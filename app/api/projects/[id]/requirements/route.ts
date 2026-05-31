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
    ),
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

// POST: 요구사항 저장(일괄 교체)
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
            // 해당 프로젝트의 기존 요구사항 삭제(Prisma API 사용)
            await tx.customerRequirement.deleteMany({
                where: { projectId },
            });

            if (requirements.length > 0) {
                await tx.customerRequirement.createMany({
                    data: requirements.map((req) => ({
                        id: req.id || generateId('spec'),
                        projectId,
                        category: req.category,
                        subcategory: req.subcategory ?? null,
                        requirement: req.requirement,
                        kanoPositiveQ: req.kanoPositiveQ ?? null,
                        kanoNegativeQ: req.kanoNegativeQ ?? null,
                        kanoWeight: req.kanoWeight ?? null,
                        order: req.order,
                    })),
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

        // Prisma ?먮윭 ?곸꽭 ?뺣낫 濡쒓렇
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
