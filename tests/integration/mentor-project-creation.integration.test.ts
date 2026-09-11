// 격리 DB와 실제 인증으로 멘토 대리 개설의 기본값·관리자 설정·배정·승인·동시성을 검증한다.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

const url = process.env.INTEGRATION_DATABASE_URL;
if (!url || url === process.env.POSTGRES_PRISMA_URL || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)) throw new Error('격리된 로컬 INTEGRATION_DATABASE_URL이 필요합니다.');
const db = new PrismaClient({ datasources: { db: { url } } });
const racer = new PrismaClient({ datasources: { db: { url } } });
vi.mock('../../lib/prisma', () => ({ get prisma() { return db; } }));
import { encodeSessionCookie } from '../../lib/auth';
import { PATCH as settings } from '../../app/api/admin/users/route';
import { POST as create } from '../../app/api/projects/route';
import { GET as options } from '../../app/api/projects/creation-options/route';
import { GET as profile } from '../../app/api/me/profile/route';
import { GET as readSpec, POST as saveSpec } from '../../app/api/projects/[id]/spec/route';
import { createProjectWithApproval } from '../../lib/project-creation-approval';

const prefix = `mentor_create_${randomUUID()}_`;
const ids = { admin: prefix + 'admin', pm: prefix + 'pm', mentor: prefix + 'mentor', otherMentor: prefix + 'other', mentee: prefix + 'mentee', stranger: prefix + 'stranger', program: prefix + 'program', otherProgram: prefix + 'otherprogram' };
const previousSecret = process.env.SESSION_SECRET;
let projectId: string;
function req(userId: string, method = 'GET', body?: unknown) {
    return new NextRequest('http://localhost/api/projects', { method, headers: { cookie: `session=${encodeSessionCookie({ userId, email: `${userId}@example.test`, name: userId })}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
const toggle = (actor: string, enabled: boolean, userId = ids.mentor) => settings(req(actor, 'PATCH', { userId, action: 'setMentorProjectCreation', enabled }));
const createRequest = (extra = {}) => create(req(ids.mentor, 'POST', { name: '대리 개설', ownerMenteeId: ids.mentee, ...extra }));
beforeAll(async () => {
    process.env.SESSION_SECRET = 'mentor-creation-isolated-integration';
    for (const [key, role] of [['admin', 'ADMIN'], ['pm', 'PROGRAM_MANAGER'], ['mentor', 'MENTOR'], ['otherMentor', 'MENTOR'], ['mentee', 'MENTEE'], ['stranger', 'MENTEE']] as const) {
        await db.user.create({ data: { id: ids[key], email: `${ids[key]}@example.test`, name: key, passwordHash: 'test-only', status: 'APPROVED', isAdmin: key === 'admin', role,
            profile: { create: { organization: '검수', phone: '01000000000', expertise: '검수', careerYears: 1, companyName: '검수', industry: '검수', privacyConsentAt: new Date() } },
        } });
    }
    for (const id of [ids.program, ids.otherProgram]) await db.program.create({ data: { id, name: '검수 프로그램', organization: '검수', managerId: ids.pm, startsAt: new Date(), endsAt: new Date('2099-01-01') } });
    await db.user.updateMany({ where: { id: { in: [ids.mentee, ids.stranger] } }, data: { programId: ids.program } });
    await db.mentorAssignment.create({ data: { menteeId: ids.mentee, mentorId: ids.mentor } });
});
afterAll(async () => {
    await db.project.deleteMany({ where: { ownerId: { in: [ids.mentee, ids.stranger] } } });
    await db.projectCreationRequest.deleteMany({ where: { menteeId: { in: [ids.mentee, ids.stranger] } } });
    await db.program.deleteMany({ where: { id: { in: [ids.program, ids.otherProgram] } } });
    await db.user.deleteMany({ where: { id: { in: Object.values(ids) } } });
    await Promise.all([db.$disconnect(), racer.$disconnect()]);
    if (previousSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previousSecret;
});

it('새 멘토는 기본 비활성이고 요청 본문으로 스스로 활성화할 수 없다', async () => {
    expect((await db.user.findUniqueOrThrow({ where: { id: ids.mentor } })).mentorProjectCreationEnabled).toBe(false);
    expect((await createRequest({ mentorProjectCreationEnabled: true })).status).toBe(403);
    expect((await options(req(ids.mentor))).status).toBe(403);
    expect((await (await profile(req(ids.mentor))).json()).mentorProjectCreationEnabled).toBe(false);
});
it('관리자만 멘토별로 설정하고 다른 멘토에는 영향이 없다', async () => {
    for (const actor of [ids.pm, ids.mentor, ids.mentee]) expect((await toggle(actor, true)).status).toBe(403);
    expect((await toggle(ids.admin, true, ids.mentee)).status).toBe(400);
    expect((await toggle(ids.admin, true)).status).toBe(200);
    expect((await (await profile(req(ids.mentor))).json()).mentorProjectCreationEnabled).toBe(true);
    expect((await db.user.findUniqueOrThrow({ where: { id: ids.otherMentor } })).mentorProjectCreationEnabled).toBe(false);
});
it('배정된 멘티만 목록에 나오며 비배정 소유자·다른 프로그램·본인 소유를 차단한다', async () => {
    const response = await options(req(ids.mentor));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.mentees.map((m: { id: string }) => m.id)).toEqual([ids.mentee]);
    expect(data.mentees[0].ownedProjectCount).toBe(0);
    expect(data.mentees[0].approvals).toEqual([]);
    for (const payload of [{ ownerMenteeId: ids.stranger }, { ownerMenteeId: ids.mentor }, { programId: ids.otherProgram }]) expect((await createRequest(payload)).status).toBe(403);
    expect(await db.project.count({ where: { programId: ids.program } })).toBe(0);
});
it('동시에 첫 프로젝트를 대리 개설해도 하나만 생기고 소유자는 멘티다', async () => {
    const responses = await Promise.all([createRequest(), createRequest()]);
    expect(responses.map(r => r.status).sort()).toEqual([200, 403]);
    const result = await responses.find(r => r.status === 200)!.json();
    expect(result.project.role).toBe('EDITOR');
    projectId = result.project.id;
    const project = await db.project.findUniqueOrThrow({ where: { id: projectId } });
    expect(project.ownerId).toBe(ids.mentee);
    expect(project.programId).toBe(ids.program);
    expect(await db.project.count({ where: { ownerId: ids.mentee } })).toBe(1);
});
it('추가 개설은 같은 멘티·프로그램의 승인 한 건을 한 번만 소비한다', async () => {
    const approved = await db.projectCreationRequest.create({ data: { menteeId: ids.mentee, programId: ids.program, reason: '추가 개발', status: 'APPROVED' } });
    const wrong = await db.projectCreationRequest.create({ data: { menteeId: ids.mentee, programId: ids.otherProgram, reason: '이전 소속', status: 'APPROVED' } });
    const other = await db.projectCreationRequest.create({ data: { menteeId: ids.stranger, programId: ids.program, reason: '타인 승인', status: 'APPROVED' } });
    const list = await (await options(req(ids.mentor))).json();
    expect(list.mentees[0].approvals).toEqual([{ id: approved.id, reason: '추가 개발' }]);
    for (const id of [wrong.id, other.id]) expect((await createRequest({ approvalRequestId: id })).status).toBe(403);
    const results = await Promise.all([createRequest({ approvalRequestId: approved.id }), createRequest({ approvalRequestId: approved.id })]);
    expect(results.map(r => r.status).sort()).toEqual([200, 403]);
    expect((await db.projectCreationRequest.findUniqueOrThrow({ where: { id: approved.id } })).usedAt).not.toBeNull();
    expect(await db.project.count({ where: { ownerId: ids.mentee } })).toBe(2);
});
it('비활성화 즉시 생성을 막되 배정 프로젝트 열람·수정은 유지한다', async () => {
    expect((await toggle(ids.admin, false)).status).toBe(200);
    expect((await createRequest()).status).toBe(403);
    expect((await options(req(ids.mentor))).status).toBe(403);
    const params = { params: Promise.resolve({ id: projectId }) };
    expect((await readSpec(req(ids.mentor), params)).status).toBe(200);
    expect((await saveSpec(req(ids.mentor, 'POST', { specFunctions: [{ name: '편집 유지', level: 'CORE', order: 0 }] }), params)).status).toBe(200);
});
it('다시 활성화해도 배정이 해제되면 생성·목록 접근을 차단한다', async () => {
    await toggle(ids.admin, true);
    await db.mentorAssignment.delete({ where: { menteeId: ids.mentee } });
    expect((await createRequest()).status).toBe(403);
    expect((await (await options(req(ids.mentor))).json()).mentees).toEqual([]);
    await db.mentorAssignment.create({ data: { menteeId: ids.mentee, mentorId: ids.mentor } });
});
it.each(['disable', 'unassign'] as const)('진행 중인 %s 변경을 기다린 생성도 최신 권한으로 거절하고 승인을 보존한다', async action => {
    await db.user.update({ where: { id: ids.mentor }, data: { mentorProjectCreationEnabled: true } });
    const approval = await db.projectCreationRequest.create({ data: { menteeId: ids.mentee, programId: ids.program, reason: '경합 검수', status: 'APPROVED' } });
    let pending: Promise<unknown>;
    await racer.$transaction(async tx => {
        if (action === 'disable') await tx.user.update({ where: { id: ids.mentor }, data: { mentorProjectCreationEnabled: false } });
        else await tx.mentorAssignment.delete({ where: { menteeId: ids.mentee } });
        pending = createProjectWithApproval({ id: prefix + randomUUID(), name: '차단 대상', ownerId: ids.mentee, programId: ids.program }, true, approval.id, ids.mentor).catch(error => error);
        let blocked = false;
        for (let attempt = 0; attempt < 50; attempt++) {
            const rows = await db.$queryRaw<{ blocked: boolean }[]>`SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%FOR UPDATE%') AS blocked`;
            if (rows[0].blocked) { blocked = true; break; }
            await new Promise(resolve => setTimeout(resolve, 20));
        }
        expect(blocked).toBe(true);
    });
    expect(await pending!).toBeInstanceOf(Error);
    expect(await db.project.count({ where: { ownerId: ids.mentee } })).toBe(2);
    expect((await db.projectCreationRequest.findUniqueOrThrow({ where: { id: approval.id } })).usedAt).toBeNull();
});
