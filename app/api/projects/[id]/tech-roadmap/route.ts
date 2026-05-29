import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';

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
        const { rows } = await request.json() as {
            rows: { category?: string; techItem?: string; currentLevel?: string; q1?: string; q2?: string; q3?: string; q4?: string; targetLevel?: string; owner?: string; order: number }[];
        };
        await prisma.$transaction([
            prisma.techRoadmap.deleteMany({ where: { projectId } }),
            prisma.techRoadmap.createMany({ data: rows.map(r => ({ ...r, projectId })) }),
        ]);
        const saved = await prisma.techRoadmap.findMany({ where: { projectId }, orderBy: { order: 'asc' } });
        return NextResponse.json({ rows: saved });
    } catch (error) {
        console.error('tech-roadmap POST error:', error);
        return NextResponse.json({ error: 'Failed to save tech roadmap' }, { status: 500 });
    }
}
