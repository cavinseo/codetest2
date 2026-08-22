// 초대 코드 가입이 역할·만료·승인을 한 트랜잭션에서 처리하는지 확인한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { INVITE_CODE_MESSAGES } from '../lib/invite-code';

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
    txUpdateInvite.mockResolvedValue({ count: 1 });
    transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
            user: { create: txCreateUser },
            memberProfile: { create: txCreateProfile },
            inviteCode: { updateMany: txUpdateInvite },
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
        expect(transaction).toHaveBeenCalledTimes(1);
        expect(body.pendingApproval).toBe(true);
        const created = txCreateUser.mock.calls[0][0].data;
        expect(created.status).toBe('PENDING');
        expect(created.role).toBe('MENTEE');
        expect(created.accessExpiresAt).toBeNull();
    });

    it('요청 본문에 role 을 실어 보내도 무시한다', async () => {
        // 역할은 서버가 초대 코드 유무로만 정한다. 클라이언트가 최상위에 role 을
        // 실어 보내도 스스로 역할을 올릴 수 없어야 한다.
        const res = await POST(signupRequest({
            name: '새회원', email: 'm@x.com', password: 'password123',
            role: 'ADMIN', profile: menteeProfile,
        }));

        expect(res.status).toBe(200);
        const created = txCreateUser.mock.calls[0][0].data;
        expect(created.role).toBe('MENTEE');
        expect(created.status).toBe('PENDING');
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
        expect(transaction).toHaveBeenCalledTimes(1);
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
        expect(txUpdateInvite.mock.calls[0][0].where).toEqual({ id: 'inv_1', usedAt: null });
        expect(txUpdateInvite.mock.calls[0][0].data.usedAt).toBeInstanceOf(Date);
        expect(txUpdateInvite.mock.calls[0][0].data.usedById).toBe('user_new');
    });

    it('트랜잭션 안에서 다른 요청이 먼저 코드를 다 써버리면 409 로 막는다', async () => {
        // 조회는 트랜잭션 밖에서 했으므로 그 사이 동시 요청이 먼저 썼을 수 있다.
        // count 가 0 이면 조건절(usedAt: null)에 걸리지 않았다는 뜻이라 이미
        // 소진된 코드로 보고 가입 전체를 되돌린다.
        findUniqueInvite.mockResolvedValue(validInvite);
        txUpdateInvite.mockResolvedValue({ count: 0 });

        const res = await POST(signupRequest({
            name: '새회원', email: 'm@x.com', password: 'password123',
            inviteCode: 'KSQF-ABCD-EFGH-JKMN', profile: mentorProfile,
        }));
        const body = await res.json();

        expect(res.status).toBe(409);
        expect(body.error).toBe(INVITE_CODE_MESSAGES.ALREADY_USED);
    });

    it('프로필 생성이 실패하면 코드 사용 처리까지 되돌아간다', async () => {
        // 트랜잭션 콜백 중간에 던지면 이후 단계(코드 사용 처리)는 아예 실행되지
        // 않아야 한다. 실행된다면 세 쓰기가 실제로는 하나의 트랜잭션으로 묶여
        // 있지 않다는 뜻이다.
        findUniqueInvite.mockResolvedValue(validInvite);
        txCreateProfile.mockRejectedValue(new Error('DB 오류'));

        const res = await POST(signupRequest({
            name: '새회원', email: 'm@x.com', password: 'password123',
            inviteCode: 'KSQF-ABCD-EFGH-JKMN', profile: mentorProfile,
        }));

        expect(res.status).toBe(500);
        expect(txUpdateInvite).not.toHaveBeenCalled();
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
