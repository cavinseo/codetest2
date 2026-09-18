// 새 고객요구사항을 대량 저장할 때 개별 삽입을 피하는지 확인한다.
import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
    access: vi.fn(),
    deletedExistingCount: vi.fn(),
    transaction: vi.fn(),
    deleteMany: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
    createMany: vi.fn(),
    create: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
    prisma: {
        customerRequirement: { count: mocks.deletedExistingCount },
        $transaction: mocks.transaction,
    },
}));
vi.mock('../lib/authorization', () => ({ requireProjectAccess: mocks.access }));

import { POST } from '../app/api/projects/[id]/requirements/route';

const params = { params: Promise.resolve({ id: 'project-1' }) };

function request(requirements: unknown[]) {
    return new NextRequest('http://localhost/api/projects/project-1/requirements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requirements }),
    });
}

beforeEach(() => {
    vi.resetAllMocks();
    mocks.access.mockResolvedValue({ user: { userId: 'user-1' }, role: 'OWNER' });
    mocks.deletedExistingCount.mockResolvedValue(0);
    mocks.findMany.mockResolvedValue([]);
    mocks.updateMany.mockResolvedValue({ count: 0 });
    mocks.create.mockResolvedValue({});
    mocks.transaction.mockImplementation(async (callback) => callback({
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
    mocks.findMany.mockResolvedValue([{ id: 'saved-1' }]);
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
