// 본인 프로필 조회·수정이 역할에 맞는 항목을 요구하는지 확인한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const findUniqueProfile = vi.fn();
const upsertProfile = vi.fn();
const findUniqueUser = vi.fn();

vi.mock('../lib/prisma', () => ({
    prisma: {
        memberProfile: { findUnique: findUniqueProfile, upsert: upsertProfile },
        user: { findUnique: findUniqueUser },
    },
}));

const requireAuth = vi.fn();
vi.mock('../lib/auth', () => ({
    requireAuth: (...args: unknown[]) => requireAuth(...(args as [])),
}));

const { GET, PUT } = await import('../app/api/me/profile/route');

function authAs(role: string) {
    requireAuth.mockResolvedValue({
        userId: 'user_1', email: 'u@x.com', name: '사용자',
        isAdmin: false, role, accessExpiresAt: null,
    });
}

function putRequest(body: unknown): NextRequest {
    return new NextRequest('http://localhost/api/me/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

beforeEach(() => {
    findUniqueProfile.mockResolvedValue(null);
    upsertProfile.mockResolvedValue({ userId: 'user_1' });
    findUniqueUser.mockResolvedValue({ mustChangePassword: false });
});

afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
});

describe('프로필 조회', () => {
    it('없으면 needsProfile 을 알린다', async () => {
        authAs('MENTEE');

        const res = await GET(new NextRequest('http://localhost/api/me/profile'));
        const body = await res.json();

        expect(body.needsProfile).toBe(true);
        expect(body.profile).toBeNull();
    });

    it('있으면 그대로 돌려준다', async () => {
        authAs('MENTEE');
        findUniqueProfile.mockResolvedValue({
            userId: 'user_1', organization: '가나대', phone: '010-0000-0000',
            companyName: '가나기업', industry: '제조업',
        });

        const res = await GET(new NextRequest('http://localhost/api/me/profile'));
        const body = await res.json();

        expect(body.needsProfile).toBe(false);
        expect(body.profile.organization).toBe('가나대');
    });

    it('승격된 멘토의 저장된 행에 전문분야가 없으면 needsProfile 을 알린다', async () => {
        // 멘티였다가 멘토로 승격된 회원. setRole 은 MemberProfile 을 건드리지
        // 않으므로 행은 남아 있지만 expertise/careerYears 는 비어 있다.
        authAs('MENTOR');
        findUniqueProfile.mockResolvedValue({
            userId: 'user_1', organization: '가나대', phone: '010-0000-0000',
            expertise: null, careerYears: null,
        });

        const res = await GET(new NextRequest('http://localhost/api/me/profile'));
        const body = await res.json();

        expect(body.needsProfile).toBe(true);
    });

    it('임시 비밀번호 계정은 mustChangePassword 를 알린다', async () => {
        // 온보딩 화면이 비밀번호 변경 섹션을 띄울지 이 값으로 판단한다.
        authAs('MENTEE');
        findUniqueUser.mockResolvedValue({ mustChangePassword: true });

        const res = await GET(new NextRequest('http://localhost/api/me/profile'));
        const body = await res.json();

        expect(body.mustChangePassword).toBe(true);
    });

    it('일반 계정은 mustChangePassword 가 false 다', async () => {
        authAs('MENTEE');

        const res = await GET(new NextRequest('http://localhost/api/me/profile'));
        const body = await res.json();

        expect(body.mustChangePassword).toBe(false);
    });

    it('ADMIN_EMAILS 계정은 isAdmin 이 꺼져 있어도 canAccessAdmin 을 true 로 알린다', async () => {
        // 화면(dashboard/admin)이 requireAdmin 과 같은 답을 보도록, isAdmin 만이
        // 아니라 ADMIN_EMAILS 매치도 canAccessAdmin 에 반영돼야 한다.
        vi.stubEnv('ADMIN_EMAILS', 'u@x.com');
        authAs('MENTEE');

        const res = await GET(new NextRequest('http://localhost/api/me/profile'));
        const body = await res.json();

        expect(body.canAccessAdmin).toBe(true);
    });
});

describe('프로필 저장', () => {
    it('멘티는 기업명과 업종을 내야 한다', async () => {
        authAs('MENTEE');

        const res = await PUT(putRequest({
            organization: '가나대', phone: '010-0000-0000', privacyConsent: true,
        }));

        expect(res.status).toBe(400);
        expect(upsertProfile).not.toHaveBeenCalled();
    });

    it('멘토는 전문분야와 경력을 내야 한다', async () => {
        authAs('MENTOR');

        const res = await PUT(putRequest({
            organization: '가나대', phone: '010-0000-0000', privacyConsent: true,
        }));

        expect(res.status).toBe(400);
    });

    it('역할에 맞으면 저장한다', async () => {
        authAs('MENTOR');

        const res = await PUT(putRequest({
            organization: '가나대', phone: '010-0000-0000', privacyConsent: true,
            expertise: '재료공학', careerYears: 10,
        }));

        expect(res.status).toBe(200);
        expect(upsertProfile).toHaveBeenCalled();
    });

    it('남의 프로필을 고칠 수 없다', async () => {
        // 경로에 userId 를 받지 않는다. 세션의 userId 만 쓴다.
        authAs('MENTOR');

        await PUT(putRequest({
            organization: '가나대', phone: '010-0000-0000', privacyConsent: true,
            expertise: '재료공학', careerYears: 10,
        }));

        expect(upsertProfile.mock.calls[0][0].where.userId).toBe('user_1');
    });

    it('저장할 때마다 다른 역할의 컬럼을 null 로 정리한다', async () => {
        // PUT 은 body 만으로 검증하고 저장된 행을 읽지 않는다(findUnique 를
        // 호출하지 않는다). 그래서 멘티 -> 멘토로 전환된 회원이 저장할 때도 예전
        // 역할(멘티)의 값이 행에 남아 있을 위험이 있다 — 매 저장이 아홉 개 컬럼을
        // 전부 쓰면서 현재 역할에 없는 항목을 명시적으로 null 로 정리하는지 본다.
        authAs('MENTOR');

        const res = await PUT(putRequest({
            organization: '가나대', phone: '010-0000-0000', privacyConsent: true,
            expertise: '재료공학', careerYears: 10,
        }));

        expect(res.status).toBe(200);
        const update = upsertProfile.mock.calls[0][0].update;
        expect(update.companyName).toBeNull();
        expect(update.industry).toBeNull();
        expect(update.foundedYear).toBeNull();
    });
});
