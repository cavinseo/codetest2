import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET: 매출추정 목록
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const { id: projectId } = await props.params;
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
    try {
        const { rows } = await request.json() as {
            rows: { customer?: string; amount: number; competitor?: string; order: number }[];
        };
        await prisma.$transaction([
            prisma.salesEstimate.deleteMany({ where: { projectId } }),
            prisma.salesEstimate.createMany({ data: rows.map(r => ({ ...r, projectId })) }),
        ]);
        const saved = await prisma.salesEstimate.findMany({ where: { projectId }, orderBy: { order: 'asc' } });
        return NextResponse.json({ rows: saved });
    } catch (error) {
        console.error('sales POST error:', error);
        return NextResponse.json({ error: 'Failed to save sales estimates' }, { status: 500 });
    }
}
