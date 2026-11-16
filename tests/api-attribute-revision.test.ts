// 제품속성 전체 교체와 초기화가 오래된 화면의 저장 요청을 거부하는지 검증한다.
import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { worksheetRevision } from '../lib/worksheet-revision';

const m = vi.hoisted(() => ({ access: vi.fn(), project: vi.fn(), count: vi.fn(), find: vi.fn(),
    transaction: vi.fn(), remove: vi.fn(), create: vi.fn() }));
vi.mock('../lib/authorization', () => ({ requireProjectAccess: m.access }));
vi.mock('../lib/prisma', () => ({ prisma: {
    project: { findUnique: m.project }, attributeFitness: { count: m.count },
    productAttribute: { findMany: m.find, deleteMany: m.remove }, $transaction: m.transaction,
} }));
const { GET, POST, DELETE } = await import('../app/api/projects/[id]/attributes/route');
const props = { params: Promise.resolve({ id: 'project' }) };
const current = [{ id: 'attribute', projectId: 'project', productName: '기존 제품', order: 0 }];

function request(method: string, revision?: string) {
    return new NextRequest('http://localhost/api/projects/project/attributes', {
        method, headers: { 'Content-Type': 'application/json', ...(revision ? { 'If-Match': revision } : {}) },
        ...(method === 'GET' ? {} : { body: JSON.stringify(method === 'POST' ? { attributes: [] } : {}) }),
    });
}

beforeEach(() => {
    vi.resetAllMocks();
    m.access.mockResolvedValue({ role: 'OWNER' });
    m.project.mockResolvedValue({ id: 'project' });
    m.count.mockResolvedValue(0);
    m.find.mockResolvedValue(current);
    m.transaction.mockImplementation(async callback => callback({ productAttribute: {
        findMany: m.find, deleteMany: m.remove, createMany: m.create,
    }, attributeFitness: { count: m.count } }));
});

it('조회 결과에 현재 revision을 포함한다', async () => {
    const response = await GET(request('GET'), props);
    expect((await response.json()).revision).toBe(worksheetRevision(current));
});

it('오래된 revision으로 전체 교체하면 기존 속성을 삭제하지 않는다', async () => {
    const response = await POST(request('POST', 'outdated'), props);
    expect(response.status).toBe(409);
    expect(m.remove).not.toHaveBeenCalled();
});

it('revision 없이 전체 교체하면 기존 속성을 삭제하지 않는다', async () => {
    const response = await POST(request('POST'), props);
    expect(response.status).toBe(428);
    expect(m.remove).not.toHaveBeenCalled();
});

it('오래된 revision으로 초기화하면 기존 속성을 삭제하지 않는다', async () => {
    const response = await DELETE(request('DELETE', 'outdated'), props);
    expect(response.status).toBe(409);
    expect(m.remove).not.toHaveBeenCalled();
});
