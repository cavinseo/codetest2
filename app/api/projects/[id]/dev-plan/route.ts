import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';
import { devPlanBodySchema } from '@/lib/bulk-save-schemas';

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
        const { rows } = devPlanBodySchema.parse(await request.json());
        await prisma.$transaction([
            prisma.devPlan.deleteMany({ where: { projectId } }),
            prisma.devPlan.createMany({ data: rows.map(r => ({ ...r, projectId, status: r.status ?? 'TODO' })) }),
        ]);
        const saved = await prisma.devPlan.findMany({ where: { projectId }, orderBy: { order: 'asc' } });
        return NextResponse.json({ rows: saved });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: '유효하지 않은 개발계획 데이터입니다.' }, { status: 400 });
        }
        console.error('dev-plan POST error:', error);
        return NextResponse.json({ error: 'Failed to save dev plan' }, { status: 500 });
    }
}
