// 회원 이용만료일 변경의 권한·날짜·초대 기한 하한과 세션 처리를 검증한다.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
    requireAdmin: vi.fn(), findUser: vi.fn(), findInvite: vi.fn(), updateUser: vi.fn(), lock: vi.fn(),
}));
vi.mock('../lib/authorization', () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock('../lib/prisma', () => ({ prisma: {
    user: { findUnique: mocks.findUser },
    $transaction: async (run: (tx: unknown) => unknown) => run({
        $queryRaw: mocks.lock,
        user: { findUnique: mocks.findUser, updateMany: mocks.updateUser },
        inviteCode: { findFirst: mocks.findInvite },
    }),
} }));
const { PATCH } = await import('../app/api/admin/users/route');
const currentExpiry = new Date('2026-10-31T14:59:59.999Z');
const user = { id: 'member', email: 'member@example.test', role: 'MENTEE', programId: 'program', accessExpiresAt: currentExpiry };
const request = (accessExpiresAt: unknown) => new NextRequest('http://localhost/api/admin/users', {
    method: 'PATCH', body: JSON.stringify({ userId: user.id, action: 'setAccessExpiry', accessExpiresAt }),
});

beforeEach(() => {
    mocks.requireAdmin.mockResolvedValue({ userId: 'admin', role: 'ADMIN' });
    mocks.findUser.mockResolvedValue(user);
    mocks.findInvite.mockResolvedValue({ expiresAt: new Date('2026-09-30T14:59:59.999Z') });
    mocks.updateUser.mockResolvedValue({ count: 1 });
    mocks.lock.mockResolvedValue([]);
});
afterEach(() => vi.resetAllMocks());

it('초대보다 긴 이용만료일을 한국 시간 하루 끝으로 저장하고 초대는 바꾸지 않는다', async () => {
    const response = await PATCH(request('2026-12-31'));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, user: { accessExpiresAt: '2026-12-31T14:59:59.999Z' } });
    expect(mocks.updateUser).toHaveBeenCalledWith(expect.objectContaining({ data: { accessExpiresAt: new Date('2026-12-31T14:59:59.999Z') } }));
    expect(mocks.lock.mock.calls[0].slice(1)).toContain('invite-email:member@example.test');
    expect(mocks.lock.mock.invocationCallOrder[0]).toBeLessThan(mocks.findInvite.mock.invocationCallOrder[0]);
});
it('초대 기한과 같은 날짜로 단축할 수 있고 기존 세션을 무효화한다', async () => {
    expect((await PATCH(request('2026-09-30'))).status).toBe(200);
    expect(mocks.updateUser.mock.calls[0][0].data.sessionVersion).toEqual({ increment: 1 });
});
it('초대 기한보다 이른 이용만료일은 저장하지 않는다', async () => {
    const response = await PATCH(request('2026-09-29'));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('초대 코드');
    expect(mocks.updateUser).not.toHaveBeenCalled();
});
it.each([undefined, null, '', '2026-02-30', '2026-13-01', '2026-10-01T00:00:00Z'])('유효하지 않은 날짜 %s를 거절한다', async value => {
    expect((await PATCH(request(value))).status).toBe(400);
    expect(mocks.updateUser).not.toHaveBeenCalled();
});
it('초대 없는 무기한 회원도 날짜를 지정할 수 있다', async () => {
    mocks.findUser.mockResolvedValue({ ...user, role: 'MENTOR', accessExpiresAt: null });
    mocks.findInvite.mockResolvedValue(null);
    expect((await PATCH(request('2026-12-31'))).status).toBe(200);
    expect(mocks.updateUser.mock.calls[0][0].data.sessionVersion).toEqual({ increment: 1 });
});
it('동시에 변경된 회원 정보는 덮어쓰지 않는다', async () => {
    mocks.updateUser.mockResolvedValue({ count: 0 });
    expect((await PATCH(request('2026-12-31'))).status).toBe(409);
});
it('관리자 권한이 없으면 회원을 조회하거나 변경하지 않는다', async () => {
    mocks.requireAdmin.mockResolvedValue(NextResponse.json({ error: '권한 없음' }, { status: 403 }));
    expect((await PATCH(request('2026-12-31'))).status).toBe(403);
    expect(mocks.findUser).not.toHaveBeenCalled();
    expect(mocks.updateUser).not.toHaveBeenCalled();
});
