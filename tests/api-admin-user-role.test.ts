// 역할 변경·계정 생성·기간 연장이 규칙을 지키는지 확인한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const findUniqueUser = vi.fn();
const findFirstUser = vi.fn();
const countUser = vi.fn();
const updateUser = vi.fn();
const transaction = vi.fn();
const txCreateUser = vi.fn();
const txCreateProfile = vi.fn();

vi.mock('../lib/prisma', () => ({
    prisma: {
        user: {
            findUnique: findUniqueUser, findFirst: findFirstUser, count: countUser,
            update: updateUser, findMany: vi.fn(async () => []),
        },
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
    findFirstUser.mockResolvedValue(null);
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
        // setRole 분기 전체가 지워져도 revoke 분기가 200 을 내고 updateUser 도
        // 호출하므로, 실제로 role 이 바뀌어 전달됐는지까지 확인해야 이 테스트가
        // setRole 분기를 제대로 고정한다.
        expect(updateUser.mock.calls[0][0].data.role).toBe('PROGRAM_MANAGER');
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
    it('기존 만료일을 기준으로 지정한 일수만큼 늘린다', async () => {
        // "연장"은 지금부터가 아니라 원래 만료일부터 밀어야 한다. 그러지 않으면
        // 먼 미래에 만료되는 계정을 오히려 앞당겨 버릴 수 있다.
        findUniqueUser.mockResolvedValue({
            id: 'user_2', email: 'u@x.com', role: 'MENTOR', isAdmin: false,
            accessExpiresAt: new Date('2027-01-01T00:00:00Z'),
        });

        const res = await PATCH(jsonRequest('PATCH', {
            userId: 'user_2', action: 'extendAccess', days: 7,
        }));

        expect(res.status).toBe(200);
        const nextExpiry = updateUser.mock.calls[0][0].data.accessExpiresAt as Date;
        expect(nextExpiry.toISOString().slice(0, 10)).toBe('2027-01-08');
        // 정상적으로 늘어난 경우(당겨지지 않은 경우)는 세션을 끊을 이유가 없다.
        expect(updateUser.mock.calls[0][0].data.sessionVersion).toBeUndefined();
    });

    it('만료 없는 계정은 기간을 연장할 수 없다', async () => {
        // null 은 관리자가 직접 만든 무제한 계정이다(스키마 주석 참고).
        // 실수로 기간을 새로 씌우면 무제한 계정이 유한 계정이 되어 버린다.
        findUniqueUser.mockResolvedValue({
            id: 'user_2', email: 'u@x.com', role: 'MENTOR', isAdmin: false, accessExpiresAt: null,
        });

        const res = await PATCH(jsonRequest('PATCH', {
            userId: 'user_2', action: 'extendAccess', days: 7,
        }));
        const body = await res.json();

        expect(res.status).toBe(400);
        expect(body.error).toBe('이 계정은 이용 기간 제한이 없습니다.');
        expect(updateUser).not.toHaveBeenCalled();
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
    const menteeProfile = {
        organization: '가나대', phone: '010-0000-0000', privacyConsent: true,
        companyName: '가나기업', industry: '제조업', foundedYear: 2010,
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

    it('멘티 계정을 만들면 기업 정보를 함께 저장한다', async () => {
        // 모든 생성 테스트가 MENTOR 만 써 왔다. 멘티 스키마 분기와 기업 정보
        // 컬럼(companyName/industry/foundedYear) 저장은 여기서 처음 확인한다.
        findUniqueUser.mockResolvedValue(null);

        const res = await POST(jsonRequest('POST', {
            name: '새회원', email: 'mentee@x.com', role: 'MENTEE', profile: menteeProfile,
        }));

        expect(res.status).toBe(200);
        expect(txCreateUser.mock.calls[0][0].data.role).toBe('MENTEE');
        const savedProfile = txCreateProfile.mock.calls[0][0].data;
        expect(savedProfile.companyName).toBe('가나기업');
        expect(savedProfile.industry).toBe('제조업');
        expect(savedProfile.foundedYear).toBe(2010);
    });

    it('매니저 역할로는 만들 수 없다', async () => {
        // 매니저는 멘토에서 승격으로만 생긴다. profile 을 멘토 스키마로 바꿔도
        // 이 메시지가 그대로 나와야 "MENTOR/MENTEE 만 허용" 규칙 자체를 확인한 것이다.
        findUniqueUser.mockResolvedValue(null);

        const res = await POST(jsonRequest('POST', {
            name: '새회원', email: 'n@x.com', role: 'PROGRAM_MANAGER', profile,
        }));
        const body = await res.json();

        expect(res.status).toBe(400);
        expect(body.error).toContain('멘토 또는 멘티');
        expect(transaction).not.toHaveBeenCalled();
    });

    it('관리자 역할로는 만들 수 없다', async () => {
        // 관리자 계정도 이 경로로는 만들지 않는다.
        findUniqueUser.mockResolvedValue(null);

        const res = await POST(jsonRequest('POST', {
            name: '새회원', email: 'n@x.com', role: 'ADMIN', profile,
        }));
        const body = await res.json();

        expect(res.status).toBe(400);
        expect(body.error).toContain('멘토 또는 멘티');
        expect(transaction).not.toHaveBeenCalled();
    });

    it('대소문자만 다른 이메일은 이미 사용 중으로 막는다', async () => {
        // 기존 계정이 Foo@X.com 으로 저장돼 있다고 가정한다. 정확히 같은 문자열로
        // 찾는 조회(findUnique)는 아무것도 못 찾지만, 대소문자를 무시하는 조회는
        // 찾아야 한다.
        findUniqueUser.mockResolvedValue(null);
        findFirstUser.mockResolvedValue({ id: 'user_existing' });

        const res = await POST(jsonRequest('POST', {
            name: '새회원', email: 'foo@x.com', role: 'MENTOR', profile,
        }));
        const body = await res.json();

        expect(res.status).toBe(409);
        expect(body.error).toContain('이미 사용 중');
        expect(findFirstUser).toHaveBeenCalledWith({
            where: { email: { equals: 'foo@x.com', mode: 'insensitive' } },
            select: { id: true },
        });
        expect(transaction).not.toHaveBeenCalled();
    });

    it('임시 비밀번호를 응답에 담지 않는다', async () => {
        // 평문은 본인 메일로만 간다. 관리자 화면에 남기지 않는다.
        findUniqueUser.mockResolvedValue(null);

        const res = await POST(jsonRequest('POST', { name: '새회원', email: 'n@x.com', role: 'MENTOR', profile }));
        const body = await res.json();

        // 키 이름( tempPassword )이 아니라 메일에 실제로 실린 비밀번호 값 자체가
        // 응답 어디에도 없는지 본다. 키 이름만 보면 { password: <평문> } 같은
        // 응답도 통과해 버려 유출을 놓친다.
        const html = sendMail.mock.calls[0][0].html as string;
        const pw = html.match(/color: #0f172a;">([^<]+)</)![1];
        expect(JSON.stringify(body)).not.toContain(pw);
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
        // 임시 비밀번호는 해시로만 남고 재발송 수단도 없으니, 계정을 다시
        // 만들어야 한다는 것까지 응답이 알려줘야 한다.
        expect(body.message).toContain('삭제하고 다시 만들어');
    });

    it('관리자가 아니면 계정 생성 경로에 들어가지 못한다', async () => {
        requireAdmin.mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }));

        const res = await POST(jsonRequest('POST', { name: '새회원', email: 'n@x.com', role: 'MENTOR', profile }));

        expect(res.status).toBe(403);
        expect(transaction).not.toHaveBeenCalled();
    });
});
