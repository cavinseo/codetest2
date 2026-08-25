// AI 라우트가 프로젝트 설정 대신 요청자 본인의 연결 모드만 따르는지 확인한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const runAiTask = vi.fn();
vi.mock('../lib/ai/registry', () => ({
    runAiTask: (...args: unknown[]) => runAiTask(...(args as [])),
}));

const loadPersonalConnection = vi.fn();
vi.mock('../lib/ai/personal-store', () => ({
    loadPersonalConnection: (...args: unknown[]) => loadPersonalConnection(...(args as [])),
}));

const requireProjectAccess = vi.fn();
vi.mock('../lib/authorization', () => ({
    requireProjectAccess: (...args: unknown[]) => requireProjectAccess(...(args as [])),
}));

const findUniqueProject = vi.fn();
vi.mock('../lib/prisma', () => ({
    prisma: { project: { findUnique: findUniqueProject } },
}));

const getAiSettings = vi.fn();
vi.mock('../lib/service-settings', () => ({
    getAiSettings: (...args: unknown[]) => getAiSettings(...(args as [])),
}));

const { POST: mentorPost } = await import('../app/api/projects/[id]/attributes/mentor/route');
const { POST: specPost } = await import('../app/api/projects/[id]/spec/generate/route');

const API_CONNECTION = {
    mode: 'api',
    vendor: 'openai',
    apiKey: 'sk-x',
    model: null,
    mcpBaseUrl: null,
    mcpModel: null,
    localBaseUrl: null,
    localModel: null,
};

const RULE_CONNECTION = {
    ...API_CONNECTION,
    mode: 'rule',
    vendor: null,
    apiKey: null,
};

const LOCAL_CONNECTION = {
    ...RULE_CONNECTION,
    mode: 'local',
    localBaseUrl: 'http://localhost:11434/v1',
    localModel: 'llama3',
};

function callMentor(body: unknown = {}) {
    const request = new NextRequest('http://localhost/api/projects/proj_1/attributes/mentor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    return mentorPost(request, { params: Promise.resolve({ id: 'proj_1' }) });
}

function callSpec(body: unknown = {}) {
    const request = new NextRequest('http://localhost/api/projects/proj_1/spec/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    return specPost(request, { params: Promise.resolve({ id: 'proj_1' }) });
}

beforeEach(() => {
    requireProjectAccess.mockResolvedValue({
        user: {
            userId: 'user_9',
            email: 'u@x.com',
            name: '사용자',
            isAdmin: false,
            role: 'MENTEE',
            accessExpiresAt: null,
        },
        role: 'OWNER',
    });
    findUniqueProject.mockResolvedValue({
        name: 'P',
        description: null,
        detailedDescription: null,
        productAttributes: [],
        specFunctions: [],
        requirements: [],
        technicalCharacteristics: [],
        targetSpecs: [],
    });
    loadPersonalConnection.mockResolvedValue(API_CONNECTION);
    getAiSettings.mockResolvedValue({
        localBaseUrl: 'http://localhost:11434/v1',
        localModel: 'llama3',
    });
    runAiTask.mockResolvedValue({
        result: { questions: [], focus: '' },
        provider: 'rule',
        requestedProvider: 'rule',
        degraded: false,
    });
});

afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
});

describe('회원 AI 연결 기반 라우팅', () => {
    it('연결이 없으면 오류나 강등 없이 rule 을 요청한다', async () => {
        loadPersonalConnection.mockResolvedValue(null);

        const response = await callMentor();
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toMatchObject({ requestedProvider: 'rule', degraded: false });
        expect(runAiTask.mock.calls[0][1]).toMatchObject({
            requested: 'rule',
            personalConnection: null,
        });
    });

    it("mode:'rule' 연결은 기본 선택인 rule 을 요청한다", async () => {
        loadPersonalConnection.mockResolvedValue(RULE_CONNECTION);

        await callMentor();

        expect(runAiTask.mock.calls[0][1]).toMatchObject({
            requested: 'rule',
            personalConnection: RULE_CONNECTION,
        });
    });

    it("mode:'api' 연결은 personal 과 연결을 함께 전달한다", async () => {
        await callMentor();

        expect(runAiTask.mock.calls[0][1]).toMatchObject({
            requested: 'personal',
            personalConnection: API_CONNECTION,
        });
    });

    it('본문 userId 대신 접근 세션의 userId 로만 연결을 읽는다', async () => {
        await callMentor({ userId: 'body_user' });

        expect(loadPersonalConnection).toHaveBeenCalledTimes(1);
        expect(loadPersonalConnection).toHaveBeenCalledWith('user_9');
        expect(loadPersonalConnection).not.toHaveBeenCalledWith('body_user');
    });

    it("mode:'local' 연결이고 서버 로컬 실행이 꺼지면 spec 브라우저 relay 를 제안한다", async () => {
        vi.stubEnv('AI_LOCAL_SERVER_DISABLED', '1');
        loadPersonalConnection.mockResolvedValue(LOCAL_CONNECTION);
        runAiTask.mockResolvedValue({
            result: { cores: [] },
            provider: 'rule',
            requestedProvider: 'rule',
            degraded: false,
        });

        const response = await callSpec();
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(loadPersonalConnection).toHaveBeenCalledWith('user_9');
        expect(runAiTask.mock.calls[0][1]).toMatchObject({
            requested: 'rule',
            personalConnection: LOCAL_CONNECTION,
        });
        expect(body.browserRelay).toMatchObject({
            task: 'specDraft',
            preferredModel: 'llama3',
        });
    });
});
