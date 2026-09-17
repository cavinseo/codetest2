// 기존 멘티 연결의 관리자 확인, 계정 보존, 세션 폐기와 첫 로그인 분리를 검증한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
    admin: vi.fn(), findInvite: vi.fn(), findMember: vi.fn(), findOtherInvites: vi.fn(),
    updateMember: vi.fn(), updateInvite: vi.fn(), lock: vi.fn(), hash: vi.fn(),
    commit: vi.fn(), rollback: vi.fn(), log: vi.fn(), error: vi.fn(),
}));
vi.mock('../lib/authorization', () => ({ requireAdmin: mocks.admin }));
vi.mock('bcryptjs', () => ({ default: { hash: mocks.hash } }));
vi.mock('../lib/logger', () => ({ createLogger: () => ({ warn: mocks.log, error: mocks.error }) }));
vi.mock('../lib/prisma', () => ({ prisma: {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
        try {
            const result = await fn({
                $queryRaw: mocks.lock,
                inviteCode: { findUnique: mocks.findInvite, findMany: mocks.findOtherInvites, updateMany: mocks.updateInvite },
                user: { findFirst: mocks.findMember, updateMany: mocks.updateMember },
            });
            mocks.commit();
            return result;
        } catch (error) {
            mocks.rollback();
            throw error;
        }
    },
} }));

const { GET, POST } = await import('../app/api/invites/[id]/link/route');
const now = new Date('2026-09-17T00:00:00.000Z');
const after = (days: number) => new Date(now.getTime() + days * 86_400_000);
const props = () => ({ params: Promise.resolve({ id: 'invite_1' }) });
const request = (body?: unknown) => new NextRequest('http://localhost/api/invites/invite_1/link', {
    method: body === undefined ? 'GET' : 'POST',
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const inviteRecord = () => ({
    id: 'invite_1', email: 'mentee@example.test', code: 'KSQF-SECRET-CODE', role: 'MENTEE',
    programId: 'program_1', program: { id: 'program_1', name: '멘티 프로그램', endsAt: after(60) },
    usedAt: null, usedById: null, expiresAt: after(10), accessExpiresAt: after(20), accessDurationDays: 90,
});
const memberRecord = () => ({
    id: 'member_1', email: 'mentee@example.test', name: '기존 멘티', role: 'MENTEE', status: 'PENDING',
    isAdmin: false, programId: null, program: null, usedInviteCode: null, accessExpiresAt: null,
    sessionVersion: 4, mustChangePassword: false, passwordHash: 'existing-secret-hash', updatedAt: after(-1),
});

async function preview() {
    const response = await GET(request(), props());
    expect(response.status).toBe(200);
    return (await response.json()).preview as {
        member: { id: string }; previewToken: string; accessExpiresAt: string; resetPassword: boolean;
    };
}

async function confirm(overrides: Record<string, unknown> = {}) {
    const state = await preview();
    return POST(request({ memberId: state.member.id, previewToken: state.previewToken, confirmIdentity: true, ...overrides }), props());
}

beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
    mocks.admin.mockResolvedValue({ userId: 'admin_1', role: 'ADMIN', isAdmin: true });
    mocks.findInvite.mockResolvedValue(inviteRecord());
    mocks.findMember.mockResolvedValue(memberRecord());
    mocks.findOtherInvites.mockResolvedValue([]);
    mocks.updateMember.mockResolvedValue({ count: 1 });
    mocks.updateInvite.mockResolvedValue({ count: 1 });
    mocks.hash.mockResolvedValue('replacement-random-password-hash');
    mocks.lock.mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());

describe('관리자 회원 연결 확인', () => {
    it.each([401, 403])('인증 또는 관리자 권한 거절 %i는 확인과 저장 모두에서 조회 전에 반환한다', async status => {
        mocks.admin.mockResolvedValue(NextResponse.json({ error: '접근할 수 없습니다.' }, { status }));
        expect((await GET(request(), props())).status).toBe(status);
        expect((await POST(request({ memberId: 'member_1', previewToken: '0'.repeat(64), confirmIdentity: true }), props())).status).toBe(status);
        expect(mocks.findInvite).not.toHaveBeenCalled();
        expect(mocks.updateMember).not.toHaveBeenCalled();
    });

    it('연결 전 회원과 기한·비밀번호 변경 영향을 보여주고 저장하지 않는다', async () => {
        const response = await GET(request(), props());
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ preview: {
            inviteId: 'invite_1', email: 'mentee@example.test',
            member: { id: 'member_1', name: '기존 멘티', status: 'PENDING', programName: null, accessExpiresAt: null },
            program: { id: 'program_1', name: '멘티 프로그램' }, inviteExpiresAt: after(10).toISOString(),
            accessExpiresAt: after(20).toISOString(), resetPassword: true, previewToken: expect.stringMatching(/^[a-f0-9]{64}$/),
        } });
        expect(mocks.updateMember).not.toHaveBeenCalled();
        expect(mocks.updateInvite).not.toHaveBeenCalled();
        expect(mocks.hash).not.toHaveBeenCalled();
    });

    it.each([
        { confirmIdentity: false }, { confirmIdentity: undefined }, { memberId: '' },
        { previewToken: '' }, { previewToken: 'invalid' },
    ])('명시적인 본인 확인과 유효한 요청이 없으면 저장하지 않는다 (%j)', async overrides => {
        const response = await POST(request({ memberId: 'member_1', previewToken: '0'.repeat(64), confirmIdentity: true, ...overrides }), props());
        expect(response.status).toBe(400);
        expect(mocks.findInvite).not.toHaveBeenCalled();
        expect(mocks.updateMember).not.toHaveBeenCalled();
    });

    it('깨진 요청 본문은 400으로 처리한다', async () => {
        const broken = new NextRequest('http://localhost/api/invites/invite_1/link', { method: 'POST', body: '{' });
        expect((await POST(broken, props())).status).toBe(400);
        expect(mocks.findInvite).not.toHaveBeenCalled();
    });

    it('다른 회원 id로 확인하면 어떤 계정도 변경하지 않는다', async () => {
        expect((await confirm({ memberId: 'other_member' })).status).toBe(409);
        expect(mocks.updateMember).not.toHaveBeenCalled();
        expect(mocks.updateInvite).not.toHaveBeenCalled();
    });

    it.each([
        { status: 'APPROVED' }, { updatedAt: now }, { sessionVersion: 5 },
        { accessExpiresAt: after(30) }, { mustChangePassword: true },
    ])('확인 화면 이후 회원 상태가 달라지면 다시 확인을 요구한다 (%j)', async changes => {
        const state = await preview();
        mocks.findMember.mockResolvedValue({ ...memberRecord(), ...changes });
        const response = await POST(request({ memberId: 'member_1', previewToken: state.previewToken, confirmIdentity: true }), props());
        expect(response.status).toBe(409);
        expect(mocks.updateMember).not.toHaveBeenCalled();
        expect(mocks.hash).not.toHaveBeenCalled();
    });

    it('확인 화면 이후 초대 기한이 달라지면 다시 확인을 요구한다', async () => {
        const state = await preview();
        mocks.findInvite.mockResolvedValue({ ...inviteRecord(), expiresAt: after(11) });
        const response = await POST(request({ memberId: 'member_1', previewToken: state.previewToken, confirmIdentity: true }), props());
        expect(response.status).toBe(409);
        expect(mocks.updateMember).not.toHaveBeenCalled();
    });

    it('잠금을 기다리는 동안 같은 이메일의 회원이 바뀌면 확인했던 회원과 새 회원 모두 변경하지 않는다', async () => {
        const state = await preview();
        mocks.findMember.mockResolvedValueOnce(memberRecord())
            .mockResolvedValueOnce({ ...memberRecord(), id: 'replacement_member' });
        const response = await POST(request({ memberId: 'member_1', previewToken: state.previewToken, confirmIdentity: true }), props());
        expect(response.status).toBe(409);
        expect(mocks.lock).toHaveBeenCalledTimes(3);
        expect(mocks.updateMember).not.toHaveBeenCalled();
        expect(mocks.updateInvite).not.toHaveBeenCalled();
        expect(mocks.hash).not.toHaveBeenCalled();
    });
});

describe('기존 멘티 연결 자격', () => {
    it.each([
        ['멘토', { role: 'MENTOR' }], ['관리자 플래그', { isAdmin: true }],
        ['거절된 회원', { status: 'REJECTED' }], ['다른 프로그램', { programId: 'other_program' }],
        ['다른 초대에 연결됨', { usedInviteCode: { id: 'other_invite' } }],
    ])('%s 계정은 연결하지 않는다', async (_, changes) => {
        mocks.findMember.mockResolvedValue({ ...memberRecord(), ...changes });
        expect((await GET(request(), props())).status).toBe(409);
        expect(mocks.updateMember).not.toHaveBeenCalled();
    });

    it.each([
        ['다른 역할', { role: 'MENTOR' }], ['이미 사용', { usedAt: now }], ['이미 연결', { usedById: 'member_1' }],
    ])('%s 초대는 새 연결을 하지 않는다', async (_, changes) => {
        mocks.findInvite.mockResolvedValue({ ...inviteRecord(), ...changes });
        expect((await GET(request(), props())).status).toBe(409);
        expect(mocks.updateInvite).not.toHaveBeenCalled();
    });

    it.each([
        { expiresAt: now }, { program: { ...inviteRecord().program, endsAt: now } },
    ])('초대나 프로그램 만료 경계에서는 연결하지 않는다 (%j)', async changes => {
        mocks.findInvite.mockResolvedValue({ ...inviteRecord(), ...changes });
        expect((await GET(request(), props())).status).toBe(400);
        expect(mocks.updateMember).not.toHaveBeenCalled();
    });

    it.each(['초대', '회원'])('%s가 없으면 404를 반환한다', async missing => {
        if (missing === '초대') mocks.findInvite.mockResolvedValue(null);
        else mocks.findMember.mockResolvedValue(null);
        expect((await GET(request(), props())).status).toBe(404);
        expect(mocks.updateMember).not.toHaveBeenCalled();
    });

    it('같은 이메일의 다른 유효 초대가 있으면 연결하지 않는다', async () => {
        mocks.findOtherInvites.mockResolvedValue([{ ...inviteRecord(), id: 'other_invite' }]);
        expect((await GET(request(), props())).status).toBe(409);
    });

    it('같은 이메일의 다른 초대가 만료되었으면 연결할 수 있다', async () => {
        mocks.findOtherInvites.mockResolvedValue([{ ...inviteRecord(), id: 'old_invite', expiresAt: now }]);
        expect((await confirm()).status).toBe(200);
    });

    it('회원 이용만료일이 초대 기한보다 짧으면 먼저 회원관리에서 연장하도록 안내한다', async () => {
        mocks.findMember.mockResolvedValue({ ...memberRecord(), accessExpiresAt: after(9) });
        const response = await GET(request(), props());
        expect(response.status).toBe(400);
        expect((await response.json()).error).toContain('회원관리');
    });
});

describe('회원 정보 보존과 첫 로그인 분리', () => {
    it('승인 대기 계정만 기존 비밀번호를 폐기하고 기존 회원 id로 승인·배정한다', async () => {
        expect((await confirm()).status).toBe(200);
        expect(mocks.updateMember).toHaveBeenCalledWith({
            where: expect.objectContaining({ id: 'member_1', status: 'PENDING', role: 'MENTEE', isAdmin: false, usedInviteCode: { is: null } }),
            data: { status: 'APPROVED', programId: 'program_1', accessExpiresAt: after(20),
                sessionVersion: { increment: 1 }, passwordHash: 'replacement-random-password-hash', mustChangePassword: true },
        });
        expect(mocks.hash.mock.calls[0][0]).toMatch(/^[a-f0-9]{64}$/);
        expect(mocks.updateInvite).toHaveBeenCalledWith({
            where: { id: 'invite_1', usedAt: null, usedById: null },
            data: { usedById: 'member_1', accessExpiresAt: after(20) },
        });
        expect(mocks.updateInvite.mock.calls[0][0].data).not.toHaveProperty('usedAt');
        expect(mocks.updateMember.mock.calls[0][0].data).not.toHaveProperty('name');
        expect(mocks.updateMember.mock.calls[0][0].data).not.toHaveProperty('email');
    });

    it.each([null, 'program_1'])('승인된 회원의 프로그램 %s를 연결할 때 비밀번호와 더 긴 이용 기간은 보존한다', async programId => {
        mocks.findMember.mockResolvedValue({ ...memberRecord(), status: 'APPROVED', programId,
            program: programId ? { name: '멘티 프로그램' } : null, accessExpiresAt: after(40), mustChangePassword: true });
        expect((await confirm()).status).toBe(200);
        expect(mocks.updateMember.mock.calls[0][0].data).toEqual({
            status: 'APPROVED', programId: 'program_1', accessExpiresAt: after(40), sessionVersion: { increment: 1 },
        });
        expect(mocks.hash).not.toHaveBeenCalled();
        expect(mocks.updateInvite.mock.calls[0][0].data).toEqual({ usedById: 'member_1', accessExpiresAt: after(40) });
    });

    it('이용 기한이 없는 회원은 초기 초대 이용 기한이 짧더라도 최초 접속 기한까지 허용한다', async () => {
        mocks.findInvite.mockResolvedValue({ ...inviteRecord(), accessExpiresAt: after(5) });
        expect((await confirm()).status).toBe(200);
        expect(mocks.updateMember.mock.calls[0][0].data.accessExpiresAt).toEqual(after(10));
    });

    it('이미 초대 기한과 같은 이용 기한을 유지하고 날짜 연장을 요구하지 않는다', async () => {
        mocks.findMember.mockResolvedValue({ ...memberRecord(), accessExpiresAt: after(10) });
        expect((await confirm()).status).toBe(200);
        expect(mocks.updateMember.mock.calls[0][0].data.accessExpiresAt).toEqual(after(10));
        expect(mocks.updateInvite.mock.calls[0][0].data).not.toHaveProperty('expiresAt');
    });

    it('이메일 잠금 후 회원과 초대를 같은 순서로 잠그고 최신 상태를 다시 읽는다', async () => {
        expect((await confirm()).status).toBe(200);
        expect(mocks.lock).toHaveBeenCalledTimes(3);
        expect(mocks.lock.mock.calls[0][0].join('')).toContain('pg_advisory_xact_lock');
        expect(mocks.lock.mock.calls[0].slice(1)).toContain('invite-email:mentee@example.test');
        expect(mocks.lock.mock.calls[1][0].join('')).toMatch(/users[\s\S]*FOR UPDATE/);
        expect(mocks.lock.mock.calls[2][0].join('')).toMatch(/invite_codes[\s\S]*FOR UPDATE/);
        expect(mocks.lock.mock.invocationCallOrder[2]).toBeLessThan(mocks.findInvite.mock.invocationCallOrder[2]);
        expect(mocks.findInvite.mock.invocationCallOrder[2]).toBeLessThan(mocks.updateMember.mock.invocationCallOrder[0]);
    });

    it.each(['회원', '초대'])('%s 조건부 갱신 실패는 전체 연결 트랜잭션을 되돌린다', async target => {
        if (target === '회원') mocks.updateMember.mockResolvedValue({ count: 0 });
        else mocks.updateInvite.mockResolvedValue({ count: 0 });
        const response = await confirm();
        expect(response.status).toBe(409);
        expect(mocks.rollback).toHaveBeenCalledOnce();
        expect(mocks.commit).toHaveBeenCalledOnce();
        expect(mocks.log).not.toHaveBeenCalled();
        if (target === '회원') expect(mocks.updateInvite).not.toHaveBeenCalled();
    });

    it('확인 후 첫 사용된 초대의 재연결 시도는 비밀번호를 다시 초기화하지 않는다', async () => {
        const state = await preview();
        mocks.findInvite.mockResolvedValue({ ...inviteRecord(), usedAt: now, usedById: 'member_1' });
        const response = await POST(request({ memberId: 'member_1', previewToken: state.previewToken, confirmIdentity: true }), props());
        expect(response.status).toBe(409);
        expect(mocks.hash).not.toHaveBeenCalled();
        expect(mocks.updateMember).not.toHaveBeenCalled();
    });

    it('감사 기록은 관리자·대상 id와 기한만 포함하고 코드·이메일·비밀번호는 남기지 않는다', async () => {
        expect((await confirm()).status).toBe(200);
        expect(mocks.log).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
            actorId: 'admin_1', inviteId: 'invite_1', memberId: 'member_1', previousStatus: 'PENDING', resetPassword: true,
        }));
        const logged = JSON.stringify(mocks.log.mock.calls);
        expect(logged).not.toContain('mentee@example.test');
        expect(logged).not.toContain('KSQF-SECRET-CODE');
        expect(logged).not.toContain('replacement-random-password-hash');
    });

    it.each(['P2002', 'P2025', 'P2034'])('DB 경합 %s는 내부 정보 없이 재확인을 요구한다', async code => {
        mocks.updateInvite.mockRejectedValue({ code, message: 'secret database data' });
        const response = await confirm();
        expect(response.status).toBe(409);
        expect(await response.text()).not.toContain('secret');
        expect(mocks.rollback).toHaveBeenCalledOnce();
    });

    it.each(['40P01', '40001'])('잠금 중 PostgreSQL 경합 %s는 내부 정보 없이 409로 재확인을 요구한다', async postgresCode => {
        mocks.lock.mockRejectedValue({ code: 'P2010', meta: { code: postgresCode, message: 'secret raw SQL' }, message: 'secret database data' });
        const response = await confirm();
        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({ error: '회원 또는 초대 정보가 변경되었습니다. 연결 내용을 다시 확인하세요.' });
        expect(mocks.rollback).toHaveBeenCalledOnce();
        expect(mocks.updateMember).not.toHaveBeenCalled();
        expect(mocks.updateInvite).not.toHaveBeenCalled();
        expect(mocks.error).not.toHaveBeenCalled();
    });

    it('경합이 아닌 P2010 오류는 500으로 처리하고 원문을 응답이나 로그에 노출하지 않는다', async () => {
        mocks.lock.mockRejectedValue({ code: 'P2010', meta: { code: '42501', message: 'secret database permission' }, message: 'secret database credential' });
        const response = await confirm();
        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: '기존 회원 연결 중 오류가 발생했습니다.' });
        expect(mocks.rollback).toHaveBeenCalledOnce();
        expect(mocks.updateMember).not.toHaveBeenCalled();
        expect(mocks.updateInvite).not.toHaveBeenCalled();
        expect(mocks.error).toHaveBeenCalledWith(expect.any(String), undefined, { code: 'P2010' });
        expect(JSON.stringify(mocks.error.mock.calls)).not.toContain('secret');
    });

    it('예상하지 못한 저장 오류는 원문을 응답이나 로그에 노출하지 않는다', async () => {
        mocks.updateInvite.mockRejectedValue(new Error('secret database credential'));
        const response = await confirm();
        expect(response.status).toBe(500);
        expect(await response.text()).not.toContain('secret');
        expect(JSON.stringify(mocks.error.mock.calls)).not.toContain('secret');
    });
});
