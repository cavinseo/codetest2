// WS-2 세세부기술 열의 접기 선택이 권한을 확인하고 프로젝트에 저장되는지 검증한다.
import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const db = vi.hoisted(() => ({
    collapsed: false,
    findUnique: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
    access: vi.fn(),
}));
vi.mock('../lib/prisma', () => ({ prisma: {
    project: { findUnique: db.findUnique, update: db.update },
    specFunction: { findMany: db.findMany },
} }));
vi.mock('../lib/authorization', () => ({ requireProjectAccess: db.access }));
const route = await import('../app/api/projects/[id]/spec/route');
const context = { params: Promise.resolve({ id: 'project' }) };
const request = (method: string, body?: unknown) => new NextRequest('http://localhost/api/projects/project/spec', {
    method, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

beforeEach(() => {
    db.collapsed = false;
    vi.clearAllMocks();
    db.access.mockResolvedValue({ role: 'OWNER' });
    db.findUnique.mockImplementation(async () => ({ id: 'project', specDetailCollapsed: db.collapsed }));
    db.findMany.mockResolvedValue([]);
    db.update.mockImplementation(async ({ data }: { data: { specDetailCollapsed: boolean } }) => {
        db.collapsed = data.specDetailCollapsed;
        return { specDetailCollapsed: db.collapsed };
    });
});

it('접기 선택을 저장하고 다음 조회에서도 반환한다', async () => {
    expect((await (await route.GET(request('GET'), context)).json()).specDetailCollapsed).toBe(false);
    expect((await route.PATCH(request('PATCH', { specDetailCollapsed: true }), context)).status).toBe(200);
    expect((await (await route.GET(request('GET'), context)).json()).specDetailCollapsed).toBe(true);
    expect(db.update).toHaveBeenCalledWith({
        where: { id: 'project' }, data: { specDetailCollapsed: true }, select: { specDetailCollapsed: true },
    });
    expect(db.access).toHaveBeenCalledWith(expect.any(NextRequest), 'project', { write: true });
});

it('잘못된 접기 값과 쓰기 권한이 없는 요청을 거부한다', async () => {
    expect((await route.PATCH(request('PATCH', { specDetailCollapsed: 'true' }), context)).status).toBe(400);
    db.access.mockResolvedValueOnce(NextResponse.json({ error: '권한 없음' }, { status: 403 }));
    expect((await route.PATCH(request('PATCH', { specDetailCollapsed: true }), context)).status).toBe(403);
    expect(db.update).not.toHaveBeenCalled();
});
