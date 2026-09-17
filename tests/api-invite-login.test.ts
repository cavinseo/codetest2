// 초대 코드 로그인의 최초 사용, 반복 로그인, 인증 실패 및 트랜잭션 경계를 검증한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
    findInvite: vi.fn(), findUser: vi.fn(), create: vi.fn(), update: vi.fn(), lock: vi.fn(),
    profile: vi.fn(), cookie: vi.fn(), rate: vi.fn(), reset: vi.fn(), encode: vi.fn(), hash: vi.fn(),
    rollback: vi.fn(), commit: vi.fn(), log: vi.fn(), updateName: vi.fn(),
}));
vi.mock('../lib/prisma', () => ({ prisma: {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
        try {
            const value = await fn({
                $queryRaw: mocks.lock,
                inviteCode: { findUnique: mocks.findInvite, updateMany: mocks.update },
                user: { findFirst: mocks.findUser, create: mocks.create, update: mocks.updateName },
            });
            mocks.commit();
            return value;
        } catch (error) {
            mocks.rollback();
            throw error;
        }
    }, memberProfile: { findUnique: mocks.profile },
} }));
vi.mock('next/headers', () => ({ cookies: async () => ({ set: mocks.cookie }) }));
vi.mock('../lib/auth', () => ({ encodeSessionCookie: mocks.encode }));
vi.mock('bcryptjs', () => ({ default: { hash: mocks.hash } }));
vi.mock('../lib/logger', () => ({ createLogger: () => ({ error: mocks.log }) }));
vi.mock('../lib/rate-limit', () => ({ LOGIN_RATE_LIMIT: {}, clientIpFrom: () => 'local', consumeRateLimit: mocks.rate, resetRateLimit: mocks.reset }));
const { POST } = await import('../app/api/auth/invite-login/route');
const now = new Date('2026-09-15T00:00:00Z');
const after = (days: number) => new Date(now.getTime() + days * 86_400_000);
const invite = {
    id: 'invite', code: 'KSQF-ABCD-EFGH-JKMN', email: 'mentee@example.com', role: 'MENTEE',
    usedAt: null, usedById: null, usedBy: null, programId: 'program',
    program: { endsAt: after(500) }, expiresAt: after(14), accessDurationDays: 90,
};
const user = { id: 'user', email: invite.email, name: '홍길동', role: 'MENTEE', isAdmin: false, status: 'APPROVED', programId: 'program', accessExpiresAt: null, sessionVersion: 3, mustChangePassword: false };
const used = { ...invite, usedAt: now, usedById: 'user', usedBy: user };
const request = (body: unknown = { email: invite.email, inviteCode: invite.code, name: '홍길동' }) => new NextRequest('http://localhost/api/auth/invite-login', { method: 'POST', body: JSON.stringify(body) });
beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    mocks.rate.mockReturnValue({ allowed: true });
    mocks.encode.mockReturnValue('signed-session');
    mocks.hash.mockResolvedValue('hashed-random-password');
    mocks.findInvite.mockResolvedValue(invite);
    mocks.findUser.mockResolvedValue(null);
    mocks.create.mockResolvedValue(user);
    mocks.updateName.mockResolvedValue(user);
    mocks.update.mockResolvedValue({ count: 1 });
    mocks.profile.mockResolvedValue(null);
});
afterEach(() => vi.useRealTimers());

describe('초대 코드 로그인', () => {
    it('지정된 날짜까지 이용하도록 계정을 만들고 재로그인으로 연장하지 않는다', async () => {
        mocks.findInvite.mockResolvedValue({ ...invite, expiresAt: after(10), accessExpiresAt: after(10) });
        expect((await POST(request())).status).toBe(200);
        expect(mocks.create.mock.calls[0][0].data.accessExpiresAt).toEqual(after(10));
        mocks.findInvite.mockResolvedValue({ ...used, accessExpiresAt: after(10), usedBy: { ...user, accessExpiresAt: after(10) } });
        vi.setSystemTime(after(9));
        expect((await POST(request())).status).toBe(200);
        expect(mocks.create).toHaveBeenCalledTimes(1);
        mocks.cookie.mockClear();
        vi.setSystemTime(after(10));
        expect((await POST(request())).status).toBe(403);
        expect(mocks.cookie).not.toHaveBeenCalled();
    });
    it('공통 이용 기한이 남아 있어도 회수된 미사용 코드는 거부한다', async () => {
        mocks.findInvite.mockResolvedValue({ ...invite, expiresAt: now, accessExpiresAt: after(10) });
        expect((await POST(request())).status).toBe(403);
        expect(mocks.create).not.toHaveBeenCalled();
    });
    it('비밀번호 없이 멘티 계정을 생성하고 서명된 온보딩 세션을 발급한다', async () => {
        const res = await POST(request());
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({ success: true, needsProfile: true, mustChangePassword: false, user: { id: 'user' } });
        expect(mocks.create.mock.calls[0][0].data).toMatchObject({ name: '홍길동', role: 'MENTEE', status: 'APPROVED', programId: 'program', mustChangePassword: false, accessExpiresAt: after(90), passwordHash: 'hashed-random-password' });
        expect(mocks.hash.mock.calls[0][0]).toMatch(/^[a-f0-9]{64}$/);
        expect(mocks.lock.mock.calls[0][0].join('?')).toContain('pg_advisory_xact_lock');
        expect(mocks.lock.mock.calls[0][1]).toBe(`invite-email:${invite.email}`);
        expect(mocks.lock.mock.calls[1][0].join('?')).toContain('SELECT id FROM invite_codes WHERE code = ? FOR UPDATE');
        expect(mocks.lock.mock.calls[1][1]).toBe(invite.code);
        expect(mocks.update).toHaveBeenCalledWith({ where: { id: 'invite', usedAt: null, usedById: null }, data: { usedAt: now, usedById: 'user' } });
        expect(mocks.encode).toHaveBeenCalledWith({ userId: 'user', email: invite.email, name: '홍길동' }, { sessionVersion: 3 });
        expect(mocks.cookie).toHaveBeenCalledWith('session', 'signed-session', expect.objectContaining({ httpOnly: true, sameSite: 'strict', path: '/' }));
        expect(mocks.commit).toHaveBeenCalledOnce();
        expect(mocks.reset).toHaveBeenCalledWith(`invite-login:local:${invite.email}`);
    });
    it('이메일 대소문자와 코드 구분 문자를 정규화한다', async () => {
        expect((await POST(request({ email: ' MENTEE@EXAMPLE.COM ', inviteCode: 'ksqf abcd efgh jkmn', name: ' 홍길동 ' }))).status).toBe(200);
        expect(mocks.findInvite).toHaveBeenCalledWith(expect.objectContaining({ where: { code: invite.code } }));
        expect(mocks.findUser).toHaveBeenCalledWith({ where: { email: { equals: invite.email, mode: 'insensitive' } } });
    });
    it.each([30, 365])('최초 생성 시 저장된 %i일 기간을 사용한다', async (days) => {
        mocks.findInvite.mockResolvedValue({ ...invite, accessDurationDays: days });
        expect((await POST(request())).status).toBe(200);
        expect(mocks.create.mock.calls[0][0].data.accessExpiresAt).toEqual(after(days));
    });
    it('프로그램 종료 시각이 더 빠르면 생성 계정의 이용 기간을 제한한다', async () => {
        mocks.findInvite.mockResolvedValue({ ...invite, program: { endsAt: after(2) } });
        expect((await POST(request())).status).toBe(200);
        expect(mocks.create.mock.calls[0][0].data.accessExpiresAt).toEqual(after(2));
    });
    it('반복 로그인은 최초 사용 기한이 지나도 계정과 기한을 변경하지 않는다', async () => {
        mocks.findInvite.mockResolvedValue({ ...used, usedAt: after(-20), expiresAt: after(-6) });
        mocks.profile.mockResolvedValue({ organization: '기관', phone: '010-0000-0000', companyName: '기업', industry: '제조' });
        const res = await POST(request());
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({ needsProfile: false });
        expect(mocks.findUser).not.toHaveBeenCalled();
        expect(mocks.create).not.toHaveBeenCalled();
        expect(mocks.update).not.toHaveBeenCalled();
    });
    it('관리자가 기간을 연장한 계정은 원래 초대 기간 후에도 같은 코드로 로그인한다', async () => {
        mocks.findInvite.mockResolvedValue({
            ...used, usedAt: after(-100), expiresAt: after(-86),
            usedBy: { ...user, accessExpiresAt: after(10) },
        });
        expect((await POST(request())).status).toBe(200);
        expect(mocks.create).not.toHaveBeenCalled();
        expect(mocks.update).not.toHaveBeenCalled();
        expect(mocks.cookie).toHaveBeenCalledOnce();
    });
    it('관리자가 연장했어도 프로그램 종료 후에는 초대 코드 로그인을 거절한다', async () => {
        mocks.findInvite.mockResolvedValue({
            ...used, usedAt: after(-100), expiresAt: after(-86),
            program: { endsAt: now }, usedBy: { ...user, accessExpiresAt: after(10) },
        });
        expect((await POST(request())).status).toBe(403);
        expect(mocks.cookie).not.toHaveBeenCalled();
        expect(mocks.update).not.toHaveBeenCalled();
    });
    it.each([
        ['없는 코드', null],
        ['다른 이메일', { ...invite, email: 'other@example.com' }],
        ['멘토 코드', { ...invite, role: 'MENTOR' }],
        ['코드 만료 경계', { ...invite, expiresAt: now }],
        ['프로그램 만료 경계', { ...invite, program: { endsAt: now } }],
        ['첫 사용의 연결 잔여값', { ...invite, usedById: 'user' }],
        ['연결 사용자 없음', { ...used, usedBy: null }],
        ['연결 ID 불일치', { ...used, usedById: 'other' }],
        ['연결 이메일 불일치', { ...used, usedBy: { ...user, email: 'other@example.com' } }],
        ['관리자 역할', { ...used, usedBy: { ...user, role: 'ADMIN' } }],
        ['관리자 플래그', { ...used, usedBy: { ...user, isAdmin: true } }],
        ['승인 대기', { ...used, usedBy: { ...user, status: 'PENDING' } }],
        ['프로그램 변경', { ...used, usedBy: { ...user, programId: 'other' } }],
        ['기존 계정 만료', { ...used, usedBy: { ...user, accessExpiresAt: now } }],
        ['저장된 30일 만료', { ...used, usedAt: after(-30), accessDurationDays: 30 }],
        ['저장된 90일 만료', { ...used, usedAt: after(-90) }],
    ])('%s는 동일한 인증 실패 응답을 주고 세션을 발급하지 않는다', async (_, record) => {
        mocks.findInvite.mockResolvedValue(record);
        const response = await POST(request());
        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({ error: '이메일과 초대 코드를 확인하세요. 이용 기한이 만료되었거나 사용할 수 없는 코드입니다.' });
        expect(mocks.cookie).not.toHaveBeenCalled();
        expect(mocks.create).not.toHaveBeenCalled();
        expect(mocks.update).not.toHaveBeenCalled();
        expect(mocks.reset).not.toHaveBeenCalled();
    });
    it('기존 이메일 계정에 새 코드를 연결하지 않는다', async () => {
        mocks.findUser.mockResolvedValue(user);
        expect((await POST(request())).status).toBe(403);
        expect(mocks.create).not.toHaveBeenCalled();
        expect(mocks.update).not.toHaveBeenCalled();
    });
    it('코드 선점에 실패하면 트랜잭션을 실패시키고 쿠키를 발급하지 않는다', async () => {
        mocks.update.mockResolvedValue({ count: 0 });
        expect((await POST(request())).status).toBe(403);
        expect(mocks.rollback).toHaveBeenCalledOnce();
        expect(mocks.commit).not.toHaveBeenCalled();
        expect(mocks.cookie).not.toHaveBeenCalled();
    });
    it('동시 생성의 고유 제약 오류는 인증 실패로 처리한다', async () => {
        mocks.create.mockRejectedValueOnce({ code: 'P2002', message: 'secret email/code' });
        expect((await POST(request())).status).toBe(403);
        expect(mocks.rollback).toHaveBeenCalledOnce();
        expect(mocks.cookie).not.toHaveBeenCalled();
    });
    it('예상하지 못한 DB 오류의 민감 내용을 응답과 로그에서 제외한다', async () => {
        mocks.findInvite.mockRejectedValueOnce(new Error('secret email/code'));
        const response = await POST(request());
        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: '로그인 중 오류가 발생했습니다.' });
        expect(JSON.stringify(mocks.log.mock.calls)).not.toContain('secret email/code');
        expect(mocks.cookie).not.toHaveBeenCalled();
    });
    it.each([
        { email: 'bad', inviteCode: '' },
        { email: invite.email, inviteCode: '' },
        { email: invite.email, inviteCode: 'a'.repeat(101) },
    ])('입력 검증 실패는 DB 조회 전에 거부한다', async (body) => {
        expect((await POST(request(body))).status).toBe(400);
        expect(mocks.lock).not.toHaveBeenCalled();
        expect(mocks.cookie).not.toHaveBeenCalled();
    });
    it('시도 제한은 DB 조회 전에 429와 재시도 시간을 반환한다', async () => {
        mocks.rate.mockReturnValue({ allowed: false, retryAfterSeconds: 60 });
        const res = await POST(request());
        expect(res.status).toBe(429);
        expect(res.headers.get('Retry-After')).toBe('60');
        expect(mocks.lock).not.toHaveBeenCalled();
        expect(mocks.cookie).not.toHaveBeenCalled();
    });
});

describe('멘티 이름 필수 등록', () => {
    it.each([undefined, '', '   ', '\t\n'])('이름 %j로는 계정 생성·코드 사용·세션 발급을 하지 않는다', async name => {
        const res = await POST(request({ email: invite.email, inviteCode: invite.code, name }));
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ code: 'INVITE_NAME_REQUIRED', error: '등록을 완료하려면 이름을 입력하세요.' });
        expect(mocks.create).not.toHaveBeenCalled();
        expect(mocks.update).not.toHaveBeenCalled();
        expect(mocks.cookie).not.toHaveBeenCalled();
    });
    it('이름의 앞뒤 공백을 제거하여 저장한다', async () => {
        expect((await POST(request({ email: invite.email, inviteCode: invite.code, name: ' 홍길동 ' }))).status).toBe(200);
        expect(mocks.create.mock.calls[0][0].data.name).toBe('홍길동');
    });
    it('이름이 있는 기존 멘티의 재로그인은 이름 입력과 변경 없이 허용한다', async () => {
        mocks.findInvite.mockResolvedValue(used);
        expect((await POST(request({ email: invite.email, inviteCode: invite.code }))).status).toBe(200);
        expect((await POST(request({ email: invite.email, inviteCode: invite.code, name: '다른 이름' }))).status).toBe(200);
        expect(mocks.updateName).not.toHaveBeenCalled();
        expect(mocks.create).not.toHaveBeenCalled();
        expect(mocks.encode).toHaveBeenCalledWith({ userId: 'user', email: invite.email, name: '홍길동' }, { sessionVersion: 3 });
    });
    it('예전에 이름 없이 등록된 멘티는 다음 코드 로그인에서 이름을 보완한다', async () => {
        mocks.findInvite.mockResolvedValue({ ...used, usedBy: { ...user, name: null } });
        expect((await POST(request({ email: invite.email, inviteCode: invite.code }))).status).toBe(400);
        expect(mocks.cookie).not.toHaveBeenCalled();
        expect((await POST(request({ email: invite.email, inviteCode: invite.code, name: ' 홍길동 ' }))).status).toBe(200);
        expect(mocks.updateName).toHaveBeenCalledWith({ where: { id: 'user' }, data: { name: '홍길동' } });
        expect(mocks.update).not.toHaveBeenCalled();
    });
    it('잘못된 코드는 이름 입력 요청보다 먼저 거절한다', async () => {
        mocks.findInvite.mockResolvedValue(null);
        expect((await POST(request({ email: invite.email, inviteCode: invite.code }))).status).toBe(403);
        expect(mocks.updateName).not.toHaveBeenCalled();
    });
});
