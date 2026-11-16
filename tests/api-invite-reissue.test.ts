// 초대 코드 재발급이 권한·기한 경계를 지키고, 옛 코드와 연결 회원의 자격을 함께 끊는지 검증한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const findUniqueInvite = vi.fn();
const updateManyInvite = vi.fn();
const updateUser = vi.fn();
const lock = vi.fn();
const transaction = vi.fn();
vi.mock('../lib/prisma', () => ({
    prisma: {
        inviteCode: { findUnique: findUniqueInvite },
        $transaction: (fn: unknown) => transaction(fn),
    },
}));

const requireAuth = vi.fn();
vi.mock('../lib/auth', () => ({ requireAuth: (...args: unknown[]) => requireAuth(...args) }));
const sendMail = vi.fn();
vi.mock('../lib/email', () => ({ sendMail: (...args: unknown[]) => sendMail(...args) }));
const logInfo = vi.fn();
const logError = vi.fn();
const logWarn = vi.fn();
vi.mock('../lib/logger', () => ({ createLogger: () => ({ info: logInfo, error: logError, warn: logWarn }) }));
const hash = vi.fn(async (value: string) => `hashed:${value}`);
vi.mock('bcryptjs', () => ({ default: { hash: (value: string) => hash(value) } }));

const { POST } = await import('../app/api/invites/[id]/reissue/route');
const NOW = new Date('2026-09-10T03:00:00.000Z');
const DAY = 86_400_000;
const future = (days: number) => new Date(NOW.getTime() + days * DAY);
const context = { params: Promise.resolve({ id: 'invite_1' }) };
const OLD_CODE = 'KSQF-OLD1-OLD2-OLD3';
const CODE_PATTERN = /^KSQF-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/;

function authAs(role: string) {
    requireAuth.mockResolvedValue({ userId: 'manager_1', email: 'manager@example.com', name: '매니저', role, isAdmin: role === 'ADMIN', accessExpiresAt: null });
}

function linkedMentee() {
    return { id: 'mentee_1', email: 'mentee@example.com', role: 'MENTEE', isAdmin: false, status: 'APPROVED', programId: 'program_1', accessExpiresAt: future(60) };
}

function unusedInvite() {
    return {
        id: 'invite_1', code: OLD_CODE, email: 'Mentee@Example.com', role: 'MENTEE',
        programId: 'program_1', issuedById: 'other_issuer', usedAt: null as Date | null,
        usedById: null as string | null, usedBy: null as ReturnType<typeof linkedMentee> | null,
        expiresAt: future(30), accessExpiresAt: null as Date | null, accessDurationDays: 90,
        program: { id: 'program_1', managerId: 'manager_1', name: '시험 <프로그램>', endsAt: future(120) },
    };
}

function usedInvite() {
    return { ...unusedInvite(), usedAt: future(-10), usedById: 'mentee_1', usedBy: linkedMentee() };
}

function request() {
    return new NextRequest('https://app.example.com/api/invites/invite_1/reissue', { method: 'POST' });
}

function loggedText() {
    return [...logInfo.mock.calls, ...logWarn.mock.calls, ...logError.mock.calls].flat()
        .map((value) => value instanceof Error ? value.message : JSON.stringify(value)).join(' ');
}

function newCode(): string {
    return updateManyInvite.mock.calls[0][0].data.code;
}

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    authAs('ADMIN');
    findUniqueInvite.mockResolvedValue(unusedInvite());
    updateManyInvite.mockResolvedValue({ count: 1 });
    updateUser.mockResolvedValue({});
    sendMail.mockResolvedValue(true);
    transaction.mockImplementation(async (fn) => fn({
        $queryRaw: lock,
        inviteCode: { findUnique: findUniqueInvite, updateMany: updateManyInvite },
        user: { update: updateUser },
    }));
});

afterEach(() => {
    vi.resetAllMocks();
    vi.useRealTimers();
});

describe('초대 코드 재발급 권한', () => {
    it('인증 실패 응답을 그대로 반환하며 아무것도 조회하지 않는다', async () => {
        requireAuth.mockResolvedValue(NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }));

        expect((await POST(request(), context)).status).toBe(401);
        expect(findUniqueInvite).not.toHaveBeenCalled();
    });

    it.each(['MENTEE', 'MENTOR'])('%s는 재발급할 수 없다', async (role) => {
        authAs(role);

        expect((await POST(request(), context)).status).toBe(403);
        expect(findUniqueInvite).not.toHaveBeenCalled();
        expect(updateManyInvite).not.toHaveBeenCalled();
    });

    it('담당 프로그램 매니저는 재발급할 수 있지만 응답으로 코드를 받지 못한다', async () => {
        authAs('PROGRAM_MANAGER');

        const res = await POST(request(), context);
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body).toMatchObject({ success: true, emailSent: true });
        expect(body.code).toBeUndefined();
        expect(JSON.stringify(body)).not.toContain(newCode());
    });

    it('다른 매니저의 프로그램 코드는 재발급할 수 없다', async () => {
        authAs('PROGRAM_MANAGER');
        const invite = unusedInvite();
        invite.program.managerId = 'other_manager';
        findUniqueInvite.mockResolvedValue(invite);

        expect((await POST(request(), context)).status).toBe(403);
        expect(updateManyInvite).not.toHaveBeenCalled();
        expect(updateUser).not.toHaveBeenCalled();
        expect(sendMail).not.toHaveBeenCalled();
    });
});

describe('초대 코드 재발급 동작', () => {
    it('옛 코드와 일치할 때만 새 코드로 바꾸고 등록 이메일로 발송한다', async () => {
        const res = await POST(request(), context);
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(updateManyInvite).toHaveBeenCalledWith({
            where: { id: 'invite_1', code: OLD_CODE }, data: { code: expect.stringMatching(CODE_PATTERN) },
        });
        expect(newCode()).not.toBe(OLD_CODE);
        // 관리자는 목록에서도 코드를 보므로 응답에 싣는다.
        expect(body.code).toBe(newCode());
        expect(sendMail).toHaveBeenCalledTimes(1);
        const mail = sendMail.mock.calls[0][0];
        expect(mail.to).toBe('mentee@example.com');
        expect(mail.html).toContain(newCode());
        expect(mail.html).not.toContain(OLD_CODE);
        expect(mail.html).toContain('이전 코드는 더 이상 사용할 수 없습니다');
        expect(mail.html).toContain('https://app.example.com/login?mode=invite');
        // 프로그램명은 관리자가 입력한 값이라 이스케이프해야 한다.
        expect(mail.html).toContain('시험 &lt;프로그램&gt;');
    });

    it('회원이 연결되지 않은 코드는 회원 정보를 건드리지 않는다', async () => {
        const body = await (await POST(request(), context)).json();

        expect(updateUser).not.toHaveBeenCalled();
        expect(body.memberCredentialsRotated).toBe(false);
    });

    it('연결된 회원의 세션과 비밀번호를 함께 무효화한다', async () => {
        // 옛 코드로 로그인한 제3자가 정해 둔 비밀번호와 세션이 남으면 코드를 바꿔도 소용없다.
        findUniqueInvite.mockResolvedValue(usedInvite());

        const body = await (await POST(request(), context)).json();

        expect(body.memberCredentialsRotated).toBe(true);
        expect(updateUser).toHaveBeenCalledWith({
            where: { id: 'mentee_1' },
            data: { passwordHash: expect.stringMatching(/^hashed:[0-9a-f]{64}$/), sessionVersion: { increment: 1 } },
        });
        expect(sendMail.mock.calls[0][0].html).toContain('기존 로그인 상태와 비밀번호를 모두 초기화했습니다');
    });

    it('이메일·회원·초대 행을 잠근 뒤에 다시 읽어 검증한다', async () => {
        await POST(request(), context);

        expect(lock).toHaveBeenCalledTimes(3);
        expect(lock.mock.invocationCallOrder[2]).toBeLessThan(findUniqueInvite.mock.invocationCallOrder[1]);
        expect(findUniqueInvite.mock.invocationCallOrder[1]).toBeLessThan(updateManyInvite.mock.invocationCallOrder[0]);
    });

    it('코드·이메일·비밀번호를 로그에 남기지 않는다', async () => {
        findUniqueInvite.mockResolvedValue(usedInvite());

        await POST(request(), context);

        const logged = loggedText();
        expect(logged).toContain('invite_1');
        expect(logged).not.toContain(newCode());
        expect(logged).not.toContain(OLD_CODE);
        expect(logged.toLowerCase()).not.toContain('mentee@example.com');
        expect(logged).not.toContain('hashed:');
    });
});

describe('초대 코드 재발급 거절', () => {
    it('없는 초대는 404', async () => {
        findUniqueInvite.mockResolvedValue(null);

        expect((await POST(request(), context)).status).toBe(404);
        expect(transaction).not.toHaveBeenCalled();
    });

    it('잠금 사이에 초대가 삭제되면 404 이고 아무것도 바꾸지 않는다', async () => {
        findUniqueInvite.mockResolvedValueOnce(unusedInvite()).mockResolvedValueOnce(null);

        expect((await POST(request(), context)).status).toBe(404);
        expect(updateManyInvite).not.toHaveBeenCalled();
    });

    it('만료된 코드는 재발급하지 않고 기한 연장을 안내한다', async () => {
        findUniqueInvite.mockResolvedValue({ ...unusedInvite(), expiresAt: future(-1) });

        const res = await POST(request(), context);

        expect(res.status).toBe(400);
        expect((await res.json()).error).toContain('기한을 먼저 연장');
        expect(updateManyInvite).not.toHaveBeenCalled();
        expect(sendMail).not.toHaveBeenCalled();
    });

    it('이용만료일이 지난 회원의 코드는 재발급하지 않는다', async () => {
        const invite = usedInvite();
        invite.usedBy = { ...linkedMentee(), accessExpiresAt: future(-1) };
        findUniqueInvite.mockResolvedValue(invite);

        expect((await POST(request(), context)).status).toBe(400);
        expect(updateUser).not.toHaveBeenCalled();
    });

    it('멘티 코드가 아니면 재발급하지 않는다', async () => {
        findUniqueInvite.mockResolvedValue({ ...unusedInvite(), role: 'MENTOR' });

        expect((await POST(request(), context)).status).toBe(400);
        expect(updateManyInvite).not.toHaveBeenCalled();
    });

    it.each([
        ['다른 이메일', { email: 'other@example.com' }],
        ['다른 프로그램', { programId: 'program_2' }],
        ['승인 취소', { status: 'PENDING' }],
        ['멘티가 아닌 역할', { role: 'MENTOR' }],
        ['관리자 플래그', { isAdmin: true }],
        ['다른 회원 ID', { id: 'someone_else' }],
    ])('연결 회원이 초대와 어긋나면(%s) 409 이고 코드를 바꾸지 않는다', async (_label, patch) => {
        const invite = usedInvite();
        invite.usedBy = { ...linkedMentee(), ...patch };
        findUniqueInvite.mockResolvedValue(invite);

        expect((await POST(request(), context)).status).toBe(409);
        expect(updateManyInvite).not.toHaveBeenCalled();
        expect(updateUser).not.toHaveBeenCalled();
        expect(sendMail).not.toHaveBeenCalled();
    });

    it('연결 표시는 있는데 회원 행이 없으면 409', async () => {
        findUniqueInvite.mockResolvedValue({ ...usedInvite(), usedBy: null });

        expect((await POST(request(), context)).status).toBe(409);
        expect(updateManyInvite).not.toHaveBeenCalled();
    });

    it('그사이 코드가 바뀌었으면 409 이고 회원 자격과 메일을 건드리지 않는다', async () => {
        findUniqueInvite.mockResolvedValue(usedInvite());
        updateManyInvite.mockResolvedValue({ count: 0 });

        expect((await POST(request(), context)).status).toBe(409);
        expect(updateUser).not.toHaveBeenCalled();
        expect(sendMail).not.toHaveBeenCalled();
    });

    it('새 코드가 기존 코드와 겹치면 409 로 다시 시도를 안내한다', async () => {
        transaction.mockRejectedValue(Object.assign(new Error('Unique constraint failed on the fields: (`code`)'), { code: 'P2002' }));

        const res = await POST(request(), context);

        expect(res.status).toBe(409);
        expect(await res.text()).not.toContain('Unique constraint');
    });

    it('예상하지 못한 DB 오류는 내부 문구 없이 500', async () => {
        transaction.mockRejectedValue(new Error('connection to mentee@example.com table lost'));

        const res = await POST(request(), context);

        expect(res.status).toBe(500);
        expect(await res.text()).not.toContain('connection');
        expect(loggedText()).not.toContain('mentee@example.com');
        expect(sendMail).not.toHaveBeenCalled();
    });

    it('메일 발송이 실패해도 재발급은 유지하고 경고를 돌려준다', async () => {
        sendMail.mockResolvedValue(false);

        const res = await POST(request(), context);
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body).toMatchObject({ success: true, emailSent: false });
        expect(body.warning).toContain('메일 재발송');
        expect(updateManyInvite).toHaveBeenCalledTimes(1);
    });
});
