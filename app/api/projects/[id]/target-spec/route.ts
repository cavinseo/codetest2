import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';
import { buildTargetSpecSuggestions } from '@/lib/worksheet-links';
import { targetSpecBodySchema } from '@/lib/bulk-save-schemas';

// GET: 목표사양 목록
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const { id: projectId } = await props.params;
    const accessResult = await requireProjectAccess(request, projectId, { write: request.method !== 'GET' });
    if (accessResult instanceof NextResponse) return accessResult;
    try {
        const [rows, improvements, techChars] = await Promise.all([
            prisma.targetSpec.findMany({ where: { projectId }, orderBy: { order: 'asc' } }),
            prisma.improvementItem.findMany({ where: { projectId, type: 'feature' } }),
            prisma.technicalCharacteristic.findMany({ where: { projectId } })
        ]);
        const suggestions = buildTargetSpecSuggestions({
            improvements,
            technicalCharacteristics: techChars,
        });
        return NextResponse.json({ rows, suggestions, improvements, technicalCharacteristics: techChars });
    } catch (error) {
        console.error('target-spec GET error:', error);
        return NextResponse.json({ error: 'Failed to load target specs' }, { status: 500 });
    }
}

// POST: 전체 일괄 저장
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const { id: projectId } = await props.params;
    const accessResult = await requireProjectAccess(request, projectId, { write: request.method !== 'GET' });
    if (accessResult instanceof NextResponse) return accessResult;
    try {
        const { rows } = targetSpecBodySchema.parse(await request.json());
        await prisma.$transaction([
            prisma.targetSpec.deleteMany({ where: { projectId } }),
            prisma.targetSpec.createMany({ data: rows.map(r => ({ ...r, projectId })) }),
        ]);
        const saved = await prisma.targetSpec.findMany({ where: { projectId }, orderBy: { order: 'asc' } });
        return NextResponse.json({ rows: saved });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: '유효하지 않은 목표사양 데이터입니다.' }, { status: 400 });
        }
        console.error('target-spec POST error:', error);
        return NextResponse.json({ error: 'Failed to save target specs' }, { status: 500 });
    }
}
