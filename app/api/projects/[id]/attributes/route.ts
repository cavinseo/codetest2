import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createLogger } from '@/lib/logger';

const log = createLogger('api/attributes');

// GET: 프로젝트의 제품 속성서 조회
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: projectId } = await params;
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

// POST: 제품 속성서 저장 (전체 교체)
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: projectId } = await params;
        const project = await prisma.project.findUnique({
            where: { id: projectId },
        });

        if (!project) {
            return NextResponse.json(
                { error: '프로젝트를 찾을 수 없습니다' },
                { status: 404 }
            );
        }

        const body = await request.json();
        const newAttributes = body.attributes || [];

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

        log.info('제품 속성서 저장 성공', { projectId, count: newAttributes.length });

        return NextResponse.json({
            attributes: updatedAttrs,
            message: '제품 속성서가 저장되었습니다',
        });
    } catch (error: unknown) {
        log.error('제품 속성서 저장 실패', error);
        return NextResponse.json(
            { error: '제품 속성서 저장 실패' },
            { status: 500 }
        );
    }
}

// DELETE: 제품 속성서 리셋
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: projectId } = await params;
        const deleteResult = await prisma.productAttribute.deleteMany({
            where: { projectId },
        });

        log.info('제품 속성서 리셋', { projectId, removed: deleteResult.count });
        return NextResponse.json({ success: true, removed: deleteResult.count });
    } catch (error: unknown) {
        log.error('리셋 실패', error);
        return NextResponse.json({ error: '리셋 실패' }, { status: 500 });
    }
}
