// 격리 PostgreSQL에서 한 멘토의 복수 멘티 배정과 개별 해제·접근 범위를 검증한다.
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';
const dbUrl = process.env.INTEGRATION_DATABASE_URL;
if (!dbUrl || dbUrl === process.env.POSTGRES_PRISMA_URL || new URL(dbUrl).hostname !== '127.0.0.1') throw new Error('격리된 로컬 INTEGRATION_DATABASE_URL이 필요합니다.');
const db = new PrismaClient({ datasources: { db: { url: dbUrl } } });
vi.mock('../../lib/prisma', () => ({ get prisma() { return db; } }));
import { encodeSessionCookie } from '../../lib/auth';
import { POST as assign, DELETE as unassign, GET as candidates } from '../../app/api/mentees/[id]/mentor/route';
import { GET as listMentees } from '../../app/api/programs/[id]/mentees/route';
import { GET as listProjects } from '../../app/api/projects/route';
import { GET as readSpec } from '../../app/api/projects/[id]/spec/route';
const prefix = `mentor_multi_${Date.now()}_`;
const ids = Object.fromEntries(['admin', 'pm', 'otherPm', 'mentor', 'otherMentor', 'a', 'b', 'c', 'program', 'otherProgram', 'pa', 'pb', 'pc'].map(k => [k, prefix + k]));
const users = ['admin', 'pm', 'otherPm', 'mentor', 'otherMentor', 'a', 'b', 'c'];
const mentees = ['a', 'b', 'c'];
const params = (id: string) => ({ params: Promise.resolve({ id }) });
function req(actor: string, path: string, method = 'GET', body?: unknown) {
    return new NextRequest(`http://localhost${path}`, {
        method, headers: { cookie: `session=${encodeSessionCookie({ userId: ids[actor], email: `${ids[actor]}@example.com`, name: actor })}`, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
}
const assignTo = (mentee: string, mentor = 'mentor', actor = 'pm') => assign(req(actor, `/api/mentees/${ids[mentee]}/mentor`, 'POST', { userId: ids[mentor] }), params(ids[mentee]));
const read = (mentee: string) => readSpec(req('mentor', `/api/projects/${ids['p' + mentee]}/spec`), params(ids['p' + mentee]));
beforeAll(async () => {
    process.env.SESSION_SECRET = 'isolated-mentor-multiple-secret';
    for (const key of users) {
        const role = key === 'admin' ? 'ADMIN' : key.includes('Pm') || key === 'pm' ? 'PROGRAM_MANAGER' : key.toLowerCase().includes('mentor') ? 'MENTOR' : 'MENTEE';
        await db.user.create({ data: { id: ids[key], email: `${ids[key]}@example.com`, name: key, passwordHash: 'test-only', role, isAdmin: key === 'admin', status: 'APPROVED',
            profile: { create: { organization: '검수기관', phone: '01000000000', expertise: '검수', careerYears: 1, companyName: '검수기업', industry: '검수', privacyConsentAt: new Date() } },
        } });
    }
    for (const key of ['program', 'otherProgram']) {
        await db.program.create({ data: { id: ids[key], name: key, organization: '검수기관', managerId: ids[key === 'program' ? 'pm' : 'otherPm'], startsAt: new Date('2026-01-01'), endsAt: new Date('2099-01-01') } });
    }
    for (const key of mentees) {
        const programId = ids[key === 'c' ? 'otherProgram' : 'program'];
        await db.user.update({ where: { id: ids[key] }, data: { programId } });
        await db.project.create({ data: { id: ids['p' + key], name: key, ownerId: ids[key], programId } });
    }
});
afterEach(async () => { await db.mentorAssignment.deleteMany({ where: { menteeId: { in: mentees.map(k => ids[k]) } } }); });
afterAll(async () => {
    await db.project.deleteMany({ where: { id: { in: mentees.map(k => ids['p' + k]) } } });
    await db.program.deleteMany({ where: { id: { in: [ids.program, ids.otherProgram] } } });
    await db.user.deleteMany({ where: { id: { in: users.map(k => ids[k]) } } });
    await db.$disconnect();
});
it('관리자와 담당 매니저가 같은 멘토에게 두 멘티를 배정하고 두 배정을 함께 조회한다', async () => {
    expect((await assignTo('a', 'mentor', 'admin')).status).toBe(200);
    const candidateResponse = await candidates(req('pm', `/api/mentees/${ids.b}/mentor?candidates=1`), params(ids.b));
    expect((await candidateResponse.json()).candidates.map((m: { id: string }) => m.id)).toContain(ids.mentor);
    expect((await assignTo('b')).status).toBe(200);
    expect(await db.mentorAssignment.count({ where: { mentorId: ids.mentor } })).toBe(2);
    const response = await listMentees(req('pm', `/api/programs/${ids.program}/mentees`), params(ids.program));
    expect(response.status).toBe(200);
    expect((await response.json()).mentees.map((m: { mentorAssignment: { mentorId: string } }) => m.mentorAssignment.mentorId)).toEqual([ids.mentor, ids.mentor]);
});
it('멘토는 배정된 두 멘티만 접근하고 한 명의 교체·해제는 다른 멘티에 영향을 주지 않는다', async () => {
    await assignTo('a'); await assignTo('b');
    expect((await read('a')).status).toBe(200);
    expect((await read('b')).status).toBe(200);
    expect((await read('c')).status).toBe(403);
    const response = await listProjects(req('mentor', '/api/projects'));
    expect((await response.json()).projects.map((p: { id: string }) => p.id).sort()).toEqual([ids.pa, ids.pb].sort());
    expect((await assignTo('a', 'otherMentor')).status).toBe(200);
    expect((await read('a')).status).toBe(403);
    expect((await read('b')).status).toBe(200);
    expect((await unassign(req('pm', `/api/mentees/${ids.b}/mentor`, 'DELETE', { userId: ids.mentor }), params(ids.b))).status).toBe(200);
    expect((await read('b')).status).toBe(403);
    expect((await db.mentorAssignment.findUniqueOrThrow({ where: { menteeId: ids.a } })).mentorId).toBe(ids.otherMentor);
    expect(await db.project.count({ where: { id: { in: [ids.pa, ids.pb, ids.pc] } } })).toBe(3);
});
it('서로 다른 프로그램에도 같은 멘토를 배정할 수 있고 매니저의 담당 범위는 유지한다', async () => {
    expect((await assignTo('a', 'mentor', 'admin')).status).toBe(200);
    expect((await assignTo('c', 'mentor', 'admin')).status).toBe(200);
    expect((await assignTo('a', 'otherMentor', 'otherPm')).status).toBe(403);
    expect((await assignTo('b', 'mentor', 'mentor')).status).toBe(403);
    expect(await db.mentorAssignment.count({ where: { mentorId: ids.mentor } })).toBe(2);
});
