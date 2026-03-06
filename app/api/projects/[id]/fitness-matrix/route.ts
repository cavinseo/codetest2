import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET: 적합도 매트릭스 로드
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const { id: projectId } = await props.params;
    try {
        const record = await prisma.fitnessMatrix.findUnique({ where: { projectId } });
        return NextResponse.json({ fitnessMatrix: record });
    } catch (error) {
        console.error('fitness-matrix GET error:', error);
        return NextResponse.json({ error: 'Failed to load fitness matrix' }, { status: 500 });
    }
}

// POST: 적합도 매트릭스 저장 (upsert)
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const { id: projectId } = await props.params;
    try {
        const body = await request.json();
        const { marketsJson, matrixJson, managerComment, consultantNote } = body;
        const record = await prisma.fitnessMatrix.upsert({
            where: { projectId },
            update: { marketsJson, matrixJson, managerComment, consultantNote },
            create: { projectId, marketsJson, matrixJson, managerComment, consultantNote },
        });
        return NextResponse.json({ fitnessMatrix: record });
    } catch (error) {
        console.error('fitness-matrix POST error:', error);
        return NextResponse.json({ error: 'Failed to save fitness matrix' }, { status: 500 });
    }
}
