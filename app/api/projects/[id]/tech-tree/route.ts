import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET: 기능기술체계 목록
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const { id: projectId } = await props.params;
    try {
        const entries = await prisma.techTreeEntry.findMany({ where: { projectId }, orderBy: { order: 'asc' } });
        return NextResponse.json({ entries });
    } catch (error) {
        console.error('tech-tree GET error:', error);
        return NextResponse.json({ error: 'Failed to load tech tree' }, { status: 500 });
    }
}

// POST: 전체 목록 일괄 저장
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const { id: projectId } = await props.params;
    try {
        const { entries } = await request.json() as {
            entries: { customerVoice?: string; coreSpec?: string; subSpec?: string; techCharacteristic?: string; order: number }[];
        };
        await prisma.$transaction([
            prisma.techTreeEntry.deleteMany({ where: { projectId } }),
            prisma.techTreeEntry.createMany({ data: entries.map(e => ({ ...e, projectId })) }),
        ]);
        const saved = await prisma.techTreeEntry.findMany({ where: { projectId }, orderBy: { order: 'asc' } });
        return NextResponse.json({ entries: saved });
    } catch (error) {
        console.error('tech-tree POST error:', error);
        return NextResponse.json({ error: 'Failed to save tech tree' }, { status: 500 });
    }
}
