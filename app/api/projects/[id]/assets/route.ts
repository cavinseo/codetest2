import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';
import { assetsBodySchema } from '@/lib/bulk-save-schemas';

// GET: 핵심자산 및 보완자산 목록
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const { id: projectId } = await props.params;
    const accessResult = await requireProjectAccess(request, projectId, { write: request.method !== 'GET' });
    if (accessResult instanceof NextResponse) return accessResult;
    try {
        const assets = await prisma.assetItem.findMany({
            where: { projectId },
            orderBy: { order: 'asc' }
        });
        return NextResponse.json({ assets });
    } catch (error) {
        console.error('Assets GET error:', error);
        return NextResponse.json({ error: 'Failed to load assets' }, { status: 500 });
    }
}

// POST: 자산 목록 일괄 저장
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const { id: projectId } = await props.params;
    const accessResult = await requireProjectAccess(request, projectId, { write: request.method !== 'GET' });
    if (accessResult instanceof NextResponse) return accessResult;
    try {
        const { assets } = assetsBodySchema.parse(await request.json());

        // 배열 형태 $transaction([...]) 은 인자를 먼저 다 평가하므로, 예전에는
        // assets 가 배열이 아닐 때 .map 이 터져 준 것이 사실상 유일한 방어막이었다.
        // 콜백 형태로 바꿔 삭제와 재생성이 확실히 같은 트랜잭션에 묶이게 한다.
        const saved = await prisma.$transaction(async (tx) => {
            await tx.assetItem.deleteMany({ where: { projectId } });
            if (assets.length > 0) {
                await tx.assetItem.createMany({
                    data: assets.map((a) => ({
                        projectId,
                        type: a.type,
                        category: a.category,
                        content: a.content,
                        order: a.order,
                    })),
                });
            }
            return tx.assetItem.findMany({ where: { projectId }, orderBy: { order: 'asc' } });
        });

        return NextResponse.json({ assets: saved });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
        }
        console.error('Assets POST error:', error);
        return NextResponse.json({ error: 'Failed to save assets' }, { status: 500 });
    }
}
