// 이메일과 개인 초대 코드의 최초 로그인 및 반복 로그인 경계를 검증한다.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ findInvite: vi.fn(), findUser: vi.fn(), create: vi.fn(), update: vi.fn(), lock: vi.fn(), profile: vi.fn(), cookie: vi.fn(), rate: vi.fn() }));
vi.mock('../lib/prisma', () => ({ prisma: {
    $transaction: async (fn: (tx: unknown) => unknown) => fn({
        $queryRaw: mocks.lock,
        inviteCode: { findUnique: mocks.findInvite, updateMany: mocks.update },
        user: { findFirst: mocks.findUser, create: mocks.create },
    }), memberProfile: { findUnique: mocks.profile },
} }));
vi.mock('next/headers', () => ({ cookies: async () => ({ set: mocks.cookie }) }));
vi.mock('../lib/auth', () => ({ encodeSessionCookie: () => 'signed-session' }));
vi.mock('../lib/rate-limit', () => ({ LOGIN_RATE_LIMIT: {}, clientIpFrom: () => 'local', consumeRateLimit: mocks.rate, resetRateLimit: vi.fn() }));
const { POST } = await import('../app/api/auth/invite-login/route');
const now = new Date();
const invite = { id: 'i', code: 'KSQF-ABCD-EFGH-JKMN', email: 'm@example.com', role: 'MENTEE', usedAt: null, usedById: null, usedBy: null, programId: 'p', program: { endsAt: new Date(now.getTime() + 180 * 86400000) }, expiresAt: new Date(now.getTime() + 86400000) };
const user = { id: 'u', email: invite.email, name: null, role: 'MENTEE', status: 'APPROVED', programId: 'p', accessExpiresAt: null, sessionVersion: 3, mustChangePassword: false };
const request = (body: unknown = { email: invite.email, inviteCode: invite.code }) => new NextRequest('http://localhost/api/auth/invite-login', { method: 'POST', body: JSON.stringify(body) });
beforeEach(() => {
    vi.clearAllMocks();
    mocks.rate.mockReturnValue({ allowed: true });
    mocks.findInvite.mockResolvedValue(invite);
    mocks.findUser.mockResolvedValue(null);
    mocks.create.mockResolvedValue(user);
    mocks.update.mockResolvedValue({ count: 1 });
    mocks.profile.mockResolvedValue(null);
});
describe('초대 코드 로그인', () => {
    it.each([30, 365])('미사용 코드의 과거 %s일 설정과 무관하게 90일을 부여한다', async (accessDurationDays) => {
        mocks.findInvite.mockResolvedValue({ ...invite, accessDurationDays });
        expect((await POST(request())).status).toBe(200);
        const firstLogin = mocks.update.mock.calls[0][0].data.usedAt as Date;
        const expiry = mocks.create.mock.calls[0][0].data.accessExpiresAt as Date;
        expect(expiry.getTime() - firstLogin.getTime()).toBe(90 * 86400000);
    });

    it('비밀번호 없이 멘티 계정을 생성하고 온보딩 세션을 발급한다', async () => {
        const res = await POST(request());
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({ success: true, needsProfile: true, mustChangePassword: false, user: { id: 'u' } });
        expect(mocks.create.mock.calls[0][0].data).toMatchObject({ role: 'MENTEE', status: 'APPROVED', programId: 'p', mustChangePassword: false });
        expect(mocks.lock).toHaveBeenCalled();
        expect(mocks.cookie).toHaveBeenCalledWith(expect.any(String), 'signed-session', expect.objectContaining({ httpOnly: true }));
    });
    it('사용된 기존 코드의 14일 가입 기한은 재로그인에 적용하지 않는다', async () => {
        mocks.findInvite.mockResolvedValue({ ...invite, usedAt: now, usedById: 'u', usedBy: user, expiresAt: new Date(0) });
        expect((await POST(request())).status).toBe(200);
        expect(mocks.create).not.toHaveBeenCalled();
        expect(mocks.update).not.toHaveBeenCalled();
    });
    it.each([
        { email: 'other@example.com' }, { role: 'MENTOR' }, { expiresAt: new Date(0) },
        { program: { endsAt: new Date(0) } }, { usedAt: now, usedById: null },
        { usedAt: now, usedById: 'u', usedBy: { ...user, role: 'ADMIN' } },
        { usedAt: now, usedById: 'u', usedBy: { ...user, isAdmin: true } },
        { usedAt: now, usedById: 'u', usedBy: { ...user, status: 'PENDING' } },
        { usedAt: now, usedById: 'u', usedBy: { ...user, programId: 'other' } },
        { usedAt: new Date(now.getTime() - 90 * 86400000), usedById: 'u', usedBy: user },
    ])('유효하지 않은 코드 또는 연결 계정을 거절한다 %j', async (overrides) => {
        mocks.findInvite.mockResolvedValue({ ...invite, ...overrides });
        expect((await POST(request())).status).toBe(403);
        expect(mocks.cookie).not.toHaveBeenCalled();
        expect(mocks.create).not.toHaveBeenCalled();
    });
    it('기존 이메일 계정을 새 코드에 연결하지 않는다', async () => {
        mocks.findUser.mockResolvedValue(user);
        expect((await POST(request())).status).toBe(403);
        expect(mocks.create).not.toHaveBeenCalled();
    });
    it('잘못된 입력과 시도 제한을 구분한다', async () => {
        expect((await POST(request({ email: 'bad', inviteCode: '' }))).status).toBe(400);
        mocks.rate.mockReturnValue({ allowed: false, retryAfterSeconds: 60 });
        const res = await POST(request());
        expect(res.status).toBe(429);
        expect(res.headers.get('Retry-After')).toBe('60');
    });
});
