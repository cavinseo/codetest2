// 기술특성별 자사·경쟁사 값 라우트가 권한·소속을 확인하고, 빈 값을 지움으로 다루며,
// 마이그레이션 전에도 표를 막지 않는지 확인한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const findManyBenchmark = vi.fn();
const upsertBenchmark = vi.fn();
const deleteManyBenchmark = vi.fn();
const findFirstTech = vi.fn();
vi.mock('../lib/prisma', () => ({
    prisma: {
        technicalBenchmark: {
            findMany: findManyBenchmark,
            upsert: upsertBenchmark,
            deleteMany: deleteManyBenchmark,
        },
        technicalCharacteristic: { findFirst: findFirstTech },
    },
}));

const requireProjectAccess = vi.fn();
vi.mock('../lib/authorization', () => ({
    requireProjectAccess: (...args: unknown[]) => requireProjectAccess(...(args as [])),
}));

const { GET, POST } = await import('../app/api/projects/[id]/qfd/technical-benchmarks/route');

const USER = { userId: 'user_1', email: 'owner@x.com', name: '소유자' };
const PROJECT = 'proj_1';

function callGet() {
    const request = new NextRequest(`http://localhost/api/projects/${PROJECT}/qfd/technical-benchmarks`);
    return GET(request, { params: Promise.resolve({ id: PROJECT }) });
}

function callPost(body: unknown) {
    const request = new NextRequest(`http://localhost/api/projects/${PROJECT}/qfd/technical-benchmarks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    return POST(request, { params: Promise.resolve({ id: PROJECT }) });
}

beforeEach(() => {
    requireProjectAccess.mockResolvedValue({ user: USER, role: 'OWNER' });
    findManyBenchmark.mockResolvedValue([{ technicalCharId: 'tech_1', company: 'self', value: '120ms' }]);
    findFirstTech.mockResolvedValue({ id: 'tech_1' });
    upsertBenchmark.mockResolvedValue({ id: 'techbm_1', value: '120ms' });
    deleteManyBenchmark.mockResolvedValue({ count: 1 });
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('GET /api/projects/[id]/qfd/technical-benchmarks', () => {
    it('프로젝트의 값을 돌려준다', async () => {
        const res = await callGet();

        expect(res.status).toBe(200);
        await expect(res.json()).resolves.toEqual({
            technicalBenchmarks: [{ technicalCharId: 'tech_1', company: 'self', value: '120ms' }],
        });
    });

    it('테이블이 아직 없으면 빈 목록을 200 으로 돌려준다', async () => {
        // 마이그레이션 전에도 QFD 표 전체는 열려야 한다. 이 줄만 비어 보이면 된다.
        findManyBenchmark.mockRejectedValue(
            Object.assign(new Error('table missing'), { code: 'P2021', meta: { table: 'technical_benchmarks' } })
        );

        const res = await callGet();

        expect(res.status).toBe(200);
        await expect(res.json()).resolves.toEqual({ technicalBenchmarks: [], migrationPending: true });
    });

    it('그 밖의 조회 오류는 500 이고 원인을 응답에 담지 않는다', async () => {
        findManyBenchmark.mockRejectedValue(new Error('connect ECONNREFUSED db-host:5432'));

        const res = await callGet();

        expect(res.status).toBe(500);
        await expect(res.json()).resolves.toEqual({ error: '기술특성 벤치마크 조회 실패' });
    });
});

describe('POST /api/projects/[id]/qfd/technical-benchmarks', () => {
    it('값을 upsert 한다', async () => {
        const res = await callPost({ technicalCharId: 'tech_1', company: 'self', value: ' 120ms ' });

        expect(res.status).toBe(200);
        expect(upsertBenchmark).toHaveBeenCalledWith(expect.objectContaining({
            where: {
                projectId_technicalCharId_company: {
                    projectId: PROJECT,
                    technicalCharId: 'tech_1',
                    company: 'self',
                },
            },
            update: { value: '120ms' },
        }));
    });

    it('빈 값은 행을 지운다', async () => {
        const res = await callPost({ technicalCharId: 'tech_1', company: 'self', value: '   ' });

        expect(res.status).toBe(200);
        await expect(res.json()).resolves.toEqual({ success: true, removed: true });
        expect(deleteManyBenchmark).toHaveBeenCalledWith({
            where: { projectId: PROJECT, technicalCharId: 'tech_1', company: 'self' },
        });
        expect(upsertBenchmark).not.toHaveBeenCalled();
    });

    it('쓰기 권한을 요구한다', async () => {
        await callPost({ technicalCharId: 'tech_1', company: 'self', value: '1' });

        expect(requireProjectAccess).toHaveBeenCalledWith(expect.anything(), PROJECT, { write: true });
    });

    it('권한 검사가 응답을 내면 저장하지 않는다', async () => {
        requireProjectAccess.mockResolvedValue(NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 }));

        const res = await callPost({ technicalCharId: 'tech_1', company: 'self', value: '1' });

        expect(res.status).toBe(403);
        expect(upsertBenchmark).not.toHaveBeenCalled();
    });

    it('다른 프로젝트의 기술특성이면 404 이고 저장하지 않는다', async () => {
        findFirstTech.mockResolvedValue(null);

        const res = await callPost({ technicalCharId: 'tech_other', company: 'self', value: '1' });

        expect(res.status).toBe(404);
        expect(findFirstTech).toHaveBeenCalledWith({
            where: { id: 'tech_other', projectId: PROJECT },
            select: { id: true },
        });
        expect(upsertBenchmark).not.toHaveBeenCalled();
    });

    it('기술특성 id 가 없으면 400 이다', async () => {
        const res = await callPost({ company: 'self', value: '1' });

        expect(res.status).toBe(400);
        expect(upsertBenchmark).not.toHaveBeenCalled();
    });

    it('테이블이 아직 없으면 503 으로 무엇이 문제인지 알린다', async () => {
        upsertBenchmark.mockRejectedValue(
            Object.assign(new Error('table missing'), { code: 'P2021', meta: { table: 'technical_benchmarks' } })
        );

        const res = await callPost({ technicalCharId: 'tech_1', company: 'self', value: '1' });

        expect(res.status).toBe(503);
        const body = await res.json();
        expect(body.error).toContain('아직 준비되지 않았습니다');
    });
});
