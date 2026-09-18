import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';
import { fitnessMatrixBodySchema } from '@/lib/bulk-save-schemas';

// GET: 적합도 매트릭스 로드
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const { id: projectId } = await props.params;
    const accessResult = await requireProjectAccess(request, projectId, { write: request.method !== 'GET' });
    if (accessResult instanceof NextResponse) return accessResult;
    try {
        const record = await prisma.fitnessMatrix.findUnique({ where: { projectId } });
        return NextResponse.json({ fitnessMatrix: record });
    } catch (error) {
        console.error('fitness-matrix GET error:', error);
        return NextResponse.json({ error: 'Failed to load fitness matrix' }, { status: 500 });
    }
}

// POST: 적합도 매트릭스 저장(upsert)
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const { id: projectId } = await props.params;
    const accessResult = await requireProjectAccess(request, projectId, { write: request.method !== 'GET' });
    if (accessResult instanceof NextResponse) return accessResult;
    try {
        const parsed = fitnessMatrixBodySchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
            return NextResponse.json({ error: '유효하지 않은 적합도 데이터입니다.' }, { status: 400 });
        }
        const { marketsJson, matrixJson, managerComment, consultantNote } = parsed.data;
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
