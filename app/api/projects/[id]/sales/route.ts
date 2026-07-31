import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';
import { salesBodySchema } from '@/lib/bulk-save-schemas';

// GET: 매출추정 목록
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const { id: projectId } = await props.params;
    const accessResult = await requireProjectAccess(request, projectId, { write: request.method !== 'GET' });
    if (accessResult instanceof NextResponse) return accessResult;
    try {
        const rows = await prisma.salesEstimate.findMany({ where: { projectId }, orderBy: { order: 'asc' } });
        return NextResponse.json({ rows });
    } catch (error) {
        console.error('sales GET error:', error);
        return NextResponse.json({ error: 'Failed to load sales estimates' }, { status: 500 });
    }
}

// POST: 전체 일괄 저장
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const { id: projectId } = await props.params;
    const accessResult = await requireProjectAccess(request, projectId, { write: request.method !== 'GET' });
    if (accessResult instanceof NextResponse) return accessResult;
    try {
        const { rows } = salesBodySchema.parse(await request.json());
        await prisma.$transaction([
            prisma.salesEstimate.deleteMany({ where: { projectId } }),
            prisma.salesEstimate.createMany({
                data: rows.map(r => ({
                    period: r.period === 'Y_PLUS_1' ? 'Y_PLUS_1' : 'Y',
                    customer: r.customer,
                    amount: Number(r.amount) || 0,
                    futureAmount: 0,
                    competitor: r.competitor,
                    order: r.order,
                    projectId,
                })),
            }),
        ]);
        const saved = await prisma.salesEstimate.findMany({ where: { projectId }, orderBy: { order: 'asc' } });
        return NextResponse.json({ rows: saved });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: '유효하지 않은 매출추정 데이터입니다.' }, { status: 400 });
        }
        console.error('sales POST error:', error);
        return NextResponse.json({ error: 'Failed to save sales estimates' }, { status: 500 });
    }
}
