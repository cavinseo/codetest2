import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';
import { generateId } from '@/lib/id';
import { createLogger } from '@/lib/logger';
import { fitnessBodySchema } from '@/lib/bulk-save-schemas';

const log = createLogger('api/attributes/fitness');

// GET: 프로젝트의 제품 속성 적합도 조회
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: projectId } = await params;
        const accessResult = await requireProjectAccess(request, projectId, { write: request.method !== 'GET' });
        if (accessResult instanceof NextResponse) return accessResult;
        const project = await prisma.project.findUnique({
            where: { id: projectId },
        });

        if (!project) {
            return NextResponse.json(
                { error: '프로젝트를 찾을 수 없습니다' },
                { status: 404 }
            );
        }

        const fitnessData = await prisma.attributeFitness.findMany({
            where: { projectId },
        });

        return NextResponse.json({ fitnesses: fitnessData });
    } catch (error: unknown) {
        log.error('적합도 데이터 조회 실패', error);
        return NextResponse.json(
            { error: '적합도 데이터 조회 실패' },
            { status: 500 }
        );
    }
}

// POST: 제품 속성 적합도 저장(전체 교체)
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: projectId } = await params;
        const accessResult = await requireProjectAccess(request, projectId, { write: request.method !== 'GET' });
        if (accessResult instanceof NextResponse) return accessResult;
        const project = await prisma.project.findUnique({
            where: { id: projectId },
        });

        if (!project) {
            return NextResponse.json(
                { error: '프로젝트를 찾을 수 없습니다' },
                { status: 404 }
            );
        }

        const { fitnesses: newFitnesses } = fitnessBodySchema.parse(await request.json());

        const updatedFitnesses = await prisma.$transaction(async (tx: any) => {
            await tx.attributeFitness.deleteMany({
                where: { projectId },
            });

            if (newFitnesses.length > 0) {
                await tx.attributeFitness.createMany({
                    data: newFitnesses.map((f: any) => ({
                        ...f,
                        projectId,
                        id: f.id || generateId('fitness'),
                    })),
                });
            }

            return tx.attributeFitness.findMany({
                where: { projectId },
            });
        });

        log.info('적합도 데이터 저장 성공', { projectId, count: newFitnesses.length });

        return NextResponse.json({
            fitnesses: updatedFitnesses,
            message: '적합도 데이터가 저장되었습니다',
        });
    } catch (error: unknown) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: '유효하지 않은 적합도 데이터입니다.' }, { status: 400 });
        }
        log.error('적합도 데이터 저장 실패', error);
        return NextResponse.json(
            { error: '적합도 데이터 저장 실패' },
            { status: 500 }
        );
    }
}
