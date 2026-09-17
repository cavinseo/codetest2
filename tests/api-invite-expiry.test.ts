// 초대 기한 연장의 권한·날짜·계정 연결과 트랜잭션 경합 방지를 검증한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const findInvite = vi.fn();
const findLockedInvite = vi.fn();
const findOtherInvites = vi.fn();
const updateInvite = vi.fn();
const findUser = vi.fn();
const updateUsers = vi.fn();
const lock = vi.fn();
const transaction = vi.fn(async (fn: (tx: unknown) => unknown) => fn({
    $queryRaw: lock,
    inviteCode: { findUnique: findLockedInvite, findMany: findOtherInvites, update: updateInvite },
    user: { findFirst: findUser, updateMany: updateUsers },
}));

vi.mock('../lib/prisma', () => ({
    prisma: {
        inviteCode: { findUnique: findInvite },
        $transaction: transaction,
    },
}));

const requireAuth = vi.fn();
vi.mock('../lib/auth', () => ({ requireAuth: (...args: unknown[]) => requireAuth(...args) }));
const sendMail = vi.fn();
vi.mock('../lib/email', () => ({ sendMail: (...args: unknown[]) => sendMail(...args) }));

const { PATCH } = await import('../app/api/invites/route');

const ISSUER_ID = 'issuer_1';
const TARGET_EXPIRY = new Date('2026-10-15T14:59:59.999Z');

function authAs(role: string) {
    requireAuth.mockResolvedValue({
        userId: ISSUER_ID, email: 'issuer@example.test', name: '발행자',
        isAdmin: role === 'ADMIN', role, accessExpiresAt: null,
    });
}

function inviteRecord() {
    return {
        id: 'inv_1', code: 'KSQF-SAME-CODE-1234', email: 'mentee@example.test',
        role: 'MENTEE', programId: 'prog_1', issuedById: ISSUER_ID,
        expiresAt: new Date('2026-09-30T14:59:59.999Z'),
        accessExpiresAt: null, accessDurationDays: 90,
        usedAt: null, usedById: null, usedBy: null,
        program: { id: 'prog_1', managerId: ISSUER_ID, endsAt: new Date('2026-12-31T08:00:00.000Z') },
    };
}

function usedInviteRecord() {
    return {
        ...inviteRecord(), usedAt: new Date('2026-09-01T03:00:00.000Z'), usedById: 'mentee_1',
        usedBy: {
            id: 'mentee_1', email: 'mentee@example.test', role: 'MENTEE', programId: 'prog_1',
            isAdmin: false, status: 'APPROVED',
            accessExpiresAt: new Date('2026-11-01T14:59:59.999Z'),
        },
    };
}

function patchRequest(body: Record<string, unknown> = {}): NextRequest {
    return new NextRequest('http://localhost/api/invites', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'inv_1', expiresAt: '2026-10-15', ...body }),
    });
}

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-17T03:00:00.000Z'));
    authAs('ADMIN');
    findInvite.mockResolvedValue({ id: 'inv_1', email: 'mentee@example.test' });
    findLockedInvite.mockResolvedValue(inviteRecord());
    findOtherInvites.mockResolvedValue([]);
    findUser.mockResolvedValue(null);
    updateUsers.mockResolvedValue({ count: 1 });
    updateInvite.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...inviteRecord(), ...data }));
    lock.mockResolvedValue([]);
});

afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
});

describe('초대 기한 연장 권한', () => {
    it.each(['ADMIN', 'PROGRAM_MANAGER'])('%s는 담당 프로그램 초대를 연장할 수 있다', async role => {
        authAs(role);
        const res = await PATCH(patchRequest());

        expect(res.status).toBe(200);
        expect(updateInvite).toHaveBeenCalledOnce();
    });

    it('관리자는 다른 매니저의 프로그램 초대도 연장한다', async () => {
        const invite = inviteRecord();
        findLockedInvite.mockResolvedValue({ ...invite, program: { ...invite.program, managerId: 'other_manager' } });

        expect((await PATCH(patchRequest())).status).toBe(200);
        expect(updateInvite).toHaveBeenCalledOnce();
    });

    it('담당이 아닌 매니저는 연장하지 못한다', async () => {
        authAs('PROGRAM_MANAGER');
        const invite = inviteRecord();
        findLockedInvite.mockResolvedValue({ ...invite, program: { ...invite.program, managerId: 'other_manager' } });

        expect((await PATCH(patchRequest())).status).toBe(403);
        expect(updateInvite).not.toHaveBeenCalled();
        expect(updateUsers).not.toHaveBeenCalled();
    });

    it.each(['MENTOR', 'MENTEE'])('%s는 조회 전에 거절한다', async role => {
        authAs(role);

        expect((await PATCH(patchRequest())).status).toBe(403);
        expect(findInvite).not.toHaveBeenCalled();
        expect(transaction).not.toHaveBeenCalled();
        expect(updateInvite).not.toHaveBeenCalled();
    });

    it('미로그인 요청은 인증 실패를 그대로 반환한다', async () => {
        requireAuth.mockResolvedValue(NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 }));

        expect((await PATCH(patchRequest())).status).toBe(401);
        expect(findInvite).not.toHaveBeenCalled();
        expect(transaction).not.toHaveBeenCalled();
    });
});

describe('초대 연장의 날짜 경계', () => {
    it.each([undefined, '', '2026-02-30', '2026-13-01', '2026-09-16', '2026-10-15T00:00:00Z'])('잘못된 날짜 %s는 변경하지 않는다', async expiresAt => {
        expect((await PATCH(patchRequest({ expiresAt }))).status).toBe(400);
        expect(updateInvite).not.toHaveBeenCalled();
        expect(updateUsers).not.toHaveBeenCalled();
    });

    it.each([undefined, ''])('id %s가 없으면 변경하지 않는다', async id => {
        expect((await PATCH(patchRequest({ id }))).status).toBe(400);
        expect(findInvite).not.toHaveBeenCalled();
        expect(updateInvite).not.toHaveBeenCalled();
    });

    it('깨진 JSON은 입력 오류로 처리한다', async () => {
        const request = new NextRequest('http://localhost/api/invites', {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{"id":',
        });

        expect((await PATCH(request)).status).toBe(400);
        expect(findInvite).not.toHaveBeenCalled();
        expect(updateInvite).not.toHaveBeenCalled();
    });

    it.each(['2026-09-29', '2026-09-30'])('현재와 같거나 짧은 날짜 %s는 거절한다', async expiresAt => {
        expect((await PATCH(patchRequest({ expiresAt }))).status).toBe(400);
        expect(updateInvite).not.toHaveBeenCalled();
    });

    it('프로그램 한국 종료 날짜를 넘는 연장은 거절한다', async () => {
        const invite = inviteRecord();
        findLockedInvite.mockResolvedValue({ ...invite, program: { ...invite.program, endsAt: new Date('2026-10-14T16:00:00.000Z') } });

        expect((await PATCH(patchRequest({ expiresAt: '2026-10-16' }))).status).toBe(400);
        expect(updateInvite).not.toHaveBeenCalled();
    });

    it('프로그램 한국 종료 날짜와 같으면 프로그램의 정확한 종료 시각까지 연장한다', async () => {
        const invite = inviteRecord();
        const endsAt = new Date('2026-10-14T16:00:00.000Z');
        findLockedInvite.mockResolvedValue({ ...invite, program: { ...invite.program, endsAt } });

        const res = await PATCH(patchRequest());

        expect(res.status).toBe(200);
        expect(updateInvite).toHaveBeenCalledWith({ where: { id: 'inv_1' }, data: { expiresAt: endsAt, accessExpiresAt: endsAt } });
        expect((await res.json()).invite.expiresAt).toBe(endsAt.toISOString());
    });

    it('프로그램 종료 시각으로 제한한 결과가 현재와 같으면 연장하지 않는다', async () => {
        const invite = inviteRecord();
        const endsAt = new Date('2026-10-14T16:00:00.000Z');
        findLockedInvite.mockResolvedValue({ ...invite, expiresAt: endsAt, program: { ...invite.program, endsAt } });

        expect((await PATCH(patchRequest())).status).toBe(400);
        expect(updateInvite).not.toHaveBeenCalled();
    });

    it('이미 종료된 프로그램은 만료 초대도 되살리지 않는다', async () => {
        const invite = inviteRecord();
        findLockedInvite.mockResolvedValue({ ...invite, expiresAt: new Date('2026-09-01T00:00:00.000Z'), program: { ...invite.program, endsAt: new Date('2026-09-17T02:00:00.000Z') } });

        expect((await PATCH(patchRequest({ expiresAt: '2026-09-17' }))).status).toBe(400);
        expect(updateInvite).not.toHaveBeenCalled();
    });
});

describe('초대 연장과 연결 계정', () => {
    it('미사용 초대의 가입·이용 기한만 바꾸고 코드와 이력은 보존한다', async () => {
        const res = await PATCH(patchRequest());

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ success: true, invite: { id: 'inv_1', expiresAt: TARGET_EXPIRY.toISOString(), usedAt: null } });
        expect(updateInvite).toHaveBeenCalledWith({
            where: { id: 'inv_1' }, data: { expiresAt: TARGET_EXPIRY, accessExpiresAt: TARGET_EXPIRY },
        });
        expect(updateUsers).not.toHaveBeenCalled();
        expect(sendMail).not.toHaveBeenCalled();
    });

    it('만료된 미사용 초대도 중복이 없으면 같은 코드로 연장한다', async () => {
        findLockedInvite.mockResolvedValue({ ...inviteRecord(), expiresAt: new Date('2026-09-01T00:00:00.000Z') });

        expect((await PATCH(patchRequest())).status).toBe(200);
        expect(findUser).toHaveBeenCalledWith(expect.objectContaining({ where: { email: { equals: 'mentee@example.test', mode: 'insensitive' } } }));
        expect(findOtherInvites).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: { not: 'inv_1' }, email: { equals: 'mentee@example.test', mode: 'insensitive' } },
        }));
        expect(updateInvite).toHaveBeenCalledOnce();
    });

    it.each(['ADMIN', 'PROGRAM_MANAGER'])('%s의 기한 편집으로는 기존 계정을 연결하지 않는다', async role => {
        authAs(role);
        findUser.mockResolvedValue({ ...usedInviteRecord().usedBy, accessExpiresAt: null, usedInviteCode: null });

        const res = await PATCH(patchRequest());

        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({ invite: { usedAt: null, expiresAt: TARGET_EXPIRY.toISOString() } });
        expect(updateUsers).not.toHaveBeenCalled();
        expect(updateInvite).toHaveBeenCalledWith({ where: { id: 'inv_1' }, data: { expiresAt: TARGET_EXPIRY, accessExpiresAt: TARGET_EXPIRY } });
        expect(sendMail).not.toHaveBeenCalled();
    });

    it.each([
        { role: 'MENTOR' }, { isAdmin: true }, { status: 'PENDING' }, { status: 'REJECTED' },
        { programId: 'other_program' }, { programId: null },
    ])('기한만 편집할 때 기존 계정의 역할·승인·프로그램은 변경하지 않는다 (%j)', async changes => {
        findUser.mockResolvedValue({ ...usedInviteRecord().usedBy, usedInviteCode: null, ...changes });

        expect((await PATCH(patchRequest())).status).toBe(200);
        expect(updateInvite.mock.calls[0][0].data).toEqual({ expiresAt: TARGET_EXPIRY, accessExpiresAt: TARGET_EXPIRY });
        expect(updateUsers).not.toHaveBeenCalled();
    });

    it('다른 초대에 연결된 기존 계정의 대기 초대는 연장하지 않는다', async () => {
        findUser.mockResolvedValue({ ...usedInviteRecord().usedBy, usedInviteCode: { id: 'other_invite' } });
        expect((await PATCH(patchRequest())).status).toBe(409);
        expect(updateInvite).not.toHaveBeenCalled();
        expect(updateUsers).not.toHaveBeenCalled();
    });

    it('아직 연결하지 않은 회원도 이용만료일보다 늦게 초대 기한을 연장하지 못한다', async () => {
        findUser.mockResolvedValue({ ...usedInviteRecord().usedBy, accessExpiresAt: new Date('2026-10-01T14:59:59.999Z'), usedInviteCode: null });
        const response = await PATCH(patchRequest());
        expect(response.status).toBe(400);
        expect((await response.json()).error).toContain('회원관리');
        expect(updateInvite).not.toHaveBeenCalled();
        expect(updateUsers).not.toHaveBeenCalled();
    });

    it('회원 연결 전 만료 초대를 연장해도 회원을 승인하거나 코드를 사용 처리하지 않는다', async () => {
        findLockedInvite.mockResolvedValue({ ...inviteRecord(), expiresAt: new Date(0) });
        findUser.mockResolvedValue({ ...usedInviteRecord().usedBy, status: 'PENDING', programId: null, accessExpiresAt: null, usedInviteCode: null });
        expect((await PATCH(patchRequest())).status).toBe(200);
        expect(updateInvite.mock.calls[0][0].data).toEqual({ expiresAt: TARGET_EXPIRY, accessExpiresAt: TARGET_EXPIRY });
        expect(updateUsers).not.toHaveBeenCalled();
    });

    it.each(['2026-10-15T14:59:59.999Z', '2026-11-01T14:59:59.999Z'])('관리자가 이미 연결한 첫 로그인 대기 계정은 이용 기한 %s를 유지하며 초대만 연장한다', async accessExpiresAt => {
        const record = usedInviteRecord();
        findLockedInvite.mockResolvedValue({ ...record, usedAt: null, usedBy: { ...record.usedBy, accessExpiresAt: new Date(accessExpiresAt) } });
        const response = await PATCH(patchRequest());
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ invite: { usedAt: null } });
        expect(updateUsers.mock.calls[0][0].data.accessExpiresAt).toEqual(new Date(accessExpiresAt));
        expect(updateInvite.mock.calls[0][0].data).toEqual({ expiresAt: TARGET_EXPIRY, accessExpiresAt: new Date(accessExpiresAt) });
        expect(findUser).not.toHaveBeenCalled();
    });

    it('기존 멘티가 있어도 다른 유효 초대가 있으면 어느 기한도 변경하지 않는다', async () => {
        findUser.mockResolvedValue({ ...usedInviteRecord().usedBy, usedInviteCode: null });
        findOtherInvites.mockResolvedValue([{ ...inviteRecord(), id: 'other_invite' }]);

        expect((await PATCH(patchRequest())).status).toBe(409);
        expect(updateInvite).not.toHaveBeenCalled();
        expect(updateUsers).not.toHaveBeenCalled();
    });

    it('동일 이메일에 다른 유효 초대가 있으면 거절한다', async () => {
        findOtherInvites.mockResolvedValue([{ ...inviteRecord(), id: 'other_invite' }]);

        expect((await PATCH(patchRequest())).status).toBe(409);
        expect(updateInvite).not.toHaveBeenCalled();
    });

    it('동일 이메일의 다른 초대가 모두 만료되었으면 연장한다', async () => {
        findOtherInvites.mockResolvedValue([{ ...inviteRecord(), id: 'expired_invite', expiresAt: new Date('2026-09-01T00:00:00.000Z') }]);

        expect((await PATCH(patchRequest())).status).toBe(200);
        expect(updateInvite).toHaveBeenCalledOnce();
    });

    it('사용된 초대 기한을 연장해도 회원 이용만료일은 유지한다', async () => {
        findLockedInvite.mockResolvedValue(usedInviteRecord());

        expect((await PATCH(patchRequest())).status).toBe(200);
        expect(transaction).toHaveBeenCalledOnce();
        expect(updateUsers).toHaveBeenCalledWith({
            where: {
                id: 'mentee_1', role: 'MENTEE', isAdmin: false, status: 'APPROVED', programId: 'prog_1',
                email: { equals: 'mentee@example.test', mode: 'insensitive' },
                accessExpiresAt: new Date('2026-11-01T14:59:59.999Z'),
            },
            data: { accessExpiresAt: new Date('2026-11-01T14:59:59.999Z') },
        });
        expect(updateInvite).toHaveBeenCalledWith({ where: { id: 'inv_1' }, data: { expiresAt: TARGET_EXPIRY } });
        expect(findUser).not.toHaveBeenCalled();
        expect(sendMail).not.toHaveBeenCalled();
    });

    it.each(['2026-10-15T14:59:59.999Z', '2026-11-01T14:59:59.999Z'])('회원 이용만료일 %s 이내에서 초대 기한을 연장한다', async currentExpiry => {
        const invite = usedInviteRecord();
        findLockedInvite.mockResolvedValue({ ...invite, usedBy: { ...invite.usedBy, accessExpiresAt: new Date(currentExpiry) } });

        expect((await PATCH(patchRequest())).status).toBe(200);
        expect(updateUsers.mock.calls[0][0].data.accessExpiresAt).toEqual(new Date(currentExpiry));
        expect(updateInvite.mock.calls[0][0].data).toEqual({ expiresAt: TARGET_EXPIRY });
    });

    it.each([false, true])('회원 이용만료일보다 늦은 초대 연장은 연결 상태와 무관하게 거절한다 (첫 로그인 완료 %s)', async used => {
        const record = usedInviteRecord();
        const mentee = { ...record.usedBy, accessExpiresAt: new Date('2026-10-01T14:59:59.999Z'), usedInviteCode: null };
        findLockedInvite.mockResolvedValue({ ...record, usedAt: used ? record.usedAt : null, usedBy: mentee });
        const res = await PATCH(patchRequest());
        expect(res.status).toBe(400);
        expect((await res.json()).error).toContain('회원관리');
        expect(updateUsers).not.toHaveBeenCalled();
        expect(updateInvite).not.toHaveBeenCalled();
    });

    it('기존 90일 이용 기한보다 긴 초대 연장도 회원관리에서 먼저 연장해야 한다', async () => {
        const invite = usedInviteRecord();
        findLockedInvite.mockResolvedValue({ ...invite, usedBy: { ...invite.usedBy, accessExpiresAt: null } });
        expect((await PATCH(patchRequest({ expiresAt: '2026-12-01' }))).status).toBe(400);
        expect(updateUsers).not.toHaveBeenCalled();
        expect(updateInvite).not.toHaveBeenCalled();
    });

    it('이메일 대소문자가 다른 기존 연결도 동일 계정으로 연장한다', async () => {
        const invite = usedInviteRecord();
        findInvite.mockResolvedValue({ email: 'MENTEE@EXAMPLE.TEST' });
        findLockedInvite.mockResolvedValue({ ...invite, email: 'MENTEE@EXAMPLE.TEST', usedBy: { ...invite.usedBy, email: 'Mentee@Example.Test' } });

        expect((await PATCH(patchRequest())).status).toBe(200);
        expect(lock.mock.calls[0].slice(1)).toContain('invite-email:mentee@example.test');
        expect(updateUsers).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ email: { equals: 'mentee@example.test', mode: 'insensitive' } }),
        }));
    });

    it.each([
        { label: '계정 연결 누락', changes: { usedById: null, usedBy: null } },
        { label: '계정 조회 누락', changes: { usedBy: null } },
        { label: '다른 계정 id', changes: { usedBy: { ...usedInviteRecord().usedBy, id: 'other_user' } } },
        { label: '다른 역할', changes: { usedBy: { ...usedInviteRecord().usedBy, role: 'MENTOR' } } },
        { label: '관리자 계정', changes: { usedBy: { ...usedInviteRecord().usedBy, isAdmin: true } } },
        { label: '승인 대기 계정', changes: { usedBy: { ...usedInviteRecord().usedBy, status: 'PENDING' } } },
        { label: '거절된 계정', changes: { usedBy: { ...usedInviteRecord().usedBy, status: 'REJECTED' } } },
        { label: '다른 프로그램', changes: { usedBy: { ...usedInviteRecord().usedBy, programId: 'prog_other' } } },
        { label: '다른 이메일', changes: { usedBy: { ...usedInviteRecord().usedBy, email: 'other@example.test' } } },
    ])('사용된 초대의 $label 상태에서는 변경하지 않는다', async ({ changes }) => {
        findLockedInvite.mockResolvedValue({ ...usedInviteRecord(), ...changes });

        expect((await PATCH(patchRequest())).status).toBe(400);
        expect(updateUsers).not.toHaveBeenCalled();
        expect(updateInvite).not.toHaveBeenCalled();
    });

    it('미사용 초대에 계정 연결만 남은 불일치 상태에서는 변경하지 않는다', async () => {
        findLockedInvite.mockResolvedValue({ ...inviteRecord(), usedById: 'mentee_1' });

        expect((await PATCH(patchRequest())).status).toBe(409);
        expect(updateUsers).not.toHaveBeenCalled();
        expect(updateInvite).not.toHaveBeenCalled();
    });

    it('멘티 이외 역할로 발급된 초대는 변경하지 않는다', async () => {
        findLockedInvite.mockResolvedValue({ ...inviteRecord(), role: 'MENTOR' });

        expect((await PATCH(patchRequest())).status).toBe(400);
        expect(updateUsers).not.toHaveBeenCalled();
        expect(updateInvite).not.toHaveBeenCalled();
    });

    it('연결된 멘티의 조건부 갱신이 실패하면 초대를 변경하지 않는다', async () => {
        findLockedInvite.mockResolvedValue(usedInviteRecord());
        updateUsers.mockResolvedValue({ count: 0 });

        expect((await PATCH(patchRequest())).status).toBe(409);
        expect(updateInvite).not.toHaveBeenCalled();
    });
});

describe('초대 연장 동시 처리와 실패', () => {
    it('발급과 같은 이메일 잠금 및 로그인과 같은 행 잠금 뒤 초대를 다시 읽는다', async () => {
        await PATCH(patchRequest());

        expect(findInvite).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'inv_1' } }));
        expect(lock).toHaveBeenCalledTimes(3);
        expect(lock.mock.calls[0][0].join('')).toContain('pg_advisory_xact_lock');
        expect(lock.mock.calls[0].slice(1)).toContain('invite-email:mentee@example.test');
        expect(lock.mock.calls[1][0].join('')).toMatch(/users[\s\S]*FOR UPDATE/);
        expect(lock.mock.calls[2][0].join('')).toMatch(/invite_codes[\s\S]*FOR UPDATE/);
        expect(lock.mock.calls[2].slice(1)).toContain('inv_1');
        expect(findLockedInvite).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'inv_1' } }));
        expect(lock.mock.invocationCallOrder[2]).toBeLessThan(findLockedInvite.mock.invocationCallOrder[0]);
        expect(findLockedInvite.mock.invocationCallOrder[0]).toBeLessThan(updateInvite.mock.invocationCallOrder[0]);
    });

    it('초기 조회에서 찾지 못한 초대는 404로 반환한다', async () => {
        findInvite.mockResolvedValue(null);

        expect((await PATCH(patchRequest())).status).toBe(404);
        expect(transaction).not.toHaveBeenCalled();
        expect(updateInvite).not.toHaveBeenCalled();
    });

    it('잠금을 기다리는 사이 삭제된 초대는 404로 반환한다', async () => {
        findLockedInvite.mockResolvedValue(null);

        expect((await PATCH(patchRequest())).status).toBe(404);
        expect(updateInvite).not.toHaveBeenCalled();
    });

    it('잠금을 기다리는 사이 사용된 초대는 재조회한 회원 이용만료일을 보존한다', async () => {
        findLockedInvite.mockResolvedValue(usedInviteRecord());

        expect((await PATCH(patchRequest())).status).toBe(200);
        expect(updateUsers).toHaveBeenCalledOnce();
        expect(findUser).not.toHaveBeenCalled();
    });

    it.each(['조회', '저장'])('DB %s 오류의 내부 메시지는 응답에 노출하지 않는다', async stage => {
        const dbError = new Error('postgresql://secret-password@internal-db:5432/private invite-email:private@example.test');
        if (stage === '조회') findInvite.mockRejectedValueOnce(dbError);
        else updateInvite.mockRejectedValueOnce(dbError);

        const res = await PATCH(patchRequest());
        const body = await res.text();

        expect(res.status).toBe(500);
        expect(body).not.toContain('secret-password');
        expect(body).not.toContain('internal-db');
        expect(body).not.toContain('private@example.test');
        expect(JSON.parse(body).error).toEqual(expect.any(String));
        expect(sendMail).not.toHaveBeenCalled();
    });
});
