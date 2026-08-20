// 팩토리로 만든 워크시트 라우트 5종이 같은 안전 속성을 지키는지 한 곳에서 검증한다.
//
// 1단계에서 잡은 결함들(검증 누락, 배열 형태 $transaction, mass-assignment)은 전부
// "복붙된 라우트 중 한쪽만 고쳐졌다"는 같은 원인에서 나왔다. 이제 구현이 하나이므로
// 테스트도 하나로 모아, 새 워크시트를 추가할 때 이 표에 한 줄만 더하면 되게 한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const models = [
    'salesEstimate', 'devPlan', 'techRoadmap', 'techTreeEntry', 'targetSpec',
] as const;

type ModelName = (typeof models)[number];

const tx = Object.fromEntries(
    models.map((name) => [name, {
        deleteMany: vi.fn(),
        createMany: vi.fn(),
        findMany: vi.fn(async () => []),
    }])
) as Record<ModelName, { deleteMany: ReturnType<typeof vi.fn>; createMany: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> }>;

vi.mock('../lib/prisma', () => ({
    prisma: {
        ...tx,
        $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    },
}));

const requireProjectAccess = vi.fn();
vi.mock('../lib/authorization', () => ({
    requireProjectAccess: (...args: unknown[]) => requireProjectAccess(...(args as [])),
}));

const sales = await import('../app/api/projects/[id]/sales/route');
const devPlan = await import('../app/api/projects/[id]/dev-plan/route');
const techRoadmap = await import('../app/api/projects/[id]/tech-roadmap/route');
const techTree = await import('../app/api/projects/[id]/tech-tree/route');
const targetSpec = await import('../app/api/projects/[id]/target-spec/route');

interface Case {
    label: string;
    post: (req: NextRequest, props: { params: Promise<{ id: string }> }) => Promise<Response>;
    model: ModelName;
    key: string;
    validRow: Record<string, unknown>;
}

const cases: Case[] = [
    {
        label: 'sales', post: sales.POST, model: 'salesEstimate', key: 'rows',
        validRow: { period: 'Y', customer: '동호회A', amount: 100, competitor: '경쟁사', order: 0 },
    },
    {
        label: 'dev-plan', post: devPlan.POST, model: 'devPlan', key: 'rows',
        validRow: { phase: '1단계', task: '설계', order: 0 },
    },
    {
        label: 'tech-roadmap', post: techRoadmap.POST, model: 'techRoadmap', key: 'rows',
        validRow: { category: '핵심', techItem: '집계엔진', order: 0 },
    },
    {
        label: 'tech-tree', post: techTree.POST, model: 'techTreeEntry', key: 'entries',
        validRow: { customerVoice: '자동 집계', coreSpec: '집계', order: 0 },
    },
    {
        label: 'target-spec', post: targetSpec.POST, model: 'targetSpec', key: 'rows',
        validRow: { category: '성능', specItem: '집계 시간', order: 0 },
    },
];

const params = { params: Promise.resolve({ id: 'project_1' }) };

function postRequest(body: unknown): NextRequest {
    return new NextRequest('http://localhost/api/projects/project_1/x', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
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

describe.each(cases)('$label 워크시트 저장', ({ post, model, key, validRow }) => {
    it('불량 바디는 400 이고 deleteMany 를 호출하지 않는다', async () => {
        for (const body of [{}, { [key]: null }, { [key]: 'oops' }, { wrongKey: [validRow] }]) {
            vi.clearAllMocks();
            requireProjectAccess.mockResolvedValue({
                user: { userId: 'user_1', email: 'a@b.com', name: null },
                role: 'OWNER',
            });

            const res = await post(postRequest(body), params);

            expect(res.status).toBe(400);
            expect(tx[model].deleteMany).not.toHaveBeenCalled();
            expect(tx[model].createMany).not.toHaveBeenCalled();
        }
    });

    it('정상 바디는 같은 트랜잭션에서 삭제 후 재생성한다', async () => {
        const res = await post(postRequest({ [key]: [validRow] }), params);

        expect(res.status).toBe(200);
        expect(tx[model].deleteMany).toHaveBeenCalledWith({ where: { projectId: 'project_1' } });
        expect(tx[model].createMany).toHaveBeenCalledTimes(1);
    });

    it('빈 배열은 의도적 초기화로 보고 삭제만 수행한다', async () => {
        const res = await post(postRequest({ [key]: [] }), params);

        expect(res.status).toBe(200);
        expect(tx[model].deleteMany).toHaveBeenCalledTimes(1);
        expect(tx[model].createMany).not.toHaveBeenCalled();
    });

    it('클라이언트가 보낸 임의 필드는 저장되지 않는다', async () => {
        await post(postRequest({
            [key]: [{ ...validRow, id: 'hijack', projectId: 'other', createdAt: '2020-01-01' }],
        }), params);

        const [{ data }] = tx[model].createMany.mock.calls[0];
        expect(data[0]).not.toHaveProperty('id');
        expect(data[0]).not.toHaveProperty('createdAt');
        expect(data[0].projectId).toBe('project_1');
    });

    it('권한이 없으면 403 이고 아무것도 지우지 않는다', async () => {
        requireProjectAccess.mockResolvedValue(
            NextResponse.json({ error: 'forbidden' }, { status: 403 })
        );

        const res = await post(postRequest({ [key]: [validRow] }), params);

        expect(res.status).toBe(403);
        expect(tx[model].deleteMany).not.toHaveBeenCalled();
    });
});

describe('오류 응답', () => {
    it('내부 오류 메시지를 클라이언트에 노출하지 않는다', async () => {
        tx.salesEstimate.deleteMany.mockRejectedValueOnce(
            new Error('Invalid `prisma.salesEstimate.deleteMany()` invocation on table sales_estimates')
        );

        const res = await sales.POST(
            postRequest({ rows: [{ period: 'Y', customer: 'x', amount: 1, order: 0 }] }),
            params
        );
        const body = await res.json();

        expect(res.status).toBe(500);
        expect(JSON.stringify(body)).not.toContain('prisma');
        expect(JSON.stringify(body)).not.toContain('sales_estimates');
        expect(body.referenceId).toBeTruthy();
    });
});
