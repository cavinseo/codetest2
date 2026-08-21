import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';
import { generateId } from '@/lib/id';
import { createLogger } from '@/lib/logger';
import { toErrorResponse } from '@/lib/api-error';
import {
    countCascadeImpact,
    describeCascadeImpact,
    hasCascadeImpact,
} from '@/lib/import-cascade-guard';

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
        const body = await request.json();
        const { requirements } = bulkRequirementsSchema.parse(body);

        const submittedIds = requirements
            .map((req) => req.id)
            .filter((id): id is string => Boolean(id));

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
                return NextResponse.json(
                    {
                        error: describeCascadeImpact(impact),
                        needsCascadeConfirm: true,
                        cascadeImpact: impact,
                    },
                    { status: 409 }
                );
            }
        }

        await prisma.$transaction(async (tx) => {
            await tx.customerRequirement.deleteMany({
                where: submittedIds.length > 0
                    ? { projectId, id: { notIn: submittedIds } }
                    : { projectId },
            });

            for (const req of requirements) {
                const data = {
                    category: req.category,
                    subcategory: req.subcategory ?? null,
                    requirement: req.requirement,
                    kanoPositiveQ: req.kanoPositiveQ ?? null,
                    kanoNegativeQ: req.kanoNegativeQ ?? null,
                    kanoWeight: req.kanoWeight ?? null,
                    order: req.order,
                };

                if (req.id) {
                    const updated = await tx.customerRequirement.updateMany({
                        where: { id: req.id, projectId },
                        data,
                    });
                    if (updated.count > 0) continue;
                }

                await tx.customerRequirement.create({
                    data: {
                        id: req.id || generateId('spec'),
                        projectId,
                        ...data,
                    },
                });
            }
        });

        log.info('Requirements saved', { projectId, count: requirements.length });

        return NextResponse.json({
            success: true,
            count: requirements.length,
        });
    } catch (error: unknown) {
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
