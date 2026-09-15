// 본인 비밀번호 설정의 초대 소유권·세션·경합 경계를 검증한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { SESSION_COOKIE_NAME } from '../lib/constants';
import { clearAllRateLimits } from '../lib/rate-limit';

const findUser = vi.fn();
const updateUser = vi.fn();
const updateMany = vi.fn();
vi.mock('../lib/prisma', () => ({ prisma: { user: { findUnique: findUser, update: updateUser, updateMany } } }));
const requireAuth = vi.fn();
vi.mock('../lib/auth', async (importOriginal) => ({
    ...await importOriginal<typeof import('../lib/auth')>(),
    requireAuth: (...args: unknown[]) => requireAuth(...args),
}));
const cookieSet = vi.fn();
vi.mock('next/headers', () => ({ cookies: async () => ({ set: cookieSet }) }));
const compare = vi.fn();
const hash = vi.fn();
vi.mock('bcryptjs', () => ({ default: {
    compare: (...args: unknown[]) => compare(...args), hash: (...args: unknown[]) => hash(...args),
} }));
const logError = vi.fn();
vi.mock('../lib/logger', () => ({ createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: logError }) }));

const { POST } = await import('../app/api/admin/password/route');
const { encodeSessionCookie, verifySessionCookie } = await import('../lib/auth');
const validBody = { currentPassword: 'oldpassword', newPassword: 'newpassword123', confirmPassword: 'newpassword123' };
const inviteBody = { verificationMethod: 'invite', inviteCode: ' ksqf abcd efgh jkmn ', newPassword: 'newpassword123', confirmPassword: 'newpassword123' };
const day = 86_400_000;
function account() {
    return {
        id: 'user_1', email: 'u@x.com', name: '사용자', passwordHash: 'old-hash', sessionVersion: 3,
        status: 'APPROVED', role: 'MENTEE', isAdmin: false, programId: 'program_1',
        accessExpiresAt: new Date(Date.now() + day),
        usedInviteCode: {
            id: 'invite_1', code: 'KSQF-ABCD-EFGH-JKMN', email: ' U@X.COM ', role: 'MENTEE',
            usedAt: new Date(Date.now() - 30 * day), usedById: 'user_1',
            expiresAt: new Date(Date.now() - 16 * day), accessDurationDays: 90, programId: 'program_1',
            program: { endsAt: new Date(Date.now() + 10 * day) },
        },
    };
}
function request(body: unknown, version = 3): NextRequest {
    const cookie = encodeSessionCookie({ userId: 'user_1', email: 'u@x.com', name: '사용자' }, { sessionVersion: version });
    return new NextRequest('http://localhost/api/admin/password', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'x-forwarded-for': '127.0.0.2' },
        body: JSON.stringify(body),
    });
}
beforeEach(() => {
    vi.stubEnv('SESSION_SECRET', 'test-only-long-enough-session-secret');
    requireAuth.mockResolvedValue({ userId: 'user_1', email: 'u@x.com', name: '사용자', isAdmin: false, role: 'MENTEE', accessExpiresAt: null });
    findUser.mockResolvedValue(account());
    updateUser.mockResolvedValue({ id: 'user_1', email: 'u@x.com', name: '사용자', sessionVersion: 4 });
    updateMany.mockResolvedValue({ count: 1 });
    compare.mockResolvedValue(true);
    hash.mockResolvedValue('new-hash');
    clearAllRateLimits();
});
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); clearAllRateLimits(); });

describe('본인 비밀번호와 세션 갱신', () => {
    it('기존 body를 받으며 본인 해시·버전·승인 상태에 원자적으로 갱신한다', async () => {
        const res = await POST(request({ ...validBody, userId: 'other-user' }));
        expect(res.status).toBe(200);
        expect(findUser.mock.calls[0][0].where.id).toBe('user_1');
        expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ id: 'user_1', passwordHash: 'old-hash', sessionVersion: 3, status: 'APPROVED' }),
            data: expect.objectContaining({ passwordHash: 'new-hash', mustChangePassword: false, sessionVersion: { increment: 1 } }),
        }));
        expect(updateUser).not.toHaveBeenCalled();
        expect(verifySessionCookie(cookieSet.mock.calls[0][1])?.ver).toBe(4);
        expect(requireAuth).toHaveBeenCalledWith(expect.anything(), { allowIncompleteOnboarding: true });
    });
    it('requireAuth 이후 버전이 바뀌었으면 서명 쿠키 버전으로 거절한다', async () => {
        findUser.mockResolvedValue({ ...account(), sessionVersion: 4 });
        expect((await POST(request(validBody))).status).toBe(401);
        expect(compare).not.toHaveBeenCalled();
        expect(updateMany).not.toHaveBeenCalled();
        expect(cookieSet).not.toHaveBeenCalled();
    });
    it('재조회에서 승인이 취소된 계정은 변경할 수 없다', async () => {
        findUser.mockResolvedValue({ ...account(), status: 'PENDING' });
        expect((await POST(request(validBody))).status).toBe(403);
        expect(updateMany).not.toHaveBeenCalled();
        expect(cookieSet).not.toHaveBeenCalled();
    });
    it('경합으로 조건부 갱신이 실패하면 성공 쿠키를 발급하지 않는다', async () => {
        updateMany.mockResolvedValue({ count: 0 });
        expect((await POST(request(validBody))).status).toBe(409);
        expect(cookieSet).not.toHaveBeenCalled();
    });
    it('관리자의 본인 현재비밀번호 변경을 유지한다', async () => {
        requireAuth.mockResolvedValue({ userId: 'user_1', email: 'u@x.com', role: 'ADMIN', isAdmin: true });
        findUser.mockResolvedValue({ ...account(), role: 'ADMIN', isAdmin: true, usedInviteCode: null });
        expect((await POST(request(validBody))).status).toBe(200);
    });
    it.each([
        { ...validBody, currentPassword: '' }, { ...validBody, newPassword: 'short' },
        { ...validBody, confirmPassword: 'different' },
        { ...validBody, newPassword: 'oldpassword', confirmPassword: 'oldpassword' },
        { ...validBody, verificationMethod: 'unknown' },
        { ...validBody, inviteCode: 'KSQF-ABCD-EFGH-JKMN' },
        { ...inviteBody, currentPassword: 'oldpassword' }, { ...inviteBody, inviteCode: '' },
    ])('잘못되거나 혼합된 입력은 변경하지 않는다 (%j)', async (body) => {
        expect((await POST(request(body))).status).toBe(400);
        expect(updateMany).not.toHaveBeenCalled();
        expect(cookieSet).not.toHaveBeenCalled();
    });
    it('반복 실패는 계정/IP 제한에 걸리고 확인 방식 전환으로 우회할 수 없다', async () => {
        compare.mockResolvedValue(false);
        for (let i = 0; i < 5; i++) expect((await POST(request(validBody))).status).toBe(400);
        const response = await POST(request(inviteBody));
        expect(response.status).toBe(429);
        expect(Number(response.headers.get('Retry-After'))).toBeGreaterThan(0);
        expect(updateMany).not.toHaveBeenCalled();
        expect(cookieSet).not.toHaveBeenCalled();
    });
    it('DB 예외에 포함된 새 해시·입력값을 로그와 응답에 노출하지 않는다', async () => {
        updateMany.mockRejectedValueOnce(new Error('new-hash secret-password u@x.com'));
        const response = await POST(request(validBody));
        expect(response.status).toBe(500);
        expect(JSON.stringify(logError.mock.calls)).not.toMatch(/new-hash|secret-password|u@x.com/);
        expect(await response.text()).not.toMatch(/new-hash|secret-password|u@x.com/);
        expect(cookieSet).not.toHaveBeenCalled();
    });
});

describe('초대 코드 확인', () => {
    it('본인 코드를 정규화하고 원래 가입 기한 뒤에도 실제 이용 기간 내에는 설정한다', async () => {
        const user = account();
        findUser.mockResolvedValue(user);
        const response = await POST(request(inviteBody));
        expect(response.status).toBe(200);
        expect(compare).not.toHaveBeenCalled();
        expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
            id: user.id, email: user.email, role: 'MENTEE', isAdmin: false, programId: user.programId, accessExpiresAt: user.accessExpiresAt,
            usedInviteCode: { is: expect.objectContaining({
                id: user.usedInviteCode.id, code: user.usedInviteCode.code, email: user.usedInviteCode.email, role: 'MENTEE',
                usedById: user.id, usedAt: user.usedInviteCode.usedAt, programId: user.programId,
                accessDurationDays: user.usedInviteCode.accessDurationDays,
                program: { is: { endsAt: user.usedInviteCode.program.endsAt } },
            }) },
        }) }));
        expect((await response.json()).message).toContain('초대 코드');
        expect(verifySessionCookie(cookieSet.mock.calls[0][1])?.ver).toBe(4);
    });
    it.each([
        ['틀린 코드', (user: ReturnType<typeof account>) => { user.usedInviteCode.code = 'KSQF-ZZZZ-ZZZZ-ZZZZ'; }],
        ['타인 코드', (user: ReturnType<typeof account>) => { user.usedInviteCode.usedById = 'other-user'; }],
        ['코드 이메일 불일치', (user: ReturnType<typeof account>) => { user.usedInviteCode.email = 'other@example.test'; }],
        ['본인 이메일 변경', (user: ReturnType<typeof account>) => { user.email = 'other@example.test'; }],
        ['코드 역할 불일치', (user: ReturnType<typeof account>) => { user.usedInviteCode.role = 'MENTOR'; }],
        ['본인 역할 불일치', (user: ReturnType<typeof account>) => { user.role = 'MENTOR'; }],
        ['관리자 플래그', (user: ReturnType<typeof account>) => { user.isAdmin = true; }],
        ['프로그램 불일치', (user: ReturnType<typeof account>) => { user.programId = 'other-program'; }],
        ['회원 이용 기간 만료', (user: ReturnType<typeof account>) => { user.accessExpiresAt = new Date(Date.now() - 1); }],
        ['프로그램 기간 만료', (user: ReturnType<typeof account>) => { user.usedInviteCode.program.endsAt = new Date(Date.now() - 1); }],
    ])('%s이면 거절하고 비밀번호와 쿠키를 보존한다', async (_name, mutate) => {
        const user = account();
        mutate(user);
        findUser.mockResolvedValue(user);
        expect((await POST(request(inviteBody))).status).toBe(403);
        expect(updateMany).not.toHaveBeenCalled();
        expect(cookieSet).not.toHaveBeenCalled();
    });
    it.each([null, { ...account().usedInviteCode, usedAt: null }, { ...account().usedInviteCode, usedById: null }])('연결되지 않거나 미사용 코드를 거부한다', async (usedInviteCode) => {
        findUser.mockResolvedValue({ ...account(), usedInviteCode });
        expect((await POST(request(inviteBody))).status).toBe(403);
        expect(updateMany).not.toHaveBeenCalled();
        expect(cookieSet).not.toHaveBeenCalled();
    });
    it('관리자 연장기한이 없으면 사용일과 이용일수로 만료를 판단한다', async () => {
        const user = account();
        user.usedInviteCode.usedAt = new Date(Date.now() - 91 * day);
        findUser.mockResolvedValue({ ...user, accessExpiresAt: null });
        expect((await POST(request(inviteBody))).status).toBe(403);
        expect(updateMany).not.toHaveBeenCalled();
    });
    it('코드 검증 뒤 철회 또는 기간 변경이 반영된 CAS 실패는 거절한다', async () => {
        updateMany.mockResolvedValue({ count: 0 });
        expect((await POST(request(inviteBody))).status).toBe(409);
        expect(cookieSet).not.toHaveBeenCalled();
    });
});
