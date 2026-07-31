import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';
import { techTreeBodySchema } from '@/lib/bulk-save-schemas';

// GET: 기능기술체계 목록
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const { id: projectId } = await props.params;
    const accessResult = await requireProjectAccess(request, projectId, { write: request.method !== 'GET' });
    if (accessResult instanceof NextResponse) return accessResult;
    try {
        const entries = await prisma.techTreeEntry.findMany({ where: { projectId }, orderBy: { order: 'asc' } });
        return NextResponse.json({ entries });
    } catch (error) {
        console.error('tech-tree GET error:', error);
        return NextResponse.json({ error: '기능기술체계도 데이터를 불러오지 못했습니다.' }, { status: 500 });
    }
}

// POST: 전체 목록 일괄 저장
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const { id: projectId } = await props.params;
    const accessResult = await requireProjectAccess(request, projectId, { write: request.method !== 'GET' });
    if (accessResult instanceof NextResponse) return accessResult;
    try {
        const { entries } = techTreeBodySchema.parse(await request.json());
        await prisma.$transaction(async (tx) => {
            await tx.techTreeEntry.deleteMany({ where: { projectId } });
            if (entries.length > 0) {
                await tx.techTreeEntry.createMany({ data: entries.map(e => ({ ...e, projectId })) });
            }
        });
        const saved = await prisma.techTreeEntry.findMany({ where: { projectId }, orderBy: { order: 'asc' } });
        return NextResponse.json({ entries: saved });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: '유효하지 않은 기능기술체계 데이터입니다.' }, { status: 400 });
        }
        console.error('tech-tree POST error:', error);
        return NextResponse.json({ error: '기능기술체계도 데이터를 저장하지 못했습니다.' }, { status: 500 });
    }
}
