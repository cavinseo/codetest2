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
        // 트랜잭션 밖 findMany 는 두 가지다: 다른 프로젝트 id 조회(NOT 조건)와
        // 캐스케이드 확인 전 개정값 검사. 조건으로 갈라 각자의 mock 으로 보낸다.
        customerRequirement: {
            count: mocks.deletedExistingCount,
            findMany: (args: { where?: { NOT?: unknown } }) =>
                (args?.where?.NOT ? mocks.foreignFindMany(args) : mocks.findMany(args)),
        },
        $transaction: mocks.transaction,
    },
}));
vi.mock('../lib/authorization', () => ({ requireProjectAccess: mocks.access }));

import { POST } from '../app/api/projects/[id]/requirements/route';
import { worksheetRevision } from '../lib/worksheet-revision';

const params = { params: Promise.resolve({ id: 'project-1' }) };

// mocks.findMany 가 기본으로 빈 배열을 돌려주므로 빈 워크시트를 읽은 개정값이 기본이다.
function request(requirements: unknown[], extra: Record<string, unknown> = {}, revision = worksheetRevision([])) {
    return new NextRequest('http://localhost/api/projects/project-1/requirements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'If-Match': revision },
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
            // 지우기 직전 캐스케이드 재확인이 트랜잭션 안에서 다시 센다.
            count: mocks.deletedExistingCount,
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
    const saved = [{ id: 'saved-1', requirement: '기존 응답' }];
    mocks.findMany.mockResolvedValue(saved);
    mocks.updateMany.mockResolvedValue({ count: 1 });

    const response = await POST(request([
        { id: 'saved-1', category: '품질', requirement: '개선된 응답', order: 0 },
    ], {}, worksheetRevision(saved)), params);

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

// 화면이 읽은 뒤 다른 사람이 요구사항을 추가하면, 그 행은 제출 id 에 없어 notIn
// 삭제로 지워진다. 읽은 시점의 개정값이 다르면 아무것도 바꾸지 않아야 한다(감리 B3).
it('읽은 뒤 다른 사람이 요구사항을 추가했으면 캐스케이드 확인 전에 409 로 막는다', async () => {
    mocks.findMany.mockResolvedValue([{ id: 'added-by-other', requirement: '다른 사람이 추가' }]);

    const response = await POST(request([
        { id: 'saved-1', category: '품질', requirement: '내 수정', order: 0 },
    ]), params);

    expect(response.status).toBe(409);
    expect(mocks.deletedExistingCount).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
});

it('확인 뒤 트랜잭션 안에서 바뀐 것을 발견해도 409 이고 지우지 않는다', async () => {
    // 첫 조회(확인 전)는 화면이 읽은 그대로, 트랜잭션 안 조회는 그 사이 바뀐 상태다.
    mocks.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValue([{ id: 'added-by-other', requirement: '다른 사람이 추가' }]);

    const response = await POST(request([
        { id: 'saved-1', category: '품질', requirement: '내 수정', order: 0 },
    ]), params);

    expect(response.status).toBe(409);
    expect(mocks.deleteMany).not.toHaveBeenCalled();
});

it('개정값 없이 저장하면 428 이고 바꾸지 않는다', async () => {
    const withoutRevision = request([{ id: 'saved-1', category: '품질', requirement: '내 수정', order: 0 }]);
    withoutRevision.headers.delete('If-Match');

    const response = await POST(withoutRevision, params);

    expect(response.status).toBe(428);
    expect(mocks.transaction).not.toHaveBeenCalled();
});

it('저장 후 새 개정값을 돌려준다', async () => {
    const response = await POST(request([
        { id: 'new-1', category: '품질', requirement: '빠른 응답', order: 0 },
    ]), params);

    await expect(response.json()).resolves.toMatchObject({ revision: worksheetRevision([]) });
});

it('명시적으로 전체 삭제를 요청하면 빈 목록을 저장한다', async () => {
    const response = await POST(request([], { deleteAll: true }), params);
    expect(response.status).toBe(200);
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { projectId: 'project-1' } });
});
