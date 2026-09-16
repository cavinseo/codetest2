// 격리 PostgreSQL과 실제 인증으로 회원 비밀번호 설정·자료 보존·세션 경합을 검증한다.
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { PrismaClient, type InviteCode, type User } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { NextRequest } from 'next/server';

const databaseUrl = vi.hoisted(() => {
    const allowed = 'postgresql://login_fixture@127.0.0.1:55439/program_restore_qa';
    if (process.env.INTEGRATION_DATABASE_URL !== allowed) {
        throw new Error('비밀번호 통합 테스트는 지정된 127.0.0.1:55439/program_restore_qa DB만 사용할 수 있습니다.');
    }
    vi.stubEnv('SESSION_SECRET', 'password-settings-isolated-session-secret');
    vi.stubEnv('POSTGRES_PRISMA_URL', 'postgresql://unused@127.0.0.1:1/unused');
    vi.stubEnv('POSTGRES_URL_NON_POOLING', 'postgresql://unused@127.0.0.1:1/unused');
    return allowed;
});
const capturedCookies = vi.hoisted(() => [] as { key: string; value: string }[]);
// Next.js 응답 쿠키 경계만 캡처하고 서명, 인증, 비밀번호 비교, DB 결과는 실제로 사용한다.
vi.mock('next/headers', () => ({ cookies: async () => ({
    set: (key: string, value: string) => { capturedCookies.push({ key, value }); },
}) }));

const baseDb = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
let passwordWriteGate: (() => Promise<void>) | null = null;
let credentialReadGate: (() => Promise<void>) | null = null;
const db = baseDb.$extends({ query: { user: {
    async findUnique({ args, query }) {
        // requireAuth를 통과한 뒤 비밀번호 확인용 계정을 새로 읽는 구간을 제어한다.
        if (args.select?.passwordHash && credentialReadGate) await credentialReadGate();
        return query(args);
    },
    async update({ args, query }) {
        if (args.data.passwordHash && passwordWriteGate) await passwordWriteGate();
        return query(args);
    },
    async updateMany({ args, query }) {
        if (args.data.passwordHash && passwordWriteGate) await passwordWriteGate();
        return query(args);
    },
} } });
vi.mock('../../lib/prisma', () => ({ get prisma() { return db; } }));

import { requireAuth, verifySessionCookie } from '../../lib/auth';
import { BCRYPT_ROUNDS, SESSION_COOKIE_NAME } from '../../lib/constants';
import { normalizeInviteCode } from '../../lib/invite-code';
import { POST as inviteLogin } from '../../app/api/auth/invite-login/route';
import { POST as passwordLogin } from '../../app/api/auth/login/route';
import { POST as logout } from '../../app/api/auth/logout/route';
import { POST as changePassword } from '../../app/api/admin/password/route';
import { GET as readProfile, PUT as saveProfile } from '../../app/api/me/profile/route';
import { PATCH as editProgram } from '../../app/api/programs/[id]/route';

const day = 86_400_000;
const initialPassword = 'Initial-password-123';
let initialHash: string;
let prefix: string;
let userIds: string[];
let inviteIds: string[];
let projectIds: string[];
let registeredEmails: string[];
let admin: User;
let programId: string;
const emailFor = (suffix: string) => `${prefix}_${suffix}@example.test`;

function request(path: string, method = 'GET', cookie?: string, body?: unknown) {
    return new NextRequest(`http://localhost${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(cookie ? { cookie: `${SESSION_COOKIE_NAME}=${cookie}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
}

function issuedCookie() {
    expect(capturedCookies).toHaveLength(1);
    expect(capturedCookies[0].key).toBe(SESSION_COOKIE_NAME);
    expect(verifySessionCookie(capturedCookies[0].value)).not.toBeNull();
    return capturedCookies[0].value;
}

function passwordInput(password: string, currentPassword = initialPassword) {
    return { currentPassword, newPassword: password, confirmPassword: password };
}

function inviteInput(code: string, password: string) {
    return { verificationMethod: 'invite', inviteCode: code, newPassword: password, confirmPassword: password };
}

async function signIn(email: string, password: string) {
    capturedCookies.length = 0;
    const response = await passwordLogin(request('/api/auth/login', 'POST', undefined, { email, password, role: 'MENTEE' }));
    expect(response.status).toBe(200);
    return { response, cookie: issuedCookie() };
}

async function user(suffix: string, mustChangePassword = false) {
    const id = `${prefix}_${suffix}`;
    userIds.push(id);
    return baseDb.user.create({ data: {
        id, email: emailFor(suffix), name: `격리 ${suffix}`, passwordHash: initialHash,
        role: 'MENTEE', status: 'APPROVED', programId, mustChangePassword,
        accessExpiresAt: new Date(Date.now() + 60 * day),
        profile: { create: {
            organization: '비밀번호 검수기관', phone: '01000000000', companyName: '보존 기업',
            industry: '검수', privacyConsentAt: new Date(),
        } },
    } });
}

async function invite(suffix: string, email = emailFor(suffix)) {
    const id = `${prefix}_${suffix}`;
    inviteIds.push(id);
    return baseDb.inviteCode.create({ data: {
        id, code: normalizeInviteCode(id), email, role: 'MENTEE', programId, issuedById: admin.id,
        expiresAt: new Date(Date.now() + 14 * day), accessDurationDays: 60,
    } });
}

async function inviteMember(suffix = 'invited') {
    const code = await invite(suffix);
    registeredEmails.push(code.email);
    capturedCookies.length = 0;
    const response = await inviteLogin(request('/api/auth/invite-login', 'POST', undefined, {
        email: code.email, inviteCode: code.code, name: `초대 ${suffix}`,
    }));
    expect(response.status).toBe(200);
    const cookie = issuedCookie();
    const account = await baseDb.user.findUniqueOrThrow({ where: { email: code.email } });
    userIds.push(account.id);
    const profileResponse = await saveProfile(request('/api/me/profile', 'PUT', cookie, {
        organization: '비밀번호 검수기관', phone: '01000000000', companyName: '보존 기업',
        industry: '검수', privacyConsent: true,
    }));
    expect(profileResponse.status).toBe(200);
    return { account, cookie, code: await baseDb.inviteCode.findUniqueOrThrow({ where: { id: code.id } }) };
}

function preservedAccount(userId: string) {
    return baseDb.user.findUniqueOrThrow({ where: { id: userId }, select: {
        id: true, email: true, name: true, role: true, status: true, isAdmin: true,
        programId: true, accessExpiresAt: true, createdAt: true, mentorProjectCreationEnabled: true,
        usedInviteCode: true, profile: true, ownedProjects: true, projectMemberships: true,
    } });
}

async function expectNoSecrets(response: Response, secrets: string[]) {
    const body = await response.clone().json();
    const serialized = JSON.stringify(body);
    for (const secret of secrets) expect(serialized).not.toContain(secret);
    expect(serialized).not.toMatch(/passwordHash|inviteCode|sessionVersion/);
}

beforeAll(async () => { initialHash = await bcrypt.hash(initialPassword, BCRYPT_ROUNDS); });
beforeEach(async () => {
    prefix = `password_${randomUUID().replaceAll('-', '')}`;
    userIds = []; inviteIds = []; projectIds = []; registeredEmails = [];
    capturedCookies.length = 0;
    passwordWriteGate = null;
    credentialReadGate = null;
    const adminId = `${prefix}_admin`;
    userIds.push(adminId);
    admin = await baseDb.user.create({ data: {
        id: adminId, email: emailFor('admin'), name: '격리 관리자', passwordHash: initialHash,
        role: 'ADMIN', isAdmin: true, status: 'APPROVED',
    } });
    programId = `${prefix}_program`;
    await baseDb.program.create({ data: {
        id: programId, managerId: admin.id, name: '비밀번호 격리 프로그램', organization: '검수기관',
        startsAt: new Date(Date.now() - day), endsAt: new Date(Date.now() + 90 * day),
    } });
});
afterEach(async () => {
    passwordWriteGate = null;
    credentialReadGate = null;
    // API 생성 사용자도 이 테스트에서 기록한 정확한 이메일·프로그램의 교집합만 정리한다.
    const createdUsers = await baseDb.user.findMany({ where: {
        email: { in: registeredEmails }, programId,
    }, select: { id: true } });
    await baseDb.inviteCode.deleteMany({ where: { id: { in: inviteIds } } });
    await baseDb.project.deleteMany({ where: { id: { in: projectIds } } });
    await baseDb.program.deleteMany({ where: { id: programId } });
    await baseDb.user.deleteMany({ where: { id: { in: [...userIds, ...createdUsers.map(row => row.id)] } } });
});
afterAll(async () => { await baseDb.$disconnect(); vi.unstubAllEnvs(); });

it('초대 가입 후 본인 코드로 설정하고 비밀번호·기존 코드로 재로그인하며 계정·프로필·프로젝트와 현재 세션을 보존한다', async () => {
    const { account, cookie, code } = await inviteMember();
    const projectId = `${prefix}_project`;
    projectIds.push(projectId);
    await baseDb.project.create({ data: {
        id: projectId, name: '보존 프로젝트', ownerId: account.id, programId,
        members: { create: { id: `${prefix}_membership`, userId: account.id, role: 'OWNER' } },
    } });
    // 최초 등록 기한이 지나도 이미 사용한 코드의 회원 이용 기한은 유효하다.
    await baseDb.inviteCode.update({ where: { id: code.id }, data: { expiresAt: new Date(Date.now() - day) } });
    const before = await preservedAccount(account.id);
    const profile = await readProfile(request('/api/me/profile', 'GET', cookie));
    expect(profile.status).toBe(200);
    expect.soft(await profile.clone().json()).toMatchObject({ canVerifyPasswordWithInviteCode: true });
    await expectNoSecrets(profile, [code.code, account.passwordHash]);

    const firstPassword = 'Invite-set-password-123';
    capturedCookies.length = 0;
    const changed = await changePassword(request('/api/admin/password', 'POST', cookie, inviteInput(code.code, firstPassword)));
    expect(changed.status).toBe(200);
    expect(await changed.clone().json()).toMatchObject({ success: true });
    await expectNoSecrets(changed, [code.code, firstPassword, account.passwordHash]);
    const refreshedCookie = issuedCookie();
    expect(verifySessionCookie(refreshedCookie)?.ver).toBe(account.sessionVersion + 1);
    expect((await readProfile(request('/api/me/profile', 'GET', cookie))).status).toBe(401);
    expect((await readProfile(request('/api/me/profile', 'GET', refreshedCookie))).status).toBe(200);
    expect(await preservedAccount(account.id)).toEqual(before);
    const firstLogin = await signIn(account.email, firstPassword);
    await expectNoSecrets(firstLogin.response, [firstPassword, code.code, account.passwordHash]);

    capturedCookies.length = 0;
    const invitedAgain = await inviteLogin(request('/api/auth/invite-login', 'POST', undefined, {
        email: account.email, inviteCode: code.code,
    }));
    expect(invitedAgain.status).toBe(200);
    const reinvitedCookie = issuedCookie();
    const secondPassword = 'Password-change-again-456';
    capturedCookies.length = 0;
    const changedAgain = await changePassword(request('/api/admin/password', 'POST', reinvitedCookie,
        passwordInput(secondPassword, firstPassword)));
    expect(changedAgain.status).toBe(200);
    await expectNoSecrets(changedAgain, [firstPassword, secondPassword, code.code]);
    const currentCookie = issuedCookie();
    expect(verifySessionCookie(currentCookie)?.ver).toBe(account.sessionVersion + 2);
    expect((await readProfile(request('/api/me/profile', 'GET', firstLogin.cookie))).status).toBe(401);
    expect((await readProfile(request('/api/me/profile', 'GET', currentCookie))).status).toBe(200);
    expect(await preservedAccount(account.id)).toEqual(before);
    await signIn(account.email, secondPassword);
    const oldPasswordLogin = await passwordLogin(request('/api/auth/login', 'POST', undefined, {
        email: account.email, password: firstPassword, role: 'MENTEE',
    }));
    expect(oldPasswordLogin.status).toBe(401);
});

it('타인 코드·미사용 코드·틀린 코드로는 본인의 비밀번호와 세션을 바꾸거나 쿠키를 발급하지 않는다', async () => {
    const member = await inviteMember();
    const other = await inviteMember('other');
    const unused = await invite('unused', member.account.email);
    const before = await baseDb.user.findUniqueOrThrow({ where: { id: member.account.id } });
    for (const invalid of [other.code.code, unused.code, 'NOT-MY-INVITE-CODE']) {
        capturedCookies.length = 0;
        const response = await changePassword(request('/api/admin/password', 'POST', member.cookie,
            inviteInput(invalid, 'Rejected-password-123')));
        expect(response.status).toBe(403);
        expect(capturedCookies).toEqual([]);
        await expectNoSecrets(response, [invalid, 'Rejected-password-123', before.passwordHash]);
        expect(await baseDb.user.findUniqueOrThrow({ where: { id: member.account.id } })).toEqual(before);
    }
    const anonymous = await changePassword(request('/api/admin/password', 'POST', undefined,
        inviteInput(member.code.code, 'Rejected-password-123')));
    expect(anonymous.status).toBe(401);
    expect(capturedCookies).toEqual([]);
});

it.each(['program', 'member'] as const)('%s 이용 기한이 끝나면 초대 확인과 기존 쿠키·코드 로그인을 거절한다', async (deadline) => {
    const member = await inviteMember();
    const past = new Date(Date.now() - day);
    if (deadline === 'program') await baseDb.program.update({ where: { id: programId }, data: { endsAt: past } });
    else await baseDb.user.update({ where: { id: member.account.id }, data: { accessExpiresAt: past } });
    const before = await baseDb.user.findUniqueOrThrow({ where: { id: member.account.id } });
    capturedCookies.length = 0;
    expect((await changePassword(request('/api/admin/password', 'POST', member.cookie,
        inviteInput(member.code.code, 'Expired-password-123')))).status).toBe(403);
    expect((await readProfile(request('/api/me/profile', 'GET', member.cookie))).status).toBe(403);
    expect((await inviteLogin(request('/api/auth/invite-login', 'POST', undefined, {
        email: member.account.email, inviteCode: member.code.code,
    }))).status).toBe(403);
    expect(capturedCookies).toEqual([]);
    expect(await baseDb.user.findUniqueOrThrow({ where: { id: member.account.id } })).toEqual(before);
});

it('기존 현재 비밀번호 요청을 유지하며 임시 비밀번호 온보딩을 해제하고 잘못된 입력은 변경하지 않는다', async () => {
    const member = await user('temporary', true);
    const { cookie, response: loginResponse } = await signIn(member.email, initialPassword);
    expect(await loginResponse.json()).toMatchObject({ mustChangePassword: true });
    const profile = await readProfile(request('/api/me/profile', 'GET', cookie));
    expect.soft(await profile.json()).toMatchObject({ mustChangePassword: true, canVerifyPasswordWithInviteCode: false });
    expect(await requireAuth(request('/api/private', 'GET', cookie))).toHaveProperty('status', 403);
    const nextPassword = 'Ordinary-password-456';
    for (const input of [
        passwordInput(nextPassword, 'wrong-current-password'),
        passwordInput('short'),
        { ...passwordInput(nextPassword), confirmPassword: 'Different-confirm-789' },
    ]) {
        capturedCookies.length = 0;
        expect((await changePassword(request('/api/admin/password', 'POST', cookie, input))).status).toBe(400);
        expect(capturedCookies).toEqual([]);
        expect(await baseDb.user.findUniqueOrThrow({ where: { id: member.id } })).toEqual(member);
    }
    capturedCookies.length = 0;
    // verificationMethod 없는 기존 관리자·온보딩 payload도 계속 지원한다.
    const changed = await changePassword(request('/api/admin/password', 'POST', cookie, passwordInput(nextPassword)));
    expect(changed.status).toBe(200);
    const currentCookie = issuedCookie();
    expect(await requireAuth(request('/api/private', 'GET', currentCookie))).toMatchObject({ userId: member.id });
    expect((await readProfile(request('/api/me/profile', 'GET', cookie))).status).toBe(401);
    const after = await baseDb.user.findUniqueOrThrow({ where: { id: member.id } });
    expect(after.mustChangePassword).toBe(false);
    expect(after.sessionVersion).toBe(member.sessionVersion + 1);
    expect(await bcrypt.compare(nextPassword, after.passwordHash)).toBe(true);
    expect((await (await signIn(member.email, nextPassword)).response.json()).mustChangePassword).toBe(false);
});

it.each(['password', 'invite'] as const)('%s 확인을 마친 두 변경 요청은 한 건만 저장하며 승자 비밀번호와 쿠키만 유효하다', async (method) => {
    const member = method === 'invite' ? await inviteMember() : null;
    const account = member?.account ?? await user('concurrent');
    const cookie = member?.cookie ?? (await signIn(account.email, initialPassword)).cookie;
    const passwords = ['Concurrent-first-123', 'Concurrent-second-456'];
    let arrivals = 0;
    let release!: () => void;
    const bothReady = new Promise<void>(resolve => { release = resolve; });
    const gateTimeout = setTimeout(release, 3_000);
    passwordWriteGate = async () => {
        arrivals += 1;
        if (arrivals === 2) release();
        await bothReady;
    };
    capturedCookies.length = 0;
    let responses: Response[];
    try {
        responses = await Promise.all(passwords.map(password => changePassword(request('/api/admin/password', 'POST', cookie,
            method === 'invite' ? inviteInput(member!.code.code, password) : passwordInput(password)))));
    } finally {
        clearTimeout(gateTimeout);
        passwordWriteGate = null;
    }
    expect(arrivals).toBe(2);
    expect(responses.filter(response => response.status === 200)).toHaveLength(1);
    expect(responses.filter(response => response.status === 409)).toHaveLength(1);
    const winner = responses.findIndex(response => response.status === 200);
    const currentCookie = issuedCookie();
    const after = await baseDb.user.findUniqueOrThrow({ where: { id: account.id } });
    expect(after.sessionVersion).toBe(account.sessionVersion + 1);
    expect(verifySessionCookie(currentCookie)?.ver).toBe(after.sessionVersion);
    expect((await readProfile(request('/api/me/profile', 'GET', cookie))).status).toBe(401);
    expect((await readProfile(request('/api/me/profile', 'GET', currentCookie))).status).toBe(200);
    await signIn(account.email, passwords[winner]);
    capturedCookies.length = 0;
    expect((await passwordLogin(request('/api/auth/login', 'POST', undefined, {
        email: account.email, password: passwords[1 - winner], role: 'MENTEE',
    }))).status).toBe(401);
    expect(capturedCookies).toEqual([]);
}, 15_000);

it.each(['logout', 'code'] as const)('인증 완료 후 %s 상태가 바뀌면 진행 중인 비밀번호 변경은 덮어쓰지 않는다', async (race) => {
    const member = await inviteMember();
    const before = await baseDb.user.findUniqueOrThrow({ where: { id: member.account.id } });
    let arrivals = 0;
    let changedCode: InviteCode | undefined;
    const raceGate = async () => {
        arrivals += 1;
        if (race === 'logout') {
            const response = await logout(request('/api/auth/logout', 'POST', member.cookie));
            expect(response.status).toBe(200);
        } else {
            changedCode = await baseDb.inviteCode.update({ where: { id: member.code.id }, data: {
                code: normalizeInviteCode(`${prefix}_reissued`),
            } });
        }
    };
    if (race === 'logout') credentialReadGate = raceGate;
    else passwordWriteGate = raceGate;
    capturedCookies.length = 0;
    const response = await changePassword(request('/api/admin/password', 'POST', member.cookie,
        inviteInput(member.code.code, 'Racing-password-123')));
    passwordWriteGate = null;
    credentialReadGate = null;
    expect(arrivals).toBe(1);
    expect(response.status).toBe(race === 'logout' ? 401 : 409);
    expect(capturedCookies).toEqual([]);
    const after = await baseDb.user.findUniqueOrThrow({ where: { id: member.account.id } });
    expect(after.passwordHash).toBe(before.passwordHash);
    expect(after.mustChangePassword).toBe(before.mustChangePassword);
    expect(after.sessionVersion).toBe(before.sessionVersion + (race === 'logout' ? 1 : 0));
    if (changedCode) expect(await baseDb.inviteCode.findUniqueOrThrow({ where: { id: changedCode.id } })).toEqual(changedCode);
});

it('현재 비밀번호 확인 후 관리자 API가 프로그램을 종료하면 진행 중인 변경과 쿠키 발급을 거절한다', async () => {
    const member = await inviteMember();
    capturedCookies.length = 0;
    const initialChange = await changePassword(request('/api/admin/password', 'POST', member.cookie,
        inviteInput(member.code.code, initialPassword)));
    expect(initialChange.status).toBe(200);
    const memberCookie = issuedCookie();
    const { cookie: adminCookie } = await signIn(admin.email, initialPassword);
    expect((await saveProfile(request('/api/me/profile', 'PUT', adminCookie, {
        organization: '비밀번호 검수기관', phone: '01000000000', privacyConsent: true,
    }))).status).toBe(200);
    const before = await baseDb.user.findUniqueOrThrow({ where: { id: member.account.id } });
    const endsAt = new Date(Date.now() - day).toISOString().slice(0, 10);
    let arrivals = 0;
    passwordWriteGate = async () => {
        arrivals += 1;
        const edited = await editProgram(request(`/api/programs/${programId}`, 'PATCH', adminCookie, {
            name: '비밀번호 격리 프로그램', organization: '검수기관',
            startsAt: new Date(Date.now() - 3 * day).toISOString().slice(0, 10), endsAt,
        }), { params: Promise.resolve({ id: programId }) });
        expect(edited.status).toBe(200);
        expect((await baseDb.program.findUniqueOrThrow({ where: { id: programId } })).endsAt).toEqual(new Date(endsAt));
        expect((await baseDb.user.findUniqueOrThrow({ where: { id: member.account.id } })).sessionVersion).toBe(before.sessionVersion);
    };
    capturedCookies.length = 0;
    const response = await changePassword(request('/api/admin/password', 'POST', memberCookie,
        passwordInput('Program-race-password-456')));
    passwordWriteGate = null;
    expect(arrivals).toBe(1);
    expect.soft(response.status).toBe(409);
    const after = await baseDb.user.findUniqueOrThrow({ where: { id: member.account.id } });
    expect.soft(after.passwordHash).toBe(before.passwordHash);
    expect.soft(after.sessionVersion).toBe(before.sessionVersion);
    expect(capturedCookies).toEqual([]);
});
