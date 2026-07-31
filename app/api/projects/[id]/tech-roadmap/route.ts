import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';
import { techRoadmapBodySchema } from '@/lib/bulk-save-schemas';

// GET: 기술로드맵 목록
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const { id: projectId } = await props.params;
    const accessResult = await requireProjectAccess(request, projectId, { write: request.method !== 'GET' });
    if (accessResult instanceof NextResponse) return accessResult;
    try {
        const rows = await prisma.techRoadmap.findMany({ where: { projectId }, orderBy: { order: 'asc' } });
        return NextResponse.json({ rows });
    } catch (error) {
        console.error('tech-roadmap GET error:', error);
        return NextResponse.json({ error: 'Failed to load tech roadmap' }, { status: 500 });
    }
}

// POST: 전체 일괄 저장
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const { id: projectId } = await props.params;
    const accessResult = await requireProjectAccess(request, projectId, { write: request.method !== 'GET' });
    if (accessResult instanceof NextResponse) return accessResult;
    try {
        const { rows } = techRoadmapBodySchema.parse(await request.json());
        await prisma.$transaction([
            prisma.techRoadmap.deleteMany({ where: { projectId } }),
            prisma.techRoadmap.createMany({ data: rows.map(r => ({ ...r, projectId })) }),
        ]);
        const saved = await prisma.techRoadmap.findMany({ where: { projectId }, orderBy: { order: 'asc' } });
        return NextResponse.json({ rows: saved });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: '유효하지 않은 기술로드맵 데이터입니다.' }, { status: 400 });
        }
        console.error('tech-roadmap POST error:', error);
        return NextResponse.json({ error: 'Failed to save tech roadmap' }, { status: 500 });
    }
}
