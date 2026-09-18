import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';
import { cascadeConfirmResponse } from '@/lib/cascade-confirm-response';
import { generateId } from '@/lib/id';
import { createLogger } from '@/lib/logger';
import { toErrorResponse } from '@/lib/api-error';
import {
    countCascadeImpact,
    describeCascadeImpact,
    hasCascadeImpact,
} from '@/lib/import-cascade-guard';
import { invalidJsonBodyResponse, readJsonBody } from '@/lib/request-body';

const log = createLogger('api/requirements');

const bulkRequirementsSchema = z.object({
    requirements: z.array(
        z.object({
            id: z.string().optional(),
            category: z.string(),
            subcategory: z.string().optional().nullable(),
            requirement: z.string(),
            kanoPositiveQ: z.string().optional().nullable(),
            kanoNegativeQ: z.string().optional().nullable(),
            kanoWeight: z.number().optional().nullable(),
            order: z.number(),
        })
    ).min(1, '요구사항이 비어 있습니다. 전체 삭제가 필요하면 deleteAll 파라미터를 사용하세요.'),
});

type RequirementInput = z.infer<typeof bulkRequirementsSchema>['requirements'][number];
type RequirementWriteData = {
    category: string;
    subcategory: string | null;
    requirement: string;
    kanoPositiveQ?: string | null;
    kanoNegativeQ?: string | null;
    kanoWeight?: number | null;
    order: number;
};
type RequirementToCreate = RequirementWriteData & { id: string; projectId: string };

function submittedRequirementIds(requirements: RequirementInput[]) {
    return requirements
        .map((requirement) => requirement.id)
        .filter((id): id is string => Boolean(id));
}

// Kano 질문·가중치는 보낸 경우에만 바꾼다. 요구사항 표는 이 값을 다루지 않아
// 보내지 않는데, 빠진 값을 null 로 쓰면 오타 하나 고쳐 저장할 때마다 Kano
// 화면에서 입력한 질문과 가중치가 전부 지워졌다. 명시적 null 은 그대로 지운다.
function requirementWriteData(requirement: RequirementInput): RequirementWriteData {
    return {
        category: requirement.category,
        subcategory: requirement.subcategory ?? null,
        requirement: requirement.requirement,
        ...(requirement.kanoPositiveQ !== undefined ? { kanoPositiveQ: requirement.kanoPositiveQ } : {}),
        ...(requirement.kanoNegativeQ !== undefined ? { kanoNegativeQ: requirement.kanoNegativeQ } : {}),
        ...(requirement.kanoWeight !== undefined ? { kanoWeight: requirement.kanoWeight } : {}),
        order: requirement.order,
    };
}

// 다른 프로젝트 요구사항의 id 로 create 하면 기본키 충돌로 500 이 나서 그 id 가
// 있다는 사실이 드러난다. 그런 id 는 새 행으로 보고 서버 id 를 붙인다.
async function findForeignRequirementIds(projectId: string, submittedIds: string[]) {
    if (submittedIds.length === 0) return new Set<string>();
    const rows = await prisma.customerRequirement.findMany({
        where: { id: { in: submittedIds }, NOT: { projectId } },
        select: { id: true },
    });
    return new Set(rows.map((row) => row.id));
}

async function saveRequirements(
    projectId: string,
    requirements: RequirementInput[],
    submittedIds: string[]
) {
    const foreignIds = await findForeignRequirementIds(projectId, submittedIds);
    await prisma.$transaction(async (tx) => {
        await tx.customerRequirement.deleteMany({
            where: submittedIds.length > 0
                ? { projectId, id: { notIn: submittedIds } }
                : { projectId },
        });

        const existingRows = submittedIds.length > 0
            ? await tx.customerRequirement.findMany({
                where: { projectId, id: { in: submittedIds } },
                select: { id: true },
            })
            : [];
        const existingIds = new Set(existingRows.map((row) => row.id));
        const requirementsToCreate: RequirementToCreate[] = [];

        for (const requirement of requirements) {
            const data = requirementWriteData(requirement);
            const ownId = requirement.id && !foreignIds.has(requirement.id) ? requirement.id : undefined;
            if (ownId && existingIds.has(ownId)) {
                const updated = await tx.customerRequirement.updateMany({
                    where: { id: ownId, projectId },
                    data,
                });
                if (updated.count > 0) continue;
            }
            requirementsToCreate.push({
                id: ownId || generateId('req'),
                projectId,
                ...data,
            });
        }

        if (requirementsToCreate.length > 0) {
            await tx.customerRequirement.createMany({ data: requirementsToCreate });
        }
    });
}

// GET: 요구사항 조회
export async function GET(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const params = await props.params;
    try {
        const projectId = params.id;
        const accessResult = await requireProjectAccess(request, projectId, { write: request.method !== 'GET' });
        if (accessResult instanceof NextResponse) return accessResult;
        const projectReqs = await prisma.customerRequirement.findMany({
            where: { projectId },
            orderBy: { order: 'asc' },
        });

        return NextResponse.json({
            requirements: projectReqs.map((r: any) => ({
                id: r.id,
                category: r.category,
                subcategory: r.subcategory,
                requirement: r.requirement,
                kanoPositiveQ: r.kanoPositiveQ ?? null,
                kanoNegativeQ: r.kanoNegativeQ ?? null,
                kanoWeight: r.kanoWeight ?? null,
                order: r.order,
            })),
        });
    } catch (error: unknown) {
        log.error('요구사항 조회 오류', error);
        return NextResponse.json(
            { error: '요구사항 조회 실패' },
            { status: 500 }
        );
    }
}

// POST: 요구사항 저장
export async function POST(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const params = await props.params;
    try {
        const projectId = params.id;
        const accessResult = await requireProjectAccess(request, projectId, { write: request.method !== 'GET' });
        if (accessResult instanceof NextResponse) return accessResult;
        const body = await readJsonBody(request);
        const { requirements } = bulkRequirementsSchema.parse(body);

        const submittedIds = submittedRequirementIds(requirements);

        // deleteMany 로 지워질 "기존" 고객요구사항 수를 센다. 제출 id 가 있어도
        // 기존 행과 안 겹치면(예: AI 자동생성 전체 교체의 새 gen_ id) notIn 이
        // 기존 행을 전부 지우고, 그 캐스케이드로 설문 응답이 사라진다.
        // notIn: [] 은 아무것도 안 지우는 게 아니라 전체를 지우므로, 빈 제출은
        // 필터 없이 전체를 센다.
        const deletedExistingCount = submittedIds.length === 0
            ? await prisma.customerRequirement.count({ where: { projectId } })
            : await prisma.customerRequirement.count({
                where: { projectId, id: { notIn: submittedIds } },
            });

        // 기존 행이 실제로 지워질 때만(그 캐스케이드로 하위 데이터가 사라질 때만)
        // 확인을 요구한다. id 를 유지한 정상 편집은 지워질 기존 행이 없어 통과한다.
        if (deletedExistingCount > 0) {
            const impact = await countCascadeImpact(prisma, projectId, {
                replacesCustomerRequirements: true,
            });
            if (hasCascadeImpact(impact) && body?.confirmCascade !== true) {
                return cascadeConfirmResponse(describeCascadeImpact(impact), impact);
            }
        }

        await saveRequirements(projectId, requirements, submittedIds);

        log.info('Requirements saved', { projectId, count: requirements.length });

        return NextResponse.json({
            success: true,
            count: requirements.length,
        });
    } catch (error: unknown) {
        const invalidBody = invalidJsonBodyResponse(error);
        if (invalidBody) return invalidBody;
        if (error instanceof z.ZodError) {
            log.warn('요구사항 검증 오류 (Zod)', { firstIssue: error.errors[0]?.message });
            return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
        }

        return toErrorResponse(error, {
            log,
            message: '요구사항 저장에 실패했습니다.',
            context: { projectId: params.id },
        });
    }
}
