import { NextRequest, NextResponse } from 'next/server';
import { cascadeConfirmResponse } from '@/lib/cascade-confirm-response';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';
import { createLogger } from '@/lib/logger';
import { attributesBodySchema } from '@/lib/bulk-save-schemas';
import { assertWorksheetRevision, worksheetRevision, WorksheetRevisionConflict, WorksheetRevisionMissing } from '@/lib/worksheet-revision';
import {
    countAttributeCascadeImpact,
    describeAttributeCascadeImpact,
    type AttributeCascadeImpact,
} from '@/lib/import-cascade-guard';
import { invalidJsonBodyResponse, readJsonBody } from '@/lib/request-body';

const log = createLogger('api/attributes');

/** 트랜잭션 안에서 다시 센 적합도 건수가 확인한 건수와 달라 삭제를 멈췄음을 알린다. */
class AttributeCascadeChangedError extends Error {
    constructor(readonly impact: AttributeCascadeImpact) {
        super(describeAttributeCascadeImpact(impact));
    }
}

// GET: 프로젝트의 제품 속성 조회
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

        const attrs = await prisma.productAttribute.findMany({
            where: { projectId },
            orderBy: { order: 'asc' },
        });

        return NextResponse.json({ attributes: attrs, revision: worksheetRevision(attrs) });
    } catch (error: unknown) {
        log.error('제품 속성 조회 실패', error);
        return NextResponse.json(
            { error: '제품 속성 조회 실패' },
            { status: 500 }
        );
    }
}

// POST: 제품 속성 저장(전체 교체)
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

        // 스키마가 strict 가 아니라 모르는 키를 버린다. confirmedCascadeImpact 를 살리려면
        // 원본 본문을 따로 들고 있어야 한다.
        const rawBody = await readJsonBody(request);
        const { attributes: newAttributes } = attributesBodySchema.parse(rawBody);

        // 저장은 항상 deleteMany 로 기존 속성을 전부 지우고 다시 만든다. 그 삭제의
        // 캐스케이드로 적합도가 함께 사라지므로, 비우는 저장뿐 아니라 비어있지 않은
        // 전체 교체 저장도 적합도가 있으면 확인 없이 진행하면 안 된다.
        const impact = await countAttributeCascadeImpact(prisma, projectId);
        // 단순 true 확인은 화면을 연 뒤 적합도가 늘어난 경우에도 통과한다. 사용자가 본
        // 개수와 지금 지워질 개수가 같을 때만 진행해 낡은 확인으로 더 많이 지우지 않게 한다.
        const confirmedImpact = rawBody?.confirmedCascadeImpact;
        if (impact.fitnesses > 0 && confirmedImpact?.fitnesses !== impact.fitnesses) {
            return cascadeConfirmResponse(describeAttributeCascadeImpact(impact), impact);
        }

        const updatedAttrs = await prisma.$transaction(async (tx) => {
            const currentAttrs = await tx.productAttribute.findMany({ where: { projectId }, orderBy: { order: 'asc' } });
            assertWorksheetRevision(request, currentAttrs);
            // 위 확인은 트랜잭션 밖에서 셌다. 그 사이 적합도가 더 저장됐을 수 있으니
            // 지우기 직전에 다시 세어 확인한 건수와 다르면 멈춘다(감리 B4).
            const currentImpact = await countAttributeCascadeImpact(tx, projectId);
            if (currentImpact.fitnesses > 0 && confirmedImpact?.fitnesses !== currentImpact.fitnesses) {
                throw new AttributeCascadeChangedError(currentImpact);
            }
            await tx.productAttribute.deleteMany({
                where: { projectId },
            });

            if (newAttributes.length > 0) {
                await tx.productAttribute.createMany({
                    data: newAttributes.map((attr) => ({
                        ...attr,
                        projectId,
                    })),
                });
            }

            return tx.productAttribute.findMany({
                where: { projectId },
                orderBy: { order: 'asc' },
            });
        }, { isolationLevel: 'Serializable' });

        log.info('제품 속성 저장 성공', { projectId, count: newAttributes.length });

        return NextResponse.json({
            attributes: updatedAttrs,
            revision: worksheetRevision(updatedAttrs),
            message: '제품 속성이 저장되었습니다',
        });
    } catch (error: unknown) {
        const invalidBody = invalidJsonBodyResponse(error);
        if (invalidBody) return invalidBody;
        if (error instanceof AttributeCascadeChangedError) {
            return cascadeConfirmResponse(describeAttributeCascadeImpact(error.impact), error.impact);
        }
        if (error instanceof WorksheetRevisionMissing) {
            return NextResponse.json({ error: error.message }, { status: 428 });
        }
        if (error instanceof WorksheetRevisionConflict || (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2034')) {
            return NextResponse.json({ error: '다른 화면에서 워크시트가 변경되었습니다. 새로고침 후 다시 확인하세요.' }, { status: 409 });
        }
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: '유효하지 않은 제품 속성 데이터입니다.' }, { status: 400 });
        }
        log.error('제품 속성 저장 실패', error);
        return NextResponse.json(
            { error: '제품 속성 저장 실패' },
            { status: 500 }
        );
    }
}

// DELETE: 제품 속성 리셋
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: projectId } = await params;
        const accessResult = await requireProjectAccess(request, projectId, { write: true });
        if (accessResult instanceof NextResponse) return accessResult;
        // 리셋도 저장과 같은 캐스케이드로 적합도를 지우므로 같은 확인을 거친다.
        // 본문 없이 오는 예전 호출은 확인 없음으로 보고 409 로 되묻는다.
        const rawBody = await request.json().catch(() => ({}));
        const confirmedImpact = rawBody?.confirmedCascadeImpact;
        // 개정값 확인·영향 집계·삭제를 한 트랜잭션에 묶어, 확인한 뒤 다른 화면이 적합도를 늘려도
        // 낡은 확인으로 더 많이 지우지 않게 한다.
        const result = await prisma.$transaction(async (tx) => {
            const currentAttrs = await tx.productAttribute.findMany({ where: { projectId }, orderBy: { order: 'asc' } });
            assertWorksheetRevision(request, currentAttrs);
            const impact = await countAttributeCascadeImpact(tx, projectId);
            if (impact.fitnesses > 0 && confirmedImpact?.fitnesses !== impact.fitnesses) {
                return { impact };
            }
            const deleted = await tx.productAttribute.deleteMany({ where: { projectId } });
            return { deleted };
        }, { isolationLevel: 'Serializable' });
        if ('impact' in result && result.impact) {
            return cascadeConfirmResponse(describeAttributeCascadeImpact(result.impact), result.impact);
        }

        log.info('제품 속성 리셋', { projectId, removed: result.deleted.count });
        return NextResponse.json({ success: true, removed: result.deleted.count, revision: worksheetRevision([]) });
    } catch (error: unknown) {
        if (error instanceof WorksheetRevisionMissing) {
            return NextResponse.json({ error: error.message }, { status: 428 });
        }
        if (error instanceof WorksheetRevisionConflict || (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2034')) {
            return NextResponse.json({ error: '다른 화면에서 워크시트가 변경되었습니다. 새로고침 후 다시 확인하세요.' }, { status: 409 });
        }
        log.error('제품 속성 리셋 실패', error);
        return NextResponse.json({ error: '제품 속성 리셋 실패' }, { status: 500 });
    }
}
