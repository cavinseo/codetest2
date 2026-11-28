import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';
import { generateId } from '@/lib/id';
import { createLogger } from '@/lib/logger';
import { fitnessBodySchema } from '@/lib/bulk-save-schemas';
import { invalidJsonBodyResponse, readJsonBody } from '@/lib/request-body';
import { assertWorksheetRevision, worksheetRevision, worksheetRevisionErrorResponse } from '@/lib/worksheet-revision';

const log = createLogger('api/attributes/fitness');

// 개정값을 해시로 만들려면 GET 과 저장 트랜잭션이 같은 순서로 읽어야 한다.
const FITNESS_ORDER = { id: 'asc' as const };

// GET: 프로젝트의 제품 속성 적합도 조회
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: projectId } = await params;
        const accessResult = await requireProjectAccess(request, projectId, { write: false });
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
            orderBy: FITNESS_ORDER,
        });

        return NextResponse.json({ fitnesses: fitnessData, revision: worksheetRevision(fitnessData) });
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
        const accessResult = await requireProjectAccess(request, projectId, { write: true });
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

        const { fitnesses: newFitnesses } = fitnessBodySchema.parse(await readJsonBody(request));

        // attributeId 를 그대로 믿으면 다른 프로젝트의 속성에 적합도를 매달 수 있다.
        // 이 프로젝트 속성만 허용하고, 다른 프로젝트에 있든 아예 없든 같은 400 으로 답해
        // 남의 id 존재 여부를 떠볼 수 없게 한다.
        const attributeIds = [...new Set(newFitnesses.map((f) => f.attributeId))];
        const ownedAttributes = attributeIds.length > 0
            ? await prisma.productAttribute.findMany({
                where: { projectId, id: { in: attributeIds } },
                select: { id: true },
            })
            : [];
        if (ownedAttributes.length !== attributeIds.length) {
            return NextResponse.json({ error: '유효하지 않은 적합도 데이터입니다.' }, { status: 400 });
        }

        // 화면이 읽은 뒤 다른 사람이 저장했으면 전체 교체가 그 입력을 지우므로 409 로 막는다(감리 B3).
        const updatedFitnesses = await prisma.$transaction(async (tx) => {
            const current = await tx.attributeFitness.findMany({ where: { projectId }, orderBy: FITNESS_ORDER });
            assertWorksheetRevision(request, current);
            await tx.attributeFitness.deleteMany({
                where: { projectId },
            });

            if (newFitnesses.length > 0) {
                await tx.attributeFitness.createMany({
                    // 전체 교체라 id 를 이어 갈 이유가 없다. 클라이언트 id 를 쓰면 다른 프로젝트
                    // 행의 id 와 부딪혀 500 이 나고, 그 차이로 id 존재 여부가 드러난다.
                    data: newFitnesses.map((f) => ({
                        id: generateId('fitness'),
                        projectId,
                        attributeId: f.attributeId,
                        importance: f.importance,
                        currentLevel: f.currentLevel,
                        targetLevel: f.targetLevel,
                        note: f.note,
                    })),
                });
            }

            return tx.attributeFitness.findMany({
                where: { projectId },
                orderBy: FITNESS_ORDER,
            });
        }, { isolationLevel: 'Serializable' });

        log.info('적합도 데이터 저장 성공', { projectId, count: newFitnesses.length });

        return NextResponse.json({
            fitnesses: updatedFitnesses,
            revision: worksheetRevision(updatedFitnesses),
            message: '적합도 데이터가 저장되었습니다',
        });
    } catch (error: unknown) {
        const invalidBody = invalidJsonBodyResponse(error);
        if (invalidBody) return invalidBody;
        const revisionResponse = worksheetRevisionErrorResponse(error);
        if (revisionResponse) return revisionResponse;
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
