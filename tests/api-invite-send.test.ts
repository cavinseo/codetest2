// 기존 초대 코드의 재발송이 권한·로그인 기한·수신자 경계를 지키고 데이터를 변경하지 않는지 검증한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const findUniqueInvite = vi.fn();
const findFirstUser = vi.fn();
const writeInvite = vi.fn();
const writeUser = vi.fn();
vi.mock('../lib/prisma', () => ({
    prisma: {
        inviteCode: {
            findUnique: findUniqueInvite,
            create: writeInvite, createMany: writeInvite, update: writeInvite,
            updateMany: writeInvite, delete: writeInvite, deleteMany: writeInvite, upsert: writeInvite,
        },
        user: { findFirst: findFirstUser, update: writeUser, updateMany: writeUser, create: writeUser },
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

const { POST } = await import('../app/api/invites/[id]/send/route');
const NOW = new Date('2026-09-10T03:00:00.000Z');
const DAY = 86_400_000;
const future = (days: number) => new Date(NOW.getTime() + days * DAY);
const context = { params: Promise.resolve({ id: 'invite_1' }) };

function authAs(role: string) {
    requireAuth.mockResolvedValue({ userId: 'manager_1', email: 'manager@example.com', name: '매니저', role, isAdmin: role === 'ADMIN', accessExpiresAt: null });
}

function unusedInvite() {
    return {
        id: 'invite_1', code: 'EXISTING-CODE', email: 'mentee@example.com', role: 'MENTEE',
        programId: 'program_1', issuedById: 'other_issuer', usedAt: null as Date | null,
        usedById: null as string | null, usedBy: null as ReturnType<typeof linkedMentee> | null,
        expiresAt: future(120), accessDurationDays: 90,
        program: { id: 'program_1', managerId: 'manager_1', name: '시험 프로그램', endsAt: future(120) },
    };
}

function linkedMentee() {
    return { id: 'mentee_1', email: 'mentee@example.com', role: 'MENTEE', isAdmin: false, status: 'APPROVED', programId: 'program_1', accessExpiresAt: future(60) };
}

function usedInvite() {
    return { ...unusedInvite(), usedAt: future(-10), usedById: 'mentee_1', usedBy: linkedMentee() };
}

function request(body?: unknown) {
    return new NextRequest('https://app.example.com/api/invites/invite_1/send', {
        method: 'POST', ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    });
}

function loggedText() {
    return [...logInfo.mock.calls, ...logWarn.mock.calls, ...logError.mock.calls].flat().map((value) => value instanceof Error ? value.message : JSON.stringify(value)).join(' ');
}

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    authAs('ADMIN');
    findUniqueInvite.mockResolvedValue(unusedInvite());
    findFirstUser.mockResolvedValue(null);
    sendMail.mockResolvedValue(true);
});

afterEach(() => {
    expect(writeInvite).not.toHaveBeenCalled();
    expect(writeUser).not.toHaveBeenCalled();
    vi.resetAllMocks();
    vi.useRealTimers();
});

describe('초대 코드 재발송 권한', () => {
    it('인증 실패 응답을 그대로 반환하며 코드를 조회하지 않는다', async () => {
        requireAuth.mockResolvedValue(NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }));
        expect((await POST(request(), context)).status).toBe(401);
        expect(findUniqueInvite).not.toHaveBeenCalled();
        expect(sendMail).not.toHaveBeenCalled();
    });

    it.each(['MENTEE', 'MENTOR'])('%s는 발송할 수 없다', async (role) => {
        authAs(role);
        expect((await POST(request(), context)).status).toBe(403);
        expect(findUniqueInvite).not.toHaveBeenCalled();
        expect(sendMail).not.toHaveBeenCalled();
    });

    it('담당 프로그램 매니저는 다른 발급자가 만든 코드도 발송할 수 있다', async () => {
        authAs('PROGRAM_MANAGER');
        expect((await POST(request(), context)).status).toBe(200);
        expect(sendMail).toHaveBeenCalledTimes(1);
    });

    it('프로그램 매니저는 다른 매니저의 프로그램 코드를 발송할 수 없다', async () => {
        authAs('PROGRAM_MANAGER');
        const invite = unusedInvite();
        invite.program.managerId = 'other_manager';
        findUniqueInvite.mockResolvedValue(invite);
        expect((await POST(request(), context)).status).toBe(403);
        expect(sendMail).not.toHaveBeenCalled();
    });

    it('관리자는 담당자가 다른 프로그램의 코드도 발송할 수 있다', async () => {
        const invite = unusedInvite();
        invite.program.managerId = 'other_manager';
        findUniqueInvite.mockResolvedValue(invite);
        expect((await POST(request(), context)).status).toBe(200);
    });

    it('존재하지 않는 초대 코드에는 404를 반환한다', async () => {
        findUniqueInvite.mockResolvedValue(null);
        expect((await POST(request(), context)).status).toBe(404);
        expect(sendMail).not.toHaveBeenCalled();
    });
});

describe('발송 가능한 코드와 이용 기한', () => {
    it.each(['MENTOR', 'PROGRAM_MANAGER', 'ADMIN'])('%s 역할의 기존 코드는 발송하지 않는다', async (role) => {
        findUniqueInvite.mockResolvedValue({ ...unusedInvite(), role });
        expect((await POST(request(), context)).status).toBe(400);
        expect(sendMail).not.toHaveBeenCalled();
    });

    it('미사용 코드의 사용 기한이 지났으면 발송하지 않는다', async () => {
        findUniqueInvite.mockResolvedValue({ ...unusedInvite(), expiresAt: future(-1) });
        expect((await POST(request(), context)).status).toBe(400);
        expect(sendMail).not.toHaveBeenCalled();
    });

    it('프로그램 종료 시각과 현재 시각이 같으면 발송하지 않는다', async () => {
        const invite = unusedInvite();
        invite.program.endsAt = NOW;
        findUniqueInvite.mockResolvedValue(invite);
        expect((await POST(request(), context)).status).toBe(400);
        expect(sendMail).not.toHaveBeenCalled();
    });

    it('최초 로그인으로부터 90일이 지난 사용 코드에는 발송하지 않는다', async () => {
        findUniqueInvite.mockResolvedValue({ ...usedInvite(), usedAt: future(-90) });
        expect((await POST(request(), context)).status).toBe(400);
        expect(sendMail).not.toHaveBeenCalled();
    });

    it('연결된 멘티의 이용 기한이 지났으면 발송하지 않는다', async () => {
        const invite = usedInvite();
        invite.usedBy.accessExpiresAt = future(-1);
        findUniqueInvite.mockResolvedValue(invite);
        expect((await POST(request(), context)).status).toBe(400);
        expect(sendMail).not.toHaveBeenCalled();
    });

    it('최초 사용 기한이 지났어도 실제 회원 이용 기한이 남은 사용 코드는 보낼 수 있다', async () => {
        findUniqueInvite.mockResolvedValue({ ...usedInvite(), expiresAt: future(-1) });
        expect((await POST(request(), context)).status).toBe(200);
        expect(sendMail).toHaveBeenCalledTimes(1);
    });

    it('정상 멘티가 사용하는 유효 코드와 이용 기한을 변경하지 않고 발송한다', async () => {
        const invite = usedInvite();
        const before = structuredClone(invite);
        findUniqueInvite.mockResolvedValue(invite);
        const result = await POST(request(), context);
        expect(result.status).toBe(200);
        expect(await result.json()).toMatchObject({ success: true, emailSent: true });
        expect(invite).toEqual(before);
        expect(sendMail.mock.calls[0][0].html).toContain(invite.code);
        expect(sendMail.mock.calls[0][0].html).toContain('/login?mode=invite');
        expect(sendMail.mock.calls[0][0].html).toContain(future(60).toISOString().slice(0, 10));
        expect(sendMail.mock.calls[0][0].html).toContain('연장되지는 않습니다');
    });

    it('프로그램이 더 일찍 끝나면 재발송 본문에 그 실제 종료 기한을 표시한다', async () => {
        const invite = usedInvite();
        invite.program.endsAt = future(20);
        findUniqueInvite.mockResolvedValue(invite);
        expect((await POST(request(), context)).status).toBe(200);
        expect(sendMail.mock.calls[0][0].html).toContain(future(20).toISOString().slice(0, 10));
        expect(sendMail.mock.calls[0][0].html).not.toContain(future(60).toISOString().slice(0, 10));
    });
});

describe('초대 이메일과 회원 연결', () => {
    it.each([
        ['회원 ID 불일치', { id: 'other_mentee' }],
        ['이메일 불일치', { email: 'other@example.com' }],
        ['멘토 역할', { role: 'MENTOR' }],
        ['관리자 플래그', { isAdmin: true }],
        ['승인 대기 회원', { status: 'PENDING' }],
        ['차단 회원', { status: 'BLOCKED' }],
        ['프로그램 불일치', { programId: 'other_program' }],
    ])('%s이면 사용 코드 발송을 거절한다', async (_label, change) => {
        const invite = usedInvite();
        Object.assign(invite.usedBy, change);
        findUniqueInvite.mockResolvedValue(invite);
        expect((await POST(request(), context)).status).toBe(409);
        expect(sendMail).not.toHaveBeenCalled();
    });

    it('사용 기록이 있지만 연결 회원이 사라졌으면 발송하지 않는다', async () => {
        findUniqueInvite.mockResolvedValue({ ...usedInvite(), usedBy: null });
        expect((await POST(request(), context)).status).toBe(409);
        expect(sendMail).not.toHaveBeenCalled();
    });

    it('미사용 코드에 회원 연결 ID가 남아 있으면 발송하지 않는다', async () => {
        findUniqueInvite.mockResolvedValue({ ...unusedInvite(), usedById: 'mentee_1' });
        expect((await POST(request(), context)).status).toBe(409);
        expect(sendMail).not.toHaveBeenCalled();
    });

    it('미사용 코드의 이메일로 기존 회원이 있으면 발송하지 않는다', async () => {
        findFirstUser.mockResolvedValue({ id: 'existing_user' });
        expect((await POST(request(), context)).status).toBe(409);
        expect(sendMail).not.toHaveBeenCalled();
        expect(findFirstUser.mock.calls[0][0].where).toEqual({ email: { equals: 'mentee@example.com', mode: 'insensitive' } });
    });

    it('요청 본문의 다른 이메일·코드는 무시하고 DB 수신자와 기존 코드만 보낸다', async () => {
        const result = await POST(request({ email: 'attacker@example.com', code: 'ATTACKER-CODE', programId: 'other_program' }), context);
        expect(result.status).toBe(200);
        expect(findUniqueInvite.mock.calls[0][0].where).toEqual({ id: 'invite_1' });
        const mail = sendMail.mock.calls[0][0];
        expect(mail.to).toBe('mentee@example.com');
        expect(mail.html).toContain('EXISTING-CODE');
        expect(mail.html).not.toContain('ATTACKER-CODE');
        expect(JSON.stringify(mail)).not.toContain('attacker@example.com');
    });

    it('저장 이메일의 대소문자와 공백을 정리하고 연결 회원 이메일을 비교한다', async () => {
        const invite = usedInvite();
        invite.email = ' MENTEE@EXAMPLE.COM ';
        invite.usedBy.email = 'Mentee@Example.com';
        findUniqueInvite.mockResolvedValue(invite);
        expect((await POST(request(), context)).status).toBe(200);
        expect(sendMail.mock.calls[0][0].to).toBe('mentee@example.com');
    });

    it('저장된 이메일 형식이 유효하지 않으면 발송하지 않는다', async () => {
        findUniqueInvite.mockResolvedValue({ ...unusedInvite(), email: 'invalid-address' });
        expect((await POST(request(), context)).status).toBe(400);
        expect(sendMail).not.toHaveBeenCalled();
    });
});

describe('재발송 결과와 오류 보호', () => {
    it('메일 발송 실패를 502로 알리고 새 코드를 만들거나 기한을 연장하지 않는다', async () => {
        sendMail.mockResolvedValue(false);
        const result = await POST(request(), context);
        expect(result.status).toBe(502);
        expect(await result.json()).toMatchObject({ success: false, emailSent: false, error: expect.any(String) });
        expect(sendMail).toHaveBeenCalledTimes(1);
    });

    it.each(['database', 'smtp'])('%s 예외의 주소와 코드를 응답이나 로그로 노출하지 않는다', async (source) => {
        const error = new Error('mentee@example.com EXISTING-CODE private details');
        if (source === 'database') findUniqueInvite.mockRejectedValue(error);
        else sendMail.mockRejectedValue(error);
        const result = await POST(request(), context);
        expect(result.status).toBe(500);
        const text = JSON.stringify(await result.json());
        expect(text).not.toContain('mentee@example.com');
        expect(text).not.toContain('EXISTING-CODE');
        expect(text).not.toContain('private details');
        expect(loggedText()).not.toContain('mentee@example.com');
        expect(loggedText()).not.toContain('EXISTING-CODE');
    });
});
