import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';
import { createLogger } from '@/lib/logger';
import { attributesBodySchema } from '@/lib/bulk-save-schemas';
import {
    countAttributeCascadeImpact,
    describeAttributeCascadeImpact,
} from '@/lib/import-cascade-guard';

const log = createLogger('api/attributes');

// GET: 프로젝트의 제품 속성 조회
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

        const attrs = await prisma.productAttribute.findMany({
            where: { projectId },
            orderBy: { order: 'asc' },
        });

        return NextResponse.json({ attributes: attrs });
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

        // 스키마가 strict 가 아니라 모르는 키를 버린다. confirmCascade 를 살리려면
        // 원본 본문을 따로 들고 있어야 한다.
        const rawBody = await request.json();
        const { attributes: newAttributes } = attributesBodySchema.parse(rawBody);

        // 저장은 항상 deleteMany 로 기존 속성을 전부 지우고 다시 만든다. 그 삭제의
        // 캐스케이드로 적합도가 함께 사라지므로, 비우는 저장뿐 아니라 비어있지 않은
        // 전체 교체 저장도 적합도가 있으면 확인 없이 진행하면 안 된다.
        const impact = await countAttributeCascadeImpact(prisma, projectId);
        if (impact.fitnesses > 0 && rawBody?.confirmCascade !== true) {
            return NextResponse.json(
                {
                    error: describeAttributeCascadeImpact(impact),
                    needsCascadeConfirm: true,
                    cascadeImpact: impact,
                },
                { status: 409 }
            );
        }

        const updatedAttrs = await prisma.$transaction(async (tx: any) => {
            await tx.productAttribute.deleteMany({
                where: { projectId },
            });

            if (newAttributes.length > 0) {
                await tx.productAttribute.createMany({
                    data: newAttributes.map((attr: any) => ({
                        ...attr,
                        projectId,
                    })),
                });
            }

            return tx.productAttribute.findMany({
                where: { projectId },
                orderBy: { order: 'asc' },
            });
        });

        log.info('제품 속성 저장 성공', { projectId, count: newAttributes.length });

        return NextResponse.json({
            attributes: updatedAttrs,
            message: '제품 속성이 저장되었습니다',
        });
    } catch (error: unknown) {
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
        const accessResult = await requireProjectAccess(request, projectId, { write: request.method !== 'GET' });
        if (accessResult instanceof NextResponse) return accessResult;
        const deleteResult = await prisma.productAttribute.deleteMany({
            where: { projectId },
        });

        log.info('제품 속성 리셋', { projectId, removed: deleteResult.count });
        return NextResponse.json({ success: true, removed: deleteResult.count });
    } catch (error: unknown) {
        log.error('제품 속성 리셋 실패', error);
        return NextResponse.json({ error: '제품 속성 리셋 실패' }, { status: 500 });
    }
}
