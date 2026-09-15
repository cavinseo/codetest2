// 타 프로그램 승인과 이미 처리한 신청의 재승인을 서버에서 차단하는지 검증한다.
import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const m = vi.hoisted(() => ({ auth: vi.fn(), user: vi.fn(), list: vi.fn(), find: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() }));
vi.mock('../lib/auth', () => ({ requireAuth: m.auth }));
vi.mock('../lib/prisma', () => ({ prisma: { user: { findUnique: m.user }, project: { count: m.count }, projectCreationRequest: { findMany: m.list, findUnique: m.find, create: m.create, updateMany: m.update } } }));
import { GET, POST, PATCH } from '../app/api/project-requests/route';
const req = (method: string, body?: unknown) => new NextRequest('http://localhost/api/project-requests', { method, ...(body ? { body: JSON.stringify(body) } : {}) });
beforeEach(() => {
    vi.resetAllMocks();
    m.auth.mockResolvedValue({ userId: 'mentee', role: 'MENTEE' });
    m.user.mockResolvedValue({ programId: 'program' });
    m.find.mockResolvedValue({ id: 'request', program: { managerId: 'manager' } });
    m.update.mockResolvedValue({ count: 1 });
    m.list.mockResolvedValue([]);
    m.count.mockResolvedValue(1);
});
it('멘티는 본인과 소속 프로그램으로만 신청한다', async () => {
    expect((await POST(req('POST', { reason: '추가 개발', menteeId: 'other', programId: 'other' }))).status).toBe(201);
    expect(m.create.mock.calls[0][0].data).toEqual({ menteeId: 'mentee', programId: 'program', reason: '추가 개발' });
});
it('중복 대기 신청은 409로 처리한다', async () => {
    m.create.mockRejectedValue({ code: 'P2002' });
    expect((await POST(req('POST', { reason: '추가 개발' }))).status).toBe(409);
});
it('멘티는 본인 신청만 조회한다', async () => {
    expect((await GET(req('GET'))).status).toBe(200);
    expect(m.list.mock.calls.every(([args]) => args.where.menteeId === 'mentee')).toBe(true);
});
it('매니저는 담당 프로그램의 신청만 조회한다', async () => {
    m.auth.mockResolvedValue({ userId: 'manager', role: 'PROGRAM_MANAGER' });
    await GET(req('GET'));
    expect(m.list.mock.calls.every(([args]) => args.where.program.managerId === 'manager')).toBe(true);
});

it('100개를 넘는 최신 이력 뒤의 미결·미사용 승인을 모두 보존하고 완료 이력만 100개로 제한한다', async () => {
    const active = Array.from({ length: 105 }, (_, i) => ({ id: `pending-${i}`, status: 'PENDING', usedAt: null, createdAt: new Date(2025, 0, i + 1) }));
    const approved = { id: 'approved', status: 'APPROVED', usedAt: null, createdAt: new Date(2024, 0, 1) };
    const history = Array.from({ length: 110 }, (_, i) => ({ id: `history-${i}`, status: i % 2 ? 'REJECTED' : 'APPROVED', usedAt: i % 2 ? null : new Date(2026, 0, 1), createdAt: new Date(2026, 0, i + 1) }));
    const rows = [...active, approved, ...history];
    const isActive = (row: typeof rows[number]) => row.status === 'PENDING' || (row.status === 'APPROVED' && row.usedAt === null);
    m.list.mockImplementation(async ({ where, take }) => rows
        .filter(row => where.OR ? isActive(row) : where.NOT ? !isActive(row) : true)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, take));
    const body = await (await GET(req('GET'))).json();
    expect(body.requests.filter((row: { status: string }) => row.status === 'PENDING')).toHaveLength(105);
    expect(body.requests.find((row: { id: string }) => row.id === 'approved')).toBeDefined();
    expect(body.requests.filter((row: { id: string }) => row.id.startsWith('history-'))).toHaveLength(100);
    expect(body.requests).toHaveLength(206);
    expect(body.ownedProjectCount).toBe(1);
    expect(m.list.mock.calls[0][0].where.OR).toEqual([{ status: 'PENDING' }, { status: 'APPROVED', usedAt: null }]);
    expect(m.list.mock.calls[1][0].where.NOT).toEqual({ OR: [{ status: 'PENDING' }, { status: 'APPROVED', usedAt: null }] });
});
it('조회 사이에 처리된 신청은 중복 행 없이 완료 상태를 표시한다', async () => {
    const request = { id: 'transition', status: 'PENDING', createdAt: new Date('2026-09-01') };
    m.list.mockResolvedValueOnce([request]).mockResolvedValueOnce([{ ...request, status: 'REJECTED' }]);
    const body = await (await GET(req('GET'))).json();
    expect(body.requests).toEqual([expect.objectContaining({ id: 'transition', status: 'REJECTED' })]);
});
it.each(['APPROVED', 'REJECTED'])('담당 매니저의 %s 처리는 미결 건만 갱신한다', async status => {
    m.auth.mockResolvedValue({ userId: 'manager', role: 'PROGRAM_MANAGER' });
    expect((await PATCH(req('PATCH', { requestId: 'request', status }))).status).toBe(200);
    expect(m.update.mock.calls[0][0].where).toEqual({ id: 'request', status: 'PENDING', program: { managerId: 'manager' } });
    expect(m.update.mock.calls[0][0].data).toMatchObject({ status, reviewedById: 'manager' });
});
it.each(['MENTEE', 'MENTOR'])('%s의 승인을 차단한다', async role => {
    m.auth.mockResolvedValue({ userId: 'mentee', role });
    expect((await PATCH(req('PATCH', { requestId: 'request', status: 'APPROVED' }))).status).toBe(403);
    expect(m.update).not.toHaveBeenCalled();
});
it('타 프로그램 매니저는 승인할 수 없다', async () => {
    m.auth.mockResolvedValue({ userId: 'other', role: 'PROGRAM_MANAGER' });
    expect((await PATCH(req('PATCH', { requestId: 'request', status: 'APPROVED' }))).status).toBe(403);
    expect(m.update).not.toHaveBeenCalled();
});
it('처리 완료 또는 동시 처리된 신청은 409로 거절한다', async () => {
    m.auth.mockResolvedValue({ userId: 'manager', role: 'PROGRAM_MANAGER' });
    m.update.mockResolvedValue({ count: 0 });
    expect((await PATCH(req('PATCH', { requestId: 'request', status: 'APPROVED' }))).status).toBe(409);
});
it('빈 사유는 저장하지 않는다', async () => {
    expect((await POST(req('POST', { reason: '  ' }))).status).toBe(400);
    expect(m.create).not.toHaveBeenCalled();
});
