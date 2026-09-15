// 격리 PostgreSQL과 실제 세션으로 프로젝트 강제 이관의 자료 보존과 경합을 검증한다.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { Prisma, PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

const dbUrl = process.env.INTEGRATION_DATABASE_URL;
if (!dbUrl || dbUrl === process.env.POSTGRES_PRISMA_URL || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(dbUrl).hostname)) {
    throw new Error('운영 DB와 분리된 로컬 INTEGRATION_DATABASE_URL이 필요합니다.');
}
const db = new PrismaClient({ datasources: { db: { url: dbUrl } } });
vi.mock('../../lib/prisma', () => ({ get prisma() { return db; } }));
import { encodeSessionCookie } from '../../lib/auth';
import { SESSION_COOKIE_NAME } from '../../lib/constants';
import type { ProjectTransferPreview } from '../../lib/project-transfer-types';
import { GET, POST } from '../../app/api/admin/projects/[id]/transfer/route';
import { DELETE as deleteUser } from '../../app/api/admin/users/route';
import { POST as assignMentor } from '../../app/api/mentees/[id]/mentor/route';
import { GET as readSpec } from '../../app/api/projects/[id]/spec/route';

const prefix = `project_transfer_${randomUUID()}_`;
const ids = { admin: prefix + 'admin', pm: prefix + 'pm', mentor: prefix + 'mentor', otherMentor: prefix + 'other_mentor', teammate: prefix + 'teammate' };
const previousSecret = process.env.SESSION_SECRET;
const params = (id: string) => ({ params: Promise.resolve({ id }) });
function request(path: string, method = 'GET', body?: unknown, actor: string | null = ids.admin) {
    return new NextRequest(`http://localhost${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', ...(actor ? { cookie: `${SESSION_COOKIE_NAME}=${encodeSessionCookie({ userId: actor, email: `${actor}@example.test`, name: actor })}` } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
}
const path = (id: string) => `/api/admin/projects/${id}/transfer`;
function user(id: string, role: string, programId?: string) {
    return db.user.create({ data: {
        id, email: `${id}@example.test`, name: id, passwordHash: 'isolated-test', role, isAdmin: role === 'ADMIN', status: 'APPROVED', programId,
        profile: { create: { organization: '격리 검수기관', phone: '01000000000', expertise: '검수', careerYears: 1, companyName: '검수기업', industry: '검수', privacyConsentAt: new Date() } },
    } });
}
async function fixture(sourceMentor = true) {
    const key = prefix + randomUUID();
    const f = { source: key + '_source', target: key + '_target', alternative: key + '_alternative', project: key + '_project', sourceOther: key + '_source_other', targetOther: key + '_target_other', program: key + '_program', targetProgram: key + '_target_program' };
    for (const id of [f.program, f.targetProgram]) {
        await db.program.create({ data: { id, name: id, organization: '격리 검수기관', managerId: ids.pm, startsAt: new Date('2020-01-01'), endsAt: new Date('2099-01-01') } });
    }
    await user(f.source, 'MENTEE', f.program);
    await user(f.target, 'MENTEE', f.targetProgram);
    await user(f.alternative, 'MENTEE', f.targetProgram);
    for (const [id, ownerId, programId] of [[f.project, f.source, f.program], [f.sourceOther, f.source, f.program], [f.targetOther, f.target, f.targetProgram]]) {
        await db.project.create({ data: { id, ownerId, programId, name: '보존할 프로젝트', description: '기존 설명', productName: '기존 제품' } });
    }
    if (sourceMentor) await db.mentorAssignment.create({ data: { menteeId: f.source, mentorId: ids.mentor } });
    await db.mentorAssignment.create({ data: { menteeId: f.target, mentorId: ids.otherMentor } });
    await db.projectMember.createMany({ data: [f.source, f.target, ids.teammate].map(userId => ({ projectId: f.project, userId, role: 'EDITOR' })) });
    await db.specFunction.create({ data: { projectId: f.project, name: '유지할 핵심 기능', level: 'CORE', technology: '기존 기술' } });
    await db.customerRequirement.create({ data: { projectId: f.project, category: '기능', requirement: '유지할 고객 요구', kanoPositiveQ: '기존 설문 문항' } });
    await db.worksheetComment.create({ data: { projectId: f.project, worksheetId: 'spec', authorId: ids.mentor, content: '유지할 멘토 의견' } });
    await db.finalReport.create({ data: { projectId: f.project, draft: { text: '유지할 초안' }, published: { text: '유지할 공개본' }, version: 4, publishedVersion: 3, updatedById: ids.mentor, publishedById: ids.otherMentor, publishedAt: new Date('2026-01-01') } });
    for (const menteeId of [f.source, f.target]) {
        await db.projectCreationRequest.create({ data: { menteeId, programId: menteeId === f.source ? f.program : f.targetProgram, reason: '보존할 개설 승인', status: 'APPROVED', reviewedById: ids.pm } });
    }
    return f;
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function snapshot(f: Fixture) {
    const [project, sourceOther, targetOther, owners, assignments, approvals] = await Promise.all([
        db.project.findUniqueOrThrow({ where: { id: f.project }, include: { members: { orderBy: { userId: 'asc' } }, specFunctions: true, requirements: true, worksheetComments: true, finalReport: true } }),
        db.project.findUniqueOrThrow({ where: { id: f.sourceOther } }),
        db.project.findUniqueOrThrow({ where: { id: f.targetOther } }),
        db.user.findMany({ where: { id: { in: [f.source, f.target] } }, orderBy: { id: 'asc' } }),
        db.mentorAssignment.findMany({ where: { menteeId: { in: [f.source, f.target] } }, orderBy: { menteeId: 'asc' } }),
        db.projectCreationRequest.findMany({ where: { menteeId: { in: [f.source, f.target] } }, orderBy: { id: 'asc' } }),
    ]);
    return { project, sourceOther, targetOther, owners, assignments, approvals };
}
async function preview(f: Fixture, target = f.target) {
    const response = await GET(request(`${path(f.project)}?targetMenteeId=${target}`), params(f.project));
    expect(response.status).toBe(200);
    const result = (await response.json()).preview as ProjectTransferPreview;
    expect(result.previewToken).toMatch(/^[a-f0-9]{64}$/);
    return result;
}
function transfer(f: Fixture, token: string, target = f.target, actor: string | null = ids.admin) {
    return POST(request(path(f.project), 'POST', { targetMenteeId: target, previewToken: token, confirmed: true }, actor), params(f.project));
}
async function deletionPreview(userId: string) {
    const response = await deleteUser(request('/api/admin/users', 'DELETE', { userId }));
    expect(response.status).toBe(409);
    const result = (await response.json()).preview as { previewToken: string };
    expect(result.previewToken).toMatch(/^[a-f0-9]{64}$/);
    return result.previewToken;
}
function deletion(userId: string, previewToken: string) {
    return deleteUser(request('/api/admin/users', 'DELETE', { userId, previewToken, confirmCascade: true, reason: 'self_request' }));
}
async function expectTransferred(f: Fixture, before: Awaited<ReturnType<typeof snapshot>>, inherited = true) {
    const after = await snapshot(f);
    expect(after.project).toEqual({ ...before.project, ownerId: f.target, programId: f.targetProgram, updatedAt: expect.any(Date), members: before.project.members.filter(member => member.userId === ids.teammate) });
    expect(after.sourceOther).toEqual(before.sourceOther);
    expect(after.targetOther).toEqual(before.targetOther);
    expect(after.owners).toEqual(before.owners);
    expect(after.approvals).toEqual(before.approvals);
    expect(after.assignments.find(row => row.menteeId === f.source)).toEqual(before.assignments.find(row => row.menteeId === f.source));
    const originalTarget = before.assignments.find(row => row.menteeId === f.target)!;
    expect(after.assignments.find(row => row.menteeId === f.target)).toEqual(inherited ? { ...originalTarget, mentorId: ids.mentor, assignedAt: expect.any(Date) } : originalTarget);
}

beforeAll(async () => {
    process.env.SESSION_SECRET = 'isolated-project-transfer-integration';
    for (const [key, role] of [['admin', 'ADMIN'], ['pm', 'PROGRAM_MANAGER'], ['mentor', 'MENTOR'], ['otherMentor', 'MENTOR'], ['teammate', 'MENTEE']] as const) await user(ids[key], role);
});
afterAll(async () => {
    try {
        await db.project.deleteMany({ where: { id: { startsWith: prefix } } });
        await db.program.deleteMany({ where: { id: { startsWith: prefix } } });
        await db.user.deleteMany({ where: { id: { startsWith: prefix } } });
    } finally {
        await db.$disconnect();
        if (previousSecret === undefined) delete process.env.SESSION_SECRET;
        else process.env.SESSION_SECRET = previousSecret;
    }
});

it('실제 세션에서 관리자만 후보·미리보기·실행에 접근하고 승인·기간·소속이 유효한 멘티만 후보로 나온다', async () => {
    const f = await fixture();
    const valid = await preview(f);
    const before = await snapshot(f);
    for (const actor of [null, ids.pm, ids.mentor, f.source]) {
        const status = actor ? 403 : 401;
        expect((await GET(request(path(f.project), 'GET', undefined, actor), params(f.project))).status).toBe(status);
        expect((await GET(request(`${path(f.project)}?targetMenteeId=${f.target}`, 'GET', undefined, actor), params(f.project))).status).toBe(status);
        expect((await transfer(f, valid.previewToken, f.target, actor)).status).toBe(status);
    }
    expect(await snapshot(f)).toEqual(before);
    for (const change of [{ status: 'PENDING' }, { accessExpiresAt: new Date('2000-01-01') }, { programId: null }]) {
        await db.user.update({ where: { id: f.alternative }, data: { status: 'APPROVED', accessExpiresAt: null, programId: f.targetProgram, ...change } });
        const response = await GET(request(path(f.project)), params(f.project));
        expect(response.status).toBe(200);
        const candidates = (await response.json()).candidates.map((row: { id: string }) => row.id);
        expect(candidates).toContain(f.target);
        for (const excluded of [f.source, f.alternative, ids.mentor, ids.pm, ids.teammate]) expect(candidates).not.toContain(excluded);
    }
});

it('다른 프로그램으로 이관하며 원본의 다른 프로젝트·배정, 자료·보고서·승인을 보존하고 두 소유자 멤버 행만 제거한다', async () => {
    const f = await fixture();
    const before = await snapshot(f);
    const value = await preview(f);
    expect(value).toMatchObject({ programChanged: true, mentorChanged: true, targetProjectCount: 1, sourceMentor: { id: ids.mentor }, currentTargetMentor: { id: ids.otherMentor }, nextMentor: { id: ids.mentor } });
    expect((await transfer(f, value.previewToken)).status).toBe(200);
    await expectTransferred(f, before);
    for (const [actor, project, expected] of [[f.source, f.project, 403], [f.target, f.project, 200], [ids.teammate, f.project, 200], [ids.mentor, f.targetOther, 200], [ids.otherMentor, f.targetOther, 403]] as const) {
        expect((await readSpec(request(`/api/projects/${project}/spec`, 'GET', undefined, actor), params(project))).status).toBe(expected);
    }
});

it('원본 멘토가 없으면 대상의 기존 멘토 배정 시각까지 그대로 유지한다', async () => {
    const f = await fixture(false);
    const before = await snapshot(f);
    const value = await preview(f);
    expect(value).toMatchObject({ sourceMentor: null, mentorChanged: false, nextMentor: { id: ids.otherMentor } });
    expect((await transfer(f, value.previewToken)).status).toBe(200);
    await expectTransferred(f, before, false);
});

it.each(['target-program', 'target-status', 'source-assignment', 'target-assignment', 'target-projects'] as const)('미리보기 뒤 %s 변경을 409로 거절하고 어떤 자료도 부분 변경하지 않는다', async change => {
    const f = await fixture();
    const value = await preview(f);
    if (change === 'target-program') await db.user.update({ where: { id: f.target }, data: { programId: f.program } });
    if (change === 'target-status') await db.user.update({ where: { id: f.target }, data: { status: 'PENDING' } });
    if (change === 'source-assignment') await db.mentorAssignment.delete({ where: { menteeId: f.source } });
    if (change === 'target-assignment') await db.mentorAssignment.update({ where: { menteeId: f.target }, data: { mentorId: ids.mentor } });
    if (change === 'target-projects') await db.project.create({ data: { id: f.targetOther + '_added', name: '미리보기 뒤 추가', ownerId: f.target, programId: f.targetProgram } });
    const before = await snapshot(f);
    expect((await transfer(f, value.previewToken)).status).toBe(409);
    expect(await snapshot(f)).toEqual(before);
});

it('동일 프로젝트에 다른 멘티로 동시 이관을 요청하면 한 번만 성공한다', async () => {
    const f = await fixture();
    const before = await snapshot(f);
    const first = await preview(f);
    const second = await preview(f, f.alternative);
    const results = await Promise.all([transfer(f, first.previewToken), transfer(f, second.previewToken, f.alternative)]);
    expect(results.map(result => result.status).sort()).toEqual([200, 409]);
    const winner = results[0].status === 200 ? f.target : f.alternative;
    const after = await snapshot(f);
    expect(after.project).toEqual({ ...before.project, ownerId: winner, programId: f.targetProgram, updatedAt: expect.any(Date), members: before.project.members.filter(member => ![f.source, winner].includes(member.userId)) });
    expect(after.sourceOther).toEqual(before.sourceOther);
    expect(after.targetOther).toEqual(before.targetOther);
    expect(after.approvals).toEqual(before.approvals);
    expect((await db.mentorAssignment.findUniqueOrThrow({ where: { menteeId: winner } })).mentorId).toBe(ids.mentor);
    if (winner === f.alternative) expect(after.assignments).toEqual(before.assignments);
    expect(await db.project.count({ where: { id: f.project } })).toBe(1);
});

function signal<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(done => { resolve = done; });
    return { promise, resolve };
}
async function expectBlockedBy(pid: number) {
    await vi.waitFor(async () => {
        const [row] = await db.$queryRaw<{ blocked: boolean }[]>`SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND ${pid} = ANY(pg_blocking_pids(pid))) AS blocked`;
        expect(row.blocked).toBe(true);
    }, { timeout: 3000, interval: 20 });
}
function holdNextTransaction() {
    const locked = signal<number>();
    const release = signal<void>();
    const run = db.$transaction.bind(db);
    type Options = { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel };
    const intercept = async (callback: (tx: Prisma.TransactionClient) => Promise<unknown>, options?: Options) => run(async tx => {
        let held = false;
        const gated = new Proxy(tx, { get(client, key, receiver) {
            if (key !== '$queryRaw') return Reflect.get(client, key, receiver);
            return async (...args: Parameters<Prisma.TransactionClient['$queryRaw']>) => {
                const rows = await client.$queryRaw(...args);
                if (!held) {
                    held = true;
                    const [row] = await client.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
                    locked.resolve(row.pid);
                    await release.promise;
                }
                return rows;
            };
        } });
        return callback(gated);
    }, { ...options, timeout: 10000 });
    const spy = vi.spyOn(db, '$transaction').mockImplementationOnce(intercept as typeof db.$transaction);
    return { locked: locked.promise, release: () => release.resolve(), restore: () => spy.mockRestore() };
}

it.each(['source', 'target'] as const)('이관이 먼저 잠근 %s 멘티 삭제는 최신 목록 재확인을 요구하며 프로젝트를 지우거나 덮어쓰지 않는다', async side => {
    const f = await fixture();
    const value = await preview(f);
    const deleteToken = await deletionPreview(f[side]);
    const before = await snapshot(f);
    const gate = holdNextTransaction();
    const moving = transfer(f, value.previewToken);
    let deleting: ReturnType<typeof deletion> | undefined;
    try {
        const pid = await Promise.race([gate.locked, moving.then(() => { throw new Error('이관이 잠금 전에 종료되었습니다.'); })]);
        deleting = deletion(f[side], deleteToken);
        await expectBlockedBy(pid);
        gate.release();
        expect((await moving).status).toBe(200);
        expect((await deleting).status).toBe(409);
        await expectTransferred(f, before);
    } finally {
        gate.release();
        await Promise.allSettled([moving, ...(deleting ? [deleting] : [])]);
        gate.restore();
    }
}, 15000);

it.each(['source', 'target'] as const)('삭제가 먼저 잠근 %s 멘티로 이관하려던 요청은 409이며 프로젝트 하위 자료는 보존된다', async side => {
    const f = await fixture();
    const value = await preview(f);
    const deleteToken = await deletionPreview(f[side]);
    const before = await snapshot(f);
    const gate = holdNextTransaction();
    const deleting = deletion(f[side], deleteToken);
    let moving: ReturnType<typeof transfer> | undefined;
    try {
        const pid = await Promise.race([gate.locked, deleting.then(() => { throw new Error('삭제가 잠금 전에 종료되었습니다.'); })]);
        moving = transfer(f, value.previewToken);
        await expectBlockedBy(pid);
        gate.release();
        expect((await deleting).status).toBe(200);
        expect((await moving).status).toBe(409);
        const after = await snapshot(f);
        expect(after.project).toEqual({ ...before.project, ownerId: side === 'source' ? ids.pm : f.source, updatedAt: side === 'source' ? expect.any(Date) : before.project.updatedAt, members: before.project.members.filter(member => member.userId !== f[side]) });
        expect(after.project.specFunctions).toEqual(before.project.specFunctions);
        expect(after.project.finalReport).toEqual(before.project.finalReport);
        expect(after.assignments.find(row => row.menteeId === f[side === 'source' ? 'target' : 'source'])).toEqual(before.assignments.find(row => row.menteeId === f[side === 'source' ? 'target' : 'source']));
        expect(await db.user.findUnique({ where: { id: f[side] } })).toBeNull();
    } finally {
        gate.release();
        await Promise.allSettled([deleting, ...(moving ? [moving] : [])]);
        gate.restore();
    }
}, 15000);

it.each(['existing', 'missing'] as const)('원본 멘토 배정 %s 행 변경이 먼저 잠기면 기다린 이관은 409이고 자료를 보존한다', async state => {
    const f = await fixture(state === 'existing');
    const value = await preview(f);
    const before = await snapshot(f);
    const gate = holdNextTransaction();
    const assigning = assignMentor(request(`/api/mentees/${f.source}/mentor`, 'POST', { userId: ids.otherMentor }), params(f.source));
    let moving: ReturnType<typeof transfer> | undefined;
    try {
        const pid = await Promise.race([gate.locked, assigning.then(() => { throw new Error('배정이 잠금 전에 종료되었습니다.'); })]);
        moving = transfer(f, value.previewToken);
        await expectBlockedBy(pid);
        gate.release();
        expect((await assigning).status).toBe(200);
        expect((await moving).status).toBe(409);
        const after = await snapshot(f);
        expect({ ...after, assignments: before.assignments }).toEqual(before);
        expect(after.assignments.find(row => row.menteeId === f.source)).toMatchObject({ mentorId: ids.otherMentor });
        expect(after.assignments.find(row => row.menteeId === f.target)).toEqual(before.assignments.find(row => row.menteeId === f.target));
    } finally {
        gate.release();
        await Promise.allSettled([assigning, ...(moving ? [moving] : [])]);
        gate.restore();
    }
}, 15000);

it('소유권과 멘토 변경 뒤 멤버 정리에서 실패해도 실제 트랜잭션이 전체를 되돌린다', async () => {
    const f = await fixture();
    const value = await preview(f);
    const before = await snapshot(f);
    const run = db.$transaction.bind(db);
    const intercept = (callback: (tx: Prisma.TransactionClient) => Promise<unknown>) => run(tx => callback(new Proxy(tx, { get(client, key, receiver) {
        if (key !== 'projectMember') return Reflect.get(client, key, receiver);
        return new Proxy(client.projectMember, { get(delegate, method, delegateReceiver) {
            if (method === 'deleteMany') return () => { throw new Error('통합 검수용 멤버 정리 실패'); };
            return Reflect.get(delegate, method, delegateReceiver);
        } });
    } })));
    const spy = vi.spyOn(db, '$transaction').mockImplementationOnce(intercept as typeof db.$transaction);
    try {
        expect((await transfer(f, value.previewToken)).status).toBe(500);
        expect(await snapshot(f)).toEqual(before);
    } finally {
        spy.mockRestore();
    }
});

it('삭제 영향 확인 뒤 프로젝트 프로그램이 바뀌면 삭제를 409로 중단하고 새 프로그램과 기존 소유자·자료를 보존한다', async () => {
    const f = await fixture();
    await db.program.update({ where: { id: f.targetProgram }, data: { managerId: ids.admin } });
    const deleteToken = await deletionPreview(f.source);
    const before = await snapshot(f);
    const ready = signal<void>();
    const release = signal<void>();
    const racer = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    const run = db.$transaction.bind(db);
    type Options = { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel };
    // 소유 목록과 토큰의 검증은 실제 실행하고 첫 소유권 갱신 바로 앞에서만 멈춘다.
    const intercept = (callback: (tx: Prisma.TransactionClient) => Promise<unknown>, options?: Options) => run(tx => callback(new Proxy(tx, { get(client, key, receiver) {
        if (key !== 'project') return Reflect.get(client, key, receiver);
        return new Proxy(client.project, { get(delegate, method, delegateReceiver) {
            if (method !== 'updateMany') return Reflect.get(delegate, method, delegateReceiver);
            return async (args: Prisma.ProjectUpdateManyArgs) => {
                if (args.where?.id === f.project) {
                    ready.resolve();
                    await release.promise;
                }
                return delegate.updateMany(args);
            };
        } });
    } })), { ...options, timeout: 10000 });
    const spy = vi.spyOn(db, '$transaction').mockImplementationOnce(intercept as typeof db.$transaction);
    const deleting = deletion(f.source, deleteToken);
    try {
        await Promise.race([ready.promise, deleting.then(() => { throw new Error('삭제가 소유권 갱신 전에 종료되었습니다.'); })]);
        const moved = await racer.$transaction(tx => tx.project.update({ where: { id: f.project }, data: { programId: f.targetProgram } }), { timeout: 10000 });
        release.resolve();
        expect((await deleting).status).toBe(409);
        expect(await snapshot(f)).toEqual({
            ...before,
            project: { ...before.project, programId: f.targetProgram, updatedAt: moved.updatedAt },
        });
    } finally {
        release.resolve();
        await Promise.allSettled([deleting]);
        spy.mockRestore();
        await racer.$disconnect();
    }
}, 15000);
