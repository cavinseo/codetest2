// Google Forms 시스템 초대가 실재하는 사용자 ID 를 참조하는지 확인한다.
//
// invitedBy 는 users.id 에 대한 필수 FK 다. 예전에는 'system' 이라는 문자열을
// 넣어서, 그런 사용자가 없는 모든 프로젝트에서 P2003 으로 항상 실패했다.
// Prisma 를 mock 하는 테스트라 FK 자체는 돌지 않으므로, 넘기는 값이
// 요청자의 userId 인지를 직접 확인한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const findRequirements = vi.fn();
const createManyResponses = vi.fn();
const deleteManyResponses = vi.fn();
const upsertInvitation = vi.fn();
const lockProject = vi.fn();
const tx = {
    $queryRaw: lockProject,
    kanoSurveyInvitation: { upsert: upsertInvitation },
    kanoResponse: { deleteMany: deleteManyResponses, createMany: createManyResponses },
};

vi.mock('../lib/prisma', () => ({
    prisma: {
        customerRequirement: { findMany: findRequirements },
        $transaction: (callback: (client: typeof tx) => unknown) => callback(tx),
    },
}));

const requireProjectAccess = vi.fn();
vi.mock('../lib/authorization', () => ({
    requireProjectAccess: (...args: unknown[]) => requireProjectAccess(...(args as [])),
}));

vi.mock('../lib/service-settings', () => ({
    isGoogleConfigured: () => Promise.resolve(true),
    getGoogleToken: () => Promise.resolve({ accessToken: 'token_x' }),
}));

const getFormResponses = vi.fn();
vi.mock('../lib/google-forms', () => ({
    getFormResponses: (...args: unknown[]) => getFormResponses(...(args as [])),
}));

vi.mock('../lib/feature-flags', () => ({
    GOOGLE_FORMS_INTEGRATION_ENABLED: true,
    GOOGLE_FORMS_DISABLED_MESSAGE: '',
}));

const { POST } = await import('../app/api/projects/[id]/kano/form-responses/route');

const REQUESTER = { userId: 'user_42', email: 'pm@ks-qfd.com', name: '매니저' };

function postRequest(body: unknown): NextRequest {
    return new NextRequest('http://localhost/api/projects/proj_1/kano/form-responses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

const params = Promise.resolve({ id: 'proj_1' });

beforeEach(() => {
    requireProjectAccess.mockResolvedValue({ user: REQUESTER, role: 'OWNER' });
    findRequirements.mockResolvedValue([{ id: 'req_1', order: 0 }]);
    upsertInvitation.mockResolvedValue({ id: 'inv_1' });
    createManyResponses.mockResolvedValue({ count: 1 });
    getFormResponses.mockResolvedValue({
        responses: [
            {
                respondentEmail: 'r@example.com',
                submittedAt: '2026-08-20T00:00:00.000Z',
                answers: [{ requirementIndex: 0, functional: 'LIKE', dysfunctional: 'TOLERATE' }],
            },
        ],
    });
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('form-responses 시스템 초대', () => {
    it('invitedBy 에 요청자의 userId 를 넣는다', async () => {
        const res = await POST(postRequest({ formId: 'form_1' }), { params });

        expect(res.status).toBe(200);
        expect(upsertInvitation).toHaveBeenCalledTimes(1);
        const created = upsertInvitation.mock.calls[0][0].create;
        expect(created.invitedBy).toBe('user_42');
    });

    it("invitedBy 에 'system' 같은 가짜 ID 를 넣지 않는다", async () => {
        await POST(postRequest({ formId: 'form_1' }), { params });

        const created = upsertInvitation.mock.calls[0][0].create;
        expect(created.invitedBy).not.toBe('system');
    });

    it('초대가 이미 있으면 기존 ID에 응답을 저장한다', async () => {
        upsertInvitation.mockResolvedValue({ id: 'inv_old' });

        await POST(postRequest({ formId: 'form_1' }), { params });

        expect(createManyResponses.mock.calls[0][0].data[0].invitationId).toBe('inv_old');
    });

    it('같은 Google Forms 응답을 다시 가져오면 기존 응답을 지운 뒤 한 번만 저장한다', async () => {
        const response = await POST(postRequest({ formId: 'form_1' }), { params });

        expect(response.status).toBe(200);
        expect(lockProject.mock.calls[0][0].join('')).toContain('pg_advisory_xact_lock');
        expect(lockProject.mock.calls[0].slice(1)).toContain('google-forms-sync:proj_1');
        expect(deleteManyResponses).toHaveBeenCalledWith({
            where: {
                projectId: 'proj_1',
                invitationId: 'inv_1',
                OR: [{ respondentEmail: 'r@example.com', requirementId: 'req_1' }],
            },
        });
        expect(deleteManyResponses.mock.invocationCallOrder[0]).toBeLessThan(
            createManyResponses.mock.invocationCallOrder[0]
        );
    });

    it('같은 응답자의 같은 요구사항은 가장 마지막 응답만 한 번 저장한다', async () => {
        getFormResponses.mockResolvedValue({
            responses: [
                {
                    respondentEmail: 'r@example.com',
                    submittedAt: '2026-08-20T00:00:00.000Z',
                    answers: [{ requirementIndex: 0, functional: 'LIKE', dysfunctional: 'TOLERATE' }],
                },
                {
                    respondentEmail: 'r@example.com',
                    submittedAt: '2026-08-21T00:00:00.000Z',
                    answers: [{ requirementIndex: 0, functional: 'EXPECT', dysfunctional: 'LIKE' }],
                },
            ],
        });

        const response = await POST(postRequest({ formId: 'form_1' }), { params });

        expect((await response.json()).importedCount).toBe(1);
        expect(createManyResponses.mock.calls[0][0].data).toMatchObject([
            { respondentEmail: 'r@example.com', requirementId: 'req_1', positiveAnswer: 2, negativeAnswer: 1 },
        ]);
    });
});
