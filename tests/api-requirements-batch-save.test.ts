// 새 고객요구사항을 대량 저장할 때 개별 삽입을 피하는지 확인한다.
import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
    access: vi.fn(),
    deletedExistingCount: vi.fn(),
    // 트랜잭션 밖에서 "다른 프로젝트의 id" 를 찾는 조회(main 의 기본키 노출 방지)
    foreignFindMany: vi.fn(),
    transaction: vi.fn(),
    deleteMany: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
    createMany: vi.fn(),
    create: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
    prisma: {
        customerRequirement: { count: mocks.deletedExistingCount, findMany: mocks.foreignFindMany },
        $transaction: mocks.transaction,
    },
}));
vi.mock('../lib/authorization', () => ({ requireProjectAccess: mocks.access }));

import { POST } from '../app/api/projects/[id]/requirements/route';

const params = { params: Promise.resolve({ id: 'project-1' }) };

function request(requirements: unknown[], extra: Record<string, unknown> = {}) {
    return new NextRequest('http://localhost/api/projects/project-1/requirements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requirements, ...extra }),
    });
}

beforeEach(() => {
    vi.resetAllMocks();
    mocks.access.mockResolvedValue({ user: { userId: 'user-1' }, role: 'OWNER' });
    mocks.deletedExistingCount.mockResolvedValue(0);
    mocks.findMany.mockResolvedValue([]);
    mocks.foreignFindMany.mockResolvedValue([]);
    mocks.updateMany.mockResolvedValue({ count: 0 });
    mocks.create.mockResolvedValue({});
    const downstream = () => ({ findMany: vi.fn(async () => []), updateMany: vi.fn() });
    mocks.transaction.mockImplementation(async (callback) => callback({
        techTreeEntry: downstream(), improvementItem: downstream(), techRoadmap: downstream(), targetSpec: downstream(),
        customerRequirement: {
            deleteMany: mocks.deleteMany,
            findMany: mocks.findMany,
            updateMany: mocks.updateMany,
            createMany: mocks.createMany,
            create: mocks.create,
        },
    }));
});

it('새 요구사항 여러 개를 한 번의 createMany로 저장한다', async () => {
    const response = await POST(request([
        { id: 'new-1', category: '품질', requirement: '빠른 응답', order: 0 },
        { id: 'new-2', category: '품질', requirement: '오류 없음', order: 1 },
        { id: 'new-3', category: '가격', requirement: '합리적 비용', order: 2 },
    ]), params);

    expect(response.status).toBe(200);
    expect(mocks.createMany).toHaveBeenCalledOnce();
    expect(mocks.createMany).toHaveBeenCalledWith({
        data: [
            expect.objectContaining({ id: 'new-1', projectId: 'project-1', requirement: '빠른 응답' }),
            expect.objectContaining({ id: 'new-2', projectId: 'project-1', requirement: '오류 없음' }),
            expect.objectContaining({ id: 'new-3', projectId: 'project-1', requirement: '합리적 비용' }),
        ],
    });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
});

it('기존 요구사항은 연결된 데이터를 보존하도록 ID별 수정 경로를 사용한다', async () => {
    mocks.findMany.mockResolvedValue([{ id: 'saved-1', requirement: '기존 응답' }]);
    mocks.updateMany.mockResolvedValue({ count: 1 });

    const response = await POST(request([
        { id: 'saved-1', category: '품질', requirement: '개선된 응답', order: 0 },
    ]), params);

    expect(response.status).toBe(200);
    expect(mocks.updateMany).toHaveBeenCalledWith({
        where: { id: 'saved-1', projectId: 'project-1' },
        data: expect.objectContaining({ requirement: '개선된 응답' }),
    });
    expect(mocks.createMany).not.toHaveBeenCalled();
});

it.each([
    { category: '   ', requirement: '빠른 응답' },
    { category: '품질', requirement: '   ' },
])('필수 텍스트가 비어 있으면 변경 전에 거절한다 (%j)', async row => {
    const response = await POST(request([{ id: 'saved-1', ...row, order: 0 }]), params);
    expect(response.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
});

it('빈 목록은 명시적 전체 삭제 요청 없이 받지 않는다', async () => {
    const response = await POST(request([]), params);
    expect(response.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
});

it('명시적으로 전체 삭제를 요청하면 빈 목록을 저장한다', async () => {
    const response = await POST(request([], { deleteAll: true }), params);
    expect(response.status).toBe(200);
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { projectId: 'project-1' } });
});
