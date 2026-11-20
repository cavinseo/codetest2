// Kano 단건·일괄 초청 메일 링크가 실제 요청의 공개 주소를 사용하는지 검증한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
    findProject: vi.fn(),
    findInvitation: vi.fn(),
    findInvitations: vi.fn(),
    createInvitation: vi.fn(),
    sendSurveyInvitation: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
    prisma: {
        project: { findUnique: mocks.findProject },
        kanoSurveyInvitation: {
            findFirst: mocks.findInvitation,
            findMany: mocks.findInvitations,
            create: mocks.createInvitation,
        },
    },
}));
vi.mock('../lib/email', () => ({ sendSurveyInvitation: mocks.sendSurveyInvitation }));
vi.mock('../lib/id', () => ({ generateId: () => 'inv_test' }));
vi.mock('../lib/authorization', () => ({
    requireProjectAccess: async () => ({ user: { userId: 'user_test' }, role: 'OWNER' }),
}));
vi.mock('../lib/logger', () => ({
    createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const { POST: inviteOne } = await import('../app/api/projects/[id]/kano/invite/route');
const { POST: inviteBulk } = await import('../app/api/projects/[id]/kano/invite/bulk/route');
const REQUEST_ORIGIN = 'https://survey.example.com';
const TEST_TOKENS = [
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
] as const;
const PROJECT_ID = 'proj_test';
const PROJECT_NAME = '테스트 프로젝트';
const RECIPIENTS = ['first@example.test', 'second@example.test'];
const params = { params: Promise.resolve({ id: PROJECT_ID }) };

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(crypto, 'randomUUID')
        .mockReturnValueOnce(TEST_TOKENS[0])
        .mockReturnValueOnce(TEST_TOKENS[1]);
    mocks.findProject.mockResolvedValue({ name: PROJECT_NAME });
    mocks.findInvitation.mockResolvedValue(null);
    mocks.findInvitations.mockResolvedValue([]);
    mocks.createInvitation.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...data }));
    mocks.sendSurveyInvitation.mockResolvedValue(true);
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
});

describe.each([
    ['환경설정 누락', undefined],
    ['localhost 설정', 'http://localhost:3000'],
    ['경로와 마지막 슬래시가 있는 옛 도메인 설정', 'https://old.example.com/auth/'],
])('Kano 초청 링크의 요청 주소 사용 — %s', (_label, nextAuthUrl) => {
    beforeEach(() => {
        vi.stubEnv('NEXTAUTH_URL', nextAuthUrl);
    });

    it('단건 초청의 API 결과와 메일 링크가 요청 origin의 설문 경로와 일치한다', async () => {
        const request = new NextRequest(`${REQUEST_ORIGIN}/api/projects/${PROJECT_ID}/kano/invite`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: RECIPIENTS[0] }),
        });

        const response = await inviteOne(request, params);
        const body = await response.json();
        const expectedLink = `${REQUEST_ORIGIN}/survey/${TEST_TOKENS[0]}`;

        expect(response.status).toBe(200);
        expect(body.invitation.token).toBe(TEST_TOKENS[0]);
        expect(body.surveyLink).toBe(expectedLink);
        expect(mocks.createInvitation).toHaveBeenCalledWith({
            data: expect.objectContaining({ token: TEST_TOKENS[0] }),
        });
        expect(mocks.sendSurveyInvitation).toHaveBeenCalledExactlyOnceWith(RECIPIENTS[0], expectedLink, PROJECT_NAME);
    });

    it('일괄 초청의 각 API 결과와 메일 링크가 요청 origin의 설문 경로와 일치한다', async () => {
        const request = new NextRequest(`${REQUEST_ORIGIN}/api/projects/${PROJECT_ID}/kano/invite/bulk`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ emails: RECIPIENTS }),
        });

        const response = await inviteBulk(request, params);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.summary).toEqual({ invited: 2, skipped: 0, failed: 0, emailSent: 2 });
        expect(body.results).toEqual(RECIPIENTS.map((email, index) => ({
            email,
            status: 'invited',
            surveyLink: `${REQUEST_ORIGIN}/survey/${TEST_TOKENS[index]}`,
        })));
        expect(mocks.createInvitation).toHaveBeenCalledTimes(2);
        expect(mocks.sendSurveyInvitation).toHaveBeenCalledTimes(2);
        RECIPIENTS.forEach((email, index) => {
            expect(mocks.createInvitation).toHaveBeenNthCalledWith(index + 1, {
                data: expect.objectContaining({ email, token: TEST_TOKENS[index] }),
            });
            expect(mocks.sendSurveyInvitation).toHaveBeenNthCalledWith(
                index + 1, email, `${REQUEST_ORIGIN}/survey/${TEST_TOKENS[index]}`, PROJECT_NAME
            );
        });
    });
});

// 단건과 일괄이 같은 주소를 다른 대소문자로 받아도 같은 사람으로 본다(감리 B12).
describe('Kano 초청 이메일 대소문자', () => {
    const singleRequest = (email: string) => new NextRequest(`${REQUEST_ORIGIN}/api/projects/${PROJECT_ID}/kano/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
    });

    it('단건 초청은 일괄과 같이 소문자로 저장하고 대소문자 없이 중복을 찾는다', async () => {
        const response = await inviteOne(singleRequest(' Foo@Example.TEST '), params);

        expect(response.status).toBe(200);
        expect(mocks.findInvitation).toHaveBeenCalledWith({
            where: { projectId: PROJECT_ID, email: { equals: 'foo@example.test', mode: 'insensitive' } },
        });
        expect(mocks.createInvitation.mock.calls[0][0].data.email).toBe('foo@example.test');
        expect(mocks.sendSurveyInvitation.mock.calls[0][0]).toBe('foo@example.test');
    });

    it('단건 초청은 대소문자만 다른 기존 초대가 있으면 새로 만들지 않는다', async () => {
        mocks.findInvitation.mockResolvedValue({ id: 'inv_old', email: 'Foo@Example.test' });

        const response = await inviteOne(singleRequest('foo@example.test'), params);

        expect(response.status).toBe(400);
        expect(mocks.createInvitation).not.toHaveBeenCalled();
    });

    it('일괄 초청은 예전에 대소문자를 살려 저장된 초대를 이미 초대한 주소로 건너뛴다', async () => {
        mocks.findInvitations.mockResolvedValue([{ email: 'Foo@Example.test' }]);
        const request = new NextRequest(`${REQUEST_ORIGIN}/api/projects/${PROJECT_ID}/kano/invite/bulk`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ emails: ['foo@example.test'] }),
        });

        const response = await inviteBulk(request, params);
        const body = await response.json();

        expect(mocks.findInvitations).toHaveBeenCalledWith({
            where: { projectId: PROJECT_ID, email: { in: ['foo@example.test'], mode: 'insensitive' } },
            select: { email: true },
        });
        expect(body.results).toEqual([expect.objectContaining({ email: 'foo@example.test', status: 'skipped' })]);
        expect(mocks.createInvitation).not.toHaveBeenCalled();
    });
});
