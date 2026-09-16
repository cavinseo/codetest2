// 응답자 이메일이 무인증 응답 본문과 로그로 새지 않는지 확인한다.
// 설문 조회 라우트는 토큰만 있으면 누구나 열 수 있고 설문 링크는 메신저로
// 전달되기 쉬우므로, 링크를 받은 사람이 초대받은 사람의 이메일까지 알게
// 되면 안 된다. 초대 생성 로그도 lib/logger.ts 규칙대로 식별자만 남긴다.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const invitationFindUnique = vi.fn();
const invitationCreate = vi.fn();
const projectFindUnique = vi.fn();
const requirementFindMany = vi.fn();

vi.mock('../lib/prisma', () => ({
    prisma: {
        kanoSurveyInvitation: {
            findUnique: (...args: unknown[]) => invitationFindUnique(...(args as [])),
            create: (...args: unknown[]) => invitationCreate(...(args as [])),
        },
        project: { findUnique: (...args: unknown[]) => projectFindUnique(...(args as [])) },
        customerRequirement: { findMany: (...args: unknown[]) => requirementFindMany(...(args as [])) },
    },
}));

const logInfo = vi.fn();
const logWarn = vi.fn();
const logError = vi.fn();
vi.mock('../lib/logger', () => ({
    createLogger: () => ({
        info: (...args: unknown[]) => logInfo(...args),
        warn: (...args: unknown[]) => logWarn(...args),
        error: (...args: unknown[]) => logError(...args),
    }),
}));

const sendSurveyInvitation = vi.fn();
vi.mock('../lib/email', () => ({
    sendSurveyInvitation: (...args: unknown[]) => sendSurveyInvitation(...(args as [])),
}));

// 권한 모듈은 통째로 갈아끼우지 않는다. 라우트가 나중에 다른 export 를 쓰면
// 그것이 undefined 가 되어 테스트가 라우트의 catch 로 흘러들기 때문이다.
const requireProjectAccess = vi.fn();
vi.mock('../lib/authorization', async () => {
    const actual = await vi.importActual<typeof import('../lib/authorization')>('../lib/authorization');
    return { ...actual, requireProjectAccess: (...args: unknown[]) => requireProjectAccess(...(args as [])) };
});

const { GET: getSurvey } = await import('../app/api/survey/[token]/route');
const { POST: postInvite } = await import('../app/api/projects/[id]/kano/invite/route');

const PROJECT = 'proj_1';
const RESPONDENT_EMAIL = 'respondent@example.com';

beforeEach(() => {
    vi.clearAllMocks();
    requireProjectAccess.mockResolvedValue({
        user: { userId: 'user_1', email: 'owner@example.com', name: '소유자' },
        role: 'OWNER',
    });
});

describe('무인증 설문 조회 응답', () => {
    beforeEach(() => {
        invitationFindUnique.mockResolvedValue({
            id: 'inv_1',
            projectId: PROJECT,
            email: RESPONDENT_EMAIL,
            token: 'survey-token',
            expiresAt: new Date(Date.now() + 86_400_000),
            respondedAt: null,
        });
        projectFindUnique.mockResolvedValue({ name: '테스트 프로젝트' });
        requirementFindMany.mockResolvedValue([
            {
                id: 'req_1',
                category: '성능',
                subcategory: '속도',
                requirement: '빠르게 열린다',
                kanoPositiveQ: '빠르면 어떤가요?',
                kanoNegativeQ: '느리면 어떤가요?',
                order: 0,
            },
        ]);
    });

    function surveyRequest() {
        return new NextRequest('http://localhost/api/survey/survey-token');
    }

    const params = { params: Promise.resolve({ token: 'survey-token' }) };

    it('응답자 이메일을 담지 않는다', async () => {
        const response = await getSurvey(surveyRequest(), params);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).not.toHaveProperty('respondentEmail');
        expect(JSON.stringify(body)).not.toContain(RESPONDENT_EMAIL);
    });

    it('설문을 그리는 데 필요한 값은 그대로 준다', async () => {
        const response = await getSurvey(surveyRequest(), params);
        const body = await response.json();

        expect(body.projectName).toBe('테스트 프로젝트');
        expect(body.requirements).toEqual([
            {
                id: 'req_1',
                category: '성능',
                subcategory: '속도',
                requirement: '빠르게 열린다',
                kanoPositiveQ: '빠르면 어떤가요?',
                kanoNegativeQ: '느리면 어떤가요?',
                order: 0,
            },
        ]);
    });
});

describe('Kano 초대 생성 로그', () => {
    const params = { params: Promise.resolve({ id: PROJECT }) };

    function inviteRequest() {
        return new NextRequest(`http://localhost/api/projects/${PROJECT}/kano/invite`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: RESPONDENT_EMAIL }),
        });
    }

    beforeEach(() => {
        projectFindUnique.mockResolvedValue({ name: '테스트 프로젝트' });
        invitationFindUnique.mockResolvedValue(null);
        invitationCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...data }));
        sendSurveyInvitation.mockResolvedValue(true);
    });

    it('이메일 없이 식별자와 발송 여부만 남긴다', async () => {
        const response = await postInvite(inviteRequest(), params);

        expect(response.status).toBe(200);
        expect(logInfo).toHaveBeenCalledTimes(1);

        const [message, meta] = logInfo.mock.calls[0];
        expect(message).toContain('초대');
        expect(meta).toEqual({
            projectId: PROJECT,
            invitationId: expect.any(String),
            emailSent: true,
        });
    });

    it('어떤 로그에도 이메일 문자열이 들어가지 않는다', async () => {
        await postInvite(inviteRequest(), params);

        const everyLogArgument = [...logInfo.mock.calls, ...logWarn.mock.calls, ...logError.mock.calls];
        expect(JSON.stringify(everyLogArgument)).not.toContain(RESPONDENT_EMAIL);
    });

    // 초대를 만든 사람은 방금 자기가 입력한 주소를 되돌려받아야 화면에
    // 초대 목록을 그릴 수 있다. 로그를 막는 것이 응답까지 막지는 않는다.
    it('응답 본문에는 초대 대상 이메일이 그대로 있다', async () => {
        const response = await postInvite(inviteRequest(), params);
        const body = await response.json();

        expect(body.invitation.email).toBe(RESPONDENT_EMAIL);
    });
});

// requireProjectAccess 가 NextResponse 를 돌려주면(권한 없음) 그대로 흘려보내는지도
// 함께 확인한다. 로그 정리가 권한 경계를 건드리지 않았음을 보이는 표본이다.
describe('Kano 초대 권한 거부', () => {
    it('권한 거부 응답을 그대로 돌려주고 아무것도 만들지 않는다', async () => {
        requireProjectAccess.mockResolvedValue(
            NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
        );

        const response = await postInvite(
            new NextRequest(`http://localhost/api/projects/${PROJECT}/kano/invite`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: RESPONDENT_EMAIL }),
            }),
            { params: Promise.resolve({ id: PROJECT }) }
        );

        expect(response.status).toBe(403);
        expect(invitationCreate).not.toHaveBeenCalled();
    });
});
