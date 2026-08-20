import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';
import { generateId } from '@/lib/id';
import { createLogger } from '@/lib/logger';

const log = createLogger('api/qfd/correlations');

const correlationSchema = z.object({
    techId1: z.string().min(1),
    techId2: z.string().min(1),
    correlation: z.enum(['STRONG_POSITIVE', 'POSITIVE', 'NEGATIVE', 'STRONG_NEGATIVE', 'NONE']),
}).refine((d) => d.techId1 !== d.techId2, {
    message: '동일한 기술특성 간의 상관관계는 설정할 수 없습니다.',
});

// GET: 기술특성 간 상관관계 조회
export async function GET(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    try {
        const params = await props.params;
        const projectId = params.id;
        const accessResult = await requireProjectAccess(request, projectId, { write: request.method !== 'GET' });
        if (accessResult instanceof NextResponse) return accessResult;

        const correlations = await prisma.techCorrelation.findMany({
            where: { projectId },
        });
        return NextResponse.json({ correlations });
    } catch (error: unknown) {
        log.error('상관관계 조회 실패', error);
        return NextResponse.json({ error: '상관관계 조회 실패' }, { status: 500 });
    }
}

// POST: 기술특성 간 상관관계 설정
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
        const { techId1, techId2, correlation } = correlationSchema.parse(body);

        // 대칭성을 위해 ID 정렬(항상 techId1 < techId2가 되도록)
        const [sortedId1, sortedId2] = [techId1, techId2].sort();

        if (correlation === 'NONE') {
            await prisma.techCorrelation.deleteMany({
                where: {
                    projectId,
                    techId1: sortedId1,
                    techId2: sortedId2,
                },
            });
            log.info('상관관계 삭제 완료', { projectId, techId1: sortedId1, techId2: sortedId2 });
            return NextResponse.json({ success: true, action: 'deleted' });
        }

        const updatedCorrelation = await prisma.techCorrelation.upsert({
            where: {
                projectId_techId1_techId2: {
                    projectId,
                    techId1: sortedId1,
                    techId2: sortedId2,
                },
            },
            update: { correlation },
            create: {
                id: generateId('corr'),
                projectId,
                techId1: sortedId1,
                techId2: sortedId2,
                correlation,
            },
        });

        log.info('상관관계 설정 완료', { projectId, techId1: sortedId1, techId2: sortedId2, correlation });
        return NextResponse.json({ success: true, action: 'saved', correlation: updatedCorrelation });
    } catch (error: unknown) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
        }
        log.error('상관관계 설정 실패', error);
        return NextResponse.json({ error: '상관관계 설정 실패' }, { status: 500 });
    }
}

// DELETE: 프로젝트의 모든 상관관계 리셋
export async function DELETE(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    try {
        const params = await props.params;
        const projectId = params.id;
        const accessResult = await requireProjectAccess(request, projectId, { write: request.method !== 'GET' });
        if (accessResult instanceof NextResponse) return accessResult;

        const deleteResult = await prisma.techCorrelation.deleteMany({
            where: { projectId },
        });

        log.info('상관관계 리셋 완료', { projectId, count: deleteResult.count });
        return NextResponse.json({ success: true, removed: deleteResult.count });
    } catch (error: unknown) {
        log.error('상관관계 리셋 실패', error);
        return NextResponse.json({ error: '상관관계 리셋 실패' }, { status: 500 });
    }
}
