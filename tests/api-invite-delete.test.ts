// 미사용·미연결 초대 삭제의 권한, 경합 조건과 회원 보호를 검증한다.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), find: vi.fn(), remove: vi.fn(), log: vi.fn() }));
vi.mock('../lib/auth', () => ({ requireAuth: mocks.auth }));
vi.mock('../lib/prisma', () => ({ prisma: { inviteCode: { findUnique: mocks.find, deleteMany: mocks.remove } } }));
vi.mock('../lib/logger', () => ({ createLogger: () => ({ info: vi.fn(), error: mocks.log }) }));
import { DELETE } from '../app/api/invites/[id]/route';

const invite = { id: 'invite', usedAt: null, usedById: null, program: { managerId: 'manager' } };
const request = () => DELETE(new NextRequest('http://localhost/api/invites/invite', { method: 'DELETE' }), { params: Promise.resolve({ id: invite.id }) });
const authAs = (role: string) => mocks.auth.mockResolvedValue({ userId: 'manager', role, isAdmin: role === 'ADMIN' });

beforeEach(() => {
    authAs('ADMIN'); mocks.find.mockResolvedValue(invite); mocks.remove.mockResolvedValue({ count: 1 });
});
afterEach(() => vi.resetAllMocks());

it('비로그인 요청은 조회나 삭제 전에 401로 차단한다', async () => {
    mocks.auth.mockResolvedValue(NextResponse.json({ error: 'Login required.' }, { status: 401 }));
    expect((await request()).status).toBe(401);
    expect(mocks.find).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
});

it.each(['MENTOR', 'MENTEE'])('%s는 삭제할 수 없다', async role => {
    authAs(role);
    expect((await request()).status).toBe(403);
    expect(mocks.find).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
});

it.each(['ADMIN', 'PROGRAM_MANAGER'])('%s는 미사용·미연결 코드만 조건부 삭제한다', async role => {
    authAs(role);
    const result = await request();
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ success: true, id: invite.id });
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith({ where: {
        id: invite.id, usedAt: null, usedById: null,
        ...(role === 'PROGRAM_MANAGER' ? { program: { managerId: 'manager' } } : {}),
    } });
});

it.each([new Date(0), new Date('2099-01-01')])('만료 여부와 무관하게 미사용·미연결 코드의 기록을 삭제한다 (%s)', async expiresAt => {
    mocks.find.mockResolvedValue({ ...invite, expiresAt });
    expect((await request()).status).toBe(200);
    expect(mocks.remove).toHaveBeenCalledOnce();
});

it('관리자는 다른 매니저의 코드도 삭제할 수 있다', async () => {
    mocks.find.mockResolvedValue({ ...invite, program: { managerId: 'other' } });
    expect((await request()).status).toBe(200);
});

it('매니저는 다른 매니저 프로그램의 코드를 삭제할 수 없다', async () => {
    authAs('PROGRAM_MANAGER');
    mocks.find.mockResolvedValue({ ...invite, program: { managerId: 'other' } });
    expect((await request()).status).toBe(403);
    expect(mocks.remove).not.toHaveBeenCalled();
});

it.each([
    { usedAt: new Date(), usedById: 'member' },
    { usedAt: null, usedById: 'member' },
    { usedAt: new Date(), usedById: null },
])('사용 이력이나 회원 연결이 있으면 삭제를 거절한다 (%j)', async changes => {
    mocks.find.mockResolvedValue({ ...invite, ...changes });
    const result = await request();
    expect(result.status).toBe(409);
    expect(await result.json()).toMatchObject({ error: '사용했거나 회원이 연결된 초대 코드는 삭제할 수 없습니다.' });
    expect(mocks.remove).not.toHaveBeenCalled();
});

it('조회 후 사용·연결·삭제 상태가 바뀌면 삭제 성공으로 응답하지 않는다', async () => {
    mocks.remove.mockResolvedValue({ count: 0 });
    const result = await request();
    expect(result.status).toBe(409);
    expect(await result.json()).toMatchObject({ error: expect.stringContaining('변경') });
});

it('이미 없는 코드는 404를 반환한다', async () => {
    mocks.find.mockResolvedValue(null);
    expect((await request()).status).toBe(404);
    expect(mocks.remove).not.toHaveBeenCalled();
});

it('DB 오류의 상세와 초대 정보를 응답이나 로그에 노출하지 않는다', async () => {
    mocks.remove.mockRejectedValue(Object.assign(new Error('private-invite-code'), { code: 'P2003' }));
    const result = await request();
    expect(result.status).toBe(500);
    expect(await result.text()).not.toContain('private-invite-code');
    expect(mocks.log).toHaveBeenCalledWith('초대 코드 삭제 실패', undefined, { code: 'P2003' });
});
