// 격리 PostgreSQL과 실제 세션 인가로 배정·승인·코멘트 및 동시 생성 제한을 검수한다.
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

const dbUrl = process.env.INTEGRATION_DATABASE_URL;
if (!dbUrl || dbUrl === process.env.POSTGRES_PRISMA_URL) throw new Error('별도 INTEGRATION_DATABASE_URL이 필요합니다.');
const db = new PrismaClient({ datasources: { db: { url: dbUrl } } });
vi.mock('../../lib/prisma', () => ({ get prisma() { return db; } }));
import { encodeSessionCookie } from '../../lib/auth';
import { POST as createProject } from '../../app/api/projects/route';
import { POST as assign, DELETE as unassign } from '../../app/api/mentees/[id]/mentor/route';
import { POST as requestApproval, PATCH as reviewApproval } from '../../app/api/project-requests/route';
import { GET as readSpec, POST as saveSpec } from '../../app/api/projects/[id]/spec/route';
import { GET as readComments, POST as comment, PATCH as editComment } from '../../app/api/projects/[id]/comments/route';
import { createProjectWithApproval } from '../../lib/project-creation-approval';

const prefix = `mentoring_${Date.now()}_`;
const ids = { admin: prefix + 'admin', pm: prefix + 'pm', otherPm: prefix + 'otherpm', mentor: prefix + 'mentor', mentee: prefix + 'mentee', program: prefix + 'program' };
function req(userId: string, path: string, method: string, body?: unknown) {
    return new NextRequest(`http://localhost${path}`, { method,
        headers: { cookie: `session=${encodeSessionCookie({ userId, email: `${userId}@example.com`, name: userId })}`, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
}
let projectId: string;
beforeAll(async () => {
    process.env.SESSION_SECRET = 'isolated-mentoring-integration-secret';
    for (const [key, role] of [['admin', 'ADMIN'], ['pm', 'PROGRAM_MANAGER'], ['otherPm', 'PROGRAM_MANAGER'], ['mentor', 'MENTOR'], ['mentee', 'MENTEE']] as const) {
        await db.user.create({ data: { id: ids[key], email: `${ids[key]}@example.com`, name: key, passwordHash: 'isolated-test', role, isAdmin: key === 'admin', status: 'APPROVED',
            profile: { create: { organization: '검수기관', phone: '01000000000', expertise: '검수', careerYears: 1, companyName: '검수기업', industry: '검수', privacyConsentAt: new Date() } },
        } });
    }
    await db.program.create({ data: { id: ids.program, name: '격리 검수', organization: '검수기관', managerId: ids.pm, startsAt: new Date(), endsAt: new Date('2099-01-01') } });
    await db.user.update({ where: { id: ids.mentee }, data: { programId: ids.program } });
});
afterAll(async () => {
    await db.project.deleteMany({ where: { ownerId: ids.mentee } });
    await db.projectCreationRequest.deleteMany({ where: { menteeId: ids.mentee } });
    await db.program.deleteMany({ where: { id: ids.program } });
    await db.user.deleteMany({ where: { id: { in: [ids.admin, ids.pm, ids.otherPm, ids.mentor, ids.mentee] } } });
    await db.$disconnect();
});

it('동시 첫 개설 요청 중 하나만 생성하고 나머지는 승인 요구로 거절한다', async () => {
    const results = await Promise.all([1, 2].map(n => createProject(req(ids.mentee, '/api/projects', 'POST', { name: `검수 ${n}` }))));
    expect(results.map(r => r.status).sort()).toEqual([200, 403]);
    expect(await db.project.count({ where: { ownerId: ids.mentee } })).toBe(1);
    projectId = (await db.project.findFirstOrThrow({ where: { ownerId: ids.mentee } })).id;
});

it('담당 PM만 배정하고, 배정 멘토도 기존 EDITOR 권한으로 본문을 수정할 수 없다', async () => {
    const params = { params: Promise.resolve({ id: ids.mentee }) };
    expect((await assign(req(ids.otherPm, '/api/mentees/x/mentor', 'POST', { userId: ids.mentor }), params)).status).toBe(403);
    expect((await assign(req(ids.pm, '/api/mentees/x/mentor', 'POST', { userId: ids.mentor }), params)).status).toBe(200);
    expect(await db.mentorAssignment.count({ where: { menteeId: ids.mentee } })).toBe(1);
    await db.projectMember.create({ data: { id: prefix + 'member', projectId, userId: ids.mentor, role: 'EDITOR' } });
    const projectParams = { params: Promise.resolve({ id: projectId }) };
    expect((await readSpec(req(ids.mentor, '/api/projects/x/spec', 'GET'), projectParams)).status).toBe(200);
    expect((await saveSpec(req(ids.mentor, '/api/projects/x/spec', 'POST', { specFunctions: [] }), projectParams)).status).toBe(403);
    expect(await db.specFunction.count({ where: { projectId } })).toBe(0);
});

it('워크시트별 코멘트를 보존하고 타인의 수정 및 해제 후 접근을 차단한다', async () => {
    const params = { params: Promise.resolve({ id: projectId }) };
    const response = await comment(req(ids.mentor, '/api/projects/x/comments?worksheetId=spec', 'POST', { content: '격리 검수 의견' }), params);
    expect(response.status).toBe(201);
    const id = (await response.json()).comment.id;
    const otherSheet = await readComments(req(ids.mentee, '/api/projects/x/comments?worksheetId=qfd', 'GET'), params);
    expect((await otherSheet.json()).comments).toHaveLength(0);
    const ownSheet = await readComments(req(ids.mentee, '/api/projects/x/comments?worksheetId=spec', 'GET'), params);
    expect((await ownSheet.json()).comments).toHaveLength(1);
    expect((await editComment(req(ids.admin, '/api/projects/x/comments?worksheetId=spec', 'PATCH', { id, content: '타인 수정' }), params)).status).toBe(403);
    expect((await unassign(req(ids.pm, '/api/mentees/x/mentor', 'DELETE', { userId: ids.mentor }), { params: Promise.resolve({ id: ids.mentee }) })).status).toBe(200);
    expect((await readSpec(req(ids.mentor, '/api/projects/x/spec', 'GET'), params)).status).toBe(403);
    expect(await db.worksheetComment.count({ where: { projectId } })).toBe(1);
});

it('승인 한 건에 동시 개설을 보내도 한 번만 소비한다', async () => {
    const application = await requestApproval(req(ids.mentee, '/api/project-requests', 'POST', { reason: '별도 개발' }));
    expect(application.status).toBe(201);
    const requestId = (await application.json()).request.id;
    expect((await reviewApproval(req(ids.otherPm, '/api/project-requests', 'PATCH', { requestId, status: 'APPROVED' }))).status).toBe(403);
    expect((await reviewApproval(req(ids.pm, '/api/project-requests', 'PATCH', { requestId, status: 'APPROVED' }))).status).toBe(200);
    const results = await Promise.all([1, 2].map(n => createProject(req(ids.mentee, '/api/projects', 'POST', { name: `승인 검수 ${n}`, approvalRequestId: requestId }))));
    expect(results.map(r => r.status).sort()).toEqual([200, 403]);
    expect(await db.project.count({ where: { ownerId: ids.mentee } })).toBe(2);
    expect((await db.projectCreationRequest.findUniqueOrThrow({ where: { id: requestId } })).usedAt).not.toBeNull();
});

it('승인 소비 뒤 생성 실패가 나면 실제 트랜잭션에서 승인을 되돌린다', async () => {
    const application = await db.projectCreationRequest.create({ data: { menteeId: ids.mentee, programId: ids.program, reason: '롤백 검수', status: 'APPROVED' } });
    await expect(createProjectWithApproval({ id: projectId, ownerId: ids.mentee, programId: ids.program, name: '중복 ID 실패' }, true, application.id)).rejects.toThrow();
    expect((await db.projectCreationRequest.findUniqueOrThrow({ where: { id: application.id } })).usedAt).toBeNull();
    expect(await db.project.count({ where: { ownerId: ids.mentee } })).toBe(2);
});
