// Google 회원 로그인 라우트가 서명 state, 기존 회원 게이트, 세션 발급을 지키는지 확인한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { encodeSessionCookie, verifySessionCookie } from '../lib/auth';
import { issueLoginState, readLoginStateRole, verifyLoginState } from '../lib/login-state';

const isGoogleConfigured = vi.fn();
vi.mock('../lib/service-settings', () => ({
    isGoogleConfigured: (...args: unknown[]) => isGoogleConfigured(...(args as [])),
}));

const getGoogleLoginAuthUrl = vi.fn();
const exchangeLoginCodeForEmail = vi.fn();
vi.mock('../lib/google-auth', () => ({
    getGoogleLoginAuthUrl: (...args: unknown[]) => getGoogleLoginAuthUrl(...(args as [])),
    exchangeLoginCodeForEmail: (...args: unknown[]) => exchangeLoginCodeForEmail(...(args as [])),
}));

const findFirstUser = vi.fn();
const createUser = vi.fn();
const findUniqueProfile = vi.fn();
vi.mock('../lib/prisma', () => ({
    prisma: {
        user: {
            findFirst: (...args: unknown[]) => findFirstUser(...(args as [])),
            create: (...args: unknown[]) => createUser(...(args as [])),
        },
        memberProfile: {
            findUnique: (...args: unknown[]) => findUniqueProfile(...(args as [])),
        },
    },
}));

const isAccessExpired = vi.fn();
const parseMemberRole = vi.fn();
vi.mock('../lib/member-roles', () => ({
    isAccessExpired: (...args: unknown[]) => isAccessExpired(...(args as [])),
    parseMemberRole: (...args: unknown[]) => parseMemberRole(...(args as [])),
}));

const isProfileCompleteForRole = vi.fn();
vi.mock('../lib/member-profile', () => ({
    isProfileCompleteForRole: (...args: unknown[]) => isProfileCompleteForRole(...(args as [])),
}));

const logInfo = vi.fn();
const logError = vi.fn();
vi.mock('../lib/logger', () => ({
    createLogger: () => ({ info: logInfo, error: logError }),
}));

const { GET: startGoogleLogin } = await import('../app/api/auth/google/login/route');
const { GET: finishGoogleLogin } = await import('../app/api/auth/google/login/callback/route');

const ORIGIN = 'http://localhost';
const CALLBACK_URL = `${ORIGIN}/api/auth/google/login/callback`;

function approvedUser(overrides: Record<string, unknown> = {}) {
    return {
        id: 'user_1',
        email: 'Stored.Member@example.com',
        name: '사용자',
        status: 'APPROVED',
        role: 'MENTEE',
        mustChangePassword: false,
        accessExpiresAt: null,
        sessionVersion: 7,
        ...overrides,
    };
}

function startRequest(role: string | null = 'MENTEE'): NextRequest {
    const url = new URL(`${ORIGIN}/api/auth/google/login`);
    if (role !== null) url.searchParams.set('role', role);
    return new NextRequest(url);
}

function callbackRequest(options: {
    code?: string;
    state?: string;
    stateCookie?: string;
    error?: string;
} = {}): NextRequest {
    const url = new URL(CALLBACK_URL);
    if (options.error) url.searchParams.set('error', options.error);
    if (options.code !== undefined) url.searchParams.set('code', options.code);
    if (options.state !== undefined) url.searchParams.set('state', options.state);

    const headers = new Headers();
    if (options.stateCookie !== undefined) {
        headers.set('cookie', `google_login_state=${options.stateCookie}`);
    }
    return new NextRequest(url, { headers });
}

function validCallbackRequest(overrides: {
    code?: string;
    state?: string;
    stateCookie?: string;
    role?: 'PROGRAM_MANAGER' | 'MENTOR' | 'MENTEE';
} = {}): NextRequest {
    const state = issueLoginState(overrides.role ?? 'MENTEE');
    return callbackRequest({
        code: overrides.code ?? 'google-code',
        state: overrides.state ?? state,
        stateCookie: overrides.stateCookie ?? state,
    });
}

function redirectError(response: NextResponse): string | null {
    return new URL(response.headers.get('location') ?? ORIGIN).searchParams.get('error');
}

function responseCookie(response: NextResponse, name: string): string | undefined {
    const setCookie = response.headers.get('set-cookie') ?? '';
    return new RegExp(`(?:^|,\\s*)${name}=([^;]*)`).exec(setCookie)?.[1];
}

beforeEach(() => {
    vi.stubEnv('SESSION_SECRET', 'test-secret');
    isGoogleConfigured.mockResolvedValue(true);
    getGoogleLoginAuthUrl.mockResolvedValue(
        'https://accounts.google.com/o/oauth2/v2/auth?mock=1'
    );
    exchangeLoginCodeForEmail.mockResolvedValue({
        email: 'Member@Example.com',
        verified: true,
    });
    findFirstUser.mockResolvedValue(approvedUser());
    findUniqueProfile.mockResolvedValue({ id: 'profile_1' });
    isAccessExpired.mockReturnValue(false);
    parseMemberRole.mockReturnValue('MENTEE');
    isProfileCompleteForRole.mockReturnValue(true);
});

afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
});

describe('Google 회원 로그인 시작', () => {
    it('Google 설정이 없으면 오류 코드와 함께 로그인 화면으로 돌려보낸다', async () => {
        isGoogleConfigured.mockResolvedValue(false);

        const response = await startGoogleLogin(startRequest());

        expect(response.status).toBe(307);
        expect(redirectError(response)).toBe('google_unconfigured');
        expect(getGoogleLoginAuthUrl).not.toHaveBeenCalled();
        expect(response.headers.get('set-cookie')).toBeNull();
    });

    it('서명 state를 lax 쿠키와 Google URL 양쪽에 넣는다', async () => {
        const response = await startGoogleLogin(startRequest());

        expect(response.status).toBe(307);
        expect(response.headers.get('location')).toBe(
            'https://accounts.google.com/o/oauth2/v2/auth?mock=1'
        );
        const state = responseCookie(response, 'google_login_state');
        expect(verifyLoginState(state)).toBe(true);
        expect(readLoginStateRole(state)).toBe('MENTEE');
        expect(getGoogleLoginAuthUrl).toHaveBeenCalledWith(CALLBACK_URL, state);

        const setCookie = response.headers.get('set-cookie') ?? '';
        expect(setCookie).toContain('HttpOnly');
        expect(setCookie.toLowerCase()).toContain('samesite=lax');
        expect(setCookie).toContain('Max-Age=300');
        expect(setCookie).toContain('Path=/api/auth/google/login');
    });

    it.each(['PROGRAM_MANAGER', 'MENTOR', 'MENTEE'] as const)(
        '%s 선택 역할을 서명 state에서 복원한다',
        async role => {
            const response = await startGoogleLogin(startRequest(role));

            expect(readLoginStateRole(responseCookie(response, 'google_login_state'))).toBe(role);
        }
    );

    it.each([
        ['누락', null],
        ['관리자', 'ADMIN'],
        ['알 수 없는 값', 'UNKNOWN'],
    ])('시작 역할이 %s이면 Google OAuth를 시작하지 않는다', async (_label, role) => {
        const response = await startGoogleLogin(startRequest(role));

        expect(redirectError(response)).toBe('google_role');
        expect(getGoogleLoginAuthUrl).not.toHaveBeenCalled();
        expect(response.headers.get('set-cookie')).toBeNull();
    });
});

describe('Google 회원 로그인 콜백 state', () => {
    it('Google 동의 거부는 google_denied로 돌려보낸다', async () => {
        const response = await finishGoogleLogin(callbackRequest({ error: 'access_denied' }));

        expect(redirectError(response)).toBe('google_denied');
        expect(exchangeLoginCodeForEmail).not.toHaveBeenCalled();
    });

    it('서명되지 않은 state 파라미터를 거부한다', async () => {
        const stateCookie = issueLoginState('MENTEE');
        const response = await finishGoogleLogin(callbackRequest({
            code: 'google-code',
            state: 'forged-state',
            stateCookie,
        }));

        expect(redirectError(response)).toBe('google_state');
        expect(exchangeLoginCodeForEmail).not.toHaveBeenCalled();
    });

    it('서명되지 않은 state 쿠키를 거부한다', async () => {
        const state = issueLoginState('MENTEE');
        const response = await finishGoogleLogin(callbackRequest({
            code: 'google-code',
            state,
            stateCookie: 'forged-cookie',
        }));

        expect(redirectError(response)).toBe('google_state');
        expect(exchangeLoginCodeForEmail).not.toHaveBeenCalled();
    });

    it('각각 유효해도 파라미터와 쿠키 값이 다르면 거부한다', async () => {
        const response = await finishGoogleLogin(callbackRequest({
            code: 'google-code',
            state: issueLoginState('MENTEE'),
            stateCookie: issueLoginState('MENTEE'),
        }));

        expect(redirectError(response)).toBe('google_state');
        expect(exchangeLoginCodeForEmail).not.toHaveBeenCalled();
    });

    it('세션 쿠키 산출물을 state 양쪽에 넣어도 거부한다', async () => {
        const session = encodeSessionCookie({
            userId: 'user_1',
            email: 'member@example.com',
            name: '사용자',
        });
        const response = await finishGoogleLogin(callbackRequest({
            code: 'google-code',
            state: session,
            stateCookie: session,
        }));

        expect(redirectError(response)).toBe('google_state');
        expect(exchangeLoginCodeForEmail).not.toHaveBeenCalled();
    });
});

describe('Google 회원 로그인 콜백 회원 게이트', () => {
    it('관리자 연결 후 첫 접속 전에는 확인된 Google 계정도 초대 로그인으로 안내하고 세션을 발급하지 않는다', async () => {
        findFirstUser.mockResolvedValue(approvedUser({
            programId: 'program', accessExpiresAt: new Date(Date.now() + 30 * 86_400_000),
            usedInviteCode: { programId: 'program', usedAt: null, expiresAt: new Date(Date.now() + 10 * 86_400_000), accessDurationDays: 90, program: { endsAt: new Date(Date.now() + 90 * 86_400_000) } },
        }));
        const res = await finishGoogleLogin(validCallbackRequest());
        expect(redirectError(res)).toBe('invite_required');
        expect(responseCookie(res, 'session')).toBeUndefined();
        expect(responseCookie(res, 'google_login_state')).toBe('');
        expect(findUniqueProfile).not.toHaveBeenCalled();
        expect(createUser).not.toHaveBeenCalled();
    });

    it('서명 state 역할과 DB 역할이 다르면 세션 없이 거부한다', async () => {
        const state = issueLoginState('MENTOR');

        const response = await finishGoogleLogin(callbackRequest({
            code: 'google-code',
            state,
            stateCookie: state,
        }));

        expect(redirectError(response)).toBe('role_mismatch');
        expect(responseCookie(response, 'session')).toBeUndefined();
        expect(findUniqueProfile).not.toHaveBeenCalled();
    });

    it('DB 역할이 올바르지 않으면 멘티로 처리하지 않고 거부한다', async () => {
        parseMemberRole.mockReturnValue(null);

        const response = await finishGoogleLogin(validCallbackRequest());

        expect(redirectError(response)).toBe('account_role_invalid');
        expect(responseCookie(response, 'session')).toBeUndefined();
        expect(findUniqueProfile).not.toHaveBeenCalled();
    });

    it('관리자가 연장한 초대 계정은 원래 초대 기간 후에도 Google로 로그인한다', async () => {
        findFirstUser.mockResolvedValue(approvedUser({
            programId: 'program', accessExpiresAt: new Date(Date.now() + 10 * 86_400_000),
            usedInviteCode: {
                programId: 'program', usedAt: new Date(Date.now() - 100 * 86_400_000), accessDurationDays: 90,
                expiresAt: new Date(0), program: { endsAt: new Date(Date.now() + 30 * 86_400_000) },
            },
        }));
        const response = await finishGoogleLogin(validCallbackRequest());
        expect(response.headers.get('location')).toBe(`${ORIGIN}/dashboard`);
        expect(responseCookie(response, 'session')).toBeDefined();
    });

    it('프로그램 종료 후에도 회원 이용만료일이 남으면 Google 로그인을 허용한다', async () => {
        findFirstUser.mockResolvedValue(approvedUser({
            programId: 'program', accessExpiresAt: new Date(Date.now() + 86_400_000),
            usedInviteCode: {
                programId: 'program', usedAt: new Date(), accessDurationDays: 90,
                expiresAt: new Date(Date.now() + 86_400_000), program: { endsAt: new Date(0) },
            },
        }));
        const response = await finishGoogleLogin(validCallbackRequest());
        expect(response.headers.get('location')).toBe(`${ORIGIN}/dashboard`);
        expect(responseCookie(response, 'session')).toBeDefined();
    });

    it('검증되지 않은 Google 이메일은 차단한다', async () => {
        exchangeLoginCodeForEmail.mockResolvedValue({
            email: 'member@example.com',
            verified: false,
        });

        const response = await finishGoogleLogin(validCallbackRequest());

        expect(redirectError(response)).toBe('google_unverified');
        expect(findFirstUser).not.toHaveBeenCalled();
        expect(responseCookie(response, 'session')).toBeUndefined();
    });

    it('미가입 이메일은 자동 가입하지 않고 no_account로 돌려보낸다', async () => {
        findFirstUser.mockResolvedValue(null);

        const response = await finishGoogleLogin(validCallbackRequest());

        expect(redirectError(response)).toBe('no_account');
        expect(createUser).not.toHaveBeenCalled();
        expect(responseCookie(response, 'session')).toBeUndefined();
    });

    it('이메일을 대소문자 무시 조건으로 조회한다', async () => {
        await finishGoogleLogin(validCallbackRequest());

        expect(findFirstUser).toHaveBeenCalledWith({
            where: {
                email: {
                    equals: 'Member@Example.com',
                    mode: 'insensitive',
                },
            },
            include: {
                usedInviteCode: {
                    select: {
                        usedAt: true, expiresAt: true, accessExpiresAt: true, accessDurationDays: true, programId: true,
                        program: { select: { endsAt: true } },
                    },
                },
            },
        });
    });

    it('PENDING 회원은 차단하고 세션 쿠키를 발급하지 않는다', async () => {
        findFirstUser.mockResolvedValue(approvedUser({ status: 'PENDING' }));

        const response = await finishGoogleLogin(validCallbackRequest());

        expect(redirectError(response)).toBe('pending');
        expect(responseCookie(response, 'session')).toBeUndefined();
    });

    it('이용 기간이 만료된 회원은 차단하고 세션 쿠키를 발급하지 않는다', async () => {
        isAccessExpired.mockReturnValue(true);

        const response = await finishGoogleLogin(validCallbackRequest());

        expect(redirectError(response)).toBe('expired');
        expect(responseCookie(response, 'session')).toBeUndefined();
    });
});

describe('Google 회원 로그인 콜백 성공과 실패', () => {
    it.each(['PROGRAM_MANAGER', 'MENTOR', 'MENTEE'] as const)(
        '%s 역할과 DB 역할이 같으면 세션을 발급한다',
        async role => {
            parseMemberRole.mockReturnValue(role);
            findFirstUser.mockResolvedValue(approvedUser({ role }));

            const response = await finishGoogleLogin(validCallbackRequest({ role }));

            expect(response.headers.get('location')).toBe(`${ORIGIN}/dashboard`);
            expect(responseCookie(response, 'session')).toBeDefined();
        }
    );

    it('승인 회원에게 sessionVersion이 든 세션 쿠키를 발급하고 dashboard로 보낸다', async () => {
        const response = await finishGoogleLogin(validCallbackRequest());

        expect(response.status).toBe(307);
        expect(response.headers.get('location')).toBe(`${ORIGIN}/dashboard`);
        const session = responseCookie(response, 'session');
        expect(verifySessionCookie(session)).toMatchObject({
            userId: 'user_1',
            email: 'Stored.Member@example.com',
            name: '사용자',
            ver: 7,
        });

        const setCookie = response.headers.get('set-cookie') ?? '';
        expect(setCookie.toLowerCase()).toContain('samesite=strict');
        expect(setCookie).toContain('Max-Age=604800');
        expect(setCookie).toContain('Path=/');
        expect(responseCookie(response, 'google_login_state')).toBe('');
        expect(logInfo).toHaveBeenCalledWith('Google 로그인 성공', { userId: 'user_1' });
        expect(JSON.stringify(logInfo.mock.calls)).not.toContain('Member@Example.com');
        expect(JSON.stringify(logInfo.mock.calls)).not.toContain('google-code');
    });

    it.each([
        ['임시 비밀번호 변경 필요', { mustChangePassword: true }, true],
        ['프로필 미완성', {}, false],
    ])('%s 회원은 onboarding으로 보낸다', async (_label, userOverrides, profileComplete) => {
        findFirstUser.mockResolvedValue(approvedUser(userOverrides));
        isProfileCompleteForRole.mockReturnValue(profileComplete);

        const response = await finishGoogleLogin(validCallbackRequest());

        expect(response.headers.get('location')).toBe(`${ORIGIN}/onboarding`);
        expect(responseCookie(response, 'session')).toBeTruthy();
    });

    it('code 교환 실패는 google_failed로 돌려보낸다', async () => {
        exchangeLoginCodeForEmail.mockRejectedValue(new Error('exchange failed'));

        const response = await finishGoogleLogin(validCallbackRequest());

        expect(redirectError(response)).toBe('google_failed');
        expect(responseCookie(response, 'session')).toBeUndefined();
        expect(logError).toHaveBeenCalledTimes(1);
        expect(JSON.stringify(logError.mock.calls)).not.toContain('google-code');
        expect(JSON.stringify(logError.mock.calls)).not.toContain('Member@Example.com');
    });
});
