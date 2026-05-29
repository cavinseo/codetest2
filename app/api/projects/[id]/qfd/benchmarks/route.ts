import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';
import { generateId } from '@/lib/id';
import { createLogger } from '@/lib/logger';

const log = createLogger('api/qfd/benchmarks');

const benchmarkSchema = z.object({
    requirementId: z.string().min(1, '요구사항 ID가 필요합니다'),
    company: z.string().min(1, '기업명이 필요합니다'),
    score: z.number().min(0).max(5),
});

// GET: 벤치마크 데이터 조회
export async function GET(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    try {
        const params = await props.params;
        const projectId = params.id;
        const accessResult = await requireProjectAccess(request, projectId, { write: request.method !== 'GET' });
        if (accessResult instanceof NextResponse) return accessResult;

        const projectBenchmarks = await prisma.benchmark.findMany({
            where: { projectId },
        });
        return NextResponse.json({ benchmarks: projectBenchmarks });
    } catch (error: unknown) {
        log.error('벤치마크 조회 실패', error);
        return NextResponse.json({ error: '벤치마크 조회 실패' }, { status: 500 });
    }
}

// POST: 벤치마크 데이터 설정
export async function POST(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    try {
        const params = await props.params;
        const projectId = params.id;
        const accessResult = await requireProjectAccess(request, projectId, { write: request.method !== 'GET' });
        if (accessResult instanceof NextResponse) return accessResult;
        const body = await request.json();
        const { requirementId, company, score } = benchmarkSchema.parse(body);

        const benchmark = await prisma.benchmark.upsert({
            where: {
                projectId_requirementId_company: {
                    projectId,
                    requirementId,
                    company,
                },
            },
            update: { score: Number(score) },
            create: {
                id: generateId('bm'),
                projectId,
                requirementId,
                company,
                score: Number(score),
            },
        });

        log.info('벤치마크 설정 완료', { projectId, reqId: requirementId, company, score });
        return NextResponse.json({ success: true, action: 'saved', benchmark });
    } catch (error: unknown) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
        }
        log.error('벤치마크 설정 실패', error);
        return NextResponse.json({ error: '벤치마크 설정 실패' }, { status: 500 });
    }
}

// DELETE: 프로젝트의 모든 벤치마크 리셋
export async function DELETE(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    try {
        const params = await props.params;
        const projectId = params.id;
        const accessResult = await requireProjectAccess(request, projectId, { write: request.method !== 'GET' });
        if (accessResult instanceof NextResponse) return accessResult;

        const deleteResult = await prisma.benchmark.deleteMany({
            where: { projectId },
        });

        log.info('벤치마크 리셋 완료', { projectId, removed: deleteResult.count });
        return NextResponse.json({ success: true, removed: deleteResult.count });
    } catch (error: unknown) {
        log.error('벤치마크 리셋 실패', error);
        return NextResponse.json({ error: '벤치마크 리셋 실패' }, { status: 500 });
    }
}
