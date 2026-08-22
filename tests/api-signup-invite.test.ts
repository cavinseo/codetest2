// 초대 코드 가입이 역할·만료·승인을 한 트랜잭션에서 처리하는지 확인한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const findUniqueUser = vi.fn();
const findUniqueInvite = vi.fn();
const transaction = vi.fn();
const txCreateUser = vi.fn();
const txCreateProfile = vi.fn();
const txUpdateInvite = vi.fn();

vi.mock('../lib/prisma', () => ({
    prisma: {
        user: { findUnique: findUniqueUser },
        inviteCode: { findUnique: findUniqueInvite },
        $transaction: (fn: unknown) => transaction(fn),
    },
}));

vi.mock('../lib/rate-limit', () => ({
    SIGNUP_RATE_LIMIT: {},
    clientIpFrom: () => '127.0.0.1',
    consumeRateLimit: () => ({ allowed: true }),
}));

const { POST } = await import('../app/api/auth/signup/route');

const menteeProfile = {
    organization: '가나대', phone: '010-0000-0000', privacyConsent: true,
    companyName: '가나테크', industry: '제조',
};
const mentorProfile = {
    organization: '가나대', phone: '010-0000-0000', privacyConsent: true,
    expertise: '재료공학', careerYears: 10,
};

function signupRequest(body: unknown): NextRequest {
    return new NextRequest('http://localhost/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

beforeEach(() => {
    findUniqueUser.mockResolvedValue(null);
    findUniqueInvite.mockResolvedValue(null);
    txCreateUser.mockResolvedValue({ id: 'user_new', email: 'm@x.com', name: '새회원' });
    txCreateProfile.mockResolvedValue({});
    txUpdateInvite.mockResolvedValue({});
    transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
            user: { create: txCreateUser },
            memberProfile: { create: txCreateProfile },
            inviteCode: { update: txUpdateInvite },
        })
    );
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('초대 코드 없는 가입', () => {
    it('승인 대기 상태로 만들고 멘티 역할을 준다', async () => {
        const res = await POST(signupRequest({
            name: '새회원', email: 'm@x.com', password: 'password123', profile: menteeProfile,
        }));
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.pendingApproval).toBe(true);
        const created = txCreateUser.mock.calls[0][0].data;
        expect(created.status).toBe('PENDING');
        expect(created.role).toBe('MENTEE');
        expect(created.accessExpiresAt).toBeNull();
    });

    it('프로필이 없으면 막는다', async () => {
        const res = await POST(signupRequest({
            name: '새회원', email: 'm@x.com', password: 'password123',
        }));

        expect(res.status).toBe(400);
        expect(transaction).not.toHaveBeenCalled();
    });

    it('개인정보 동의가 없으면 막는다', async () => {
        const res = await POST(signupRequest({
            name: '새회원', email: 'm@x.com', password: 'password123',
            profile: { ...menteeProfile, privacyConsent: false },
        }));

        expect(res.status).toBe(400);
    });
});

describe('초대 코드 가입', () => {
    const validInvite = {
        id: 'inv_1', code: 'KSQF-ABCD-EFGH-JKMN', email: 'm@x.com', role: 'MENTOR',
        expiresAt: new Date(Date.now() + 86400000), accessDurationDays: 90, usedAt: null,
    };

    it('코드의 역할을 부여하고 자동 승인한다', async () => {
        // 관리자가 특정 이메일로 코드를 발급한 행위 자체가 승인이다.
        findUniqueInvite.mockResolvedValue(validInvite);

        const res = await POST(signupRequest({
            name: '새회원', email: 'm@x.com', password: 'password123',
            inviteCode: 'KSQF-ABCD-EFGH-JKMN', profile: mentorProfile,
        }));

        expect(res.status).toBe(200);
        const created = txCreateUser.mock.calls[0][0].data;
        expect(created.role).toBe('MENTOR');
        expect(created.status).toBe('APPROVED');
        expect(created.accessExpiresAt).toBeInstanceOf(Date);
    });

    it('코드를 사용 처리한다', async () => {
        findUniqueInvite.mockResolvedValue(validInvite);

        await POST(signupRequest({
            name: '새회원', email: 'm@x.com', password: 'password123',
            inviteCode: 'KSQF-ABCD-EFGH-JKMN', profile: mentorProfile,
        }));

        expect(txUpdateInvite).toHaveBeenCalled();
        expect(txUpdateInvite.mock.calls[0][0].data.usedAt).toBeInstanceOf(Date);
    });

    it('다른 이메일로는 쓸 수 없다', async () => {
        findUniqueInvite.mockResolvedValue(validInvite);

        const res = await POST(signupRequest({
            name: '새회원', email: 'other@x.com', password: 'password123',
            inviteCode: 'KSQF-ABCD-EFGH-JKMN', profile: mentorProfile,
        }));

        expect(res.status).toBe(400);
        expect(transaction).not.toHaveBeenCalled();
    });

    it('없는 코드를 막는다', async () => {
        findUniqueInvite.mockResolvedValue(null);

        const res = await POST(signupRequest({
            name: '새회원', email: 'm@x.com', password: 'password123',
            inviteCode: 'KSQF-ZZZZ-ZZZZ-ZZZZ', profile: mentorProfile,
        }));

        expect(res.status).toBe(400);
    });

    it('멘토 코드인데 멘티 항목만 보내면 막는다', async () => {
        // 역할이 코드로 정해지므로 그 역할에 맞는 항목을 요구한다.
        findUniqueInvite.mockResolvedValue(validInvite);

        const res = await POST(signupRequest({
            name: '새회원', email: 'm@x.com', password: 'password123',
            inviteCode: 'KSQF-ABCD-EFGH-JKMN', profile: menteeProfile,
        }));

        expect(res.status).toBe(400);
        expect(transaction).not.toHaveBeenCalled();
    });
});
