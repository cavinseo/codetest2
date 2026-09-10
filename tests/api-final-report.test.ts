// 배정 멘토만 보고서를 저장·완료하고 일반 열람자에게는 완료본만 공개되는지 검증한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import type { ReportDraft } from '../lib/final-report-payload';

const m = vi.hoisted(() => ({
    access: vi.fn(), project: vi.fn(), findReport: vi.fn(), createReport: vi.fn(), updateReport: vi.fn(),
    transaction: vi.fn(), lock: vi.fn(), logError: vi.fn(),
}));
vi.mock('../lib/authorization', () => ({ requireProjectAccess: m.access }));
vi.mock('../lib/prisma', () => ({ prisma: {
    project: { findUnique: m.project },
    finalReport: { findUnique: m.findReport, create: m.createReport, update: m.updateReport },
    $transaction: m.transaction,
} }));
vi.mock('../lib/logger', () => ({ createLogger: () => ({ error: m.logError }) }));
import { GET, PUT, POST } from '../app/api/projects/[id]/report/route';

const PROJECT = 'project_1';
const MENTOR = 'mentor_1';
const MENTEE = 'mentee_1';
const DATE = new Date('2026-09-11T00:00:00.000Z');
const params = { params: Promise.resolve({ id: PROJECT }) };
type StoredReport = {
    projectId: string; draft: ReportDraft; published: ReportDraft['document']; version: number;
    publishedVersion: number | null; updatedById: string; publishedById: string | null;
    publishedAt: Date | null; updatedAt: Date;
};
let record: StoredReport | null;

function document(text = '비공개 초안 본문') {
    return { title: '결과보고서', fileName: '결과보고서.docx', blocks: [{ kind: 'paragraph' as const, text }] };
}

function draft(text = '비공개 초안 본문'): ReportDraft {
    return {
        free: {
            productImageDataUrl: null, productImageWidthPx: null, productImageHeightPx: null,
            marketDefinition: '공개 전 시장 메모', targetCustomer: '', finalSpecExplanation: '', improvedProductName: '', improvedProductDescription: '',
        }, document: document(text), previewNeedsRefresh: false,
    };
}

function existingReport(published = false): StoredReport {
    return {
        projectId: PROJECT, draft: draft(), published: published ? document('기존 완료 본문') : null,
        version: published ? 3 : 1, publishedVersion: published ? 2 : null,
        updatedById: MENTOR, publishedById: published ? MENTOR : null,
        publishedAt: published ? DATE : null, updatedAt: DATE,
    };
}

function auth(role = 'MENTOR', userId = MENTOR, projectRole = 'COACH') {
    m.access.mockResolvedValue({ user: { userId, role, isAdmin: role === 'ADMIN' }, role: projectRole });
}

function req(method: string, body?: unknown, view?: string) {
    return new NextRequest(`https://app.example.com/api/projects/${PROJECT}/report${view ? `?view=${view}` : ''}`, {
        method, ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    });
}

async function read(view?: string) {
    const response = await GET(req('GET', undefined, view), params);
    expect(response.status).toBe(200);
    return response.json();
}

function expectNoWrite() {
    expect(m.createReport).not.toHaveBeenCalled();
    expect(m.updateReport).not.toHaveBeenCalled();
}

beforeEach(() => {
    vi.resetAllMocks();
    record = null;
    auth();
    m.project.mockResolvedValue({ owner: { mentorAssignment: { mentorId: MENTOR, mentor: { name: '배정 멘토' } } } });
    m.lock.mockImplementation(async (query: TemplateStringsArray) => query.join('').includes('mentor_assignments')
        ? [{ mentorId: MENTOR }] : [{ ownerId: MENTEE }]);
    m.findReport.mockImplementation(async () => structuredClone(record));
    m.createReport.mockImplementation(async ({ data }) => {
        record = { published: null, publishedVersion: null, publishedById: null, publishedAt: null, updatedAt: DATE, ...structuredClone(data) };
        return structuredClone(record);
    });
    m.updateReport.mockImplementation(async ({ data }) => {
        record = { ...record!, ...structuredClone(data), updatedAt: DATE };
        return structuredClone(record);
    });
    m.transaction.mockImplementation(async (callback) => {
        const before = structuredClone(record);
        try {
            return await callback({ $queryRaw: m.lock, finalReport: { findUnique: m.findReport, create: m.createReport, update: m.updateReport } });
        } catch (error) {
            record = before;
            throw error;
        }
    });
});

afterEach(() => vi.restoreAllMocks());

describe('프로젝트 접근과 멘토 보고서 권한', () => {
    it.each([401, 403, 404])('기존 프로젝트 접근 오류 %i를 조회·저장·완료에 그대로 적용한다', async (status) => {
        m.access.mockImplementation(async () => NextResponse.json({ error: '접근 거절' }, { status }));
        for (const [method, handler] of [['GET', GET], ['PUT', PUT], ['POST', POST]] as const) {
            expect((await handler(req(method, method === 'PUT' ? { version: 0, draft: draft() } : method === 'POST' ? { version: 0 } : undefined), params)).status).toBe(status);
        }
        expect(m.project).not.toHaveBeenCalled();
        expect(m.findReport).not.toHaveBeenCalled();
        expectNoWrite();
    });

    it('접근 확인 뒤 프로젝트가 사라지면 404를 반환한다', async () => {
        m.project.mockResolvedValue(null);
        expect((await GET(req('GET'), params)).status).toBe(404);
        expect((await PUT(req('PUT', { version: 0, draft: draft() }), params)).status).toBe(404);
        expect(m.transaction).not.toHaveBeenCalled();
    });

    it.each([
        ['ADMIN', 'admin_1', 'ADMIN'],
        ['PROGRAM_MANAGER', 'other_manager', 'VIEWER'],
        ['MENTEE', MENTEE, 'OWNER'],
        ['MENTEE', 'participant', 'EDITOR'],
        ['MENTOR', 'other_mentor', 'COACH'],
    ])('%s 미배정 사용자는 프로젝트를 읽더라도 저장·완료할 수 없다', async (role, id, projectRole) => {
        auth(role, id, projectRole);
        expect((await PUT(req('PUT', { version: 0, draft: draft() }), params)).status).toBe(403);
        expect((await POST(req('POST', { version: 0 }), params)).status).toBe(403);
        expect(m.transaction).not.toHaveBeenCalled();
        expectNoWrite();
    });

    it.each(['MENTOR', 'PROGRAM_MANAGER'])('배정된 %s는 초안을 저장하고 완료할 수 있다', async (role) => {
        auth(role);
        expect((await PUT(req('PUT', { version: 0, draft: draft() }), params)).status).toBe(200);
        expect((await POST(req('POST', { version: 1 }), params)).status).toBe(200);
        expect(record).toMatchObject({ version: 2, publishedVersion: 2, publishedById: MENTOR, updatedById: MENTOR });
        // 결과보고서 권한이 워크시트 쓰기 권한을 요구하거나 확장하지 않는다.
        expect(m.access).toHaveBeenCalledWith(expect.any(NextRequest), PROJECT);
    });

    it('배정 대상 ID여도 관리자 역할이면 저장할 수 없다', async () => {
        auth('ADMIN', MENTOR, 'ADMIN');
        expect((await PUT(req('PUT', { version: 0, draft: draft() }), params)).status).toBe(403);
        expectNoWrite();
    });

    it('멘토 배정이 없으면 쓰기와 멘토 이름을 제공하지 않는다', async () => {
        m.project.mockResolvedValue({ owner: { mentorAssignment: null } });
        auth('ADMIN', 'admin_1', 'ADMIN');
        expect(await read()).toMatchObject({ canEdit: false, mentorName: null, view: 'draft' });
        expect((await PUT(req('PUT', { version: 0, draft: draft() }), params)).status).toBe(403);
    });
});

describe('초안과 공개본 조회 분리', () => {
    it.each([
        ['MENTOR', MENTOR, true], ['ADMIN', 'admin_1', false], ['PROGRAM_MANAGER', 'other_manager', false],
    ])('%s는 초안을 읽으며 배정 여부에 따라 편집 권한을 받는다', async (role, id, canEdit) => {
        auth(role as string, id as string);
        record = existingReport(true);
        const body = await read();
        expect(body).toMatchObject({ view: 'draft', canEdit, version: 3, mentorName: '배정 멘토', hasPublishedReport: true, hasUnpublishedChanges: true, draft: record.draft });
        expect(body).not.toHaveProperty('document');
        expect(body).not.toHaveProperty('published');
        expect(JSON.stringify(body)).not.toContain('기존 완료 본문');
    });

    it.each(['draft', 'published', undefined])('멘티는 view=%s에서도 완료 전 초안·자유 입력·그림을 받지 않는다', async (view) => {
        auth('MENTEE', MENTEE, 'OWNER');
        record = existingReport();
        record.draft.free.productImageDataUrl = 'data:image/png;base64,SECRETIMAGE';
        const body = await read(view);
        expect(body).toMatchObject({ view: 'published', canEdit: false, document: null, hasPublishedReport: false });
        expect(body).not.toHaveProperty('draft');
        expect(body).not.toHaveProperty('free');
        const serialized = JSON.stringify(body);
        expect(serialized).not.toContain('비공개 초안 본문');
        expect(serialized).not.toContain('공개 전 시장 메모');
        expect(serialized).not.toContain('SECRETIMAGE');
    });

    it('일반 프로젝트 참여자는 draft를 요청해도 기존 완료본만 받는다', async () => {
        auth('MENTEE', 'participant', 'EDITOR');
        record = existingReport(true);
        const body = await read('draft');
        expect(body).toMatchObject({ view: 'published', canEdit: false, version: 2, document: record.published });
        expect(body).not.toHaveProperty('draft');
        expect(JSON.stringify(body)).not.toContain('비공개 초안 본문');
    });

    it('배정 멘토도 현재 공개본을 명시하면 완료 문서 하나만 받는다', async () => {
        record = existingReport(true);
        const body = await read('published');
        expect(body).toMatchObject({ view: 'published', canEdit: true, document: record.published });
        expect(body).not.toHaveProperty('draft');
    });

    it('아직 보고서가 없으면 초안 열람자에게 version 0과 draft null을 반환한다', async () => {
        expect(await read()).toMatchObject({ view: 'draft', version: 0, draft: null, hasPublishedReport: false, hasUnpublishedChanges: false });
    });

    it('보고서 조회 응답은 공유 캐시와 브라우저 저장을 금지한다', async () => {
        const response = await GET(req('GET'), params);
        expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    });
});

describe('초안 저장과 완료 문서 유지', () => {
    it('최초 초안 저장은 version 1과 실제 작성자를 기록하고 문서를 응답에 되돌려 보내지 않는다', async () => {
        const response = await PUT(req('PUT', { version: 0, draft: draft() }), params);
        expect(response.status).toBe(200);
        expect(record).toMatchObject({ projectId: PROJECT, version: 1, draft: draft(), updatedById: MENTOR, published: null });
        const body = await response.json();
        expect(body).toMatchObject({ success: true, version: 1, hasPublishedReport: false, hasUnpublishedChanges: true });
        expect(body).not.toHaveProperty('draft');
        expect(body).not.toHaveProperty('document');
        expect(body).not.toHaveProperty('published');
    });

    it('미리보기 없는 자유 입력도 초안으로 저장한다', async () => {
        const input = { ...draft(), document: null };
        expect((await PUT(req('PUT', { version: 0, draft: input }), params)).status).toBe(200);
        expect(record?.draft).toEqual(input);
    });

    it('새 초안 저장은 기존 완료본·완료 버전·완료 시각·완료자를 유지한다', async () => {
        record = existingReport(true);
        const before = structuredClone(record);
        const response = await PUT(req('PUT', { version: 3, draft: draft('새 교정 초안') }), params);
        expect(response.status).toBe(200);
        expect(record).toMatchObject({ version: 4, published: before.published, publishedVersion: before.publishedVersion, publishedAt: before.publishedAt, publishedById: before.publishedById });
        expect(record?.draft.document).toEqual(document('새 교정 초안'));
        expect(m.updateReport.mock.calls[0][0].data).not.toHaveProperty('published');
        auth('MENTEE', MENTEE, 'OWNER');
        expect((await read()).document).toEqual(before.published);
    });

    it('완료는 서버에 저장된 초안을 복사하고 version과 publishedVersion을 같은 새 값으로 바꾼다', async () => {
        record = existingReport(true);
        const savedDraft = structuredClone(record.draft);
        const response = await POST(req('POST', { version: 3 }), params);
        expect(response.status).toBe(200);
        expect(record).toMatchObject({ draft: savedDraft, published: savedDraft.document, version: 4, publishedVersion: 4, publishedById: MENTOR, updatedById: MENTOR });
        const body = await response.json();
        expect(body).toMatchObject({ success: true, version: 4, hasPublishedReport: true, hasUnpublishedChanges: false, publishedAt: expect.any(String) });
        expect(body).not.toHaveProperty('draft');
        expect(body).not.toHaveProperty('document');
        expect(m.updateReport.mock.calls[0][0].data).not.toHaveProperty('draft');
    });

    it('완료 후 새 초안을 저장해도 멘티의 완료 문서와 이미지는 바뀌지 않는다', async () => {
        const input = draft('최초 완료 문서');
        input.document!.blocks.push({ kind: 'image', title: '완료 당시 캡처', pngDataUrl: 'data:image/png;base64,YWJjZA==', widthMm: 10, heightMm: 10, landscape: false });
        expect((await PUT(req('PUT', { version: 0, draft: input }), params)).status).toBe(200);
        expect((await POST(req('POST', { version: 1 }), params)).status).toBe(200);
        const published = structuredClone(record?.published);
        expect((await PUT(req('PUT', { version: 2, draft: draft('워크시트 변경 후 새 초안') }), params)).status).toBe(200);
        auth('MENTEE', MENTEE, 'OWNER');
        expect((await read()).document).toEqual(published);
        auth();
        expect((await POST(req('POST', { version: 3 }), params)).status).toBe(200);
        auth('MENTEE', MENTEE, 'OWNER');
        expect((await read()).document).toEqual(document('워크시트 변경 후 새 초안'));
    });

    it.each(['PUT', 'POST'])('%s의 오래된 버전은 409로 거절하고 초안과 완료본을 보존한다', async (method) => {
        record = existingReport(true);
        const before = structuredClone(record);
        const response = await (method === 'PUT' ? PUT : POST)(req(method, method === 'PUT' ? { version: 2, draft: draft('덮어쓰기') } : { version: 2 }), params);
        expect(response.status).toBe(409);
        expect(record).toEqual(before);
        expectNoWrite();
    });

    it('보고서가 이미 생성되어 있으면 version 0의 중복 최초 저장을 거절한다', async () => {
        record = existingReport();
        expect((await PUT(req('PUT', { version: 0, draft: draft() }), params)).status).toBe(409);
        expectNoWrite();
    });

    it.each(['없음', '문서 없음', '빈 블록', '오래된 미리보기', '저장된 형식 오류'])('%s 초안은 완료할 수 없고 기존 데이터는 그대로 둔다', async (state) => {
        if (state !== '없음') {
            record = existingReport(true);
            if (state === '문서 없음') record.draft.document = null;
            if (state === '빈 블록') record.draft.document!.blocks = [];
            if (state === '오래된 미리보기') record.draft.previewNeedsRefresh = true;
            if (state === '저장된 형식 오류') Object.assign(record.draft, { document: { invalid: true } });
        }
        const before = structuredClone(record);
        expect((await POST(req('POST', { version: record?.version ?? 0 }), params)).status).toBe(400);
        expect(record).toEqual(before);
        expectNoWrite();
    });

    it.each(['PUT', 'POST'])('%s DB 오류 시 트랜잭션을 실패시키고 원래 초안·완료본을 보존한다', async (method) => {
        record = existingReport(true);
        const before = structuredClone(record);
        m.updateReport.mockImplementationOnce(async ({ data }) => {
            record = { ...record!, ...data };
            throw new Error('private report contents and database failure');
        });
        const response = await (method === 'PUT' ? PUT : POST)(req(method, method === 'PUT' ? { version: 3, draft: draft('실패한 초안') } : { version: 3 }), params);
        expect(response.status).toBe(500);
        expect(record).toEqual(before);
        expect(await response.text()).not.toContain('private report');
        expect(JSON.stringify(m.logError.mock.calls)).not.toContain('private report');
    });

    it('최초 저장 실패 시 보고서가 생성된 것처럼 응답하지 않는다', async () => {
        m.createReport.mockRejectedValueOnce(new Error('DB create failed'));
        expect((await PUT(req('PUT', { version: 0, draft: draft() }), params)).status).toBe(500);
        expect(record).toBeNull();
    });
});

describe('저장 트랜잭션 안의 멘토 재확인', () => {
    it('프로젝트와 현재 소유 멘티의 배정을 순서대로 잠근 뒤 보고서 버전을 읽고 저장한다', async () => {
        expect((await PUT(req('PUT', { version: 0, draft: draft() }), params)).status).toBe(200);
        expect(m.lock).toHaveBeenCalledTimes(2);
        expect(m.lock.mock.calls[0][0].join('')).toContain('"projects"');
        expect(m.lock.mock.calls[0][0].join('')).toContain('FOR UPDATE');
        expect(m.lock.mock.calls[0][1]).toBe(PROJECT);
        expect(m.lock.mock.calls[1][0].join('')).toContain('"mentor_assignments"');
        expect(m.lock.mock.calls[1][0].join('')).toContain('FOR UPDATE');
        expect(m.lock.mock.calls[1][1]).toBe(MENTEE);
        expect(m.lock.mock.invocationCallOrder[0]).toBeLessThan(m.lock.mock.invocationCallOrder[1]);
        expect(m.lock.mock.invocationCallOrder[1]).toBeLessThan(m.findReport.mock.invocationCallOrder[0]);
        expect(m.findReport.mock.invocationCallOrder[0]).toBeLessThan(m.createReport.mock.invocationCallOrder[0]);
    });

    it.each(['PUT', 'POST'])('%s 직전 멘토가 배정 해제되면 기존 접근 허용과 관계없이 403을 반환한다', async (method) => {
        record = existingReport(true);
        m.lock.mockResolvedValueOnce([{ ownerId: MENTEE }]).mockResolvedValueOnce([]);
        const before = structuredClone(record);
        expect((await (method === 'PUT' ? PUT : POST)(req(method, method === 'PUT' ? { version: 3, draft: draft() } : { version: 3 }), params)).status).toBe(403);
        expect(m.findReport).not.toHaveBeenCalled();
        expectNoWrite();
        expect(record).toEqual(before);
    });

    it('프로젝트 소유권이 변경되면 새 소유 멘티의 멘토 배정을 확인한다', async () => {
        m.lock.mockResolvedValueOnce([{ ownerId: 'new_owner' }]).mockResolvedValueOnce([{ mentorId: 'new_mentor' }]);
        expect((await PUT(req('PUT', { version: 0, draft: draft() }), params)).status).toBe(403);
        expect(m.lock.mock.calls[1][1]).toBe('new_owner');
        expectNoWrite();
    });

    it('잠금 시점에 프로젝트가 사라졌으면 보고서를 생성하지 않는다', async () => {
        m.lock.mockResolvedValueOnce([]);
        expect((await PUT(req('PUT', { version: 0, draft: draft() }), params)).status).toBe(404);
        expect(m.lock).toHaveBeenCalledTimes(1);
        expectNoWrite();
    });
});

describe('저장 요청 형식과 크기 제한', () => {
    it.each([
        { version: -1, draft: draft() }, { version: 0, draft: { invalid: true } },
        { version: 0, draft: draft(), updatedById: 'other_author' },
        { version: 0, draft: draft(), published: document('임의 공개') },
    ])('잘못된 저장 형식이나 임의 작성자·공개 문서는 400으로 거절한다', async (body) => {
        expect((await PUT(req('PUT', body), params)).status).toBe(400);
        expect(m.transaction).not.toHaveBeenCalled();
        expectNoWrite();
    });

    it('완료 요청 본문에 임의 문서를 보내 기존 저장 초안을 대체할 수 없다', async () => {
        record = existingReport(true);
        const before = structuredClone(record);
        expect((await POST(req('POST', { version: 3, draft: draft('주입한 본문') }), params)).status).toBe(400);
        expect(record).toEqual(before);
        expectNoWrite();
    });

    it.each(['PUT', 'POST'])('%s의 깨진 JSON은 400을 반환한다', async (method) => {
        const request = new NextRequest(`https://app.example.com/api/projects/${PROJECT}/report`, { method, body: '{bad json' });
        expect((await (method === 'PUT' ? PUT : POST)(request, params)).status).toBe(400);
        expectNoWrite();
    });

    function sizedBody(bytes: number) {
        const input = draft();
        input.free.targetCustomer = '가'.repeat(90_000);
        input.document!.blocks = Array.from({ length: 32 }, () => ({ kind: 'paragraph', text: 'a'.repeat(100_000) }));
        input.document!.blocks.push({ kind: 'paragraph', text: '' });
        const payload = { version: 0, draft: input };
        const remaining = bytes - Buffer.byteLength(JSON.stringify(payload), 'utf8');
        Object.assign(input.document!.blocks[32], { text: 'a'.repeat(remaining) });
        return JSON.stringify(payload);
    }

    it('UTF-8 기준 정확히 3,500,000바이트의 유효 초안은 저장한다', async () => {
        const body = sizedBody(3_500_000);
        expect(Buffer.byteLength(body, 'utf8')).toBe(3_500_000);
        const request = new NextRequest(`https://app.example.com/api/projects/${PROJECT}/report`, { method: 'PUT', body });
        expect((await PUT(request, params)).status).toBe(200);
        expect(record?.version).toBe(1);
    });

    it('문자 수와 헤더가 한도 이하여도 실제 UTF-8 바이트가 1바이트 넘으면 413을 반환한다', async () => {
        const body = sizedBody(3_500_001);
        expect(body.length).toBeLessThan(3_500_000);
        const request = new NextRequest(`https://app.example.com/api/projects/${PROJECT}/report`, {
            method: 'PUT', headers: { 'Content-Length': String(body.length) }, body,
        });
        expect((await PUT(request, params)).status).toBe(413);
        expect(m.transaction).not.toHaveBeenCalled();
        expectNoWrite();
    });

    it.each(['PUT', 'POST'])('%s에 초과 Content-Length가 있으면 본문을 읽기 전에 413으로 거절한다', async (method) => {
        const request = new NextRequest(`https://app.example.com/api/projects/${PROJECT}/report`, { method, headers: { 'Content-Length': '3500001' }, body: '{}' });
        const text = vi.spyOn(request, 'text');
        expect((await (method === 'PUT' ? PUT : POST)(request, params)).status).toBe(413);
        expect(text).not.toHaveBeenCalled();
        expectNoWrite();
    });
});
