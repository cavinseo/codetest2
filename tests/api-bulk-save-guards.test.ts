// 대량 저장 라우트가 "잘못된 바디로 데이터를 지우지 않는다"를 보장하는 회귀 테스트.
//
// 기존 tests/bulk-save-schemas.test.ts 는 스키마 자체만 검증했다. 정작 라우트가
// 그 스키마를 호출하는지는 아무도 확인하지 않아, improvements/assets/funding 세
// 라우트가 검증 없이 deleteMany 를 돌고 있었다. 여기서는 라우트 핸들러를 직접
// 불러 deleteMany 호출 여부까지 본다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const tx = {
    improvementItem: { deleteMany: vi.fn(), createMany: vi.fn(), findMany: vi.fn(async () => []) },
    assetItem: { deleteMany: vi.fn(), createMany: vi.fn(), findMany: vi.fn(async () => []) },
    fundingPlan: { deleteMany: vi.fn(), createMany: vi.fn(), findMany: vi.fn(async () => []) },
    fundingSource: { deleteMany: vi.fn(), createMany: vi.fn(), findMany: vi.fn(async () => []) },
};

vi.mock('../lib/prisma', () => ({
    prisma: {
        // 콜백 형태만 쓰도록 라우트를 정리했으므로 콜백에 tx 를 넘겨준다.
        $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    },
}));

// 권한은 이 테스트의 관심사가 아니므로 통과시킨다(권한 케이스는 아래에서 따로 확인).
const requireProjectAccess = vi.fn(async () => ({
    user: { userId: 'user_1', email: 'a@b.com', name: null },
    role: 'OWNER' as const,
}));
vi.mock('../lib/authorization', () => ({
    requireProjectAccess: (...args: unknown[]) => requireProjectAccess(...(args as [])),
}));

const { POST: improvementsPost } = await import('../app/api/projects/[id]/improvements/route');
const { POST: assetsPost } = await import('../app/api/projects/[id]/assets/route');
const { POST: fundingPost } = await import('../app/api/projects/[id]/funding/route');

const params = { params: Promise.resolve({ id: 'project_1' }) };

function post(body: unknown): NextRequest {
    return new NextRequest('http://localhost/api/projects/project_1/x', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

function allDeleteMocks() {
    return [
        tx.improvementItem.deleteMany,
        tx.assetItem.deleteMany,
        tx.fundingPlan.deleteMany,
        tx.fundingSource.deleteMany,
    ];
}

beforeEach(() => {
    requireProjectAccess.mockResolvedValue({
        user: { userId: 'user_1', email: 'a@b.com', name: null },
        role: 'OWNER',
    });
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('improvements POST', () => {
    const validItem = { type: 'need', content: '회비 집계 자동화', order: 0 };

    it.each([
        ['빈 객체', {}],
        ['items 가 null', { items: null }],
        ['items 가 배열이 아님', { items: 'oops' }],
        ['키 오타', { item: [validItem] }],
        ['type 이 허용값 밖', { items: [{ type: 'unknown', order: 0 }] }],
    ])('%s → 400 이고 deleteMany 를 호출하지 않는다', async (_label, body) => {
        const res = await improvementsPost(post(body), params);

        expect(res.status).toBe(400);
        expect(tx.improvementItem.deleteMany).not.toHaveBeenCalled();
        expect(tx.improvementItem.createMany).not.toHaveBeenCalled();
    });

    it('정상 바디는 같은 트랜잭션에서 삭제 후 재생성한다', async () => {
        const res = await improvementsPost(post({ items: [validItem] }), params);

        expect(res.status).toBe(200);
        expect(tx.improvementItem.deleteMany).toHaveBeenCalledWith({ where: { projectId: 'project_1' } });
        expect(tx.improvementItem.createMany).toHaveBeenCalledTimes(1);
    });

    it('빈 배열은 의도적 초기화로 보고 삭제만 수행한다', async () => {
        const res = await improvementsPost(post({ items: [] }), params);

        expect(res.status).toBe(200);
        expect(tx.improvementItem.deleteMany).toHaveBeenCalledTimes(1);
        expect(tx.improvementItem.createMany).not.toHaveBeenCalled();
    });

    it('클라이언트가 보낸 임의 필드는 저장되지 않는다', async () => {
        await improvementsPost(post({
            items: [{ ...validItem, id: 'hijack', projectId: 'other_project' }],
        }), params);

        const [{ data }] = tx.improvementItem.createMany.mock.calls[0];
        expect(data[0]).not.toHaveProperty('id');
        expect(data[0].projectId).toBe('project_1');
    });

    it('권한이 없으면 403 이고 아무것도 지우지 않는다', async () => {
        requireProjectAccess.mockResolvedValue(
            NextResponse.json({ error: 'forbidden' }, { status: 403 }) as never
        );

        const res = await improvementsPost(post({ items: [validItem] }), params);

        expect(res.status).toBe(403);
        for (const mock of allDeleteMocks()) expect(mock).not.toHaveBeenCalled();
    });
});

describe('assets POST', () => {
    const validAsset = { type: 'CORE', content: '회원 명부 DB', order: 0 };

    it.each([
        ['빈 객체', {}],
        ['assets 가 배열이 아님', { assets: 42 }],
        ['type 이 허용값 밖', { assets: [{ type: 'OTHER', order: 0 }] }],
    ])('%s → 400 이고 deleteMany 를 호출하지 않는다', async (_label, body) => {
        const res = await assetsPost(post(body), params);

        expect(res.status).toBe(400);
        expect(tx.assetItem.deleteMany).not.toHaveBeenCalled();
    });

    it('정상 바디는 삭제 후 재생성한다', async () => {
        const res = await assetsPost(post({ assets: [validAsset] }), params);

        expect(res.status).toBe(200);
        expect(tx.assetItem.deleteMany).toHaveBeenCalledWith({ where: { projectId: 'project_1' } });
        expect(tx.assetItem.createMany).toHaveBeenCalledTimes(1);
    });

    it('빈 배열은 삭제만 수행한다', async () => {
        await assetsPost(post({ assets: [] }), params);

        expect(tx.assetItem.deleteMany).toHaveBeenCalledTimes(1);
        expect(tx.assetItem.createMany).not.toHaveBeenCalled();
    });
});

describe('funding POST', () => {
    const validPlan = { category: '소요자금', item: '생산비용', year1: 100, order: 0 };
    const validSource = { category: '정부자금', year1: '{"amount":50}', order: 0 };

    it.each([
        ['plans 가 배열이 아님', { plans: 'oops' }],
        ['sources 가 배열이 아님', { sources: {} }],
    ])('%s → 400 이고 deleteMany 를 호출하지 않는다', async (_label, body) => {
        const res = await fundingPost(post(body), params);

        expect(res.status).toBe(400);
        expect(tx.fundingPlan.deleteMany).not.toHaveBeenCalled();
        expect(tx.fundingSource.deleteMany).not.toHaveBeenCalled();
    });

    it('두 키가 모두 없으면 400 이고 아무것도 지우지 않는다', async () => {
        const res = await fundingPost(post({}), params);

        expect(res.status).toBe(400);
        expect(tx.fundingPlan.deleteMany).not.toHaveBeenCalled();
        expect(tx.fundingSource.deleteMany).not.toHaveBeenCalled();
    });

    it('plans 만 보내면 sources 는 건드리지 않는다', async () => {
        const res = await fundingPost(post({ plans: [validPlan] }), params);

        expect(res.status).toBe(200);
        expect(tx.fundingPlan.deleteMany).toHaveBeenCalledTimes(1);
        expect(tx.fundingSource.deleteMany).not.toHaveBeenCalled();
    });

    it('sources 만 보내면 plans 는 건드리지 않는다', async () => {
        await fundingPost(post({ sources: [validSource] }), params);

        expect(tx.fundingSource.deleteMany).toHaveBeenCalledTimes(1);
        expect(tx.fundingPlan.deleteMany).not.toHaveBeenCalled();
    });

    it('클라이언트가 보낸 id 는 저장되지 않는다', async () => {
        await fundingPost(post({
            plans: [{ ...validPlan, id: 'hijack', createdAt: '2020-01-01' }],
        }), params);

        const [{ data }] = tx.fundingPlan.createMany.mock.calls[0];
        expect(data[0]).not.toHaveProperty('id');
        expect(data[0]).not.toHaveProperty('createdAt');
        expect(data[0].projectId).toBe('project_1');
    });
});
