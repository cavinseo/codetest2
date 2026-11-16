// 실제 프로젝트 권한과 모의 DB로 Kano 응답 선택·전체 삭제의 범위와 입력 경계를 검증한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
    requireAuth: vi.fn(), project: vi.fn(), findResponses: vi.fn(), deleteResponses: vi.fn(),
    resetInvitations: vi.fn(), deleteInvitations: vi.fn(), transaction: vi.fn(),
}));
vi.mock('../lib/auth', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('../lib/prisma', () => ({ prisma: {
    project: { findUnique: mocks.project },
    kanoResponse: { findMany: mocks.findResponses, deleteMany: mocks.deleteResponses },
    kanoSurveyInvitation: { updateMany: mocks.resetInvitations, deleteMany: mocks.deleteInvitations },
    $transaction: mocks.transaction,
} }));
vi.mock('../lib/logger', () => ({ createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }));

const { GET, DELETE } = await import('../app/api/projects/[id]/kano/responses/route');
const params = { params: Promise.resolve({ id: 'project_a' }) };
const selectedEmail = 'selected@example.test';
const otherEmail = 'other@example.test';
let responses: { projectId: string; respondentEmail: string; requirementId: string }[];
let invitations: { projectId: string; email: string; respondedAt: Date | null; isUsed: boolean }[];

function request(body?: unknown, includeInvitations = false) {
    return new NextRequest(`https://app.example.test/api/projects/project_a/kano/responses${includeInvitations ? '?includeInvitations=true' : ''}`, {
        method: 'DELETE',
        ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    });
}

function authAs(role: string, userId = 'owner') {
    mocks.requireAuth.mockResolvedValue({ userId, email: 'user@example.test', role, isAdmin: false, name: '테스트 사용자' });
}

beforeEach(() => {
    vi.clearAllMocks();
    authAs('MENTEE');
    mocks.project.mockResolvedValue({ ownerId: 'owner', owner: { mentorAssignment: { mentorId: 'mentor' } }, members: [] });
    responses = ['project_a', 'project_b'].flatMap(projectId => [selectedEmail, otherEmail].flatMap(respondentEmail =>
        ['req_1', 'req_2'].map(requirementId => ({ projectId, respondentEmail, requirementId }))
    ));
    invitations = ['project_a', 'project_b'].flatMap(projectId => [selectedEmail, otherEmail].map(email => ({
        projectId, email, respondedAt: new Date('2026-10-01'), isUsed: true,
    })));
    mocks.findResponses.mockImplementation(async ({ where }) => responses.filter(row => row.projectId === where.projectId));
    mocks.deleteResponses.mockImplementation(async ({ where }) => {
        const before = responses.length;
        responses = responses.filter(row => !(row.projectId === where.projectId
            && (!where.respondentEmail || where.respondentEmail.in.includes(row.respondentEmail))));
        return { count: before - responses.length };
    });
    mocks.resetInvitations.mockImplementation(async ({ where, data }) => {
        const rows = invitations.filter(row => row.projectId === where.projectId
            && (!where.email || where.email.in.includes(row.email)));
        rows.forEach(row => Object.assign(row, data));
        return { count: rows.length };
    });
    mocks.deleteInvitations.mockImplementation(async ({ where }) => {
        const before = invitations.length;
        invitations = invitations.filter(row => row.projectId !== where.projectId);
        return { count: before - invitations.length };
    });
    mocks.transaction.mockImplementation(async callback => callback({
        kanoResponse: { deleteMany: mocks.deleteResponses },
        kanoSurveyInvitation: { updateMany: mocks.resetInvitations, deleteMany: mocks.deleteInvitations },
    }));
});
afterEach(() => vi.restoreAllMocks());

describe('응답 삭제의 실제 프로젝트 권한', () => {
    it.each([['소유 멘티', 'MENTEE', 'owner'], ['배정 멘토', 'MENTOR', 'mentor']])('%s는 선택한 응답자의 모든 문항만 삭제한다', async (_label, role, userId) => {
        authAs(role, userId);
        const response = await DELETE(request({ respondentEmails: [selectedEmail] }), params);

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ success: true, deletedResponses: 2, resetInvitations: 1, deletedInvitations: 0 });
        expect(mocks.deleteResponses).toHaveBeenCalledExactlyOnceWith({ where: { projectId: 'project_a', respondentEmail: { in: [selectedEmail] } } });
        expect(mocks.resetInvitations).toHaveBeenCalledExactlyOnceWith({ where: { projectId: 'project_a', email: { in: [selectedEmail] } }, data: { respondedAt: null, isUsed: false } });
        expect(responses.filter(row => row.projectId === 'project_b')).toHaveLength(4);
        expect(responses.filter(row => row.projectId === 'project_a' && row.respondentEmail === otherEmail)).toHaveLength(2);
        expect(invitations.find(row => row.projectId === 'project_a' && row.email === selectedEmail)).toMatchObject({ respondedAt: null, isUsed: false });
        expect(invitations.filter(row => row.projectId === 'project_b' || row.email === otherEmail).every(row => row.respondedAt !== null && row.isUsed)).toBe(true);
        expect(mocks.deleteInvitations).not.toHaveBeenCalled();
    });

    it.each(['홍길동', '대문자@EXAMPLE.test', 'UPPER@EXAMPLE.test'])('기존 응답자 식별키 %s를 정규화하지 않고 현재 프로젝트에서만 삭제한다', async respondentKey => {
        responses.forEach(row => { if (row.respondentEmail === selectedEmail) row.respondentEmail = respondentKey; });
        invitations.forEach(row => { if (row.email === selectedEmail) row.email = respondentKey; });
        const response = await DELETE(request({ respondentEmails: [respondentKey] }), params);

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ deletedResponses: 2, resetInvitations: 1, deletedInvitations: 0 });
        expect(mocks.deleteResponses).toHaveBeenCalledExactlyOnceWith({ where: { projectId: 'project_a', respondentEmail: { in: [respondentKey] } } });
        expect(mocks.resetInvitations).toHaveBeenCalledExactlyOnceWith({ where: { projectId: 'project_a', email: { in: [respondentKey] } }, data: { respondedAt: null, isUsed: false } });
        expect(responses.filter(row => row.projectId === 'project_b')).toHaveLength(4);
        expect(responses.filter(row => row.projectId === 'project_a' && row.respondentEmail === otherEmail)).toHaveLength(2);
        expect(invitations.find(row => row.projectId === 'project_a' && row.email === respondentKey)).toMatchObject({ respondedAt: null, isUsed: false });
        expect(invitations.filter(row => row.projectId === 'project_b' || row.email === otherEmail).every(row => row.respondedAt !== null && row.isUsed)).toBe(true);
    });

    it.each([
        ['조회 전용 멘티', 'MENTEE', 'viewer', 'VIEWER'],
        ['코치 멘티', 'MENTEE', 'coach', 'COACH'],
        ['미배정 멘토의 과거 편집 멤버', 'MENTOR', 'unassigned', 'EDITOR'],
        ['미배정 프로그램 매니저', 'PROGRAM_MANAGER', 'manager', 'EDITOR'],
    ])('%s는 DB 쓰기 없이 거부한다', async (_label, role, userId, memberRole) => {
        authAs(role, userId);
        mocks.project.mockResolvedValue({ ownerId: 'owner', owner: { mentorAssignment: { mentorId: 'mentor' } }, members: [{ role: memberRole }] });
        expect((await DELETE(request({ respondentEmails: [selectedEmail] }), params)).status).toBe(403);
        expect(mocks.transaction).not.toHaveBeenCalled();
        expect(mocks.deleteResponses).not.toHaveBeenCalled();
        expect(mocks.resetInvitations).not.toHaveBeenCalled();
    });

    it('미로그인은 프로젝트 조회나 삭제를 실행하지 않는다', async () => {
        mocks.requireAuth.mockResolvedValue(NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }));
        expect((await DELETE(request(), params)).status).toBe(401);
        expect(mocks.project).not.toHaveBeenCalled();
        expect(mocks.transaction).not.toHaveBeenCalled();
    });

    it.each([['MENTEE', 'owner', true], ['MENTOR', 'mentor', true], ['MENTEE', 'viewer', false]])('GET의 삭제 권한도 실제 역할 %s/%s를 따른다', async (role, userId, canDelete) => {
        authAs(role as string, userId as string);
        mocks.project.mockResolvedValue({ ownerId: 'owner', owner: { mentorAssignment: { mentorId: 'mentor' } }, members: [{ role: 'VIEWER' }] });
        const response = await GET(new NextRequest('https://app.example.test/api/projects/project_a/kano/responses'), params);
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ canDelete });
        expect(mocks.transaction).not.toHaveBeenCalled();
    });
});

describe('선택 DELETE 본문의 엄격한 경계와 기존 리셋 호환', () => {
    it.each([{}, null, [], { respondentEmails: [] }, { respondentEmails: 'all' }, { respondentEmails: [''] },
        { respondentEmails: [selectedEmail], projectId: 'project_b' }, { includeInvitations: true }, { respondentEmails: [123] },
    ].map(body => [body]))('잘못되거나 모호한 본문 %j은 전체 삭제로 바꾸지 않는다', async body => {
        expect((await DELETE(request(body), params)).status).toBe(400);
        expect(mocks.transaction).not.toHaveBeenCalled();
        expect(responses).toHaveLength(8);
    });

    it.each(['{broken', ' ', '\n'])('깨진 JSON 또는 공백 본문은 DB 쓰기 없이 거부한다 (%j)', async body => {
        const malformed = new NextRequest('https://app.example.test/api/projects/project_a/kano/responses', { method: 'DELETE', body });
        expect((await DELETE(malformed, params)).status).toBe(400);
        expect(mocks.transaction).not.toHaveBeenCalled();
    });

    it('선택 응답과 초대 전체 삭제를 함께 요청하면 거부한다', async () => {
        expect((await DELETE(request({ respondentEmails: [selectedEmail] }, true), params)).status).toBe(400);
        expect(mocks.transaction).not.toHaveBeenCalled();
    });

    it.each([false, true])('본문 없는 전체 삭제는 기존 includeInvitations=%s 계약을 유지한다', async includeInvitations => {
        const response = await DELETE(request(undefined, includeInvitations), params);
        expect(response.status).toBe(200);
        expect(mocks.deleteResponses).toHaveBeenCalledExactlyOnceWith({ where: { projectId: 'project_a' } });
        expect(responses.filter(row => row.projectId === 'project_b')).toHaveLength(4);
        expect(invitations.filter(row => row.projectId === 'project_b')).toHaveLength(2);
        if (includeInvitations) {
            expect(mocks.deleteInvitations).toHaveBeenCalledExactlyOnceWith({ where: { projectId: 'project_a' } });
            expect(mocks.resetInvitations).not.toHaveBeenCalled();
        } else {
            expect(mocks.resetInvitations).toHaveBeenCalledExactlyOnceWith({ where: { projectId: 'project_a' }, data: { respondedAt: null, isUsed: false } });
            expect(mocks.deleteInvitations).not.toHaveBeenCalled();
        }
    });

    it('트랜잭션 오류는 실패 응답으로 전달한다', async () => {
        mocks.transaction.mockRejectedValueOnce(new Error('mock transaction failed'));
        expect((await DELETE(request({ respondentEmails: [selectedEmail] }), params)).status).toBe(500);
    });
});
