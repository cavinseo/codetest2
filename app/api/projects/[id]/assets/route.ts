import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';

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
        const { assets } = await request.json();
        await prisma.$transaction([
            prisma.assetItem.deleteMany({ where: { projectId } }),
            prisma.assetItem.createMany({
                data: assets.map((a: any) => ({
                    projectId,
                    type: a.type,
                    category: a.category,
                    content: a.content,
                    order: a.order
                }))
            })
        ]);
        const saved = await prisma.assetItem.findMany({
            where: { projectId },
            orderBy: { order: 'asc' }
        });
        return NextResponse.json({ assets: saved });
    } catch (error) {
        console.error('Assets POST error:', error);
        return NextResponse.json({ error: 'Failed to save assets' }, { status: 500 });
    }
}
