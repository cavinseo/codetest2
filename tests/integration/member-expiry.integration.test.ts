// 격리 PostgreSQL에서 초대·회원 기한의 전체 흐름과 동시 변경을 검증한다.
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('next/headers', () => ({ cookies: async () => ({ set: vi.fn() }) }));
vi.mock('../../lib/email', () => ({ sendMail: async () => true }));
const dbUrl = process.env.INTEGRATION_DATABASE_URL;
if (!dbUrl || !['127.0.0.1', 'localhost'].includes(new URL(dbUrl).hostname)
    || new URL(dbUrl).pathname !== '/program_restore_qa' || dbUrl === process.env.POSTGRES_PRISMA_URL) {
    throw new Error('별도 로컬 program_restore_qa DB만 사용할 수 있습니다.');
}
const db = new PrismaClient({ datasources: { db: { url: dbUrl } } });
vi.mock('../../lib/prisma', () => ({ get prisma() { return db; } }));
import { encodeSessionCookie, requireAuth } from '../../lib/auth';
import { SESSION_COOKIE_NAME } from '../../lib/constants';
import { issueMenteeInvite } from '../../lib/invite-management';
import { normalizeInviteCode } from '../../lib/invite-code';
import { formatInviteExpiryDate } from '../../lib/invite-expiry';
import { POST as login } from '../../app/api/auth/invite-login/route';
import { GET as listMembers, PATCH as editMember } from '../../app/api/admin/users/route';
import { GET as listInvites, PATCH as editInvite } from '../../app/api/invites/route';

const prefix = `expiryqa_${Date.now()}`;
const adminId = `${prefix}_admin`;
const programId = `${prefix}_program`;
const origin = 'http://localhost';
const now = new Date();
const dateAfter = (days: number) => formatInviteExpiryDate(new Date(now.getTime() + days * 86_400_000));
const expiryAfter = (days: number) => new Date(`${dateAfter(days)}T23:59:59.999+09:00`);
const manager = { userId: adminId, role: 'ADMIN' as const };

function adminRequest(path: string, body?: unknown) {
    const session = encodeSessionCookie({ userId: adminId, email: `${adminId}@example.test`, name: '검증 관리자' });
    return new NextRequest(`${origin}${path}`, {
        method: body ? 'PATCH' : 'GET', headers: { cookie: `${SESSION_COOKIE_NAME}=${session}` },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
}
async function issue(suffix: string, days = 10) {
    const result = await issueMenteeInvite({ email: `${prefix}_${suffix}@example.test`,
        code: normalizeInviteCode(`${prefix}${suffix}`), role: 'MENTEE', programId,
        expiresAt: expiryAfter(days), accessDurationDays: 90 }, manager);
    if ('error' in result) throw new Error(result.error);
    return result.invite;
}
const signIn = (invite: { email: string; code: string }) => login(new NextRequest(`${origin}/api/auth/invite-login`, {
    method: 'POST', body: JSON.stringify({ email: invite.email, inviteCode: invite.code, name: '기한 검증 멘티' }),
}));
const setExpiry = (userId: string, days: number) => editMember(adminRequest('/api/admin/users', {
    userId, action: 'setAccessExpiry', accessExpiresAt: dateAfter(days),
}));
async function createMember(suffix: string) {
    const invite = await issue(suffix);
    const response = await signIn(invite);
    expect(response.status).toBe(200);
    return { invite, member: await db.user.findUniqueOrThrow({ where: { email: invite.email } }) };
}

beforeAll(async () => {
    process.env.SESSION_SECRET = 'isolated-member-expiry-integration-secret';
    await db.user.create({ data: { id: adminId, email: `${adminId}@example.test`, passwordHash: 'fixture',
        name: '검증 관리자', role: 'ADMIN', isAdmin: true, status: 'APPROVED',
        profile: { create: { organization: '검증', phone: '01000000000', expertise: '검증', careerYears: 1, privacyConsentAt: now } } } });
    await db.program.create({ data: { id: programId, managerId: adminId, name: '기한 검증', organization: '검증',
        startsAt: new Date('2020-01-01'), endsAt: expiryAfter(45) } });
});
afterEach(() => vi.useRealTimers());
afterAll(async () => {
    await db.inviteCode.deleteMany({ where: { issuedById: adminId } });
    await db.user.deleteMany({ where: { email: { startsWith: prefix }, id: { not: adminId } } });
    await db.program.deleteMany({ where: { id: programId } });
    await db.user.deleteMany({ where: { id: adminId } });
    await db.$disconnect();
});

it('발급 날짜를 초기 이용만료일에 반영하고 연장 후 초대·프로그램 종료와 별도로 로그인한다', async () => {
    const { invite, member } = await createMember('lifecycle');
    expect(invite.accessExpiresAt).toEqual(invite.expiresAt);
    expect(member.accessExpiresAt).toEqual(invite.expiresAt);
    const usedAt = (await db.inviteCode.findUniqueOrThrow({ where: { id: invite.id } })).usedAt;
    expect((await setExpiry(member.id, 60)).status).toBe(200);

    const invitations = (await (await listInvites(adminRequest('/api/invites'))).json()).invites;
    expect(invitations.find((item: { id: string }) => item.id === invite.id)).toMatchObject({
        expiresAt: invite.expiresAt.toISOString(), accessExpiresAt: expiryAfter(60).toISOString(),
    });
    const members = (await (await listMembers(adminRequest('/api/admin/users'))).json()).users;
    expect(members.find((item: { id: string }) => item.id === member.id)).toMatchObject({
        inviteExpiresAt: invite.expiresAt.toISOString(), accessExpiresAt: expiryAfter(60).toISOString(),
    });

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(expiryAfter(46));
    expect((await signIn(invite)).status).toBe(200);
    vi.setSystemTime(new Date(expiryAfter(60).getTime() - 1));
    expect((await signIn(invite)).status).toBe(200);
    const session = encodeSessionCookie({ userId: member.id, email: member.email, name: member.name });
    const request = new NextRequest(`${origin}/api/projects`, { headers: { cookie: `${SESSION_COOKIE_NAME}=${session}` } });
    expect(await requireAuth(request, { allowIncompleteOnboarding: true })).not.toBeInstanceOf(NextResponse);
    vi.setSystemTime(expiryAfter(60));
    expect((await signIn(invite)).status).toBe(403);
    expect((await requireAuth(request, { allowIncompleteOnboarding: true }) as NextResponse).status).toBe(403);
    expect((await db.inviteCode.findUniqueOrThrow({ where: { id: invite.id } })).usedAt).toEqual(usedAt);
    expect(await db.user.count({ where: { email: member.email } })).toBe(1);
});

it('최초 접속 기한이 지난 미사용 코드는 계정을 만들지 않는다', async () => {
    const invite = await issue('unused');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(invite.expiresAt);
    expect((await signIn(invite)).status).toBe(403);
    expect(await db.user.count({ where: { email: invite.email } })).toBe(0);
});

it('발급 후 프로그램 종료일이 앞당겨져도 초기 회원 기한은 초대 기한보다 짧아지지 않는다', async () => {
    const invite = await issue('program_changed');
    await db.program.update({ where: { id: programId }, data: { endsAt: expiryAfter(5) } });
    try {
        expect((await signIn(invite)).status).toBe(200);
        expect((await db.user.findUniqueOrThrow({ where: { email: invite.email } })).accessExpiresAt).toEqual(invite.expiresAt);
    } finally {
        await db.program.update({ where: { id: programId }, data: { endsAt: expiryAfter(45) } });
    }
});

it('회원 기한 하한을 지키고 단축하면 이미 발급한 세션을 무효화한다', async () => {
    const { invite, member } = await createMember('shorten');
    expect((await setExpiry(member.id, 9)).status).toBe(400);
    expect((await db.user.findUniqueOrThrow({ where: { id: member.id } })).accessExpiresAt).toEqual(invite.expiresAt);
    expect((await setExpiry(member.id, 60)).status).toBe(200);
    const session = encodeSessionCookie({ userId: member.id, email: member.email, name: member.name });
    expect((await setExpiry(member.id, 10)).status).toBe(200);
    const request = new NextRequest(`${origin}/api/projects`, { headers: { cookie: `${SESSION_COOKIE_NAME}=${session}` } });
    expect((await requireAuth(request, { allowIncompleteOnboarding: true }) as NextResponse).status).toBe(401);
    expect((await signIn(invite)).status).toBe(200);
});

it('초대 연장과 회원 기한 단축을 동시에 요청해도 초대 기한이 회원 기한을 넘지 않는다', async () => {
    const { invite, member } = await createMember('race');
    expect((await setExpiry(member.id, 60)).status).toBe(200);
    const responses = await Promise.all([
        editInvite(adminRequest('/api/invites', { id: invite.id, expiresAt: dateAfter(40) })),
        setExpiry(member.id, 20),
    ]);
    expect(responses.map(response => response.status).sort()).toEqual([200, 400]);
    const storedInvite = await db.inviteCode.findUniqueOrThrow({ where: { id: invite.id } });
    const storedMember = await db.user.findUniqueOrThrow({ where: { id: member.id } });
    expect(storedInvite.expiresAt.getTime()).toBeLessThanOrEqual(storedMember.accessExpiresAt!.getTime());
});
