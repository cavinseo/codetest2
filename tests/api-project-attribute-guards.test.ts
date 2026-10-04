// 제품 속성 초기화와 적합도 저장에서 연결 데이터의 프로젝트 경계를 지킨다.
import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
    access: vi.fn(), projectFind: vi.fn(), attributesFind: vi.fn(), attributesDelete: vi.fn(),
    fitnessDelete: vi.fn(), fitnessCreate: vi.fn(), fitnessFind: vi.fn(), cascadeImpact: vi.fn(),
}));

vi.mock('../lib/authorization', () => ({ requireProjectAccess: mocks.access }));
vi.mock('../lib/prisma', () => ({ prisma: {
    project: { findUnique: mocks.projectFind },
    productAttribute: { findMany: mocks.attributesFind, deleteMany: mocks.attributesDelete },
    attributeFitness: { findMany: mocks.fitnessFind, deleteMany: mocks.fitnessDelete, createMany: mocks.fitnessCreate },
    $transaction: async (callback: (tx: unknown) => unknown) => callback({
        productAttribute: { deleteMany: mocks.attributesDelete, createMany: vi.fn(), findMany: mocks.attributesFind },
        attributeFitness: { deleteMany: mocks.fitnessDelete, createMany: mocks.fitnessCreate, findMany: mocks.fitnessFind },
    }),
} }));
vi.mock('../lib/import-cascade-guard', () => ({
    countAttributeCascadeImpact: (...args: unknown[]) => mocks.cascadeImpact(...args),
    describeAttributeCascadeImpact: () => '적합도 기록이 연결되어 있습니다.',
}));

const { DELETE: resetAttributes } = await import('../app/api/projects/[id]/attributes/route');
const { POST: saveFitness } = await import('../app/api/projects/[id]/attributes/fitness/route');
const params = { params: Promise.resolve({ id: 'project-1' }) };
const request = (path: string, method: string, body?: unknown) => new NextRequest(`http://localhost${path}`, {
    method,
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
});

beforeEach(() => {
    vi.clearAllMocks();
    mocks.access.mockResolvedValue({ role: 'OWNER', user: { userId: 'owner-1' } });
    mocks.projectFind.mockResolvedValue({ id: 'project-1' });
    mocks.cascadeImpact.mockResolvedValue({ fitnesses: 2 });
    mocks.attributesFind.mockResolvedValue([]);
    mocks.attributesDelete.mockResolvedValue({ count: 1 });
    mocks.fitnessDelete.mockResolvedValue({ count: 0 });
    mocks.fitnessCreate.mockResolvedValue({ count: 1 });
    mocks.fitnessFind.mockResolvedValue([]);
});

it('적합도 기록이 연결된 속성 초기화는 확인 전까지 삭제하지 않는다', async () => {
    const response = await resetAttributes(request('/api/projects/project-1/attributes', 'DELETE'), params);

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ needsCascadeConfirm: true, cascadeImpact: { fitnesses: 2 } });
    expect(mocks.attributesDelete).not.toHaveBeenCalled();
});

it('초기화 확인 후에만 연결된 적합도를 삭제한다', async () => {
    const response = await resetAttributes(request('/api/projects/project-1/attributes', 'DELETE', { confirmedCascadeImpact: { fitnesses: 2 } }), params);

    expect(response.status).toBe(200);
    expect(mocks.attributesDelete).toHaveBeenCalledWith({ where: { projectId: 'project-1' } });
});

it('초기화 확인 이후 영향 범위가 바뀌면 다시 확인을 요구한다', async () => {
    mocks.cascadeImpact.mockResolvedValue({ fitnesses: 3 });
    const response = await resetAttributes(request('/api/projects/project-1/attributes', 'DELETE', {
        confirmedCascadeImpact: { fitnesses: 2 },
    }), params);

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ needsCascadeConfirm: true, cascadeImpact: { fitnesses: 3 } });
    expect(mocks.attributesDelete).not.toHaveBeenCalled();
});

it('연결 적합도가 있는 전체 저장은 영향 확인 전까지 교체하지 않는다', async () => {
    const response = await (await import('../app/api/projects/[id]/attributes/route')).POST(
        request('/api/projects/project-1/attributes', 'POST', { attributes: [] }), params,
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ needsCascadeConfirm: true, cascadeImpact: { fitnesses: 2 } });
    expect(mocks.attributesDelete).not.toHaveBeenCalled();
});

it('전체 저장 확인 이후 영향 범위가 바뀌면 교체하지 않는다', async () => {
    mocks.cascadeImpact.mockResolvedValue({ fitnesses: 3 });
    const response = await (await import('../app/api/projects/[id]/attributes/route')).POST(
        request('/api/projects/project-1/attributes', 'POST', {
            attributes: [], confirmedCascadeImpact: { fitnesses: 2 },
        }), params,
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ needsCascadeConfirm: true, cascadeImpact: { fitnesses: 3 } });
    expect(mocks.attributesDelete).not.toHaveBeenCalled();
});

it('다른 프로젝트 속성이 포함된 적합도 저장을 거부한다', async () => {
    const response = await saveFitness(request('/api/projects/project-1/attributes/fitness', 'POST', {
        fitnesses: [{ attributeId: 'project-2-attribute', importance: 3, currentLevel: 2, targetLevel: 4 }],
    }), params);

    expect(response.status).toBe(400);
    expect(mocks.attributesFind).toHaveBeenCalledWith({
        where: { projectId: 'project-1', id: { in: ['project-2-attribute'] } }, select: { id: true },
    });
    expect(mocks.fitnessDelete).not.toHaveBeenCalled();
});
