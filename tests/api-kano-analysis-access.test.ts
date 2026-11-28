// Kano 분석 API가 멘토 권한을 검사하고 설문 관리용 요약에는 개별 분석을 노출하지 않는지 검증한다.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import type { ProjectAccess, ProjectAccessRole } from '../lib/authorization';
import type { MemberRole } from '../lib/member-roles';

const m = vi.hoisted(() => ({
    access: vi.fn(), responses: vi.fn(), requirements: vi.fn(), updateMany: vi.fn(), transaction: vi.fn(), logError: vi.fn(),
}));
vi.mock('../lib/authorization', () => ({ requireProjectAccess: m.access }));
vi.mock('../lib/prisma', () => ({ prisma: {
    kanoResponse: { findMany: m.responses },
    customerRequirement: { findMany: m.requirements, updateMany: m.updateMany },
    $transaction: m.transaction,
} }));
vi.mock('../lib/logger', () => ({ createLogger: () => ({ error: m.logError }) }));
import { GET, PATCH } from '../app/api/projects/[id]/kano/analysis/route';

const params = { params: Promise.resolve({ id: 'project' }) };
const projectRoles: ProjectAccessRole[] = ['OWNER', 'EDITOR', 'COACH', 'ADMIN', 'VIEWER'];
const cases: Array<[MemberRole, ProjectAccessRole, boolean, boolean]> = [
    ...projectRoles.map(role => ['MENTEE', role, false, false] as [MemberRole, ProjectAccessRole, boolean, boolean]),
    ...projectRoles.map(role => ['MENTOR', role, role === 'EDITOR', role === 'EDITOR'] as [MemberRole, ProjectAccessRole, boolean, boolean]),
    ...projectRoles.map(role => ['PROGRAM_MANAGER', role, role === 'EDITOR', role === 'EDITOR'] as [MemberRole, ProjectAccessRole, boolean, boolean]),
    ...projectRoles.map(role => ['ADMIN', role, true, false] as [MemberRole, ProjectAccessRole, boolean, boolean]),
];
const responses = [
    { id: 'answer-a', projectId: 'project', requirementId: 'requirement-a', invitationId: 'invitation-a', positiveAnswer: 1, negativeAnswer: 5, respondentEmail: 'respondent-a@example.test' },
    { id: 'answer-b', projectId: 'project', requirementId: 'requirement-b', invitationId: 'invitation-a', positiveAnswer: 1, negativeAnswer: 5, respondentEmail: 'respondent-a@example.test' },
    { id: 'answer-c', projectId: 'project', requirementId: 'requirement-a', invitationId: 'invitation-b', positiveAnswer: 1, negativeAnswer: 5, respondentEmail: 'respondent-b@example.test' },
];

function actor(systemRole: MemberRole, projectRole: ProjectAccessRole): ProjectAccess {
    return {
        role: projectRole,
        user: { userId: 'actor', email: 'actor@example.test', name: null, role: systemRole, isAdmin: systemRole === 'ADMIN', accessExpiresAt: null },
    };
}

function request(method = 'GET', query = '', body?: unknown) {
    return new NextRequest(`http://localhost/api/projects/project/kano/analysis${query}`, {
        method,
        ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    });
}

function expectNoWrite() {
    expect(m.updateMany).not.toHaveBeenCalled();
    expect(m.transaction).not.toHaveBeenCalled();
}

beforeEach(() => {
    vi.resetAllMocks();
    m.access.mockResolvedValue(actor('MENTOR', 'EDITOR'));
    m.responses.mockResolvedValue(structuredClone(responses));
    m.requirements.mockResolvedValue([
        { id: 'requirement-a', kanoWeight: 2.5, order: 0, category: '기능', subcategory: '가치' },
        { id: 'requirement-b', kanoWeight: 4, order: 1, category: '기능', subcategory: '가치' },
    ]);
    m.updateMany.mockResolvedValue({ count: 1 });
    m.transaction.mockImplementation(async operations => Promise.all(operations));
});

describe('Kano 상세 분석 조회 권한', () => {
    it.each(cases)('%s + %s의 상세 조회 허용 %s를 적용한다', async (systemRole, projectRole, canRead) => {
        m.access.mockResolvedValue(actor(systemRole, projectRole));
        const response = await GET(request(), params);
        expect(response.status).toBe(canRead ? 200 : 403);
        expect(m.access).toHaveBeenCalledWith(expect.any(NextRequest), 'project', { write: false });
        if (canRead) {
            const body = await response.json();
            expect(body.totalResponses).toBe(3);
            expect(body.uniqueRespondents).toBe(2);
            expect(body.requirements.map((row: { requirementId: string; kanoWeight: number; responseCount: number }) =>
                [row.requirementId, row.kanoWeight, row.responseCount])).toEqual([
                ['requirement-a', 2.5, 2], ['requirement-b', 4, 1],
            ]);
            expect(body.requirements[0]).toMatchObject({ better: 1, worse: -1 });
        } else {
            const body = await response.json();
            expect(body).toEqual({ error: expect.any(String) });
            expect(m.responses).not.toHaveBeenCalled();
            expect(m.requirements).not.toHaveBeenCalled();
        }
        expectNoWrite();
    });

    it('허용된 조회에 응답이 없어도 빈 집계와 응답 수를 유지한다', async () => {
        m.responses.mockResolvedValue([]);
        const response = await GET(request(), params);
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ totalResponses: 0, uniqueRespondents: 0, requirements: [] });
        expectNoWrite();
    });
});

describe('Kano 관리용 요약 조회', () => {
    it.each([
        ['MENTEE', 'OWNER', false, false], ['PROGRAM_MANAGER', 'VIEWER', false, false],
        ['MENTOR', 'EDITOR', true, true], ['PROGRAM_MANAGER', 'EDITOR', true, true], ['ADMIN', 'OWNER', true, false],
    ] as Array<[MemberRole, ProjectAccessRole, boolean, boolean]>)('%s + %s는 응답 수와 권한만 받는다', async (systemRole, projectRole, canRead, canEdit) => {
        m.access.mockResolvedValue(actor(systemRole, projectRole));
        const response = await GET(request('GET', '?view=summary'), params);
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ canRead, canEdit, totalResponses: 3, uniqueRespondents: 2 });
        expect(m.requirements).not.toHaveBeenCalled();
        expect(m.responses).toHaveBeenCalledWith(expect.objectContaining({ where: {
            projectId: 'project', project: { id: 'project' }, requirement: { projectId: 'project' }, invitation: { projectId: 'project' },
        } }));
        expectNoWrite();
    });

    it('빈 요약에는 개별 요구사항이나 통계 값을 추가하지 않는다', async () => {
        m.access.mockResolvedValue(actor('MENTEE', 'OWNER'));
        m.responses.mockResolvedValue([]);
        expect(await (await GET(request('GET', '?view=summary'), params)).json()).toEqual({ canRead: false, canEdit: false, totalResponses: 0, uniqueRespondents: 0 });
        expect(m.requirements).not.toHaveBeenCalled();
        expectNoWrite();
    });
});

describe('Kano 가중치 수정 권한', () => {
    it.each(cases)('%s + %s의 가중치 수정 허용을 적용한다', async (systemRole, projectRole, _canRead, canEdit) => {
        m.access.mockResolvedValue(actor(systemRole, projectRole));
        const response = await PATCH(request('PATCH', '', { weights: [{ requirementId: 'requirement-a', kanoWeight: 3.5 }] }), params);
        expect(response.status).toBe(canEdit ? 200 : 403);
        expect(m.access).toHaveBeenCalledWith(expect.any(NextRequest), 'project', { write: true });
        if (canEdit) {
            expect(await response.json()).toEqual({ success: true, count: 1 });
            expect(m.updateMany).toHaveBeenCalledExactlyOnceWith({ where: { id: 'requirement-a', projectId: 'project' }, data: { kanoWeight: 3.5 } });
            expect(m.transaction).toHaveBeenCalledOnce();
        } else {
            expect(await response.json()).toEqual({ error: expect.any(String) });
            expectNoWrite();
        }
        expect(m.responses).not.toHaveBeenCalled();
        expect(m.requirements).not.toHaveBeenCalled();
    });

    it('배정 멘토의 명시적 null 초기화와 숫자 입력을 기존 방식으로 저장한다', async () => {
        const response = await PATCH(request('PATCH', '', { weights: [
            { requirementId: 'requirement-a', kanoWeight: null }, { requirementId: 'requirement-b', kanoWeight: '4.5' },
        ] }), params);
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ success: true, count: 2 });
        expect(m.updateMany.mock.calls).toEqual([
            [{ where: { id: 'requirement-a', projectId: 'project' }, data: { kanoWeight: null } }],
            [{ where: { id: 'requirement-b', projectId: 'project' }, data: { kanoWeight: 4.5 } }],
        ]);
        expect(m.transaction).toHaveBeenCalledOnce();
    });
});

describe('프로젝트 접근 거부 전달', () => {
    it.each([401, 403, 404])('%s 거부는 상세·요약·수정 모두 DB 작업 전에 전달한다', async status => {
        const denied = NextResponse.json({ error: '프로젝트 접근 거부' }, { status });
        m.access.mockResolvedValue(denied);
        for (const response of [
            await GET(request(), params), await GET(request('GET', '?view=summary'), params),
            await PATCH(request('PATCH', '', { weights: [{ requirementId: 'requirement-a', kanoWeight: 5 }] }), params),
        ]) {
            expect(response).toBe(denied);
            expect(response.status).toBe(status);
        }
        expect(m.responses).not.toHaveBeenCalled();
        expect(m.requirements).not.toHaveBeenCalled();
        expectNoWrite();
    });
});

// 예전에는 검사 없이 Number() 로 읽어 weights:[null] 은 500 이 났고 kanoWeight:99 는 그대로
// 저장돼 '매력'으로 보였다. 집계표 입력칸과 같은 0~5 만 받는다(감리 B16).
describe('Kano 가중치 입력 검증', () => {
    it.each([
        ['목록 항목이 null', { weights: [null] }, '가중치 목록 형식이 올바르지 않습니다.'],
        ['목록이 아님', { weights: 'x' }, '가중치 목록 형식이 올바르지 않습니다.'],
        ['목록이 없음', {}, '가중치 목록 형식이 올바르지 않습니다.'],
        ['요구사항 id 없음', { weights: [{ kanoWeight: 3 }] }, '가중치 목록 형식이 올바르지 않습니다.'],
        ['5 초과', { weights: [{ requirementId: 'requirement-a', kanoWeight: 99 }] }, '가중치는 0부터 5 사이의 숫자로 입력해주세요.'],
        ['음수', { weights: [{ requirementId: 'requirement-a', kanoWeight: -1 }] }, '가중치는 0부터 5 사이의 숫자로 입력해주세요.'],
        ['숫자가 아닌 문자열', { weights: [{ requirementId: 'requirement-a', kanoWeight: 'abc' }] }, '가중치는 0부터 5 사이의 숫자로 입력해주세요.'],
        ['불리언', { weights: [{ requirementId: 'requirement-a', kanoWeight: true }] }, '가중치는 0부터 5 사이의 숫자로 입력해주세요.'],
        ['값 없음', { weights: [{ requirementId: 'requirement-a' }] }, '가중치는 0부터 5 사이의 숫자로 입력해주세요.'],
    ])('%s 이면 400 으로 거절하고 아무것도 저장하지 않는다', async (_label, body, message) => {
        const response = await PATCH(request('PATCH', '', body), params);
        expect(response.status).toBe(400);
        expect((await response.json()).error).toBe(message);
        expectNoWrite();
    });

    it('범위 끝값과 빈칸은 받는다', async () => {
        const response = await PATCH(request('PATCH', '', { weights: [
            { requirementId: 'requirement-a', kanoWeight: 0 },
            { requirementId: 'requirement-b', kanoWeight: 5 },
            { requirementId: 'requirement-c', kanoWeight: '' },
        ] }), params);
        expect(response.status).toBe(200);
        expect(m.updateMany.mock.calls.map(([call]) => call.data.kanoWeight)).toEqual([0, 5, null]);
    });
});
