// 격리 PostgreSQL에서 멘토 보고서 권한·완료본 보존·동시 저장 및 배정 변경을 검증한다.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { Prisma, PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

const dbUrl = process.env.INTEGRATION_DATABASE_URL;
if (!dbUrl || dbUrl === process.env.POSTGRES_PRISMA_URL || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(dbUrl).hostname)) {
    throw new Error('운영 DB와 분리된 로컬 INTEGRATION_DATABASE_URL이 필요합니다.');
}
const db = new PrismaClient({ datasources: { db: { url: dbUrl } } });
const racer = new PrismaClient({ datasources: { db: { url: dbUrl } } });
vi.mock('../../lib/prisma', () => ({ get prisma() { return db; } }));
import { encodeSessionCookie } from '../../lib/auth';
import { GET, PUT, POST, PATCH } from '../../app/api/projects/[id]/report/route';
import { GET as exportProject } from '../../app/api/projects/[id]/export/route';
import { GET as readOverview } from '../../app/api/projects/[id]/overview/route';
import { POST as writeSpec } from '../../app/api/projects/[id]/spec/route';
import type { ReportDraft } from '../../lib/final-report-payload';

const prefix = `report_${randomUUID()}_`;
const ids = { admin: prefix + 'admin', pm: prefix + 'pm', mentor: prefix + 'mentor', otherMentor: prefix + 'other_mentor', mentee: prefix + 'mentee', otherMentee: prefix + 'other_mentee', program: prefix + 'program' };
const originalSessionSecret = process.env.SESSION_SECRET;
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jx1cAAAAASUVORK5CYII=';

function draft(text: string): ReportDraft {
    return { previewNeedsRefresh: false,
        free: { productImageDataUrl: null, productImageWidthPx: null, productImageHeightPx: null,
            marketDefinition: text, targetCustomer: '', finalSpecExplanation: '', improvedProductName: '', improvedProductDescription: '' },
        document: { title: '검수 보고서', fileName: '검수.docx', blocks: [
            { kind: 'paragraph', text }, { kind: 'image', title: text, pngDataUrl: png, widthMm: 10, heightMm: 10, landscape: false },
        ] },
    };
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });
function req(projectId: string, userId: string | null, method = 'GET', body?: unknown, query = '') {
    return new NextRequest(`http://localhost/api/projects/${projectId}/report${query}`, { method,
        headers: { 'Content-Type': 'application/json', ...(userId ? { cookie: `session=${encodeSessionCookie({ userId, email: `${userId}@example.test`, name: userId })}` } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
}
async function project() {
    return db.project.create({ data: { id: prefix + randomUUID(), name: '워크시트 원본', ownerId: ids.mentee, programId: ids.program } });
}
async function save(id: string, text = '비공개 초안', version = 0) {
    const response = await PUT(req(id, ids.mentor, 'PUT', { version, draft: draft(text) }), params(id));
    expect(response.status).toBe(200);
    return response.json();
}

beforeAll(async () => {
    process.env.SESSION_SECRET = 'isolated-final-report-session-secret';
    for (const [key, role] of [['admin', 'ADMIN'], ['pm', 'PROGRAM_MANAGER'], ['mentor', 'MENTOR'], ['otherMentor', 'MENTOR'], ['mentee', 'MENTEE'], ['otherMentee', 'MENTEE']] as const) {
        await db.user.create({ data: { id: ids[key], email: `${ids[key]}@example.test`, name: key, passwordHash: 'local-only', role, status: 'APPROVED', isAdmin: role === 'ADMIN',
            profile: { create: { organization: '격리 검수기관', phone: '01000000000', expertise: '검수', careerYears: 1, companyName: '검수기업', industry: '검수', privacyConsentAt: new Date() } },
        } });
    }
    await db.program.create({ data: { id: ids.program, name: '보고서 검수', organization: '검수기관', managerId: ids.pm, startsAt: new Date('2020-01-01'), endsAt: new Date('2099-01-01') } });
    await db.user.update({ where: { id: ids.mentee }, data: { programId: ids.program } });
    await db.mentorAssignment.create({ data: { menteeId: ids.mentee, mentorId: ids.mentor } });
});
afterAll(async () => {
    await db.project.deleteMany({ where: { id: { startsWith: prefix } } });
    await db.program.delete({ where: { id: ids.program } });
    await db.user.deleteMany({ where: { id: { in: Object.values(ids) } } });
    await Promise.all([db.$disconnect(), racer.$disconnect()]);
    if (originalSessionSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = originalSessionSecret;
});

it('실제 세션과 배정으로 작성자를 제한하고 관리자는 초안 열람만 허용한다', async () => {
    const p = await project();
    expect((await GET(req(p.id, null), params(p.id))).status).toBe(401);
    for (const userId of [ids.otherMentor, ids.otherMentee]) expect((await GET(req(p.id, userId), params(p.id))).status).toBe(403);
    for (const userId of [ids.admin, ids.pm, ids.mentee]) {
        expect((await PUT(req(p.id, userId, 'PUT', { version: 0, draft: draft('거절') }), params(p.id))).status).toBe(403);
        expect((await POST(req(p.id, userId, 'POST', { version: 0 }), params(p.id))).status).toBe(403);
        expect((await PATCH(req(p.id, userId, 'PATCH', { version: 0, worksheetId: 'spec', analysis: { analysis: '차단' } }), params(p.id))).status).toBe(403);
    }
    await save(p.id);
    const adminDraft = await (await GET(req(p.id, ids.admin), params(p.id))).json();
    expect(adminDraft).toMatchObject({ canEdit: false, view: 'draft', draft: draft('비공개 초안') });
    for (const userId of [ids.pm, ids.mentee]) {
        const result = await (await GET(req(p.id, userId), params(p.id))).json();
        expect(result).toMatchObject({ canEdit: false, view: 'published', document: null });
        expect(result).not.toHaveProperty('draft');
        expect(JSON.stringify(result)).not.toContain('비공개 초안');
    }
});

it('새 요청으로 초안을 복원하되 멘티·overview·export에 본문과 그림을 노출하지 않는다', async () => {
    const p = await project();
    await save(p.id, '기밀-보고서-초안');
    const restored = await (await GET(req(p.id, ids.mentor), params(p.id))).json();
    expect(restored.draft).toEqual(draft('기밀-보고서-초안'));
    const menteeResponse = await GET(req(p.id, ids.mentee, 'GET', undefined, '?view=draft'), params(p.id));
    expect(menteeResponse.headers.get('cache-control')).toContain('no-store');
    const publicBody = await menteeResponse.json();
    expect(publicBody).toMatchObject({ view: 'published', document: null, hasPublishedReport: false });
    expect(publicBody).not.toHaveProperty('draft');
    for (const response of [publicBody, await (await readOverview(req(p.id, ids.mentee), params(p.id))).json(), await (await exportProject(req(p.id, ids.mentee), params(p.id))).json()]) {
        expect(JSON.stringify(response)).not.toContain('기밀-보고서-초안');
        expect(JSON.stringify(response)).not.toContain(png);
    }
});

it('완료본은 워크시트·새 초안 변경에 영향받지 않고 재완료할 때만 교체된다', async () => {
    const p = await project();
    const initial = await save(p.id, '완료본 A');
    const completed = await POST(req(p.id, ids.mentor, 'POST', { version: initial.version }), params(p.id));
    expect(completed.status).toBe(200);
    const versionA = (await completed.json()).version;
    await db.project.update({ where: { id: p.id }, data: { name: '워크시트 변경' } });
    const savedB = await save(p.id, '새 초안 B', versionA);
    const publicA = await (await GET(req(p.id, ids.mentee), params(p.id))).json();
    expect(publicA.document).toEqual(draft('완료본 A').document);
    expect(JSON.stringify(publicA)).not.toContain('새 초안 B');
    expect((await POST(req(p.id, ids.mentor, 'POST', { version: savedB.version }), params(p.id))).status).toBe(200);
    expect((await (await GET(req(p.id, ids.mentee), params(p.id))).json()).document).toEqual(draft('새 초안 B').document);
    expect((await db.project.findUniqueOrThrow({ where: { id: p.id } })).name).toBe('워크시트 변경');
});

it('동시 첫 저장은 한 건만 성공하고 기존 초안과 공개본의 버전을 덮어쓰지 않는다', async () => {
    const p = await project();
    const responses = await Promise.all(['첫째', '둘째'].map(text => PUT(req(p.id, ids.mentor, 'PUT', { version: 0, draft: draft(text) }), params(p.id))));
    expect(responses.map(r => r.status).sort()).toEqual([200, 409]);
    const saved = await db.finalReport.findUniqueOrThrow({ where: { projectId: p.id } });
    expect(saved.version).toBe(1);
    const before = JSON.stringify(saved);
    expect((await POST(req(p.id, ids.mentor, 'POST', { version: 0 }), params(p.id))).status).toBe(409);
    expect(JSON.stringify(await db.finalReport.findUniqueOrThrow({ where: { projectId: p.id } }))).toBe(before);
});

it('저장과 완료가 경합해도 같은 버전의 다른 내용을 공개하지 않는다', async () => {
    const p = await project();
    await save(p.id, '공개 후보');
    const [saved, completed] = await Promise.all([
        PUT(req(p.id, ids.mentor, 'PUT', { version: 1, draft: draft('새 편집') }), params(p.id)),
        POST(req(p.id, ids.mentor, 'POST', { version: 1 }), params(p.id)),
    ]);
    expect([saved.status, completed.status].sort()).toEqual([200, 409]);
    const stored = await db.finalReport.findUniqueOrThrow({ where: { projectId: p.id } });
    expect(stored.version).toBe(2);
    expect(stored.published).toEqual(completed.status === 200 ? draft('공개 후보').document : null);
});

it('미리보기 재생성 필요 상태의 완료 실패는 기존 공개본을 보존한다', async () => {
    const p = await project();
    await save(p.id, '보존할 완료본');
    await POST(req(p.id, ids.mentor, 'POST', { version: 1 }), params(p.id));
    const stale = draft('수정 중');
    stale.previewNeedsRefresh = true;
    expect((await PUT(req(p.id, ids.mentor, 'PUT', { version: 2, draft: stale }), params(p.id))).status).toBe(200);
    const before = await db.finalReport.findUniqueOrThrow({ where: { projectId: p.id } });
    expect((await POST(req(p.id, ids.mentor, 'POST', { version: 3 }), params(p.id))).status).toBe(400);
    expect(await db.finalReport.findUniqueOrThrow({ where: { projectId: p.id } })).toEqual(before);
});

it('배정 변경과 저장이 경합하면 잠금 뒤 현재 멘토를 재검사한다', async () => {
    const p = await project();
    await save(p.id, '보존할 초안');
    let pending: Promise<Response> | undefined;
    await racer.$transaction(async tx => {
        await tx.$queryRaw`SELECT "mentorId" FROM "mentor_assignments" WHERE "menteeId" = ${ids.mentee} FOR UPDATE`;
        pending = PUT(req(p.id, ids.mentor, 'PUT', { version: 1, draft: draft('거절할 수정') }), params(p.id));
        let blocked = false;
        const deadline = Date.now() + 5000;
        while (Date.now() < deadline) {
            const rows = await db.$queryRaw<Array<{ blocked: boolean }>>`SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query LIKE '%SELECT "mentorId" FROM "mentor_assignments"%') AS blocked`;
            if (rows[0].blocked) { blocked = true; break; }
            await new Promise(resolve => setTimeout(resolve, 25));
        }
        expect(blocked).toBe(true);
        await tx.mentorAssignment.update({ where: { menteeId: ids.mentee }, data: { mentorId: ids.otherMentor } });
    }, { timeout: 10_000 });
    try {
        expect((await pending!).status).toBe(403);
        const report = await db.finalReport.findUniqueOrThrow({ where: { projectId: p.id } });
        expect(report.version).toBe(1);
        expect(report.draft).toEqual(draft('보존할 초안'));
        expect((await GET(req(p.id, ids.mentor), params(p.id))).status).toBe(403);
        expect((await GET(req(p.id, ids.otherMentor), params(p.id))).status).toBe(200);
    } finally {
        await db.mentorAssignment.update({ where: { menteeId: ids.mentee }, data: { mentorId: ids.mentor } });
    }
});

it('배정 멘토는 멘티의 워크시트를 수정할 수 있고 미배정 멘토는 거절된다', async () => {
    const p = await project();
    await save(p.id);
    const specFunctions = [{ id: 'core_0', level: 'CORE', name: '멘토가 보완한 핵심 기능', order: 0 }];
    expect((await writeSpec(req(p.id, ids.mentor, 'POST', { specFunctions }), params(p.id))).status).toBe(200);
    expect(await db.specFunction.findMany({ where: { projectId: p.id }, select: { name: true } })).toEqual([{ name: '멘토가 보완한 핵심 기능' }]);
    expect((await writeSpec(req(p.id, ids.otherMentor, 'POST', { specFunctions }), params(p.id))).status).toBe(403);
});

it('멘토로 배정된 PM은 작성할 수 있고 배정 해제 후에는 조회만 가능하다', async () => {
    const p = await project();
    await db.mentorAssignment.update({ where: { menteeId: ids.mentee }, data: { mentorId: ids.pm } });
    try {
        expect((await PUT(req(p.id, ids.pm, 'PUT', { version: 0, draft: draft('PM 멘토') }), params(p.id))).status).toBe(200);
        expect((await POST(req(p.id, ids.pm, 'POST', { version: 1 }), params(p.id))).status).toBe(200);
    } finally {
        await db.mentorAssignment.update({ where: { menteeId: ids.mentee }, data: { mentorId: ids.mentor } });
    }
    expect((await (await GET(req(p.id, ids.pm), params(p.id))).json()).canEdit).toBe(false);
    expect((await PUT(req(p.id, ids.pm, 'PUT', { version: 2, draft: draft('거절') }), params(p.id))).status).toBe(403);
});

it('프로젝트 삭제만 보고서를 함께 지우며 작성자의 회원 삭제는 완료본을 보존한다', async () => {
    const p = await project();
    await save(p.id);
    await POST(req(p.id, ids.mentor, 'POST', { version: 1 }), params(p.id));
    await db.finalReport.update({ where: { projectId: p.id }, data: { updatedById: ids.otherMentor, publishedById: ids.otherMentor } });
    await db.user.delete({ where: { id: ids.otherMentor } });
    expect((await db.finalReport.findUniqueOrThrow({ where: { projectId: p.id } })).published).not.toBeNull();
    await db.project.delete({ where: { id: p.id } });
    expect(await db.finalReport.findUnique({ where: { projectId: p.id } })).toBeNull();
});

it('워크시트 분석은 배정 멘토와 관리자만 읽으며 완료본을 계속 보존한다', async () => {
    const p = await project();
    await save(p.id, '공개본 유지');
    expect((await POST(req(p.id, ids.mentor, 'POST', { version: 1 }), params(p.id))).status).toBe(200);
    const analysis = { core: '비공개 핵심 자산', complementary: '비공개 보완 자산' };
    expect((await PATCH(req(p.id, ids.mentor, 'PATCH', { version: 2, worksheetId: 'assets', analysis }), params(p.id))).status).toBe(200);
    const restored = await (await GET(req(p.id, ids.mentor, 'GET', undefined, '?worksheetId=assets'), params(p.id))).json();
    expect(restored).toMatchObject({ canEdit: true, version: 3, analysis });
    const adminAnalysis = await (await GET(req(p.id, ids.admin, 'GET', undefined, '?worksheetId=assets'), params(p.id))).json();
    expect(adminAnalysis).toMatchObject({ canRead: true, canEdit: false, version: 3, analysis });
    expect((await PATCH(req(p.id, ids.admin, 'PATCH', { version: 3, worksheetId: 'assets', analysis: { core: '거절', complementary: '' } }), params(p.id))).status).toBe(403);
    for (const userId of [ids.pm, ids.mentee]) {
        const privateResponse = await GET(req(p.id, userId, 'GET', undefined, '?worksheetId=assets'), params(p.id));
        expect(privateResponse.headers.get('cache-control')).toContain('no-store');
        expect(await privateResponse.json()).toEqual({ canEdit: false });
        const visible = await (await GET(req(p.id, userId, 'GET', undefined, '?view=draft'), params(p.id))).json();
        expect(visible.document).toEqual(draft('공개본 유지').document);
        expect(JSON.stringify(visible)).not.toContain('비공개');
    }
    const stored = await db.finalReport.findUniqueOrThrow({ where: { projectId: p.id } });
    expect(stored.draft).toMatchObject({ previewNeedsRefresh: true, worksheetAnalysis: { assets: analysis }, free: draft('공개본 유지').free });
    expect((await POST(req(p.id, ids.mentor, 'POST', { version: 3 }), params(p.id))).status).toBe(400);
    expect((await db.finalReport.findUniqueOrThrow({ where: { projectId: p.id } })).published).toEqual(stored.published);
});

it('서로 다른 워크시트의 동시 첫 분석 저장은 버전 충돌을 표시하고 재시도로 두 내용을 보존한다', async () => {
    const p = await project();
    const inputs = [{ worksheetId: 'spec', analysis: { analysis: '기능 분석' } }, { worksheetId: 'fitness', analysis: { analysis: '적합도 분석' } }] as const;
    const responses = await Promise.all(inputs.map(input => PATCH(req(p.id, ids.mentor, 'PATCH', { version: 0, ...input }), params(p.id))));
    expect(responses.map(response => response.status).sort()).toEqual([200, 409]);
    const rejected = inputs[responses.findIndex(response => response.status === 409)];
    expect((await PATCH(req(p.id, ids.mentor, 'PATCH', { version: 1, ...rejected }), params(p.id))).status).toBe(200);
    const stored = await db.finalReport.findUniqueOrThrow({ where: { projectId: p.id } });
    expect(stored.version).toBe(2);
    expect(stored.draft).toMatchObject({ worksheetAnalysis: { spec: { analysis: '기능 분석' }, fitness: { analysis: '적합도 분석' } } });
});

it('분석을 누락한 구버전 보고서 저장은 최신 분석을 지우거나 완료를 우회하지 못한다', async () => {
    const p = await project();
    expect((await PATCH(req(p.id, ids.mentor, 'PATCH', { version: 0, worksheetId: 'spec', analysis: { analysis: '완료에 반영할 분석' } }), params(p.id))).status).toBe(200);
    expect((await PUT(req(p.id, ids.mentor, 'PUT', { version: 1, draft: draft('분석 없는 문서') }), params(p.id))).status).toBe(200);
    expect((await POST(req(p.id, ids.mentor, 'POST', { version: 2 }), params(p.id))).status).toBe(400);
    const restored = await (await GET(req(p.id, ids.mentor), params(p.id))).json();
    expect(restored.draft).toMatchObject({ previewNeedsRefresh: true, worksheetAnalysis: { spec: { analysis: '완료에 반영할 분석' } } });
    const refreshed = { ...draft('완료에 반영할 분석'), worksheetAnalysis: restored.draft.worksheetAnalysis };
    expect((await PUT(req(p.id, ids.mentor, 'PUT', { version: 2, draft: refreshed }), params(p.id))).status).toBe(200);
    expect((await POST(req(p.id, ids.mentor, 'POST', { version: 3 }), params(p.id))).status).toBe(200);
    expect((await (await GET(req(p.id, ids.mentee), params(p.id))).json()).document).toEqual(refreshed.document);
});

it('보고서 RLS가 권한을 받은 비소유자의 SQL 조회·수정·삽입을 차단한다', async () => {
    const rows = await db.$queryRaw<Array<{ enabled: boolean; policies: bigint }>>(Prisma.sql`
        SELECT c.relrowsecurity AS enabled, (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'final_reports') AS policies
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'final_reports'
    `);
    expect(rows).toEqual([{ enabled: true, policies: BigInt(0) }]);

    const role = `report_rls_${randomUUID().replaceAll('-', '')}`;
    const projectIds = [prefix + randomUUID(), prefix + randomUUID()];
    const rollback = new Error('RLS 검수용 역할과 자료를 롤백한다.');
    try {
        await expect(db.$transaction(async tx => {
            await tx.project.createMany({ data: projectIds.map(id => ({ id, name: 'RLS 격리 자료', ownerId: ids.mentee, programId: ids.program })) });
            await tx.finalReport.create({ data: {
                projectId: projectIds[0], draft: draft('SQL 비공개 초안') as Prisma.InputJsonValue,
                published: draft('SQL 완료본').document as Prisma.InputJsonValue,
                version: 2, publishedVersion: 2, updatedById: ids.mentor, publishedById: ids.mentor, publishedAt: new Date(),
            } });
            // 식별자는 테스트가 만든 UUID만 사용하며 역할 생성·GRANT도 같은 트랜잭션에서 롤백한다.
            await tx.$executeRawUnsafe(`CREATE ROLE "${role}" NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT`);
            await tx.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO "${role}"`);
            await tx.$executeRawUnsafe(`GRANT SELECT, INSERT, UPDATE ON TABLE public.final_reports TO "${role}"`);
            await tx.$executeRawUnsafe(`SET LOCAL ROLE "${role}"`);
            const actor = await tx.$queryRaw<Array<{ role: string; superuser: boolean; bypass: boolean; owner: boolean; select: boolean; insert: boolean; update: boolean }>>`
                SELECT current_user::text AS role, r.rolsuper AS superuser, r.rolbypassrls AS bypass,
                    c.relowner = r.oid AS owner,
                    has_table_privilege(current_user, 'public.final_reports', 'SELECT') AS select,
                    has_table_privilege(current_user, 'public.final_reports', 'INSERT') AS insert,
                    has_table_privilege(current_user, 'public.final_reports', 'UPDATE') AS update
                FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE r.rolname = current_user AND n.nspname = 'public' AND c.relname = 'final_reports'
            `;
            expect(actor).toEqual([{ role, superuser: false, bypass: false, owner: false, select: true, insert: true, update: true }]);
            // 테이블 권한이 실제로 있어도 초안·완료본은 보이지 않고 UPDATE는 0행이어야 한다.
            expect(await tx.$queryRaw`SELECT "projectId", "draft", "published" FROM public.final_reports WHERE "projectId" = ${projectIds[0]}`).toEqual([]);
            expect(await tx.$executeRaw`UPDATE public.final_reports SET "version" = "version" + 1 WHERE "projectId" = ${projectIds[0]}`).toBe(0);
            await expect(tx.$executeRaw`
                INSERT INTO public.final_reports ("projectId", "draft", "updatedById", "updatedAt")
                VALUES (${projectIds[1]}, ${JSON.stringify(draft('차단할 삽입'))}::jsonb, ${ids.mentor}, CURRENT_TIMESTAMP)
            `).rejects.toMatchObject({ code: 'P2010', meta: { code: '42501', message: expect.stringContaining('row-level security') } });
            throw rollback;
        }, { timeout: 15_000 })).rejects.toBe(rollback);
    } finally {
        expect(await db.$queryRaw`SELECT rolname::text FROM pg_roles WHERE rolname = ${role}`).toEqual([]);
        expect(await db.project.count({ where: { id: { in: projectIds } } })).toBe(0);
        expect(await db.finalReport.count({ where: { projectId: { in: projectIds } } })).toBe(0);
    }
});
