import { groupRequirementsByCategory } from '@/lib/requirements-table-utils';
import { synchronizeRequirementLinkedOrder } from '@/lib/requirement-order-store';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';
import { cascadeConfirmResponse } from '@/lib/cascade-confirm-response';
import { getKanoAnalysisAccess } from '@/lib/kano-analysis-access';
import { generateId } from '@/lib/id';
import { createLogger } from '@/lib/logger';
import { toErrorResponse } from '@/lib/api-error';
import type { Prisma } from '@prisma/client';
import {
    CascadeImpactChangedError,
    countCascadeImpact,
    describeCascadeImpact,
    EMPTY_CASCADE_IMPACT,
    isCascadeImpactConfirmed,
    type CascadeImpact,
} from '@/lib/import-cascade-guard';
import { invalidJsonBodyResponse, readJsonBody } from '@/lib/request-body';
import { assertWorksheetRevision, worksheetRevision, worksheetRevisionErrorResponse } from '@/lib/worksheet-revision';

const log = createLogger('api/requirements');

// 개정값은 화면용 그룹 정렬 전, DB 에서 이 순서로 읽은 원본 행으로 만든다.
const REQUIREMENT_ORDER = [{ order: 'asc' as const }, { id: 'asc' as const }];

const bulkRequirementsSchema = z.object({
    requirements: z.array(
        z.object({
            id: z.string().optional(),
            category: z.string().refine(value => value.trim().length > 0, '1차 그룹을 입력하세요.'),
            subcategory: z.string().optional().nullable(),
            requirement: z.string().refine(value => value.trim().length > 0, '요구사항을 입력하세요.'),
            kanoPositiveQ: z.string().optional().nullable(),
            kanoNegativeQ: z.string().optional().nullable(),
            kanoWeight: z.number().optional().nullable(),
            order: z.number(),
        })
    ),
    deleteAll: z.literal(true).optional(),
}).superRefine((body, context) => {
    if (body.requirements.length === 0 && !body.deleteAll) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: '전체 삭제를 요청하려면 deleteAll을 확인하세요.', path: ['deleteAll'] });
    }
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
// 화면에서 입력한 질문과 가중치가 전부 지워졌다. Prisma 는 undefined 필드를 건드리지
// 않으므로(생성 시에는 기본값 null) 빠진 값은 undefined 로 그대로 넘긴다. 명시적 null 은 그대로 지운다.
function requirementWriteData(requirement: RequirementInput): RequirementWriteData {
    return {
        category: requirement.category,
        subcategory: requirement.subcategory ?? null,
        requirement: requirement.requirement,
        kanoPositiveQ: requirement.kanoPositiveQ,
        kanoNegativeQ: requirement.kanoNegativeQ,
        kanoWeight: requirement.kanoWeight,
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

/**
 * 이번 저장으로 지워질 기존 요구사항이 있을 때, 그 캐스케이드로 함께 지워질 건수를 센다.
 * 지워질 기존 행이 없으면(id 를 유지한 정상 편집) 하위 데이터도 남으므로 빈 영향을 돌려준다.
 */
async function requirementCascadeImpact(
    db: Prisma.TransactionClient,
    projectId: string,
    submittedIds: string[]
): Promise<CascadeImpact> {
    // 제출 id 가 있어도 기존 행과 안 겹치면(예: AI 자동생성 전체 교체의 새 gen_ id)
    // notIn 이 기존 행을 전부 지운다. notIn: [] 은 아무것도 안 지우는 게 아니라
    // 전체를 지우므로, 빈 제출은 필터 없이 전체를 센다.
    const deletedExistingCount = submittedIds.length === 0
        ? await db.customerRequirement.count({ where: { projectId } })
        : await db.customerRequirement.count({ where: { projectId, id: { notIn: submittedIds } } });
    if (deletedExistingCount === 0) return EMPTY_CASCADE_IMPACT;
    return countCascadeImpact(db, projectId, { replacesCustomerRequirements: true });
}

async function saveRequirements(
    request: NextRequest,
    projectId: string,
    requirements: RequirementInput[],
    submittedIds: string[],
    confirmedImpact: unknown
): Promise<string> {
    const foreignIds = await findForeignRequirementIds(projectId, submittedIds);
    return prisma.$transaction(async (tx) => {
        const previous = await tx.customerRequirement.findMany({ where: { projectId }, orderBy: REQUIREMENT_ORDER });
        // 화면이 읽은 뒤 다른 사람이 저장했으면 notIn 삭제가 그 사람이 추가한 행을
        // 지우므로 409 로 막는다(감리 B3). 아래 캐스케이드 확인 전 검사는 안내용이고
        // 이 트랜잭션 안의 검사가 정본이다.
        assertWorksheetRevision(request, previous);
        // 확인창을 띄운 뒤 응답이 더 들어왔을 수 있다. 지우기 직전에 다시 세어
        // 사용자가 확인한 건수와 다르면 멈춘다(감리 B4).
        const impact = await requirementCascadeImpact(tx, projectId, submittedIds);
        if (!isCascadeImpactConfirmed(impact, confirmedImpact)) throw new CascadeImpactChangedError(impact);
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
        await synchronizeRequirementLinkedOrder(tx, projectId, previous, requirements);
        const saved = await tx.customerRequirement.findMany({ where: { projectId }, orderBy: REQUIREMENT_ORDER });
        return worksheetRevision(saved);
    }, { timeout: 30000, isolationLevel: 'Serializable' });
}

// GET: 요구사항 조회
export async function GET(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const params = await props.params;
    try {
        const projectId = params.id;
        const accessResult = await requireProjectAccess(request, projectId, { write: false });
        if (accessResult instanceof NextResponse) return accessResult;
        const projectReqs = await prisma.customerRequirement.findMany({
            where: { projectId },
            orderBy: REQUIREMENT_ORDER,
        });

        return NextResponse.json({
            revision: worksheetRevision(projectReqs),
            requirements: groupRequirementsByCategory(projectReqs).map((r) => ({
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
        const accessResult = await requireProjectAccess(request, projectId, { write: true });
        if (accessResult instanceof NextResponse) return accessResult;
        const { canEdit: canEditAnalysis } = getKanoAnalysisAccess(accessResult);
        const body = await readJsonBody(request);
        const requirements = groupRequirementsByCategory(bulkRequirementsSchema.parse(body).requirements.map(row => ({
            ...row, subcategory: row.subcategory ?? null,
            // 일반 요구사항 편집으로 멘토의 분석 가중치를 덮어쓰지 않도록 한다. undefined 는
            // requirementWriteData 가 "보내지 않은 Kano 필드"로 보고 저장값을 그대로 둔다.
            kanoWeight: canEditAnalysis ? row.kanoWeight : undefined,
        })));

        const submittedIds = submittedRequirementIds(requirements);
        const confirmedImpact: unknown = body?.confirmedCascadeImpact;

        // 이미 다른 화면에서 바뀌었다면 캐스케이드 삭제 확인을 묻기 전에 알려 준다.
        // 확인을 받고 나서야 충돌로 실패하면 사용자는 같은 질문에 두 번 답하게 된다.
        assertWorksheetRevision(request, await prisma.customerRequirement.findMany({
            where: { projectId },
            orderBy: REQUIREMENT_ORDER,
        }));

        // 확인창에 보여 줄 건수다. 실제 삭제 직전에 트랜잭션 안에서 다시 센다.
        const impact = await requirementCascadeImpact(prisma, projectId, submittedIds);
        if (!isCascadeImpactConfirmed(impact, confirmedImpact)) {
            return cascadeConfirmResponse(describeCascadeImpact(impact), impact);
        }

        const revision = await saveRequirements(request, projectId, requirements, submittedIds, confirmedImpact);

        log.info('Requirements saved', { projectId, count: requirements.length });

        return NextResponse.json({
            success: true,
            count: requirements.length,
            revision,
        });
    } catch (error: unknown) {
        const invalidBody = invalidJsonBodyResponse(error);
        if (invalidBody) return invalidBody;
        // 확인한 뒤 그 사이 지워질 건수가 바뀌었다. 새 건수로 다시 묻는다.
        if (error instanceof CascadeImpactChangedError) {
            return cascadeConfirmResponse(describeCascadeImpact(error.impact), error.impact);
        }
        const revisionResponse = worksheetRevisionErrorResponse(error);
        if (revisionResponse) return revisionResponse;
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
