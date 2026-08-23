// 본인 프로필 조회·수정이 역할에 맞는 항목을 요구하는지 확인한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const findUniqueProfile = vi.fn();
const upsertProfile = vi.fn();

vi.mock('../lib/prisma', () => ({
    prisma: { memberProfile: { findUnique: findUniqueProfile, upsert: upsertProfile } },
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
});

afterEach(() => {
    vi.clearAllMocks();
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
        findUniqueProfile.mockResolvedValue({ userId: 'user_1', organization: '가나대' });

        const res = await GET(new NextRequest('http://localhost/api/me/profile'));
        const body = await res.json();

        expect(body.needsProfile).toBe(false);
        expect(body.profile.organization).toBe('가나대');
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

    it('예전 역할의 컬럼이 남아 있어도 현재 역할로 저장할 수 있다', async () => {
        // 멘티 -> 멘토로 전환된 회원의 저장된 행에는 companyName/industry 가
        // 그대로 남아 있다(역할 전환이 컬럼을 정리해 주지 않는다). 검증 payload 를
        // 이 저장된 행과 body 를 섞어(spread) 만들면, MENTOR 스키마는 strict 라
        // companyName/industry 를 알 수 없는 키로 거부해 정상적인 수정이 막힌다.
        // body 만으로 검증해야 이 저장이 통과한다.
        authAs('MENTOR');
        findUniqueProfile.mockResolvedValue({
            userId: 'user_1', organization: '가나대', phone: '010-0000-0000',
            companyName: '가나기업', industry: '제조업', foundedYear: 2010,
            expertise: null, careerYears: null, careerSummary: null,
        });

        const res = await PUT(putRequest({
            organization: '가나대', phone: '010-0000-0000', privacyConsent: true,
            expertise: '재료공학', careerYears: 10,
        }));

        expect(res.status).toBe(200);
        expect(upsertProfile).toHaveBeenCalled();
    });
});
