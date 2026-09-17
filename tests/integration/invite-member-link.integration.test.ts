// 격리 PostgreSQL에서 기존 멘티 복구·자료 보존·첫 로그인·세션 무효화를 검증한다.
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';

const capturedCookies = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({ cookies: async () => ({ set: (key: string, value: string) => capturedCookies.set(key, value) }) }));
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
import { normalizeInviteCode } from '../../lib/invite-code';
import { issueMenteeInvite, extendMenteeInvite } from '../../lib/invite-management';
import { getInviteMemberLinkPreview, linkInviteMember } from '../../lib/invite-member-link';
import { POST as inviteLogin } from '../../app/api/auth/invite-login/route';
import { POST as passwordLogin } from '../../app/api/auth/login/route';
import { POST as signup } from '../../app/api/auth/signup/route';
import { POST as changePassword } from '../../app/api/admin/password/route';
import { GET as previewLink, POST as executeLink } from '../../app/api/invites/[id]/link/route';
import { DELETE as revokeInvite } from '../../app/api/invites/route';

const prefix = `linkqa_${Date.now()}`;
const adminId = `${prefix}_admin`;
const programId = `${prefix}_program`;
const oldPassword = 'Existing-password-123!';
const after = (days: number) => new Date(Date.now() + days * 86_400_000);
const manager = { role: 'ADMIN' as const, userId: adminId };
let requestNumber = 0;
function request(path: string, body?: unknown, session?: string, method = 'POST') {
    return new NextRequest(`http://localhost${path}`, {
        method, headers: { 'Content-Type': 'application/json', 'x-forwarded-for': `127.1.0.${++requestNumber}`,
            ...(session ? { cookie: `${SESSION_COOKIE_NAME}=${session}` } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
}
function sessionFor(user: { id: string; email: string; name: string | null; sessionVersion: number }) {
    return encodeSessionCookie({ userId: user.id, email: user.email, name: user.name }, { sessionVersion: user.sessionVersion });
}
async function fixture(suffix: string, status = 'PENDING', days = 30) {
    const email = `${prefix}_${suffix}@example.test`;
    const invite = await db.inviteCode.create({ data: {
        id: `${prefix}_${suffix}_invite`, code: normalizeInviteCode(`${prefix}_${suffix}`), email, role: 'MENTEE',
        programId, issuedById: adminId, expiresAt: after(10), accessExpiresAt: after(10), accessDurationDays: 90,
    } });
    // 일반 가입 충돌이 이미 발생한 과거 데이터를 재현한다.
    const member = await db.user.create({ data: {
        id: `${prefix}_${suffix}_member`, email, name: '기존 멘티', role: 'MENTEE', status,
        passwordHash: await bcrypt.hash(oldPassword, 4), accessExpiresAt: days ? after(days) : null,
        profile: { create: { organization: '보존 기관', phone: '01012345678', companyName: '보존 기업', industry: '제조', privacyConsentAt: new Date() } },
    } });
    return { invite, member };
}
const signIn = (invite: { email: string; code: string }) => inviteLogin(request('/api/auth/invite-login', { email: invite.email, inviteCode: invite.code }));
beforeAll(async () => {
    process.env.SESSION_SECRET = 'isolated-invite-link-integration-secret';
    await db.user.create({ data: { id: adminId, email: `${adminId}@example.test`, name: '검증 관리자', passwordHash: 'fixture',
        role: 'ADMIN', isAdmin: true, status: 'APPROVED',
        profile: { create: { organization: '검증', phone: '01012345678', expertise: '검증', careerYears: 1, privacyConsentAt: new Date() } } } });
    await db.program.create({ data: { id: programId, managerId: adminId, name: '연결 검증', organization: '검증',
        startsAt: after(-30), endsAt: after(100) } });
});
afterAll(async () => {
    await db.inviteCode.deleteMany({ where: { issuedById: adminId } });
    await db.user.deleteMany({ where: { email: { startsWith: prefix }, id: { not: adminId } } });
    await db.program.deleteMany({ where: { id: programId } });
    await db.user.deleteMany({ where: { id: adminId } });
    await db.$disconnect();
});

it('대기 회원을 관리자 API로 연결하고 자료를 보존하며 첫 로그인 후 비밀번호를 재설정한다', async () => {
    const { invite, member } = await fixture('recover');
    const project = await db.project.create({ data: { id: `${prefix}_project`, name: '보존 프로젝트', ownerId: member.id, programId, detailedDescription: '보존할 작성 내용' } });
    const oldProfile = await db.memberProfile.findUniqueOrThrow({ where: { userId: member.id } });
    expect((await signIn(invite)).status).toBe(409);
    const admin = await db.user.findUniqueOrThrow({ where: { id: adminId } });
    const context = { params: Promise.resolve({ id: invite.id }) };
    const response = await previewLink(request(`/api/invites/${invite.id}/link`, undefined, sessionFor(admin), 'GET'), context);
    expect(response.status).toBe(200);
    const { preview } = await response.json();
    expect(preview.resetPassword).toBe(true);
    expect((await executeLink(request(`/api/invites/${invite.id}/link`, {
        memberId: member.id, previewToken: preview.previewToken, confirmIdentity: true,
    }, sessionFor(admin)), context)).status).toBe(200);
    const linked = await db.user.findUniqueOrThrow({ where: { id: member.id }, include: { usedInviteCode: true } });
    expect(linked).toMatchObject({ status: 'APPROVED', programId, sessionVersion: 1, mustChangePassword: true, accessExpiresAt: member.accessExpiresAt });
    expect(linked.usedInviteCode).toMatchObject({ usedById: member.id, usedAt: null, expiresAt: invite.expiresAt });
    expect(await bcrypt.compare(oldPassword, linked.passwordHash)).toBe(false);
    expect(await db.memberProfile.findUniqueOrThrow({ where: { userId: member.id } })).toEqual(oldProfile);
    expect(await db.project.findUniqueOrThrow({ where: { id: project.id } })).toEqual(project);
    const oldAccess = request('/api/projects', undefined, sessionFor(member), 'GET');
    expect((await requireAuth(oldAccess) as NextResponse).status).toBe(401);
    const loginResult = await signIn(invite);
    expect(loginResult.status).toBe(200);
    expect(await loginResult.json()).toMatchObject({ user: { id: member.id }, mustChangePassword: true });
    const firstUsedAt = (await db.inviteCode.findUniqueOrThrow({ where: { id: invite.id } })).usedAt;
    expect(firstUsedAt).toBeInstanceOf(Date);
    const loginSession = capturedCookies.get(SESSION_COOKIE_NAME)!;
    expect((await changePassword(request('/api/admin/password', {
        verificationMethod: 'invite', inviteCode: invite.code, newPassword: 'New-password-456!', confirmPassword: 'New-password-456!',
    }, loginSession))).status).toBe(200);
    const changed = await db.user.findUniqueOrThrow({ where: { id: member.id } });
    expect(changed).toMatchObject({ mustChangePassword: false, sessionVersion: 2 });
    expect(await bcrypt.compare('New-password-456!', changed.passwordHash)).toBe(true);
    expect((await passwordLogin(request('/api/auth/login', { email: member.email, password: oldPassword, role: 'MENTEE' }))).status).toBe(401);
    expect((await requireAuth(oldAccess) as NextResponse).status).toBe(401);
    expect((await requireAuth(request('/api/projects', undefined, loginSession, 'GET')) as NextResponse).status).toBe(401);
    expect(await requireAuth(request('/api/projects', undefined, capturedCookies.get(SESSION_COOKIE_NAME), 'GET'))).not.toBeInstanceOf(NextResponse);
    await db.inviteCode.update({ where: { id: invite.id }, data: { expiresAt: after(-1) } });
    expect((await signIn(invite)).status).toBe(200);
    expect((await db.inviteCode.findUniqueOrThrow({ where: { id: invite.id } })).usedAt).toEqual(firstUsedAt);
});

it('승인된 미배정 회원의 비밀번호와 더 긴 기한을 보존하고 첫 코드 사용 전 비밀번호 로그인을 안내한다', async () => {
    const { invite, member } = await fixture('approved', 'APPROVED');
    const preview = await getInviteMemberLinkPreview(invite.id);
    await linkInviteMember(invite.id, member.id, preview.previewToken);
    const linked = await db.user.findUniqueOrThrow({ where: { id: member.id } });
    expect(linked).toMatchObject({ passwordHash: member.passwordHash, accessExpiresAt: member.accessExpiresAt, sessionVersion: 1, mustChangePassword: false });
    const blocked = await passwordLogin(request('/api/auth/login', { email: member.email, password: oldPassword, role: 'MENTEE' }));
    expect(blocked.status).toBe(403);
    expect(await blocked.json()).toMatchObject({ code: 'INVITE_LOGIN_REQUIRED' });
    const responses = await Promise.all([signIn(invite), signIn(invite)]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(await db.user.count({ where: { email: member.email } })).toBe(1);
    expect((await passwordLogin(request('/api/auth/login', { email: member.email, password: oldPassword, role: 'MENTEE' }))).status).toBe(200);
});

it('연결 승인은 최초 접속 기한을 소진하거나 우회하지 않으며 회수도 연결 자료를 보존한다', async () => {
    const { invite, member } = await fixture('revoke');
    const preview = await getInviteMemberLinkPreview(invite.id);
    await linkInviteMember(invite.id, member.id, preview.previewToken);
    const admin = await db.user.findUniqueOrThrow({ where: { id: adminId } });
    expect((await revokeInvite(request('/api/invites', { id: invite.id }, sessionFor(admin), 'DELETE'))).status).toBe(200);
    expect((await signIn(invite)).status).toBe(403);
    expect(await db.inviteCode.findUniqueOrThrow({ where: { id: invite.id } })).toMatchObject({ usedById: member.id, usedAt: null });
    expect(await db.memberProfile.findUnique({ where: { userId: member.id } })).not.toBeNull();
});

it('만료된 미연결 초대는 날짜만 연장한 다음 별도 연결하며 날짜 편집으로 계정을 승인하지 않는다', async () => {
    const { invite, member } = await fixture('expired', 'PENDING', 0);
    await db.inviteCode.update({ where: { id: invite.id }, data: { expiresAt: after(-1) } });
    await expect(getInviteMemberLinkPreview(invite.id)).rejects.toMatchObject({ status: 400 });
    const newExpiry = after(20);
    expect(await extendMenteeInvite(invite.id, newExpiry, manager)).toHaveProperty('invite');
    expect(await db.user.findUniqueOrThrow({ where: { id: member.id } })).toEqual(member);
    expect(await db.inviteCode.findUniqueOrThrow({ where: { id: invite.id } })).toMatchObject({ usedById: null, usedAt: null });
    const preview = await getInviteMemberLinkPreview(invite.id);
    await linkInviteMember(invite.id, member.id, preview.previewToken);
    expect((await db.user.findUniqueOrThrow({ where: { id: member.id } })).accessExpiresAt).toEqual(newExpiry);
});

it('미리보기 후 승인 상태가 바뀌면 연결을 거절하고 기존 비밀번호를 보존한다', async () => {
    const { invite, member } = await fixture('stale');
    const preview = await getInviteMemberLinkPreview(invite.id);
    await db.user.update({ where: { id: member.id }, data: { status: 'APPROVED' } });
    await expect(linkInviteMember(invite.id, member.id, preview.previewToken)).rejects.toMatchObject({ status: 409 });
    expect(await db.user.findUniqueOrThrow({ where: { id: member.id } })).toMatchObject({ passwordHash: member.passwordHash, sessionVersion: 0 });
    expect((await db.inviteCode.findUniqueOrThrow({ where: { id: invite.id } })).usedById).toBeNull();
});

it('같은 미리보기로 동시에 연결해도 비밀번호와 세션 버전을 한 번만 변경한다', async () => {
    const { invite, member } = await fixture('concurrent');
    const preview = await getInviteMemberLinkPreview(invite.id);
    const results = await Promise.allSettled([
        linkInviteMember(invite.id, member.id, preview.previewToken), linkInviteMember(invite.id, member.id, preview.previewToken),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(await db.user.findUniqueOrThrow({ where: { id: member.id } })).toMatchObject({ sessionVersion: 1 });
    expect(await db.inviteCode.findUniqueOrThrow({ where: { id: invite.id } })).toMatchObject({ usedById: member.id, usedAt: null });
});

it('회원 변경 이후 초대 저장이 실패하면 승인·비밀번호·세션·기한을 모두 실제 DB에서 되돌린다', async () => {
    const { invite, member } = await fixture('rollback');
    const preview = await getInviteMemberLinkPreview(invite.id);
    const triggerName = `${prefix}_reject_link`;
    // 격리 DB의 이 테스트 초대만 갱신 건수 0을 반환하도록 만들어 두 번째 저장 실패를 재현한다.
    await db.$executeRawUnsafe(`CREATE FUNCTION ${triggerName}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$`);
    try {
        await db.$executeRawUnsafe(`CREATE TRIGGER ${triggerName} BEFORE UPDATE ON invite_codes FOR EACH ROW WHEN (OLD.id = '${invite.id}') EXECUTE FUNCTION ${triggerName}()`);
        await expect(linkInviteMember(invite.id, member.id, preview.previewToken)).rejects.toMatchObject({ status: 409 });
        expect(await db.user.findUniqueOrThrow({ where: { id: member.id } })).toEqual(member);
        expect(await db.inviteCode.findUniqueOrThrow({ where: { id: invite.id } })).toEqual(invite);
    } finally {
        await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${triggerName} ON invite_codes`);
        await db.$executeRawUnsafe(`DROP FUNCTION ${triggerName}()`);
    }
});

it('초대 발급과 코드 없는 일반 가입이 경합해도 유효한 초대와 미연결 가입 계정을 함께 만들지 않는다', async () => {
    const email = `${prefix}_signup_race@example.test`;
    const [issued, registered] = await Promise.all([
        issueMenteeInvite({ email, code: normalizeInviteCode(`${prefix}_signup_race`), role: 'MENTEE', programId, expiresAt: after(10), accessDurationDays: 90 }, manager),
        signup(request('/api/auth/signup', { email, name: '동시 가입', password: oldPassword, role: 'MENTOR',
            profile: { organization: '기관', phone: '01012345678', expertise: '분야', careerYears: 1, privacyConsent: true } })),
    ]);
    const userCount = await db.user.count({ where: { email } });
    const inviteCount = await db.inviteCode.count({ where: { email } });
    expect(userCount + inviteCount).toBe(1);
    if ('invite' in issued) {
        expect(registered.status).toBe(409);
        expect(await registered.json()).toMatchObject({ code: 'INVITE_LOGIN_REQUIRED' });
    } else {
        expect(issued.status).toBe(409);
        expect(registered.status).toBe(200);
    }
});
