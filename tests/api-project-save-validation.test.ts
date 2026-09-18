// 프로젝트 스펙과 적합도 저장 API의 입력 검증을 확인한다.
import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
    access: vi.fn(),
    project: vi.fn(),
    transaction: vi.fn(),
    deleteSpecs: vi.fn(),
    createSpec: vi.fn(),
    findSpecs: vi.fn(),
    saveFitnessMatrix: vi.fn(),
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
        headers: { 'Content-Type': 'application/json' },
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
    }));
    mocks.saveFitnessMatrix.mockResolvedValue({ id: 'fitness-1', projectId: 'project-1' });
});

it.each([
    ['배열이 아닌 스펙 목록', { specFunctions: {} }],
    ['허용되지 않은 스펙 단계', { specFunctions: [{ level: 'UNKNOWN', name: '기능', order: 0 }] }],
    ['이름이 비어 있는 스펙', { specFunctions: [{ level: 'CORE', name: '   ', order: 0 }] }],
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
});
