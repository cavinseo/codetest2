// 격리된 로컬 PostgreSQL에서 초대 로그인 연결·재사용·동시성·세션 만료를 검증한다.
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';

const capturedCookies = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({ cookies: async () => ({ set: (key: string, value: string) => capturedCookies.set(key, value) }) }));
vi.mock('../../lib/email', () => ({ sendMail: async () => true }));
const dbUrl = process.env.INTEGRATION_DATABASE_URL;
if (!dbUrl || !['127.0.0.1', 'localhost'].includes(new URL(dbUrl).hostname)
    || !['/login_restore_qa', '/program_restore_qa'].includes(new URL(dbUrl).pathname) || dbUrl === process.env.POSTGRES_PRISMA_URL) {
    throw new Error('별도 로컬 login_restore_qa 또는 program_restore_qa DB만 사용할 수 있습니다.');
}
const db = new PrismaClient({ datasources: { db: { url: dbUrl } } });
vi.mock('../../lib/prisma', () => ({ get prisma() { return db; } }));
import { encodeSessionCookie, requireAuth } from '../../lib/auth';
import { SESSION_COOKIE_NAME } from '../../lib/constants';
import { normalizeInviteCode } from '../../lib/invite-code';
import { POST as login } from '../../app/api/auth/invite-login/route';
import { POST as signup } from '../../app/api/auth/signup/route';
import { PATCH as updateMember } from '../../app/api/admin/users/route';

const prefix = `loginqa_${Date.now()}`;
const adminId = `${prefix}_admin`;
const programId = `${prefix}_program`;
const day = 86_400_000;
function request(path: string, body: unknown) {
    return new NextRequest(`http://localhost${path}`, { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
async function invite(suffix: string, accessDurationDays = 30) {
    return db.inviteCode.create({ data: { id: `${prefix}_${suffix}`, code: normalizeInviteCode(`${prefix}${suffix}`),
        email: `${prefix}_${suffix}@example.test`, role: 'MENTEE', programId, issuedById: adminId,
        accessDurationDays, expiresAt: new Date(Date.now() + 14 * day) } });
}
const signIn = (code: { email: string; code: string }, name = '격리 멘티') => login(request('/api/auth/invite-login', { email: code.email, inviteCode: code.code, name }));
beforeAll(async () => {
    process.env.SESSION_SECRET = 'isolated-login-integration-secret';
    await db.user.create({ data: { id: adminId, email: `${adminId}@example.test`, passwordHash: 'fixture',
        name: '검증 관리자', role: 'ADMIN', isAdmin: true, status: 'APPROVED',
        profile: { create: { organization: '검증', phone: '01000000000', expertise: '검증', careerYears: 1, privacyConsentAt: new Date() } } } });
    await db.program.create({ data: { id: programId, managerId: adminId, name: '격리 로그인 검증', organization: '검증',
        startsAt: new Date('2020-01-01'), endsAt: new Date(Date.now() + 200 * day) } });
});
afterAll(async () => {
    await db.inviteCode.deleteMany({ where: { issuedById: adminId } });
    await db.user.deleteMany({ where: { email: { startsWith: prefix }, id: { not: adminId } } });
    await db.program.deleteMany({ where: { id: programId } });
    await db.user.deleteMany({ where: { id: adminId } });
    await db.$disconnect();
});

it('같은 코드의 동시 첫 로그인은 동일한 계정 하나를 생성하고 저장된 30일을 적용한다', async () => {
    const code = await invite('concurrent');
    const responses = await Promise.all([signIn(code), signIn(code)]);
    expect(responses.map(response => response.status)).toEqual([200, 200]);
    const bodies = await Promise.all(responses.map(response => response.json()));
    expect(bodies[0].user.id).toBe(bodies[1].user.id);
    expect(bodies[0].needsProfile).toBe(true);
    expect(await db.user.count({ where: { email: code.email } })).toBe(1);
    const used = await db.inviteCode.findUniqueOrThrow({ where: { id: code.id }, include: { usedBy: true } });
    expect(used.usedBy?.role).toBe('MENTEE');
    expect(used.usedBy?.accessExpiresAt?.getTime()).toBe(used.usedAt!.getTime() + 30 * day);
    await db.inviteCode.update({ where: { id: code.id }, data: { expiresAt: new Date(Date.now() - day) } });
    expect((await signIn(code)).status).toBe(200);
    const again = await db.inviteCode.findUniqueOrThrow({ where: { id: code.id }, include: { usedBy: true } });
    expect(again.usedAt).toEqual(used.usedAt);
    expect(again.usedBy?.accessExpiresAt).toEqual(used.usedBy?.accessExpiresAt);
});

it('다른 이메일과 만료된 최초 코드는 사용자나 연결을 남기지 않는다', async () => {
    const code = await invite('denied');
    expect((await signIn({ ...code, email: `${prefix}_other@example.test` })).status).toBe(403);
    await db.inviteCode.update({ where: { id: code.id }, data: { expiresAt: new Date(Date.now() - day) } });
    expect((await signIn(code)).status).toBe(403);
    expect(await db.user.count({ where: { email: code.email } })).toBe(0);
    expect((await db.inviteCode.findUniqueOrThrow({ where: { id: code.id } })).usedById).toBeNull();
});

it('기존 관리자와 같은 이메일로 발급된 새 코드는 기존 계정을 연결하거나 바꾸지 않는다', async () => {
    const code = await invite('existing');
    const email = `${adminId}@example.test`;
    await db.inviteCode.update({ where: { id: code.id }, data: { email } });
    expect((await signIn({ ...code, email })).status).toBe(403);
    const admin = await db.user.findUniqueOrThrow({ where: { id: adminId } });
    expect(admin.role).toBe('ADMIN');
    expect(admin.isAdmin).toBe(true);
    expect((await db.inviteCode.findUniqueOrThrow({ where: { id: code.id } })).usedById).toBeNull();
});

it('프로그램이 종료되어도 회원 이용만료일이 남으면 코드와 기존 세션을 허용한다', async () => {
    const code = await invite('ended');
    expect((await signIn(code)).status).toBe(200);
    const used = await db.inviteCode.findUniqueOrThrow({ where: { id: code.id }, include: { usedBy: true } });
    const user = used.usedBy!;
    const session = encodeSessionCookie({ userId: user.id, email: user.email, name: user.name });
    const req = new NextRequest('http://localhost/api/projects', { headers: { cookie: `${SESSION_COOKIE_NAME}=${session}` } });
    expect(await requireAuth(req, { allowIncompleteOnboarding: true })).not.toBeInstanceOf(NextResponse);
    const saved = await db.program.findUniqueOrThrow({ where: { id: programId } });
    await db.program.update({ where: { id: programId }, data: { endsAt: new Date(Date.now() - day) } });
    expect((await signIn(code)).status).toBe(200);
    expect(await requireAuth(req, { allowIncompleteOnboarding: true })).not.toBeInstanceOf(NextResponse);
    expect(await db.user.count({ where: { id: user.id } })).toBe(1);
    await db.program.update({ where: { id: programId }, data: { endsAt: saved.endsAt } });
});

it('기존 코드 가입과 코드 로그인이 동시에 실행되어도 연결은 하나이며 이후 코드 로그인할 수 있다', async () => {
    const code = await invite('signup_race');
    const responses = await Promise.all([
        signup(request('/api/auth/signup', { name: '격리 동시 가입', email: code.email, password: 'Fixture-login-123!', inviteCode: code.code,
            profile: { organization: '검증 기관', phone: '01012345678', companyName: '검증 기업', industry: '검증', privacyConsent: true } })),
        signIn(code),
    ]);
    expect(responses.some(response => response.status === 200)).toBe(true);
    expect(await db.user.count({ where: { email: code.email } })).toBe(1);
    const used = await db.inviteCode.findUniqueOrThrow({ where: { id: code.id }, include: { usedBy: true } });
    expect(used.usedBy?.email).toBe(code.email);
    expect(used.usedBy?.role).toBe('MENTEE');
    expect((await signIn(code)).status).toBe(200);
});

it('관리자의 기존 기간 연장이 코드 로그인과 이전 세션에 반영되며 첫 사용 시각은 보존된다', async () => {
    const code = await invite('extended');
    expect((await signIn(code)).status).toBe(200);
    const used = await db.inviteCode.findUniqueOrThrow({ where: { id: code.id }, include: { usedBy: true } });
    const user = used.usedBy!;
    const originalUsedAt = new Date(Date.now() - 31 * day);
    await db.inviteCode.update({ where: { id: code.id }, data: { usedAt: originalUsedAt } });
    await db.user.update({ where: { id: user.id }, data: { accessExpiresAt: new Date(Date.now() - day) } });
    expect((await signIn(code)).status).toBe(403);
    const adminSession = encodeSessionCookie({ userId: adminId, email: `${adminId}@example.test`, name: '검증 관리자' });
    const result = await updateMember(new NextRequest('http://localhost/api/admin/users', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', cookie: `${SESSION_COOKIE_NAME}=${adminSession}` },
        body: JSON.stringify({ userId: user.id, action: 'extendAccess', days: 90 }),
    }));
    expect(result.status).toBe(200);
    expect((await signIn(code)).status).toBe(200);
    const session = encodeSessionCookie({ userId: user.id, email: user.email, name: user.name });
    const access = new NextRequest('http://localhost/api/projects', { headers: { cookie: `${SESSION_COOKIE_NAME}=${session}` } });
    expect(await requireAuth(access, { allowIncompleteOnboarding: true })).not.toBeInstanceOf(NextResponse);
    expect((await db.inviteCode.findUniqueOrThrow({ where: { id: code.id } })).usedAt).toEqual(originalUsedAt);
});
it('이름을 입력하기 전에는 등록과 코드 사용이 일어나지 않고 이름 입력 후 한 번만 생성된다', async () => {
    const code = await invite('required_name');
    capturedCookies.clear();
    for (const name of [undefined, '', '   ']) {
        const response = await login(request('/api/auth/invite-login', { email: code.email, inviteCode: code.code, name }));
        expect(response.status).toBe(400);
        expect((await response.json()).code).toBe('INVITE_NAME_REQUIRED');
        expect(await db.user.count({ where: { email: code.email } })).toBe(0);
        const current = await db.inviteCode.findUniqueOrThrow({ where: { id: code.id } });
        expect([current.usedAt, current.usedById]).toEqual([null, null]);
        expect(capturedCookies.size).toBe(0);
    }
    expect((await signIn(code, ' 실제 이름 ')).status).toBe(200);
    const created = await db.user.findFirstOrThrow({ where: { email: code.email } });
    expect(created.name).toBe('실제 이름');
    expect((await login(request('/api/auth/invite-login', { email: code.email, inviteCode: code.code }))).status).toBe(200);
    expect(await db.user.count({ where: { email: code.email } })).toBe(1);
});

it('이름 없는 기존 계정은 본인 코드 확인 후 이름만 보완하고 등록된 이름을 덮어쓰지 않는다', async () => {
    const code = await invite('legacy_name');
    expect((await signIn(code)).status).toBe(200);
    const used = await db.inviteCode.findUniqueOrThrow({ where: { id: code.id }, include: { usedBy: true } });
    await db.user.update({ where: { id: used.usedById! }, data: { name: null } });
    const missing = await login(request('/api/auth/invite-login', { email: code.email, inviteCode: code.code }));
    expect(missing.status).toBe(400);
    expect((await signIn(code, '보완 이름')).status).toBe(200);
    expect((await signIn(code, '바꿀 수 없는 이름')).status).toBe(200);
    const after = await db.inviteCode.findUniqueOrThrow({ where: { id: code.id }, include: { usedBy: true } });
    expect(after.usedBy?.name).toBe('보완 이름');
    expect(after.usedAt).toEqual(used.usedAt);
    expect(after.usedBy?.accessExpiresAt).toEqual(used.usedBy?.accessExpiresAt);
});
