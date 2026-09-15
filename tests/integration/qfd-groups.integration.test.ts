// 격리 PostgreSQL에서 WS-9 그룹의 저장·삭제·재조회·권한·동시 변경을 검증한다.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

const dbUrl = process.env.INTEGRATION_DATABASE_URL;
if (!dbUrl || dbUrl === process.env.POSTGRES_PRISMA_URL || !['localhost', '127.0.0.1'].includes(new URL(dbUrl).hostname)
    || new URL(dbUrl).pathname !== '/program_restore_qa') throw new Error('별도 로컬 program_restore_qa DB가 필요합니다.');
const db = new PrismaClient({ datasources: { db: { url: dbUrl } } });
vi.mock('../../lib/prisma', () => ({ get prisma() { return db; } }));
import { encodeSessionCookie } from '../../lib/auth';
import { SESSION_COOKIE_NAME } from '../../lib/constants';
import { GET, POST, PATCH, DELETE } from '../../app/api/projects/[id]/qfd/technical/route';

const prefix = 'qfd_groups_' + randomUUID() + '_';
const ownerId = prefix + 'admin';
const viewerId = prefix + 'manager';
const programId = prefix + 'program';
const oldSecret = process.env.SESSION_SECRET;
function request(projectId: string, method: string, body?: object, userId = ownerId) {
    return new NextRequest('http://localhost/api/projects/' + projectId + '/qfd/technical', {
        method, headers: { 'Content-Type': 'application/json', cookie: SESSION_COOKIE_NAME + '=' + encodeSessionCookie({ userId, email: userId + '@example.com', name: '격리검수' }) },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
}
function params(id: string) { return { params: Promise.resolve({ id }) }; }
async function project(suffix: string) {
    return db.project.create({ data: { id: prefix + suffix, name: 'WS-9 격리 검수', ownerId, programId } });
}
async function add(projectId: string, name: string, groupIndex?: number) {
    const response = await POST(request(projectId, 'POST', { name, ...(groupIndex === undefined ? {} : { groupIndex }) }), params(projectId));
    expect(response.status).toBe(200);
    return (await response.json()).technicalCharacteristic as { id: string; name: string; groupIndex: number; columnOrder: number };
}
async function list(projectId: string) {
    const response = await GET(request(projectId, 'GET'), params(projectId));
    expect(response.status).toBe(200);
    return (await response.json()).technicalCharacteristics as { id: string; name: string; groupIndex: number }[];
}
beforeAll(async () => {
    process.env.SESSION_SECRET = 'isolated-qfd-groups-integration-session-secret';
    await db.user.createMany({ data: [
        { id: ownerId, email: ownerId + '@example.com', name: '검수 관리자', passwordHash: 'isolated', role: 'ADMIN', isAdmin: true, status: 'APPROVED' },
        { id: viewerId, email: viewerId + '@example.com', name: '검수 매니저', passwordHash: 'isolated', role: 'PROGRAM_MANAGER', status: 'APPROVED' },
    ] });
    for (const userId of [ownerId, viewerId]) {
        await db.user.update({ where: { id: userId }, data: { profile: { create: { organization: '격리검수', phone: '01000000000', expertise: '검수', careerYears: 1, privacyConsentAt: new Date() } } } });
    }
    await db.program.create({ data: { id: programId, name: 'WS-9 격리 검수', organization: '검수기관', managerId: ownerId, startsAt: new Date('2020-01-01'), endsAt: new Date('2099-01-01') } });
});
afterAll(async () => {
    try {
        await db.project.deleteMany({ where: { id: { startsWith: prefix } } });
        await db.program.deleteMany({ where: { id: programId } });
        await db.user.deleteMany({ where: { id: { in: [ownerId, viewerId] } } });
    } finally {
        await db.$disconnect();
        if (oldSecret === undefined) delete process.env.SESSION_SECRET;
        else process.env.SESSION_SECRET = oldSecret;
    }
});

it('마이그레이션은 기존 세부기능 ID와 3열 그룹·순서를 보존한다', async () => {
    const migration = readFileSync(new URL('../../prisma/migrations/20260915024500_qfd_technical_groups/migration.sql', import.meta.url), 'utf8');
    await db.$transaction(async tx => {
        await tx.$executeRawUnsafe('CREATE TEMP TABLE projects (id TEXT PRIMARY KEY) ON COMMIT DROP');
        await tx.$executeRawUnsafe('CREATE TEMP TABLE technical_characteristics (id TEXT PRIMARY KEY, "projectId" TEXT, name TEXT) ON COMMIT DROP');
        await tx.$executeRawUnsafe("INSERT INTO pg_temp.projects VALUES ('a'), ('b'), ('empty')");
        await tx.$executeRawUnsafe("INSERT INTO pg_temp.technical_characteristics VALUES ('a4','a','four'),('a1','a','one'),('a3','a','three'),('a2','a','two'),('b1','b','other')");
        for (const sql of migration.split(';').map(s => s.trim()).filter(Boolean)) await tx.$executeRawUnsafe(sql);
        expect(await tx.$queryRawUnsafe('SELECT id, "groupIndex", "columnOrder" FROM pg_temp.technical_characteristics ORDER BY id')).toEqual([
            { id: 'a1', groupIndex: 0, columnOrder: 0 }, { id: 'a2', groupIndex: 0, columnOrder: 1 },
            { id: 'a3', groupIndex: 0, columnOrder: 2 }, { id: 'a4', groupIndex: 1, columnOrder: 3 },
            { id: 'b1', groupIndex: 0, columnOrder: 0 },
        ]);
        expect(await tx.$queryRawUnsafe('SELECT id, "qfdTechnicalInitialized" FROM pg_temp.projects ORDER BY id')).toEqual([
            { id: 'a', qfdTechnicalInitialized: true }, { id: 'b', qfdTechnicalInitialized: true }, { id: 'empty', qfdTechnicalInitialized: false },
        ]);
    });
});

it('최초 동시 조회는 한 번만 채우고 삭제 후 조회는 기능을 되살리지 않는다', async () => {
    const p = await project('initial');
    await db.techTreeEntry.createMany({ data: ['기능1', '기능2', '기능3', '기능4', ' 기능1 ', '', null].map((subSpec, order) => ({ projectId: p.id, subSpec, order })) });
    const results = await Promise.all([list(p.id), list(p.id)]);
    expect(results[0]).toHaveLength(4);
    expect(results[1]).toHaveLength(4);
    const rows = results[0];
    expect(rows.map(t => t.groupIndex)).toEqual([0, 0, 0, 1]);
    expect((await DELETE(request(p.id, 'DELETE', { id: rows[0].id }), params(p.id))).status).toBe(200);
    expect((await list(p.id)).map(t => t.id)).toEqual(rows.slice(1).map(t => t.id));
    for (const groupIndex of [0, 1]) {
        const ids = rows.slice(1).filter(t => t.groupIndex === groupIndex).map(t => t.id);
        expect((await DELETE(request(p.id, 'DELETE', { groupIndex, ids }), params(p.id))).status).toBe(200);
    }
    expect(await list(p.id)).toEqual([]);
    expect((await db.project.findUniqueOrThrow({ where: { id: p.id } })).qfdTechnicalInitialized).toBe(true);
    expect((await add(p.id, '새 기능')).groupIndex).toBe(0);
});

it('이름 있는 기능으로만 그룹을 만들고 기존 그룹에 추가·수정한다', async () => {
    const p = await project('crud');
    expect((await POST(request(p.id, 'POST', { name: '  ' }), params(p.id))).status).toBe(400);
    expect((await POST(request(p.id, 'POST', { name: '기능', groupIndex: 3 }), params(p.id))).status).toBe(409);
    expect(await db.technicalCharacteristic.count({ where: { projectId: p.id } })).toBe(0);
    const a = await add(p.id, ' 기능1 ');
    const b = await add(p.id, '기능2', a.groupIndex);
    const c = await add(p.id, '기능3');
    expect([a.name, a.groupIndex, b.groupIndex, c.groupIndex]).toEqual(['기능1', 0, 0, 1]);
    expect(b.columnOrder).toBeGreaterThan(a.columnOrder);
    expect((await POST(request(p.id, 'POST', { name: '기능1' }), params(p.id))).status).toBe(409);
    expect((await PATCH(request(p.id, 'PATCH', { id: a.id, name: '   ' }), params(p.id))).status).toBe(400);
    expect((await PATCH(request(p.id, 'PATCH', { id: a.id, name: '기능2' }), params(p.id))).status).toBe(409);
    expect((await PATCH(request(p.id, 'PATCH', { id: a.id, name: '수정 기능', unit: 'ms', targetValue: '100' }), params(p.id))).status).toBe(200);
    const updated = await db.technicalCharacteristic.findUniqueOrThrow({ where: { id: a.id } });
    expect([updated.groupIndex, updated.columnOrder, updated.name, updated.unit, updated.targetValue]).toEqual([0, 0, '수정 기능', 'ms', '100']);
});

it('그룹 삭제는 연결 자료만 정리하며 나머지 그룹의 관계 강도를 보존한다', async () => {
    const p = await project('cascade');
    const a = await add(p.id, '삭제1'), b = await add(p.id, '삭제2', a.groupIndex), keep = await add(p.id, '보존');
    const req = await db.customerRequirement.create({ data: { projectId: p.id, category: '품질', requirement: '요구', order: 0 } });
    for (const tech of [a, b, keep]) {
        await db.qFDMatrix.create({ data: { projectId: p.id, requirementId: req.id, technicalCharId: tech.id, strength: 'STRONG' } });
        await db.technicalBenchmark.create({ data: { projectId: p.id, technicalCharId: tech.id, company: 'self', value: '10' } });
    }
    await db.techCorrelation.create({ data: { projectId: p.id, techId1: a.id, techId2: keep.id, correlation: 'POSITIVE' } });
    const response = await DELETE(request(p.id, 'DELETE', { groupIndex: a.groupIndex, ids: [a.id, b.id] }), params(p.id));
    expect(response.status).toBe(200);
    expect(await list(p.id)).toEqual([expect.objectContaining({ id: keep.id, groupIndex: 1 })]);
    expect(await db.qFDMatrix.findMany({ where: { projectId: p.id }, select: { technicalCharId: true, strength: true } })).toEqual([{ technicalCharId: keep.id, strength: 'STRONG' }]);
    expect(await db.technicalBenchmark.findMany({ where: { projectId: p.id }, select: { technicalCharId: true } })).toEqual([{ technicalCharId: keep.id }]);
    expect(await db.techCorrelation.count({ where: { projectId: p.id } })).toBe(0);
    expect(await db.customerRequirement.count({ where: { projectId: p.id } })).toBe(1);
});

it('확인 후 그룹에 추가된 기능과 다른 프로젝트의 기능은 삭제하지 않는다', async () => {
    const p = await project('stale'), other = await project('other');
    const a = await add(p.id, '기능1'), b = await add(p.id, '기능2', a.groupIndex), foreign = await add(other.id, '외부');
    expect((await DELETE(request(p.id, 'DELETE', { groupIndex: a.groupIndex, ids: [a.id] }), params(p.id))).status).toBe(409);
    expect((await DELETE(request(p.id, 'DELETE', { groupIndex: a.groupIndex, ids: [a.id, foreign.id] }), params(p.id))).status).toBe(409);
    expect((await DELETE(request(p.id, 'DELETE', { id: foreign.id }), params(p.id))).status).toBe(404);
    expect((await PATCH(request(p.id, 'PATCH', { id: foreign.id, name: '침범' }), params(p.id))).status).toBe(404);
    expect((await list(p.id)).map(t => t.id)).toEqual([a.id, b.id]);
    expect(await db.technicalCharacteristic.findUnique({ where: { id: foreign.id } })).not.toBeNull();
});

it('읽기 전용 사용자의 조회는 초기화하지 않으며 모든 그룹 쓰기는 거부한다', async () => {
    const p = await project('readonly');
    await db.techTreeEntry.create({ data: { projectId: p.id, subSpec: '자동 채움 후보' } });
    const response = await GET(request(p.id, 'GET', undefined, viewerId), params(p.id));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ technicalCharacteristics: [], canWrite: false });
    expect((await db.project.findUniqueOrThrow({ where: { id: p.id } })).qfdTechnicalInitialized).toBe(false);
    for (const [handler, method, body] of [[POST, 'POST', { name: '추가' }], [PATCH, 'PATCH', { id: 'x', name: '수정' }], [DELETE, 'DELETE', { groupIndex: 0, ids: ['x'] }]] as const) {
        expect((await handler(request(p.id, method, body, viewerId), params(p.id))).status).toBe(403);
    }
});

it('동시 그룹 생성은 별도 그룹으로 저장하고 같은 세부기능 중복 생성은 막는다', async () => {
    const p = await project('concurrent');
    const rows = await Promise.all([add(p.id, '동시1'), add(p.id, '동시2')]);
    expect(new Set(rows.map(t => t.groupIndex)).size).toBe(2);
    const repeated = await Promise.all([1, 2].map(() => POST(request(p.id, 'POST', { name: '중복' }), params(p.id))));
    expect(repeated.map(r => r.status).sort()).toEqual([200, 409]);
    expect(await db.technicalCharacteristic.count({ where: { projectId: p.id, name: '중복' } })).toBe(1);
});

it('그룹 삭제와 기능 추가가 겹치면 확인하지 않은 기능을 삭제하지 않는다', async () => {
    const p = await project('race'), a = await add(p.id, '원래 기능');
    const results = await Promise.all([
        DELETE(request(p.id, 'DELETE', { groupIndex: a.groupIndex, ids: [a.id] }), params(p.id)),
        POST(request(p.id, 'POST', { groupIndex: a.groupIndex, name: '동시 추가' }), params(p.id)),
    ]);
    expect(results.map(r => r.status).sort()).toEqual([200, 409]);
    const rows = await list(p.id);
    if (results[1].status === 200) expect(rows.map(t => t.name)).toEqual(['원래 기능', '동시 추가']);
    else expect(rows).toEqual([]);
});
