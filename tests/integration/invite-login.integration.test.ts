// 격리 PostgreSQL에서 코드 로그인·발급의 동시성과 기존 세션의 프로그램 만료를 검수한다.
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';

const capturedCookies = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({ cookies: async () => ({ set: (key: string, value: string) => capturedCookies.set(key, value) }) }));
vi.mock('../../lib/email', () => ({ sendMail: async () => true }));
const dbUrl = process.env.INTEGRATION_DATABASE_URL;
if (!dbUrl || dbUrl === process.env.POSTGRES_PRISMA_URL) throw new Error('별도 INTEGRATION_DATABASE_URL이 필요합니다.');
const db = new PrismaClient({ datasources: { db: { url: dbUrl } } });
vi.mock('../../lib/prisma', () => ({ get prisma() { return db; } }));
import { encodeSessionCookie, requireAuth } from '../../lib/auth';
import { SESSION_COOKIE_NAME } from '../../lib/constants';
import { POST as login } from '../../app/api/auth/invite-login/route';
import { POST as issue } from '../../app/api/invites/route';
import { POST as signup } from '../../app/api/auth/signup/route';

const prefix = `inviteqa_${Date.now()}`;
const adminId = `${prefix}_admin`;
const programId = `${prefix}_program`;
const endedProgramId = `${prefix}_ended`;
const email = `${prefix}@example.com`;
const code = `KSQF-${prefix.toUpperCase()}`;
let accountId: string;
let session: string;
function request(path: string, body: unknown, cookie?: string) {
    return new NextRequest(`http://localhost${path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie: `${SESSION_COOKIE_NAME}=${cookie}` } : {}) },
        body: JSON.stringify(body),
    });
}
function loginRequest(targetEmail = email, targetCode = code) {
    return request('/api/auth/invite-login', { email: targetEmail, inviteCode: targetCode });
}
beforeAll(async () => {
    process.env.SESSION_SECRET = 'isolated-invite-integration-secret';
    await db.user.create({ data: { id: adminId, email: `${adminId}@example.com`, passwordHash: 'isolated-test', name: '초대 검수 관리자', role: 'ADMIN', isAdmin: true, status: 'APPROVED',
        profile: { create: { organization: '검수', phone: '01000000000', expertise: '검수', careerYears: 1, privacyConsentAt: new Date() } },
    } });
    for (const [id, endsAt] of [[programId, new Date(Date.now() + 200 * 86400000)], [endedProgramId, new Date(Date.now() - 86400000)]] as const) {
        await db.program.create({ data: { id, name: '초대 검수', organization: '검수', managerId: adminId, startsAt: new Date('2020-01-01'), endsAt } });
    }
    // 생성기의 코드 정규화와 동일한 정규형을 사용한다.
    const { normalizeInviteCode } = await import('../../lib/invite-code');
    await db.inviteCode.create({ data: { id: `${prefix}_code`, code: normalizeInviteCode(code), email, role: 'MENTEE', programId, issuedById: adminId, expiresAt: new Date(Date.now() + 200 * 86400000) } });
});
afterAll(async () => {
    await db.inviteCode.deleteMany({ where: { issuedById: adminId } });
    await db.user.deleteMany({ where: { email: { startsWith: prefix }, id: { not: adminId } } });
    await db.program.deleteMany({ where: { id: { in: [programId, endedProgramId] } } });
    await db.user.deleteMany({ where: { id: adminId } });
    await db.$disconnect();
});

it('다른 이메일로 최초 코드를 사용할 수 없으며 계정이나 연결이 남지 않는다', async () => {
    const res = await login(loginRequest(`${prefix}_other@example.com`));
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await db.user.count({ where: { email } })).toBe(0);
    expect((await db.inviteCode.findUniqueOrThrow({ where: { id: `${prefix}_code` } })).usedById).toBeNull();
});

it('동시 최초 로그인은 같은 멘티 한 명에 연결되며 첫 사용부터 90일로 한 번만 확정된다', async () => {
    const responses = await Promise.all([login(loginRequest()), login(loginRequest())]);
    expect(responses.map(r => r.status)).toEqual([200, 200]);
    const bodies = await Promise.all(responses.map(r => r.json()));
    accountId = bodies[0].user.id;
    expect(bodies[1].user.id).toBe(accountId);
    expect(bodies[0].needsProfile).toBe(true);
    expect(bodies[0].mustChangePassword).toBe(false);
    expect(await db.user.count({ where: { email } })).toBe(1);
    const invite = await db.inviteCode.findUniqueOrThrow({ where: { id: `${prefix}_code` }, include: { usedBy: true } });
    expect(invite.usedById).toBe(accountId);
    expect(invite.usedBy?.role).toBe('MENTEE');
    expect(invite.usedBy?.programId).toBe(programId);
    expect(invite.usedBy!.accessExpiresAt!.getTime() - invite.usedAt!.getTime()).toBe(90 * 86400000);
    const firstExpiry = invite.usedBy!.accessExpiresAt!.getTime();
    const again = await login(loginRequest());
    expect(again.status).toBe(200);
    expect((await db.user.findUniqueOrThrow({ where: { id: accountId } })).accessExpiresAt!.getTime()).toBe(firstExpiry);
    session = again.cookies.get(SESSION_COOKIE_NAME)?.value ?? capturedCookies.get(SESSION_COOKIE_NAME)!;
    expect(session).toBeTruthy();
});

it('프로그램 종료는 사용된 코드와 이미 발급된 세션을 함께 차단하고 기록은 보존한다', async () => {
    const accessRequest = new NextRequest('http://localhost/api/projects', { headers: { cookie: `${SESSION_COOKIE_NAME}=${session}` } });
    expect(await requireAuth(accessRequest, { allowIncompleteOnboarding: true })).not.toBeInstanceOf(NextResponse);
    await db.program.update({ where: { id: programId }, data: { endsAt: new Date(Date.now() - 1000) } });
    const blocked = await requireAuth(accessRequest, { allowIncompleteOnboarding: true });
    expect(blocked).toBeInstanceOf(NextResponse);
    expect((blocked as NextResponse).status).toBe(403);
    expect((await login(loginRequest())).status).toBeGreaterThanOrEqual(400);
    expect(await db.user.count({ where: { id: accountId } })).toBe(1);
    expect((await db.inviteCode.findUniqueOrThrow({ where: { id: `${prefix}_code` } })).usedById).toBe(accountId);
    await db.program.update({ where: { id: programId }, data: { endsAt: new Date(Date.now() + 200 * 86400000) } });
});

it('발급 동시 요청도 이메일당 유효 코드 한 개만 만들고 종료 프로그램은 발급하지 않는다', async () => {
    const adminSession = encodeSessionCookie({ userId: adminId, email: `${adminId}@example.com`, name: '초대 검수 관리자' });
    const body = { email: `${prefix}_issue@example.com`, role: 'MENTEE', programId };
    const responses = await Promise.all([issue(request('/api/invites', body, adminSession)), issue(request('/api/invites', body, adminSession))]);
    expect(responses.map(r => r.status).sort()).toEqual([200, 409]);
    expect(await db.inviteCode.count({ where: { email: body.email } })).toBe(1);
    const ended = await issue(request('/api/invites', { ...body, email: `${prefix}_ended@example.com`, programId: endedProgramId }, adminSession));
    expect(ended.status).toBeGreaterThanOrEqual(400);
    expect(await db.inviteCode.count({ where: { email: `${prefix}_ended@example.com` } })).toBe(0);
});

it('과거 사용 코드의 가입 기한이 지났어도 회원 기한 안에서는 로그인하고 90일 상한은 우회하지 못한다', async () => {
    const saved = await db.inviteCode.findUniqueOrThrow({ where: { id: `${prefix}_code` } });
    const originalUser = await db.user.findUniqueOrThrow({ where: { id: accountId } });
    await db.inviteCode.update({ where: { id: saved.id }, data: { expiresAt: new Date(Date.now() - 86400000) } });
    expect((await login(loginRequest())).status).toBe(200);
    await db.inviteCode.update({ where: { id: saved.id }, data: { usedAt: new Date(Date.now() - 91 * 86400000), accessDurationDays: 365 } });
    await db.user.update({ where: { id: accountId }, data: { accessExpiresAt: new Date(Date.now() + 365 * 86400000) } });
    expect((await login(loginRequest())).status).toBeGreaterThanOrEqual(400);
    const blocked = await requireAuth(new NextRequest('http://localhost/api/projects', { headers: { cookie: `${SESSION_COOKIE_NAME}=${session}` } }), { allowIncompleteOnboarding: true });
    expect((blocked as NextResponse).status).toBe(403);
    await db.inviteCode.update({ where: { id: saved.id }, data: { usedAt: saved.usedAt, expiresAt: saved.expiresAt, accessDurationDays: saved.accessDurationDays } });
    await db.user.update({ where: { id: accountId }, data: { accessExpiresAt: originalUser.accessExpiresAt } });
});

it('기존 코드 가입과 코드 로그인이 동시에 실행되어도 같은 코드가 두 회원에게 연결되지 않는다', async () => {
    const raceEmail = `${prefix}_race@example.com`;
    const raceCode = `KSQF-RACE-${prefix.toUpperCase()}`;
    const { normalizeInviteCode } = await import('../../lib/invite-code');
    await db.inviteCode.create({ data: { id: `${prefix}_race`, code: normalizeInviteCode(raceCode), email: raceEmail, role: 'MENTEE', programId, issuedById: adminId, expiresAt: new Date(Date.now() + 86400000) } });
    const [signedUp, loggedIn] = await Promise.all([
        signup(request('/api/auth/signup', { name: '동시 가입 검수', email: raceEmail, password: 'Isolated-QA-123!', inviteCode: raceCode,
            profile: { organization: '검수', phone: '01012345678', companyName: '검수', industry: '검수', privacyConsent: true } })),
        login(loginRequest(raceEmail, raceCode)),
    ]);
    expect([200, 409]).toContain(signedUp.status);
    expect(loggedIn.status).toBe(200);
    const result = await loggedIn.json();
    expect(await db.user.count({ where: { email: raceEmail } })).toBe(1);
    expect((await db.inviteCode.findUniqueOrThrow({ where: { id: `${prefix}_race` } })).usedById).toBe(result.user.id);
});

it('미사용 과거 단기 코드도 신규 첫 로그인은 두 진입 경로 모두 90일로 시작한다', async () => {
    const { normalizeInviteCode } = await import('../../lib/invite-code');
    for (const mode of ['signup', 'login']) {
        const candidateEmail = `${prefix}_${mode}@example.com`;
        const candidateCode = normalizeInviteCode(`KSQF-${prefix.toUpperCase()}-${mode.toUpperCase()}`);
        const id = `${prefix}_${mode}`;
        await db.inviteCode.create({ data: { id, code: candidateCode, email: candidateEmail, role: 'MENTEE', programId, issuedById: adminId, accessDurationDays: 30, expiresAt: new Date(Date.now() + 86400000) } });
        const response = mode === 'signup'
            ? await signup(request('/api/auth/signup', { name: '기한 검수', email: candidateEmail, password: 'Isolated-QA-123!', inviteCode: candidateCode,
                profile: { organization: '검수', phone: '01012345678', companyName: '검수', industry: '검수', privacyConsent: true } }))
            : await login(loginRequest(candidateEmail, candidateCode));
        expect(response.status).toBe(200);
        const record = await db.inviteCode.findUniqueOrThrow({ where: { id }, include: { usedBy: true } });
        expect(record.usedBy!.accessExpiresAt!.getTime() - record.usedAt!.getTime()).toBe(90 * 86400000);
    }
});
