import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';

// GET: 개발계획 목록
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const { id: projectId } = await props.params;
    const accessResult = await requireProjectAccess(request, projectId, { write: request.method !== 'GET' });
    if (accessResult instanceof NextResponse) return accessResult;
    try {
        const rows = await prisma.devPlan.findMany({ where: { projectId }, orderBy: { order: 'asc' } });
        return NextResponse.json({ rows });
    } catch (error) {
        console.error('dev-plan GET error:', error);
        return NextResponse.json({ error: 'Failed to load dev plan' }, { status: 500 });
    }
}

// POST: 전체 일괄 저장
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const { id: projectId } = await props.params;
    const accessResult = await requireProjectAccess(request, projectId, { write: request.method !== 'GET' });
    if (accessResult instanceof NextResponse) return accessResult;
    try {
        const { rows } = await request.json() as {
            rows: { phase?: string; task?: string; description?: string; startDate?: string; endDate?: string; owner?: string; status?: string; order: number }[];
        };
        await prisma.$transaction([
            prisma.devPlan.deleteMany({ where: { projectId } }),
            prisma.devPlan.createMany({ data: rows.map(r => ({ ...r, projectId, status: r.status ?? 'TODO' })) }),
        ]);
        const saved = await prisma.devPlan.findMany({ where: { projectId }, orderBy: { order: 'asc' } });
        return NextResponse.json({ rows: saved });
    } catch (error) {
        console.error('dev-plan POST error:', error);
        return NextResponse.json({ error: 'Failed to save dev plan' }, { status: 500 });
    }
}
