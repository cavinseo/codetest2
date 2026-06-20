import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';
import { generateId } from '@/lib/id';
import { createLogger } from '@/lib/logger';

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

        await prisma.$transaction(async (tx) => {
            const submittedIds = requirements
                .map((req) => req.id)
                .filter((id): id is string => Boolean(id));

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
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            log.error('요구사항 검증 오류 (Zod)', { errors: error.errors });
            return NextResponse.json({ error: error.errors[0].message, details: error.errors }, { status: 400 });
        }

        // Prisma 오류 상세 정보 로그
        log.error('요구사항 저장 오류 (Prisma/DB)', {
            message: error.message,
            code: error.code,
            meta: error.meta,
            stack: error.stack
        });

        return NextResponse.json(
            {
                error: '요구사항 저장 실패',
                message: error.message,
                code: error.code
            },
            { status: 500 }
        );
    }
}
