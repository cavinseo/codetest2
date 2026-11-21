// 제품 속성 적합도 전체 교체 저장이 다른 사람의 저장을 덮어쓰지 않는지 확인한다(감리 B3).
import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { worksheetRevision } from '../lib/worksheet-revision';

const mocks = vi.hoisted(() => ({
    access: vi.fn(),
    findProject: vi.fn(),
    findAttributes: vi.fn(),
    findFitnesses: vi.fn(),
    deleteFitnesses: vi.fn(),
    createFitnesses: vi.fn(),
}));

vi.mock('../lib/authorization', () => ({ requireProjectAccess: mocks.access }));
vi.mock('../lib/logger', () => ({ createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }));
vi.mock('../lib/prisma', () => {
    const attributeFitness = {
        findMany: mocks.findFitnesses,
        deleteMany: mocks.deleteFitnesses,
        createMany: mocks.createFitnesses,
    };
    return {
        prisma: {
            project: { findUnique: mocks.findProject },
            productAttribute: { findMany: mocks.findAttributes },
            attributeFitness,
            $transaction: async (callback: (tx: unknown) => unknown) => callback({ attributeFitness }),
        },
    };
});

import { GET, POST } from '../app/api/projects/[id]/attributes/fitness/route';

const params = { params: Promise.resolve({ id: 'project-1' }) };
const fitness = { attributeId: 'attr-1', importance: 5, currentLevel: 3, targetLevel: 7, note: '' };

function save(revision: string | null) {
    return new NextRequest('http://localhost/api/projects/project-1/attributes/fitness', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(revision ? { 'If-Match': revision } : {}) },
        body: JSON.stringify({ fitnesses: [fitness] }),
    });
}

beforeEach(() => {
    vi.resetAllMocks();
    mocks.access.mockResolvedValue({ user: { userId: 'user-1' }, role: 'OWNER' });
    mocks.findProject.mockResolvedValue({ id: 'project-1' });
    mocks.findAttributes.mockResolvedValue([{ id: 'attr-1' }]);
    mocks.findFitnesses.mockResolvedValue([]);
});

it('GET 은 저장 때 돌려보낼 개정값을 준다', async () => {
    const saved = [{ id: 'fit-1', projectId: 'project-1', ...fitness }];
    mocks.findFitnesses.mockResolvedValue(saved);

    const response = await GET(new NextRequest('http://localhost/api/projects/project-1/attributes/fitness'), params);

    await expect(response.json()).resolves.toEqual({ fitnesses: saved, revision: worksheetRevision(saved) });
    // 개정값 해시가 매번 같은 순서로 만들어지도록 정렬해 읽는다.
    expect(mocks.findFitnesses).toHaveBeenCalledWith({ where: { projectId: 'project-1' }, orderBy: { id: 'asc' } });
});

it('읽은 개정값이 맞으면 전체 교체 후 새 개정값을 돌려준다', async () => {
    const response = await POST(save(worksheetRevision([])), params);

    expect(response.status).toBe(200);
    expect(mocks.deleteFitnesses).toHaveBeenCalledOnce();
    expect(mocks.createFitnesses).toHaveBeenCalledOnce();
    await expect(response.json()).resolves.toMatchObject({ revision: worksheetRevision([]) });
});

it('읽은 뒤 다른 사람이 저장했으면 409 이고 지우지 않는다', async () => {
    mocks.findFitnesses.mockResolvedValue([{ id: 'fit-other', projectId: 'project-1', ...fitness, importance: 9 }]);

    const response = await POST(save(worksheetRevision([])), params);

    expect(response.status).toBe(409);
    expect(mocks.deleteFitnesses).not.toHaveBeenCalled();
    expect(mocks.createFitnesses).not.toHaveBeenCalled();
});

it('개정값 없이 저장하면 428 이고 지우지 않는다', async () => {
    // 조회에 실패한 화면은 개정값이 없다. 그 화면의 기본값으로 저장된 적합도를 덮으면 안 된다.
    const response = await POST(save(null), params);

    expect(response.status).toBe(428);
    expect(mocks.deleteFitnesses).not.toHaveBeenCalled();
});
