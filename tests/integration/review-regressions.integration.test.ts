// 격리 PostgreSQL과 실제 세션으로 초대·소속·분석·로그아웃·관리자 삭제 회귀를 검증한다.
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { Prisma, PrismaClient, type User } from '@prisma/client';
import { NextRequest } from 'next/server';

// HTTP 응답 쿠키와 메일 전송 경계만 대체하며 인증과 데이터 쿼리는 실제로 수행한다.
const capturedCookies = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({ cookies: async () => ({ set: (key: string, value: string) => capturedCookies.set(key, value) }) }));
vi.mock('../../lib/email', () => ({ sendMail: async () => true }));

const dbUrl = process.env.INTEGRATION_DATABASE_URL;
if (!dbUrl || dbUrl === process.env.POSTGRES_PRISMA_URL
    || new URL(dbUrl).hostname !== '127.0.0.1' || new URL(dbUrl).pathname !== '/program_restore_qa') {
    throw new Error('운영 DB와 다른 127.0.0.1의 program_restore_qa DB만 사용할 수 있습니다.');
}
const baseDb = new PrismaClient({ datasources: { db: { url: dbUrl } } });
let adminCountIds: string[] | null = null;
const db = baseDb.$extends({
    query: {
        user: {
            count({ args, query }) {
                // 다른 통합 테스트의 관리자가 있어도 두 격리 관리자 사이의 마지막 관리자 정책을 검증한다.
                // 고정 숫자를 반환하지 않고 트랜잭션 안에서도 해당 ID의 실제 DB 행을 센다.
                return query(adminCountIds ? {
                    ...args, where: { AND: [args.where ?? {}, { id: { in: adminCountIds } }] },
                } : args);
            },
        },
    },
});
vi.mock('../../lib/prisma', () => ({ get prisma() { return db; } }));

import { encodeSessionCookie } from '../../lib/auth';
import { SESSION_COOKIE_NAME } from '../../lib/constants';
import { normalizeInviteCode } from '../../lib/invite-code';
import { GET as listInvites, POST as issueInvite } from '../../app/api/invites/route';
import { POST as moveMentee } from '../../app/api/programs/[id]/mentees/route';
import { DELETE as deleteUser } from '../../app/api/admin/users/route';
import { GET as readAnalysis } from '../../app/api/projects/[id]/qfd/analysis/route';
import { GET as readTechnicals, POST as createTechnical } from '../../app/api/projects/[id]/qfd/technical/route';
import { POST as importJson } from '../../app/api/projects/[id]/import-json/route';
import { GET as affiliation } from '../../app/api/me/affiliation/route';
import { POST as inviteLogin } from '../../app/api/auth/invite-login/route';
import { POST as logout } from '../../app/api/auth/logout/route';
import { POST as assignMentor } from '../../app/api/mentees/[id]/mentor/route';
import { GET as readProfile } from '../../app/api/me/profile/route';

const day = 86_400_000;
let prefix: string;
let userIds: string[];
let programIds: string[];
let projectIds: string[];
let inviteIds: string[];
let issuedEmails: string[];
let admin: User;
let manager: User;
let mentee: User;
let programA: string;
let programB: string;
const context = (id: string) => ({ params: Promise.resolve({ id }) });
const emailFor = (suffix: string) => `${prefix}_${suffix}@example.test`;

function request(path: string, method = 'GET', actor?: User, body?: unknown, version = actor?.sessionVersion ?? 0) {
    return new NextRequest(`http://localhost${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(actor ? { cookie: `${SESSION_COOKIE_NAME}=${encodeSessionCookie({ userId: actor.id, email: actor.email, name: actor.name }, { sessionVersion: version })}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
}

async function user(suffix: string, role = 'MENTEE', programId?: string) {
    const id = `${prefix}_${suffix}`;
    userIds.push(id);
    return db.user.create({ data: {
        id, email: emailFor(suffix), name: `격리 ${suffix}`, role, status: 'APPROVED',
        isAdmin: role === 'ADMIN', passwordHash: 'isolated-unused-password-hash', programId,
        accessExpiresAt: new Date(Date.now() + 60 * day),
        profile: { create: {
            organization: '격리 검수기관', phone: '01000000000', expertise: '검수', careerYears: 1,
            companyName: '검수기업', industry: '검수', privacyConsentAt: new Date(),
        } },
    } });
}

async function program(suffix: string, managerId: string) {
    const id = `${prefix}_${suffix}`;
    programIds.push(id);
    await db.program.create({ data: {
        id, managerId, name: `격리 ${suffix}`, organization: '격리 검수기관',
        startsAt: new Date(Date.now() - day), endsAt: new Date(Date.now() + 90 * day),
    } });
    return id;
}

async function project(suffix: string, owner: User, programId = programA) {
    const id = `${prefix}_${suffix}`;
    projectIds.push(id);
    return db.project.create({ data: { id, ownerId: owner.id, programId, name: `격리 ${suffix}`, qfdTechnicalInitialized: true } });
}

async function invite(suffix: string, issuer = admin, redeemer?: User) {
    const id = `${prefix}_${suffix}`;
    inviteIds.push(id);
    return db.inviteCode.create({ data: {
        id, code: normalizeInviteCode(id), email: redeemer?.email ?? emailFor(suffix), role: 'MENTEE',
        programId: redeemer?.programId ?? programA, issuedById: issuer.id,
        expiresAt: new Date(Date.now() + 14 * day), accessDurationDays: 60,
        ...(redeemer ? { usedById: redeemer.id, usedAt: new Date(Date.now() - day) } : {}),
    } });
}

async function codeLogin(code: { email: string; code: string }) {
    return inviteLogin(request('/api/auth/invite-login', 'POST', undefined, { email: code.email, inviteCode: code.code }));
}

beforeAll(() => { vi.stubEnv('SESSION_SECRET', 'review-regressions-isolated-session-secret'); });
beforeEach(async () => {
    prefix = `review_${randomUUID().replaceAll('-', '')}`;
    userIds = []; programIds = []; projectIds = []; inviteIds = []; issuedEmails = [];
    capturedCookies.clear();
    admin = await user('admin', 'ADMIN');
    manager = await user('manager', 'PROGRAM_MANAGER');
    programA = await program('program_a', manager.id);
    programB = await program('program_b', admin.id);
    mentee = await user('mentee', 'MENTEE', programA);
});
afterEach(async () => {
    vi.restoreAllMocks();
    adminCountIds = null;
    // API가 생성한 코드는 사전에 기록한 정확한 이메일과 프로그램 ID의 교집합으로 한정한다.
    await baseDb.inviteCode.deleteMany({ where: { OR: [
        { id: { in: inviteIds } }, { email: { in: issuedEmails }, programId: { in: programIds } },
    ] } });
    await baseDb.project.deleteMany({ where: { id: { in: projectIds } } });
    await baseDb.program.deleteMany({ where: { id: { in: programIds } } });
    await baseDb.user.deleteMany({ where: { id: { in: userIds } } });
});
afterAll(async () => { await baseDb.$disconnect(); vi.unstubAllEnvs(); });

it('F01 관리자만 목록에서 원문 코드를 보며 PM의 이메일 목록과 기존 멘티 코드 로그인은 유지한다', async () => {
    const code = await invite('list_used', admin, mentee);
    const pmResponse = await listInvites(request('/api/invites', 'GET', manager));
    expect(pmResponse.status).toBe(200);
    const pmBody = await pmResponse.json();
    expect(pmBody.invites).toContainEqual(expect.objectContaining({ id: code.id, email: code.email }));
    expect(pmBody.invites.every((row: object) => !('code' in row))).toBe(true);
    expect(JSON.stringify(pmBody)).not.toContain(code.code);
    const adminResponse = await listInvites(request('/api/invites', 'GET', admin));
    expect(adminResponse.status).toBe(200);
    expect((await adminResponse.json()).invites).toContainEqual(expect.objectContaining({ id: code.id, code: code.code }));
    expect((await codeLogin(code)).status).toBe(200);
    expect(capturedCookies.has(SESSION_COOKIE_NAME)).toBe(true);
});

it('F01 PM 발급은 메일 결과만 반환하고 관리자 발급은 저장된 원문 코드를 반환한다', async () => {
    for (const [actor, suffix] of [[manager, 'pm_issue'], [admin, 'admin_issue']] as const) {
        const email = emailFor(suffix);
        issuedEmails.push(email);
        const response = await issueInvite(request('/api/invites', 'POST', actor, {
            email, role: 'MENTEE', programId: programA,
            expiresAt: new Date(Date.now() + 14 * day).toISOString().slice(0, 10),
        }));
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body).toMatchObject({ success: true, emailSent: true, invite: { email, programId: programA } });
        const stored = await db.inviteCode.findFirstOrThrow({ where: { email, programId: programA } });
        expect(stored.issuedById).toBe(actor.id);
        if (actor.id === admin.id) expect(body.code).toBe(stored.code);
        else {
            expect(body).not.toHaveProperty('code');
            expect(body.invite).not.toHaveProperty('code');
            expect(JSON.stringify(body)).not.toContain(stored.code);
        }
    }
});

it('F02 멘티 재배정은 계정과 사용 코드의 프로그램만 함께 옮겨 기존 기간·프로젝트·로그인을 보존한다', async () => {
    const originalProject = await project('original_project', mentee);
    const originalCode = await invite('move_used', admin, mentee);
    const response = await moveMentee(request(`/api/programs/${programB}/mentees`, 'POST', admin, { userId: mentee.id, confirmReassign: true }), context(programB));
    expect(response.status).toBe(200);
    const afterUser = await db.user.findUniqueOrThrow({ where: { id: mentee.id } });
    const afterCode = await db.inviteCode.findUniqueOrThrow({ where: { id: originalCode.id } });
    expect(afterUser.programId).toBe(programB);
    expect(afterUser.accessExpiresAt).toEqual(mentee.accessExpiresAt);
    expect(afterCode).toEqual({ ...originalCode, programId: programB });
    expect((await db.project.findUniqueOrThrow({ where: { id: originalProject.id } })).programId).toBe(programA);
    expect((await codeLogin(originalCode)).status).toBe(200);
    expect((await readProfile(request('/api/me/profile', 'GET', mentee))).status).toBe(200);
});

it('F02 이동한 프로그램 종료 후에도 회원 이용만료일이 남으면 코드와 세션을 보존한다', async () => {
    const code = await invite('move_ends', admin, mentee);
    expect((await moveMentee(request(`/api/programs/${programB}/mentees`, 'POST', admin, { userId: mentee.id, confirmReassign: true }), context(programB))).status).toBe(200);
    await db.program.update({ where: { id: programB }, data: { endsAt: new Date(Date.now() - 1_000) } });
    expect((await codeLogin(code)).status).toBe(200);
    expect((await readProfile(request('/api/me/profile', 'GET', mentee))).status).toBe(200);
    expect((await db.user.findUniqueOrThrow({ where: { id: mentee.id } })).accessExpiresAt).toEqual(mentee.accessExpiresAt);
});

it.each(['MENTOR', 'MENTEE'])('F03 %s 발급자 삭제는 사용·대기·만료 코드를 실행 관리자에게 이전하고 재로그인을 보존한다', async (role) => {
    const issuer = await user('issuer', role, role === 'MENTEE' ? programA : undefined);
    const used = await invite('issuer_used', issuer, mentee);
    const pending = await invite('issuer_pending', issuer);
    const expired = await invite('issuer_expired', issuer);
    await db.inviteCode.update({ where: { id: expired.id }, data: { expiresAt: new Date(Date.now() - day) } });
    const before = await db.inviteCode.findMany({ where: { id: { in: [used.id, pending.id, expired.id] } }, orderBy: { id: 'asc' } });
    const previewResponse = await deleteUser(request('/api/admin/users', 'DELETE', admin, { userId: issuer.id }));
    expect(previewResponse.status).toBe(409);
    const previewBody = await previewResponse.json();
    expect(previewBody.needsCascadeConfirm).toBe(true);
    expect(previewBody.preview?.transferredIssuedInviteCodes ?? previewBody.transferredIssuedInviteCodes).toBe(3);
    expect(await db.user.findUnique({ where: { id: issuer.id } })).not.toBeNull();
    const response = await deleteUser(request('/api/admin/users', 'DELETE', admin, {
        userId: issuer.id, confirmCascade: true, reason: 'misregistration', previewToken: previewBody.preview?.previewToken,
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, transferredIssuedInviteCodes: 3 });
    expect(await db.user.findUnique({ where: { id: issuer.id } })).toBeNull();
    const after = await db.inviteCode.findMany({ where: { id: { in: before.map(row => row.id) } }, orderBy: { id: 'asc' } });
    expect(after).toEqual(before.map(row => ({ ...row, issuedById: admin.id })));
    expect((await codeLogin(used)).status).toBe(200);
    expect((await db.user.findUniqueOrThrow({ where: { id: mentee.id } })).accessExpiresAt).toEqual(mentee.accessExpiresAt);
});

async function analysisFixture() {
    const owned = await project('qfd_project', mentee);
    const requirementId = `${prefix}_requirement`;
    const visibleId = `${prefix}_visible`;
    const blankId = `${prefix}_blank`;
    await db.customerRequirement.create({ data: { id: requirementId, projectId: owned.id, category: '검수', requirement: '저장 확인', kanoWeight: 2 } });
    await db.technicalCharacteristic.createMany({ data: [
        { id: visibleId, projectId: owned.id, name: '유효 기능', groupIndex: 0, columnOrder: 0 },
        { id: blankId, projectId: owned.id, name: ' \t\n ', groupIndex: 1, columnOrder: 1 },
    ] });
    await db.qFDMatrix.createMany({ data: [
        { id: `${prefix}_visible_rel`, projectId: owned.id, requirementId, technicalCharId: visibleId, strength: 'WEAK' },
        { id: `${prefix}_blank_rel`, projectId: owned.id, requirementId, technicalCharId: blankId, strength: 'STRONG' },
    ] });
    return { owned, visibleId, blankId };
}

it('F04 공백 기능은 WS-9와 분석·순위에서 제외되며 조회는 숨은 기능과 기존 관계를 삭제하지 않는다', async () => {
    const { owned, visibleId, blankId } = await analysisFixture();
    const beforeRows = await db.technicalCharacteristic.findMany({ where: { projectId: owned.id }, orderBy: { id: 'asc' } });
    const beforeRelations = await db.qFDMatrix.findMany({ where: { projectId: owned.id }, orderBy: { id: 'asc' } });
    const visibleResponse = await readTechnicals(request(`/api/projects/${owned.id}/qfd/technical`, 'GET', mentee), context(owned.id));
    expect(visibleResponse.status).toBe(200);
    expect((await visibleResponse.json()).technicalCharacteristics.map((row: { id: string }) => row.id)).toEqual([visibleId]);
    const response = await readAnalysis(request(`/api/projects/${owned.id}/qfd/analysis`, 'GET', mentee), context(owned.id));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.totalTechnicals).toBe(1);
    expect(body.technicals).toEqual([expect.objectContaining({ id: visibleId, rank: 1, totalScore: 2 })]);
    expect(body.totals.technicalScore).toBe(2);
    expect(JSON.stringify(body.technicals)).not.toContain(blankId);
    expect(await db.technicalCharacteristic.findMany({ where: { projectId: owned.id }, orderBy: { id: 'asc' } })).toEqual(beforeRows);
    expect(await db.qFDMatrix.findMany({ where: { projectId: owned.id }, orderBy: { id: 'asc' } })).toEqual(beforeRelations);
});

it('F04 공백 기능 신규 입력과 JSON 복원은 기존 기능·관계를 바꾸기 전에 거절한다', async () => {
    const { owned } = await analysisFixture();
    const beforeRows = await db.technicalCharacteristic.findMany({ where: { projectId: owned.id }, orderBy: { id: 'asc' } });
    const beforeRelations = await db.qFDMatrix.findMany({ where: { projectId: owned.id }, orderBy: { id: 'asc' } });
    expect((await createTechnical(request(`/api/projects/${owned.id}/qfd/technical`, 'POST', mentee, { name: ' \t ', groupIndex: 0 }), context(owned.id))).status).toBe(400);
    expect((await importJson(request(`/api/projects/${owned.id}/import-json`, 'POST', mentee, {
        confirmCascade: true, technicalCharacteristics: [{ name: '\n  ' }],
    }), context(owned.id))).status).toBe(400);
    expect(await db.technicalCharacteristic.findMany({ where: { projectId: owned.id }, orderBy: { id: 'asc' } })).toEqual(beforeRows);
    expect(await db.qFDMatrix.findMany({ where: { projectId: owned.id }, orderBy: { id: 'asc' } })).toEqual(beforeRelations);
});

it('F05 현재 멘토에게 여러 멘티의 프로그램을 표시하고 과거 COACH는 소속과 접근에서 제외한다', async () => {
    const currentMentor = await user('current_mentor', 'MENTOR');
    const legacyMentor = await user('legacy_mentor', 'MENTOR');
    const secondMentee = await user('second_mentee', 'MENTEE', programB);
    const first = await project('first_mentee_project', mentee);
    const second = await project('second_mentee_project', secondMentee, programB);
    await db.projectMember.createMany({ data: [first, second].map(row => ({ id: `${row.id}_legacy`, projectId: row.id, userId: legacyMentor.id, role: 'COACH' })) });
    for (const owner of [mentee, secondMentee]) {
        expect((await assignMentor(request(`/api/mentees/${owner.id}/mentor`, 'POST', admin, { userId: currentMentor.id }), context(owner.id))).status).toBe(200);
    }
    const menteeResponse = await affiliation(request('/api/me/affiliation', 'GET', mentee));
    expect(menteeResponse.status).toBe(200);
    expect((await menteeResponse.json()).mentors).toEqual([expect.objectContaining({ id: currentMentor.id, projectNames: [first.name] })]);
    const mentorResponse = await affiliation(request('/api/me/affiliation', 'GET', currentMentor));
    expect(mentorResponse.status).toBe(200);
    const mentorBody = await mentorResponse.json();
    expect(mentorBody.programs.map((row: { id: string }) => row.id).sort()).toEqual([programA, programB].sort());
    expect(mentorBody.programs.flatMap((row: { projects: { id: string }[] }) => row.projects.map(p => p.id)).sort()).toEqual([first.id, second.id].sort());
    const oldResponse = await affiliation(request('/api/me/affiliation', 'GET', legacyMentor));
    expect(oldResponse.status).toBe(200);
    expect((await oldResponse.json()).programs).toEqual([]);
    expect((await readAnalysis(request(`/api/projects/${first.id}/qfd/analysis`, 'GET', legacyMentor), context(first.id))).status).toBe(403);
    expect((await readAnalysis(request(`/api/projects/${first.id}/qfd/analysis`, 'GET', currentMentor), context(first.id))).status).toBe(200);
    expect(await db.projectMember.count({ where: { projectId: { in: [first.id, second.id] }, userId: legacyMentor.id } })).toBe(2);
});

it('F05 프로젝트가 없는 멘티도 현재 배정된 멘토를 소속 정보에서 확인한다', async () => {
    const mentor = await user('mentor_without_project', 'MENTOR');
    expect((await assignMentor(request(`/api/mentees/${mentee.id}/mentor`, 'POST', admin, { userId: mentor.id }), context(mentee.id))).status).toBe(200);
    const response = await affiliation(request('/api/me/affiliation', 'GET', mentee));
    expect(response.status).toBe(200);
    expect((await response.json()).mentors).toEqual([expect.objectContaining({ id: mentor.id, projectNames: [] })]);
});

it('F08 오래된 로그아웃은 현재 세션을 보존하고 유효한 쿠키만 한 번 무효화한다', async () => {
    await db.user.update({ where: { id: mentee.id }, data: { sessionVersion: 4 } });
    for (const [cookieVersion, expectedVersion] of [[3, 4], [4, 5], [4, 5]]) {
        const response = await logout(request('/api/auth/logout', 'POST', mentee, undefined, cookieVersion));
        expect(response.status).toBe(200);
        expect(response.cookies.get(SESSION_COOKIE_NAME)).toMatchObject({ value: '', maxAge: 0 });
        expect((await db.user.findUniqueOrThrow({ where: { id: mentee.id } })).sessionVersion).toBe(expectedVersion);
    }
    expect((await readProfile(request('/api/me/profile', 'GET', mentee, undefined, 4))).status).toBe(401);
    expect((await readProfile(request('/api/me/profile', 'GET', mentee, undefined, 5))).status).toBe(200);
    const anonymous = await logout(request('/api/auth/logout', 'POST'));
    expect(anonymous.cookies.get(SESSION_COOKIE_NAME)).toMatchObject({ value: '', maxAge: 0 });
    expect((await db.user.findUniqueOrThrow({ where: { id: mentee.id } })).sessionVersion).toBe(5);
});

it('F09 두 관리자가 동시에 서로를 삭제해도 실제 관리자 한 명은 남는다', async () => {
    const first = await user('race_admin_a', 'ADMIN');
    const second = await user('race_admin_b', 'ADMIN');
    adminCountIds = [first.id, second.id];
    type Transaction = (operation: (tx: Prisma.TransactionClient) => Promise<unknown>, options?: {
        maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel;
    }) => Promise<unknown>;
    const actualTransaction = db.$transaction.bind(db) as unknown as Transaction;
    let arrivals = 0;
    let release!: () => void;
    const bothTransactionsStarted = new Promise<void>(resolve => { release = resolve; });
    // 두 요청이 실제 사전 조회를 모두 마친 후 실제 트랜잭션 콜백을 동시에 시작한다.
    // 잠금 이후 count에 barrier를 두면 올바른 직렬화가 교착되므로 그 앞에서만 동기화한다.
    const transactionSpy = vi.spyOn(db, '$transaction').mockImplementation((async (operation, options) => {
        return actualTransaction(async tx => {
            arrivals += 1;
            if (arrivals === 2) release();
            await bothTransactionsStarted;
            return operation(tx);
        }, options);
    }) as Transaction as unknown as typeof db.$transaction);
    try {
        const responses = await Promise.all([
            deleteUser(request('/api/admin/users', 'DELETE', first, { userId: second.id, confirmCascade: true })),
            deleteUser(request('/api/admin/users', 'DELETE', second, { userId: first.id, confirmCascade: true })),
        ]);
        expect(arrivals).toBe(2);
        expect(responses.filter(response => response.status === 200)).toHaveLength(1);
        expect(responses.filter(response => [400, 401, 403, 409].includes(response.status))).toHaveLength(1);
        const survivors = await baseDb.user.findMany({ where: { id: { in: adminCountIds }, isAdmin: true } });
        expect(survivors).toHaveLength(1);
        expect(survivors[0].id).toBe(responses[0].status === 200 ? first.id : second.id);
        expect(survivors[0].role).toBe('ADMIN');
        expect(survivors[0].status).toBe('APPROVED');
        expect((await readProfile(request('/api/me/profile', 'GET', survivors[0]))).status).toBe(200);
        expect(await baseDb.user.findUnique({ where: { id: admin.id } })).not.toBeNull();
    } finally {
        transactionSpy.mockRestore();
        adminCountIds = null;
    }
}, 15_000);
