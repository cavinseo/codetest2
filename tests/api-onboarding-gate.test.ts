// 온보딩(임시 비밀번호 변경 + 프로필 작성)을 마치기 전에는 API 를 쓸 수 없어야 한다.
//
// 이 파일은 다른 라우트 테스트와 달리 lib/auth 를 mock 하지 않는다.
// requireAuth 를 스텁하면 검증 대상인 게이트가 아예 돌지 않기 때문이다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const findUniqueUser = vi.fn();
const updateUser = vi.fn();
const findUniqueMemberProfile = vi.fn();
const upsertMemberProfile = vi.fn();
const transaction = vi.fn();

vi.mock('../lib/prisma', () => ({
    prisma: {
        user: { findUnique: findUniqueUser, update: updateUser },
        memberProfile: { findUnique: findUniqueMemberProfile, upsert: upsertMemberProfile },
        $transaction: (...args: unknown[]) => transaction(...args),
    },
}));

// 임시 비밀번호 변경 경로가 쓰는 것들. 게이트만 보면 되므로 최소한으로 채운다.
const compare = vi.fn();
const hash = vi.fn();
vi.mock('bcryptjs', () => ({
    default: {
        compare: (...args: unknown[]) => compare(...args),
        hash: (...args: unknown[]) => hash(...args),
    },
}));

vi.mock('next/headers', () => ({
    cookies: async () => ({ set: vi.fn() }),
}));

const { encodeSessionCookie, requireAuth } = await import('../lib/auth');
const { GET: getMyProfile, PUT: putMyProfile } = await import('../app/api/me/profile/route');
const { POST: changePassword } = await import('../app/api/admin/password/route');

/** 역할별로 완성된 프로필. 이 값이 있으면 게이트를 통과해야 한다. */
function completeProfile(role: string) {
    if (role === 'MENTOR' || role === 'PROGRAM_MANAGER') {
        return { organization: '기관', phone: '010-0000-0000', expertise: '제조', careerYears: 10 };
    }
    if (role === 'MENTEE') {
        return { organization: '기관', phone: '010-0000-0000', companyName: '회사', industry: '제조' };
    }
    return { organization: '기관', phone: '010-0000-0000' };
}

function userRow(overrides: Record<string, unknown> = {}) {
    const role = (overrides.role as string) ?? 'MENTEE';
    return {
        id: 'user_1',
        email: 'user@example.com',
        name: '사용자',
        status: 'APPROVED',
        isAdmin: false,
        sessionVersion: 0,
        role,
        accessExpiresAt: null,
        mustChangePassword: false,
        profile: completeProfile(role),
        // 비밀번호 변경 경로가 이 행에서 passwordHash 를 읽는다.
        passwordHash: 'hashed',
        ...overrides,
    };
}

function sessionCookieHeader(): string {
    const cookie = encodeSessionCookie(
        { userId: 'user_1', email: 'user@example.com', name: '사용자' },
        { sessionVersion: 0 }
    );
    return `session=${cookie}`;
}

function requestWithSession(): NextRequest {
    return new NextRequest('http://localhost/test', {
        headers: { cookie: sessionCookieHeader() },
    });
}

async function bodyOf(result: unknown): Promise<Record<string, unknown>> {
    return await (result as NextResponse).json();
}

beforeEach(() => {
    vi.stubEnv('SESSION_SECRET', 'test-secret');
    findUniqueUser.mockResolvedValue(userRow());
    findUniqueMemberProfile.mockResolvedValue(completeProfile('MENTEE'));
});

afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
});

describe('온보딩 관문', () => {
    it('임시 비밀번호를 안 바꿨으면 막는다', async () => {
        findUniqueUser.mockResolvedValue(userRow({ mustChangePassword: true }));

        const result = await requireAuth(requestWithSession());

        expect(result).toBeInstanceOf(NextResponse);
        expect((result as NextResponse).status).toBe(403);
        expect(await bodyOf(result)).toMatchObject({ code: 'onboarding_required' });
    });

    it('프로필이 아예 없으면 터지지 않고 막는다', async () => {
        // profile 이 null 일 때 isProfileCompleteForRole 에 undefined 가 흘러가면
        // undefined.organization 에서 TypeError 로 죽는다. 403 이어야 한다.
        findUniqueUser.mockResolvedValue(userRow({ profile: null }));

        const result = await requireAuth(requestWithSession());

        expect((result as NextResponse).status).toBe(403);
        expect(await bodyOf(result)).toMatchObject({ code: 'onboarding_required' });
    });

    it('멘토인데 전문분야가 없으면 막는다', async () => {
        findUniqueUser.mockResolvedValue(userRow({
            role: 'MENTOR',
            profile: { organization: '기관', phone: '010-0000-0000', careerYears: 10 },
        }));

        expect((await requireAuth(requestWithSession()) as NextResponse).status).toBe(403);
    });

    it('멘티인데 기업명이 없으면 막는다', async () => {
        findUniqueUser.mockResolvedValue(userRow({
            role: 'MENTEE',
            profile: { organization: '기관', phone: '010-0000-0000', industry: '제조' },
        }));

        expect((await requireAuth(requestWithSession()) as NextResponse).status).toBe(403);
    });

    it('관리자도 예외가 아니다', async () => {
        // 권한이 가장 큰 계정에 구멍을 남기지 않는다. 관리자도 온보딩을 거친다.
        findUniqueUser.mockResolvedValue(userRow({
            role: 'ADMIN', isAdmin: true, mustChangePassword: true,
        }));

        const result = await requireAuth(requestWithSession());

        expect((result as NextResponse).status).toBe(403);
        expect(await bodyOf(result)).toMatchObject({ code: 'onboarding_required' });
    });

    it('온보딩을 마친 계정은 통과한다', async () => {
        const result = await requireAuth(requestWithSession());

        expect(result).not.toBeInstanceOf(NextResponse);
        expect(result).toMatchObject({ userId: 'user_1', role: 'MENTEE' });
    });

    it('승인 대기 계정은 온보딩이 아니라 승인 대기로 막는다', async () => {
        // 게이트 순서가 뒤집히면 승인도 안 난 계정이 "온보딩을 마치라"는
        // 엉뚱한 안내를 받는다.
        findUniqueUser.mockResolvedValue(userRow({
            status: 'PENDING', mustChangePassword: true,
        }));

        const result = await requireAuth(requestWithSession());

        expect((result as NextResponse).status).toBe(403);
        expect(await bodyOf(result)).not.toMatchObject({ code: 'onboarding_required' });
    });

    it('allowIncompleteOnboarding 을 준 호출은 미완료여도 통과한다', async () => {
        findUniqueUser.mockResolvedValue(userRow({ mustChangePassword: true, profile: null }));

        const result = await requireAuth(requestWithSession(), { allowIncompleteOnboarding: true });

        expect(result).not.toBeInstanceOf(NextResponse);
    });

    it('온보딩 화면이 쓰는 GET /api/me/profile 은 미완료여도 열린다', async () => {
        // 이 경로가 막히면 아무도 온보딩을 끝낼 수 없어 전원이 영구 잠긴다.
        findUniqueUser.mockResolvedValue(userRow({ mustChangePassword: true, profile: null }));
        findUniqueMemberProfile.mockResolvedValue(null);

        const response = await getMyProfile(requestWithSession());

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ needsProfile: true, mustChangePassword: true });
    });

    it('온보딩 화면이 쓰는 PUT /api/me/profile 은 미완료여도 열린다', async () => {
        findUniqueUser.mockResolvedValue(userRow({ mustChangePassword: true, profile: null }));
        transaction.mockResolvedValue([]);

        const response = await putMyProfile(new NextRequest('http://localhost/api/me/profile', {
            method: 'PUT',
            headers: { cookie: sessionCookieHeader(), 'content-type': 'application/json' },
            body: JSON.stringify({
                organization: '기관',
                phone: '010-0000-0000',
                privacyConsent: true,
                companyName: '회사',
                industry: '제조',
            }),
        }));

        expect(response.status).toBe(200);
        expect(upsertMemberProfile).toHaveBeenCalled();
    });

    it('온보딩 화면이 쓰는 POST /api/admin/password 는 미완료여도 열린다', async () => {
        findUniqueUser.mockResolvedValue(userRow({ mustChangePassword: true, profile: null }));
        compare.mockResolvedValue(true);
        hash.mockResolvedValue('new-hash');
        updateUser.mockResolvedValue({
            id: 'user_1', email: 'user@example.com', name: '사용자', sessionVersion: 1,
        });

        const response = await changePassword(new NextRequest('http://localhost/api/admin/password', {
            method: 'POST',
            headers: { cookie: sessionCookieHeader(), 'content-type': 'application/json' },
            body: JSON.stringify({
                currentPassword: 'temp-pass-1234',
                newPassword: 'brand-new-5678',
                confirmPassword: 'brand-new-5678',
            }),
        }));

        expect(response.status).toBe(200);
        expect(updateUser).toHaveBeenCalled();
    });
});
