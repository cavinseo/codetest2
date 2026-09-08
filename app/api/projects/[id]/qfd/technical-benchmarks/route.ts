// WS-9 표 아래 「자사」·경쟁사 줄의 기술특성별 실측값을 읽고 쓰는 라우트.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';
import { generateId } from '@/lib/id';
import { createLogger } from '@/lib/logger';
import { isMissingTechnicalBenchmarkTable } from '@/lib/technical-benchmark-guards';

const log = createLogger('api/qfd/technical-benchmarks');

const upsertSchema = z.object({
    technicalCharId: z.string().min(1, '기술특성 ID가 필요합니다'),
    company: z.string().min(1, '기업명이 필요합니다'),
    value: z.string(),
});

const MIGRATION_PENDING_MESSAGE = '자사·경쟁사 값 저장소가 아직 준비되지 않았습니다. 관리자에게 문의하세요.';

// GET: 기술특성별 자사·경쟁사 값 조회
export async function GET(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const params = await props.params;
    try {
        const projectId = params.id;
        const accessResult = await requireProjectAccess(request, projectId, { write: request.method !== 'GET' });
        if (accessResult instanceof NextResponse) return accessResult;

        const benchmarks = await prisma.technicalBenchmark.findMany({
            where: { projectId },
            orderBy: [{ company: 'asc' }, { technicalCharId: 'asc' }],
        });

        return NextResponse.json({ technicalBenchmarks: benchmarks });
    } catch (error: unknown) {
        // 마이그레이션 전이면 표 전체가 못 열리는 대신 이 줄만 비어 보이게 한다.
        // 화면은 이 응답을 실패로 치지 않으므로 나머지 QFD 데이터는 그대로 뜬다.
        if (isMissingTechnicalBenchmarkTable(error)) {
            log.info('기술특성 벤치마크 테이블이 아직 없다', { projectId: params.id });
            return NextResponse.json({ technicalBenchmarks: [], migrationPending: true });
        }
        log.error('기술특성 벤치마크 조회 오류', error);
        return NextResponse.json({ error: '기술특성 벤치마크 조회 실패' }, { status: 500 });
    }
}

// POST: 기술특성별 자사·경쟁사 값 저장(빈 값이면 지운다)
export async function POST(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const params = await props.params;
    try {
        const projectId = params.id;
        const accessResult = await requireProjectAccess(request, projectId, { write: request.method !== 'GET' });
        if (accessResult instanceof NextResponse) return accessResult;
        const body = await request.json();
        const data = upsertSchema.parse(body);

        // 기술특성 id 만 믿으면 다른 프로젝트의 열에 값을 붙일 수 있다.
        // 같은 파일의 다른 라우트들과 같은 방식으로 소속을 먼저 확인한다.
        const tech = await prisma.technicalCharacteristic.findFirst({
            where: { id: data.technicalCharId, projectId },
            select: { id: true },
        });

        if (!tech) {
            return NextResponse.json({ error: '현재 프로젝트의 기술특성만 수정할 수 있습니다.' }, { status: 404 });
        }

        const value = data.value.trim();
        const key = {
            projectId_technicalCharId_company: {
                projectId,
                technicalCharId: data.technicalCharId,
                company: data.company,
            },
        };

        // 빈 값은 "지움"으로 다룬다. 빈 문자열 행을 남기면 조회할 때마다
        // 값이 있는지 없는지를 두 가지로(행 없음·빈 문자열) 판정해야 한다.
        if (!value) {
            await prisma.technicalBenchmark.deleteMany({
                where: {
                    projectId,
                    technicalCharId: data.technicalCharId,
                    company: data.company,
                },
            });
            log.info('기술특성 벤치마크 삭제', { projectId, techId: data.technicalCharId });
            return NextResponse.json({ success: true, removed: true });
        }

        const saved = await prisma.technicalBenchmark.upsert({
            where: key,
            update: { value },
            create: {
                id: generateId('techbm'),
                projectId,
                technicalCharId: data.technicalCharId,
                company: data.company,
                value,
            },
        });

        log.info('기술특성 벤치마크 저장', { projectId, techId: data.technicalCharId });
        return NextResponse.json({ success: true, technicalBenchmark: saved });
    } catch (error: unknown) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
        }
        if (isMissingTechnicalBenchmarkTable(error)) {
            log.error('기술특성 벤치마크 테이블 없음 — 마이그레이션 미적용', error);
            return NextResponse.json({ error: MIGRATION_PENDING_MESSAGE }, { status: 503 });
        }
        log.error('기술특성 벤치마크 저장 오류', error);
        return NextResponse.json({ error: '기술특성 벤치마크 저장 실패' }, { status: 500 });
    }
}
