// 프로젝트 스펙과 적합도 저장 API의 입력 검증을 확인한다.
import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { worksheetRevision } from '../lib/worksheet-revision';

const mocks = vi.hoisted(() => ({
    access: vi.fn(),
    project: vi.fn(),
    transaction: vi.fn(),
    deleteSpecs: vi.fn(),
    createSpec: vi.fn(),
    findSpecs: vi.fn(),
    saveFitnessMatrix: vi.fn(),
    findFitnessMatrix: vi.fn(),
}));

vi.mock('../lib/authorization', () => ({ requireProjectAccess: mocks.access }));
vi.mock('../lib/prisma', () => ({
    prisma: {
        project: { findUnique: mocks.project },
        $transaction: mocks.transaction,
        fitnessMatrix: { upsert: mocks.saveFitnessMatrix },
    },
}));

import { POST as saveSpecs } from '../app/api/projects/[id]/spec/route';
import { POST as saveFitnessMatrix } from '../app/api/projects/[id]/fitness-matrix/route';

const params = { params: Promise.resolve({ id: 'project-1' }) };

function requestFor(path: string, body: unknown) {
    return new NextRequest(`http://localhost${path}`, {
        method: 'POST',
        // 스펙은 저장된 행 하나를, 적합도 매트릭스는 아직 저장 전(빈 상태)을 읽은 화면으로 본다.
        headers: {
            'Content-Type': 'application/json',
            'If-Match': path.endsWith('/spec') ? worksheetRevision([{ id: 'saved-spec', name: '핵심 기능' }]) : worksheetRevision([]),
        },
        body: JSON.stringify(body),
    });
}

function invalidJsonRequest(path: string) {
    return new NextRequest(`http://localhost${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{',
    });
}

beforeEach(() => {
    vi.resetAllMocks();
    mocks.access.mockResolvedValue({ user: { userId: 'user-1', role: 'MENTEE' } });
    mocks.project.mockResolvedValue({ id: 'project-1' });
    mocks.createSpec.mockResolvedValue({ id: 'saved-spec' });
    mocks.findSpecs.mockResolvedValue([{ id: 'saved-spec', name: '핵심 기능' }]);
    mocks.transaction.mockImplementation(async (callback) => callback({
        specFunction: {
            deleteMany: mocks.deleteSpecs,
            create: mocks.createSpec,
            findMany: mocks.findSpecs,
        },
        fitnessMatrix: {
            findUnique: mocks.findFitnessMatrix,
            upsert: mocks.saveFitnessMatrix,
        },
    }));
    mocks.findFitnessMatrix.mockResolvedValue(null);
    mocks.saveFitnessMatrix.mockResolvedValue({ id: 'fitness-1', projectId: 'project-1' });
});

it.each([
    ['배열이 아닌 스펙 목록', { specFunctions: {} }],
    ['허용되지 않은 스펙 단계', { specFunctions: [{ level: 'UNKNOWN', name: '기능', order: 0 }] }],
    ['이름이 비어 있는 스펙', { specFunctions: [{ level: 'CORE', name: '   ', order: 0 }] }],
    ['존재하지 않는 상위 스펙', { specFunctions: [{ id: 'sub', level: 'SUB', parentId: 'missing', name: '세부 기능', order: 0 }] }],
    ['잘못된 상위 단계', { specFunctions: [
        { id: 'core', level: 'CORE', name: '핵심', order: 0 },
        { id: 'detail', level: 'DETAIL', parentId: 'core', name: '세세부', order: 1 },
    ] }],
    ['중복 스펙 ID', { specFunctions: [
        { id: 'same', level: 'CORE', name: '핵심', order: 0 },
        { id: 'same', level: 'CORE', name: '핵심 둘', order: 1 },
    ] }],
])('유효하지 않은 %s은 스펙 데이터를 바꾸지 않고 400을 반환한다', async (_name, body) => {
    const response = await saveSpecs(requestFor('/api/projects/project-1/spec', body), params);

    expect(response.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
});

it('잘못된 JSON 스펙 요청은 DB 호출 없이 400을 반환한다', async () => {
    const response = await saveSpecs(invalidJsonRequest('/api/projects/project-1/spec'), params);

    expect(response.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
});

it('유효한 스펙 저장은 기존 단계별 저장 동작을 유지한다', async () => {
    const response = await saveSpecs(requestFor('/api/projects/project-1/spec', {
        specFunctions: [{ id: 'core_0', level: 'CORE', name: '핵심 기능', order: 0 }],
    }), params);

    expect(response.status).toBe(200);
    expect(mocks.deleteSpecs).toHaveBeenCalledWith({ where: { projectId: 'project-1' } });
    expect(mocks.createSpec).toHaveBeenCalledWith({
        data: {
            projectId: 'project-1',
            level: 'CORE',
            name: '핵심 기능',
            technology: null,
            order: 0,
        },
    });
});

it('빈 스펙 목록으로 초기화하면 저장된 스펙도 삭제한다', async () => {
    mocks.findSpecs.mockResolvedValue([]);

    const request = requestFor('/api/projects/project-1/spec', {
        specFunctions: [],
    });
    request.headers.set('If-Match', worksheetRevision([]));
    const response = await saveSpecs(request, params);

    expect(response.status).toBe(200);
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.deleteSpecs).toHaveBeenCalledWith({ where: { projectId: 'project-1' } });
    expect(mocks.createSpec).not.toHaveBeenCalled();
    expect((await response.json()).specFunctions).toEqual([]);
});

it('오래된 스펙 revision으로 저장하면 기존 행을 지우지 않는다', async () => {
    const request = requestFor('/api/projects/project-1/spec', { specFunctions: [] });
    request.headers.set('If-Match', 'outdated');

    const response = await saveSpecs(request, params);

    expect(response.status).toBe(409);
    expect(mocks.deleteSpecs).not.toHaveBeenCalled();
    expect(mocks.createSpec).not.toHaveBeenCalled();
});

it('스펙 revision 없이 전체 교체를 요청하면 저장을 거부한다', async () => {
    const request = requestFor('/api/projects/project-1/spec', { specFunctions: [] });
    request.headers.delete('If-Match');

    const response = await saveSpecs(request, params);

    expect(response.status).toBe(428);
    expect(mocks.deleteSpecs).not.toHaveBeenCalled();
});

it.each([
    ['필수 JSON 값이 없는 요청', { matrixJson: '{}' }],
    ['문자열이 아닌 JSON 값', { marketsJson: [], matrixJson: '{}' }],
    ['손상된 JSON 문자열', { marketsJson: '{', matrixJson: '{}' }],
])('유효하지 않은 %s은 적합도 데이터를 바꾸지 않고 400을 반환한다', async (_name, body) => {
    const response = await saveFitnessMatrix(requestFor('/api/projects/project-1/fitness-matrix', body), params);

    expect(response.status).toBe(400);
    expect(mocks.saveFitnessMatrix).not.toHaveBeenCalled();
});

it('잘못된 JSON 적합도 요청은 DB 호출 없이 400을 반환한다', async () => {
    const response = await saveFitnessMatrix(invalidJsonRequest('/api/projects/project-1/fitness-matrix'), params);

    expect(response.status).toBe(400);
    expect(mocks.saveFitnessMatrix).not.toHaveBeenCalled();
});

it('유효한 적합도 저장은 기존 upsert 동작을 유지한다', async () => {
    const response = await saveFitnessMatrix(requestFor('/api/projects/project-1/fitness-matrix', {
        marketsJson: '[]',
        matrixJson: '{}',
        managerComment: '멘티 의견',
        consultantNote: '멘토 의견',
    }), params);

    expect(response.status).toBe(200);
    expect(mocks.saveFitnessMatrix).toHaveBeenCalledWith({
        where: { projectId: 'project-1' },
        update: {
            marketsJson: '[]',
            matrixJson: '{}',
            managerComment: '멘티 의견',
            consultantNote: '멘토 의견',
        },
        create: {
            projectId: 'project-1',
            marketsJson: '[]',
            matrixJson: '{}',
            managerComment: '멘티 의견',
            consultantNote: '멘토 의견',
        },
    });
    await expect(response.json()).resolves.toMatchObject({
        revision: worksheetRevision([{ id: 'fitness-1', projectId: 'project-1' }]),
    });
});

// 매트릭스 전체를 덮어쓰므로, 화면이 읽은 뒤 다른 사람이 저장했으면 막아야 한다(감리 B3).
it('적합도 매트릭스를 읽은 뒤 다른 사람이 저장했으면 409 이고 덮어쓰지 않는다', async () => {
    mocks.findFitnessMatrix.mockResolvedValue({ id: 'fitness-1', projectId: 'project-1', matrixJson: '{"a":1}' });

    const response = await saveFitnessMatrix(requestFor('/api/projects/project-1/fitness-matrix', {
        marketsJson: '[]',
        matrixJson: '{}',
    }), params);

    expect(response.status).toBe(409);
    expect(mocks.saveFitnessMatrix).not.toHaveBeenCalled();
});

it('적합도 매트릭스를 개정값 없이 저장하면 428 이고 덮어쓰지 않는다', async () => {
    const request = requestFor('/api/projects/project-1/fitness-matrix', { marketsJson: '[]', matrixJson: '{}' });
    request.headers.delete('If-Match');

    const response = await saveFitnessMatrix(request, params);

    expect(response.status).toBe(428);
    expect(mocks.saveFitnessMatrix).not.toHaveBeenCalled();
});

// 행마다 순차로 create 해서 기본 5초로는 큰 스펙이 원격 DB 에서 끝까지 저장되지 못한다.
// 엑셀 업로드와 같은 제한 시간을 써야 한다(감리 B15).
it('스펙 화면 저장은 엑셀 업로드와 같은 트랜잭션 제한 시간을 쓴다', async () => {
    const { SPEC_SAVE_TIMEOUT_MS } = await import('../lib/spec-save-timeout');
    const response = await saveSpecs(requestFor('/api/projects/project-1/spec', {
        specFunctions: [{ id: 'core', level: 'CORE', name: '핵심 기능', order: 0 }],
    }), params);

    expect(response.status).toBe(200);
    expect(SPEC_SAVE_TIMEOUT_MS).toBeGreaterThan(5_000);
    expect(mocks.transaction.mock.calls[0][1]).toEqual({ isolationLevel: 'Serializable', timeout: SPEC_SAVE_TIMEOUT_MS });
});
