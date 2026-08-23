// 역할 변경·계정 생성·기간 연장이 규칙을 지키는지 확인한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const findUniqueUser = vi.fn();
const countUser = vi.fn();
const updateUser = vi.fn();
const transaction = vi.fn();
const txCreateUser = vi.fn();
const txCreateProfile = vi.fn();

vi.mock('../lib/prisma', () => ({
    prisma: {
        user: { findUnique: findUniqueUser, count: countUser, update: updateUser, findMany: vi.fn(async () => []) },
        project: { count: vi.fn(async () => 0) },
        $transaction: (fn: unknown) => transaction(fn),
    },
}));

const requireAdmin = vi.fn();
vi.mock('../lib/authorization', () => ({
    requireAdmin: (...args: unknown[]) => requireAdmin(...(args as [])),
}));

const sendMail = vi.fn();
vi.mock('../lib/email', () => ({
    sendMail: (...args: unknown[]) => sendMail(...(args as [])),
}));

const { PATCH, POST } = await import('../app/api/admin/users/route');

const ADMIN = { userId: 'admin_1', email: 'a@x.com', name: '관리자' };

function jsonRequest(method: string, body: unknown): NextRequest {
    return new NextRequest('http://localhost/api/admin/users', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

beforeEach(() => {
    requireAdmin.mockResolvedValue(ADMIN);
    findUniqueUser.mockResolvedValue({ id: 'user_2', email: 'u@x.com', role: 'MENTOR', isAdmin: false });
    countUser.mockResolvedValue(2);
    updateUser.mockResolvedValue({ id: 'user_2', email: 'u@x.com', role: 'PROGRAM_MANAGER' });
    txCreateUser.mockResolvedValue({ id: 'user_new', email: 'n@x.com', name: '새회원' });
    txCreateProfile.mockResolvedValue({});
    transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({ user: { create: txCreateUser }, memberProfile: { create: txCreateProfile } })
    );
    sendMail.mockResolvedValue(true);
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('역할 변경', () => {
    it('멘토를 매니저로 승격한다', async () => {
        const res = await PATCH(jsonRequest('PATCH', {
            userId: 'user_2', action: 'setRole', role: 'PROGRAM_MANAGER',
        }));

        expect(res.status).toBe(200);
        expect(updateUser).toHaveBeenCalled();
    });

    it('멘티를 바로 매니저로 올릴 수 없다', async () => {
        // 매니저는 멘토 중에서 선택한다. 두 단계를 강제한다.
        findUniqueUser.mockResolvedValue({ id: 'user_2', email: 'u@x.com', role: 'MENTEE', isAdmin: false });

        const res = await PATCH(jsonRequest('PATCH', {
            userId: 'user_2', action: 'setRole', role: 'PROGRAM_MANAGER',
        }));
        const body = await res.json();

        expect(res.status).toBe(400);
        expect(body.error).toContain('멘토');
        expect(updateUser).not.toHaveBeenCalled();
    });

    it('관리자로 올리면 isAdmin 도 함께 켠다', async () => {
        const res = await PATCH(jsonRequest('PATCH', {
            userId: 'user_2', action: 'setRole', role: 'ADMIN',
        }));

        expect(res.status).toBe(200);
        expect(updateUser.mock.calls[0][0].data.isAdmin).toBe(true);
    });

    it('마지막 관리자를 강등할 수 없다', async () => {
        findUniqueUser.mockResolvedValue({ id: 'user_2', email: 'u@x.com', role: 'ADMIN', isAdmin: true });
        countUser.mockResolvedValue(1);

        const res = await PATCH(jsonRequest('PATCH', {
            userId: 'user_2', action: 'setRole', role: 'MENTOR',
        }));

        expect(res.status).toBe(400);
        expect(updateUser).not.toHaveBeenCalled();
    });

    it('강등하면 발급된 세션을 끊는다', async () => {
        // 권한이 줄어드는 변경은 로그인 중인 사용자에게도 즉시 적용돼야 한다.
        findUniqueUser.mockResolvedValue({ id: 'user_2', email: 'u@x.com', role: 'ADMIN', isAdmin: true });
        countUser.mockResolvedValue(3);

        await PATCH(jsonRequest('PATCH', {
            userId: 'user_2', action: 'setRole', role: 'MENTOR',
        }));

        expect(updateUser.mock.calls[0][0].data.sessionVersion).toEqual({ increment: 1 });
    });

    it('강등하면 isAdmin 도 함께 끈다', async () => {
        // role 이 단일 진실이다. 둘이 어긋나면 앱의 절반에서만 관리자가 된다.
        findUniqueUser.mockResolvedValue({ id: 'user_2', email: 'u@x.com', role: 'ADMIN', isAdmin: true });
        countUser.mockResolvedValue(3);

        await PATCH(jsonRequest('PATCH', {
            userId: 'user_2', action: 'setRole', role: 'MENTOR',
        }));

        expect(updateUser.mock.calls[0][0].data.role).toBe('MENTOR');
        expect(updateUser.mock.calls[0][0].data.isAdmin).toBe(false);
    });

    it('매니저를 멘토로 내릴 때도 세션을 끊는다', async () => {
        // 관리자만 강등이 아니다. 매니저는 전체 프로젝트를 읽을 수 있었다.
        findUniqueUser.mockResolvedValue({ id: 'user_2', email: 'u@x.com', role: 'PROGRAM_MANAGER', isAdmin: false });

        await PATCH(jsonRequest('PATCH', {
            userId: 'user_2', action: 'setRole', role: 'MENTOR',
        }));

        expect(updateUser.mock.calls[0][0].data.sessionVersion).toEqual({ increment: 1 });
    });
});

describe('기간 연장', () => {
    it('만료일을 지정한 일수만큼 미룬다', async () => {
        const res = await PATCH(jsonRequest('PATCH', {
            userId: 'user_2', action: 'extendAccess', days: 30,
        }));

        expect(res.status).toBe(200);
        expect(updateUser.mock.calls[0][0].data.accessExpiresAt).toBeInstanceOf(Date);
    });

    it('일수가 없으면 막는다', async () => {
        const res = await PATCH(jsonRequest('PATCH', { userId: 'user_2', action: 'extendAccess' }));

        expect(res.status).toBe(400);
    });
});

describe('계정 생성', () => {
    const profile = {
        organization: '가나대', phone: '010-0000-0000', privacyConsent: true,
        expertise: '재료공학', careerYears: 10,
    };

    it('멘토 계정을 만들고 임시 비밀번호를 보낸다', async () => {
        findUniqueUser.mockResolvedValue(null);

        const res = await POST(jsonRequest('POST', {
            name: '새회원', email: 'n@x.com', role: 'MENTOR', profile,
        }));

        expect(res.status).toBe(200);
        expect(txCreateUser.mock.calls[0][0].data.mustChangePassword).toBe(true);
        expect(sendMail).toHaveBeenCalled();
    });

    it('만든 계정은 바로 승인 상태다', async () => {
        findUniqueUser.mockResolvedValue(null);

        await POST(jsonRequest('POST', { name: '새회원', email: 'n@x.com', role: 'MENTOR', profile }));

        expect(txCreateUser.mock.calls[0][0].data.status).toBe('APPROVED');
    });

    it('매니저 역할로는 만들 수 없다', async () => {
        // 매니저는 멘토에서 승격으로만 생긴다.
        findUniqueUser.mockResolvedValue(null);

        const res = await POST(jsonRequest('POST', {
            name: '새회원', email: 'n@x.com', role: 'PROGRAM_MANAGER', profile,
        }));

        expect(res.status).toBe(400);
        expect(transaction).not.toHaveBeenCalled();
    });

    it('임시 비밀번호를 응답에 담지 않는다', async () => {
        // 평문은 본인 메일로만 간다. 관리자 화면에 남기지 않는다.
        findUniqueUser.mockResolvedValue(null);

        const res = await POST(jsonRequest('POST', { name: '새회원', email: 'n@x.com', role: 'MENTOR', profile }));
        const body = await res.json();

        expect(JSON.stringify(body)).not.toContain('tempPassword');
    });

    it('평문 비밀번호를 저장하지 않고 해시만 남긴다', async () => {
        // 메일 본문에 실린 평문이 DB 나 응답 어디에도 남으면 안 된다.
        findUniqueUser.mockResolvedValue(null);

        await POST(jsonRequest('POST', { name: '새회원', email: 'n@x.com', role: 'MENTOR', profile }));

        const created = txCreateUser.mock.calls[0][0].data;
        expect(created.passwordHash).toMatch(/^\$2[aby]\$/);
        expect(created.password).toBeUndefined();
        expect(created.tempPassword).toBeUndefined();
    });

    it('메일 발송이 실패하면 알린다', async () => {
        findUniqueUser.mockResolvedValue(null);
        sendMail.mockResolvedValue(false);

        const res = await POST(jsonRequest('POST', { name: '새회원', email: 'n@x.com', role: 'MENTOR', profile }));
        const body = await res.json();

        expect(body.emailSent).toBe(false);
    });
});
