import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { generateId } from '@/lib/id';
import { createLogger } from '@/lib/logger';

const log = createLogger('api/requirements');

const bulkRequirementsSchema = z.object({
    requirements: z.array(
        z.object({
            id: z.string().optional(),
            category: z.string(),
            subcategory: z.string().optional(),
            requirement: z.string(),
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

// POST: 요구사항 저장 (일괄 교체)
export async function POST(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const params = await props.params;
    try {
        const projectId = params.id;
        const body = await request.json();
        const { requirements } = bulkRequirementsSchema.parse(body);

        await prisma.$transaction(async (tx: any) => {
            // 해당 프로젝트의 기존 요구사항 삭제
            await tx.customerRequirement.deleteMany({
                where: { projectId },
            });

            // 새 요구사항 생성
            if (requirements.length > 0) {
                await tx.customerRequirement.createMany({
                    data: requirements.map((req) => ({
                        id: req.id || generateId('spec'),
                        projectId,
                        category: req.category,
                        subcategory: req.subcategory,
                        requirement: req.requirement,
                        order: req.order,
                    })),
                });
            }
        });

        log.info('요구사항 저장', { projectId, count: requirements.length });

        return NextResponse.json({
            success: true,
            count: requirements.length,
        });
    } catch (error: unknown) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
        }
        log.error('요구사항 저장 오류', error);
        return NextResponse.json(
            { error: '요구사항 저장 실패' },
            { status: 500 }
        );
    }
}
