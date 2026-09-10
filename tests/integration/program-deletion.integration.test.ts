// 격리 PostgreSQL에서 관리자 프로그램 삭제의 자료 보존과 동시 회원 배정 경합을 검증한다.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { Prisma, PrismaClient } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';

const dbUrl = process.env.INTEGRATION_DATABASE_URL;
if (!dbUrl || dbUrl === process.env.POSTGRES_PRISMA_URL || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(dbUrl).hostname)) {
    throw new Error('운영 DB와 분리된 로컬 INTEGRATION_DATABASE_URL이 필요합니다.');
}
const db = new PrismaClient({ datasources: { db: { url: dbUrl } } });
const racer = new PrismaClient({ datasources: { db: { url: dbUrl } } });
vi.mock('../../lib/prisma', () => ({ get prisma() { return db; } }));
import { encodeSessionCookie, requireAuth } from '../../lib/auth';
import { SESSION_COOKIE_NAME } from '../../lib/constants';
import { GET, DELETE } from '../../app/api/programs/[id]/route';

const prefix = `program_delete_${randomUUID()}_`;
const adminId = `${prefix}admin`;
const managerId = `${prefix}manager`;
const originalSessionSecret = process.env.SESSION_SECRET;

function request(id: string, method: 'GET' | 'DELETE', userId: string | null = adminId, counts = { inviteCount: 0, requestCount: 0 }) {
    return new NextRequest(`http://localhost/api/programs/${id}`, {
        method,
        headers: { 'Content-Type': 'application/json', ...(userId ? { cookie: `${SESSION_COOKIE_NAME}=${encodeSessionCookie({ userId, email: `${userId}@example.com`, name: userId })}` } : {}) },
        ...(method === 'DELETE' ? { body: JSON.stringify({ confirm: true, ...counts }) } : {}),
    });
}

function params(id: string) { return { params: Promise.resolve({ id }) }; }

function seedProgram(suffix: string) {
    return db.program.create({ data: {
        id: prefix + suffix, name: `삭제 검수 ${suffix}`, organization: '격리 검수기관',
        managerId: adminId, startsAt: new Date('2020-01-01'), endsAt: new Date('2099-01-01'),
    } });
}

function seedMentee(suffix: string, programId: string) {
    return db.user.create({ data: {
        id: prefix + suffix, email: `${prefix}${suffix}@example.com`, name: suffix, passwordHash: 'isolated-test',
        role: 'MENTEE', status: 'APPROVED', programId,
        profile: { create: { organization: '격리 검수기관', phone: '01000000000', companyName: '검수기업', industry: '검수', privacyConsentAt: new Date() } },
    } });
}

function seedInvite(suffix: string, programId: string, used?: { usedAt: Date | null; usedById: string | null }) {
    return db.inviteCode.create({ data: {
        id: prefix + suffix, code: prefix + suffix, email: `${prefix}${suffix}@example.com`, role: 'MENTEE',
        programId, issuedById: adminId, expiresAt: new Date('2099-01-01'), ...used,
    } });
}

beforeAll(async () => {
    process.env.SESSION_SECRET = 'isolated-program-deletion-integration-secret';
    for (const [id, role] of [[adminId, 'ADMIN'], [managerId, 'PROGRAM_MANAGER']] as const) {
        await db.user.create({ data: {
            id, email: `${id}@example.com`, name: role, passwordHash: 'isolated-test', role, isAdmin: role === 'ADMIN', status: 'APPROVED',
            profile: { create: { organization: '격리 검수기관', phone: '01000000000', expertise: '검수', careerYears: 1, privacyConsentAt: new Date() } },
        } });
    }
});

afterAll(async () => {
    vi.restoreAllMocks();
    try {
        await db.project.deleteMany({ where: { id: { startsWith: prefix } } });
        await db.projectCreationRequest.deleteMany({ where: { id: { startsWith: prefix } } });
        await db.inviteCode.deleteMany({ where: { id: { startsWith: prefix } } });
        await db.user.deleteMany({ where: { id: { startsWith: prefix, notIn: [adminId, managerId] } } });
        await db.program.deleteMany({ where: { id: { startsWith: prefix } } });
        await db.user.deleteMany({ where: { id: { in: [adminId, managerId] } } });
    } finally {
        await Promise.all([db.$disconnect(), racer.$disconnect()]);
        if (originalSessionSecret === undefined) delete process.env.SESSION_SECRET;
        else process.env.SESSION_SECRET = originalSessionSecret;
    }
});

it('실제 관리자 세션만 빈 프로그램을 삭제하고 다른 프로그램은 보존한다', async () => {
    const target = await seedProgram('empty');
    const other = await seedProgram('unrelated');
    expect((await GET(request(target.id, 'GET', null), params(target.id))).status).toBe(401);
    expect((await DELETE(request(target.id, 'DELETE', managerId), params(target.id))).status).toBe(403);
    expect(await db.program.findUnique({ where: { id: target.id } })).not.toBeNull();
    const preview = await GET(request(target.id, 'GET'), params(target.id));
    expect((await preview.json()).program).toMatchObject({ projectCount: 0, menteeCount: 0, canDelete: true });
    const result = await DELETE(request(target.id, 'DELETE'), params(target.id));
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ success: true, deletedProgram: target.name });
    expect(await db.program.findUnique({ where: { id: target.id } })).toBeNull();
    expect(await db.program.findUnique({ where: { id: other.id } })).toEqual(other);
    expect((await DELETE(request(target.id, 'DELETE'), params(target.id))).status).toBe(404);
});

it('연결된 프로젝트와 작성 내용이 있으면 삭제하지 않는다', async () => {
    const target = await seedProgram('project_blocked');
    const project = await db.project.create({ data: {
        id: `${prefix}project`, name: '보존할 프로젝트', description: '원래 작성 내용', ownerId: adminId, programId: target.id,
        specFunctions: { create: { id: `${prefix}spec`, level: 'core', name: '보존할 핵심 스펙', technology: '보존할 기술적 특성' } },
        worksheetComments: { create: { id: `${prefix}comment`, worksheetId: 'spec', authorId: adminId, content: '보존할 의견' } },
    }, include: { specFunctions: true, worksheetComments: true } });
    const result = await DELETE(request(target.id, 'DELETE'), params(target.id));
    expect(result.status).toBe(409);
    expect((await result.json()).program.projectCount).toBe(1);
    expect(await db.program.findUnique({ where: { id: target.id } })).toEqual(target);
    expect(await db.project.findUnique({ where: { id: project.id }, include: { specFunctions: true, worksheetComments: true } })).toEqual(project);
});

it('소속 멘티가 있으면 계정과 프로그램 소속을 보존한다', async () => {
    const target = await seedProgram('mentee_blocked');
    const mentee = await seedMentee('attached_mentee', target.id);
    const result = await DELETE(request(target.id, 'DELETE'), params(target.id));
    expect(result.status).toBe(409);
    expect((await result.json()).program.menteeCount).toBe(1);
    expect(await db.program.findUnique({ where: { id: target.id } })).toEqual(target);
    expect(await db.user.findUnique({ where: { id: mentee.id } })).toEqual(mentee);
});

it.each(['both', 'usedAt', 'usedById'] as const)('이동한 멘티의 사용 초대코드는 %s가 남아 있어도 보존한다', async usage => {
    const oldProgram = await seedProgram(`invite_old_${usage}`);
    const newProgram = await seedProgram(`invite_new_${usage}`);
    const mentee = await seedMentee(`moved_mentee_${usage}`, newProgram.id);
    const invite = await seedInvite(`used_invite_${usage}`, oldProgram.id, {
        usedAt: usage === 'usedById' ? null : new Date(), usedById: usage === 'usedAt' ? null : mentee.id,
    });
    const beforeAuth = await requireAuth(request(oldProgram.id, 'GET', mentee.id));
    const preview = await GET(request(oldProgram.id, 'GET'), params(oldProgram.id));
    expect((await preview.json()).program).toMatchObject({ projectCount: 0, menteeCount: 0, usedInviteCount: 1, canDelete: false });
    expect((await DELETE(request(oldProgram.id, 'DELETE'), params(oldProgram.id))).status).toBe(409);
    expect(await db.program.findUnique({ where: { id: oldProgram.id } })).toEqual(oldProgram);
    expect(await db.inviteCode.findUnique({ where: { id: invite.id } })).toEqual(invite);
    expect(await db.user.findUnique({ where: { id: mentee.id } })).toEqual(mentee);
    // 프로그램 불일치로 이미 거절된 계정도 코드 삭제 때문에 권한이 달라지지 않는다.
    const afterAuth = await requireAuth(request(oldProgram.id, 'GET', mentee.id));
    if (beforeAuth instanceof NextResponse) {
        expect(afterAuth).toBeInstanceOf(NextResponse);
        expect((afterAuth as NextResponse).status).toBe(beforeAuth.status);
        expect(await (afterAuth as NextResponse).json()).toEqual(await beforeAuth.json());
    } else {
        expect(afterAuth).toEqual(beforeAuth);
    }
});

it('대상의 미사용 초대와 신청 이력만 cascade 삭제하고 다른 자료는 보존한다', async () => {
    const target = await seedProgram('cascade_target');
    const other = await seedProgram('cascade_other');
    const mentee = await seedMentee('requester', other.id);
    const invite = await seedInvite('unused_target', target.id);
    const otherInvite = await seedInvite('unused_other', other.id);
    const application = await db.projectCreationRequest.create({ data: { id: `${prefix}request_target`, menteeId: mentee.id, programId: target.id, reason: '이관 전 신청', status: 'REJECTED' } });
    const otherApplication = await db.projectCreationRequest.create({ data: { id: `${prefix}request_other`, menteeId: mentee.id, programId: other.id, reason: '유지할 신청', status: 'PENDING' } });
    const preview = await GET(request(target.id, 'GET'), params(target.id));
    expect((await preview.json()).program).toMatchObject({ inviteCount: 1, requestCount: 1, canDelete: true });
    expect((await DELETE(request(target.id, 'DELETE', adminId, { inviteCount: 1, requestCount: 1 }), params(target.id))).status).toBe(200);
    expect(await db.program.findUnique({ where: { id: target.id } })).toBeNull();
    expect(await db.inviteCode.findUnique({ where: { id: invite.id } })).toBeNull();
    expect(await db.projectCreationRequest.findUnique({ where: { id: application.id } })).toBeNull();
    expect(await db.program.findUnique({ where: { id: other.id } })).toEqual(other);
    expect(await db.inviteCode.findUnique({ where: { id: otherInvite.id } })).toEqual(otherInvite);
    expect(await db.projectCreationRequest.findUnique({ where: { id: otherApplication.id } })).toEqual(otherApplication);
    expect(await db.user.findUnique({ where: { id: mentee.id } })).toEqual(mentee);
});

it('미리보기 이후 발급된 초대코드는 새 건수를 확인하기 전까지 삭제하지 않는다', async () => {
    const target = await seedProgram('preview_changed');
    const preview = await GET(request(target.id, 'GET'), params(target.id));
    expect((await preview.json()).program.inviteCount).toBe(0);
    const added = await seedInvite('added_after_preview', target.id);
    const result = await DELETE(request(target.id, 'DELETE'), params(target.id));
    expect(result.status).toBe(409);
    expect((await result.json()).program).toMatchObject({ inviteCount: 1, canDelete: true });
    expect(await db.inviteCode.findUnique({ where: { id: added.id } })).toEqual(added);
    expect(await db.program.findUnique({ where: { id: target.id } })).toEqual(target);
    expect((await DELETE(request(target.id, 'DELETE', adminId, { inviteCount: 1, requestCount: 0 }), params(target.id))).status).toBe(200);
});

function signal<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(done => { resolve = done; });
    return { promise, resolve };
}

it('삭제 행 잠금 중 시작한 회원 배정은 대기 후 거절되고 기존 소속을 잃지 않는다', async () => {
    const target = await seedProgram('race_target');
    const original = await seedProgram('race_original');
    const mentee = await seedMentee('race_mentee', original.id);
    const locked = signal<void>();
    const release = signal<void>();
    const writerStarted = signal<number>();
    const runTransaction = db.$transaction.bind(db);
    type TransactionOptions = { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel };
    // 실제 SQL과 트랜잭션을 유지하고 FOR UPDATE가 잠금을 획득한 직후만 정지한다.
    const intercept = async (callback: (tx: Prisma.TransactionClient) => Promise<unknown>, options?: TransactionOptions) => runTransaction(async tx => {
        const gated = new Proxy(tx, { get(client, key, receiver) {
            if (key !== '$queryRaw') return Reflect.get(client, key, receiver);
            return async (...args: Parameters<Prisma.TransactionClient['$queryRaw']>) => {
                const rows = await client.$queryRaw(...args);
                locked.resolve();
                await release.promise;
                return rows;
            };
        } });
        return callback(gated);
    }, options);
    const transactionSpy = vi.spyOn(db, '$transaction').mockImplementationOnce(intercept as typeof db.$transaction);
    const deleting = DELETE(request(target.id, 'DELETE'), params(target.id));
    let assigning: Promise<PromiseSettledResult<unknown>> | undefined;
    try {
        expect(await Promise.race([locked.promise.then(() => true), deleting.then(() => false)])).toBe(true);
        assigning = racer.$transaction(async tx => {
            const [row] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
            writerStarted.resolve(row.pid);
            return tx.user.update({ where: { id: mentee.id }, data: { programId: target.id } });
        }, { timeout: 10000 }).then(value => ({ status: 'fulfilled', value }), reason => ({ status: 'rejected', reason }));
        const writerPid = await writerStarted.promise;
        await vi.waitFor(async () => {
            const [activity] = await db.$queryRaw<{ wait_event_type: string | null }[]>`SELECT wait_event_type FROM pg_stat_activity WHERE pid = ${writerPid}`;
            expect(activity?.wait_event_type).toBe('Lock');
        }, { timeout: 3000, interval: 20 });
        release.resolve();
        expect((await deleting).status).toBe(200);
        const assigned = await assigning;
        expect(assigned.status).toBe('rejected');
        if (assigned.status === 'rejected') expect(assigned.reason).toMatchObject({ code: 'P2003' });
        expect(await db.program.findUnique({ where: { id: target.id } })).toBeNull();
        expect(await db.user.findUnique({ where: { id: mentee.id } })).toEqual(mentee);
        expect(await db.program.findUnique({ where: { id: original.id } })).toEqual(original);
    } finally {
        release.resolve();
        await Promise.allSettled([deleting, ...(assigning ? [assigning] : [])]);
        transactionSpy.mockRestore();
    }
}, 15000);
