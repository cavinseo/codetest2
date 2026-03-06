import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET: 개선포인트 목록
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const { id: projectId } = await props.params;
    try {
        const items = await prisma.improvementItem.findMany({ where: { projectId }, orderBy: [{ type: 'asc' }, { order: 'asc' }] });
        return NextResponse.json({ items });
    } catch (error) {
        console.error('improvements GET error:', error);
        return NextResponse.json({ error: 'Failed to load improvements' }, { status: 500 });
    }
}

// POST: 전체 일괄 저장
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const { id: projectId } = await props.params;
    try {
        const { items } = await request.json() as {
            items: { type: string; content?: string; improvementRate?: string; devProportion?: string; priority?: string; order: number }[];
        };
        await prisma.$transaction([
            prisma.improvementItem.deleteMany({ where: { projectId } }),
            prisma.improvementItem.createMany({ data: items.map(i => ({ ...i, projectId })) }),
        ]);
        const saved = await prisma.improvementItem.findMany({ where: { projectId }, orderBy: [{ type: 'asc' }, { order: 'asc' }] });
        return NextResponse.json({ items: saved });
    } catch (error) {
        console.error('improvements POST error:', error);
        return NextResponse.json({ error: 'Failed to save improvements' }, { status: 500 });
    }
}
