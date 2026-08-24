// 프로젝트 personal AI 모드가 요청자 본인의 연결만 사용하고 폴백 옵션을 전달하는지 확인한다.
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

const { POST } = await import('../app/api/projects/[id]/attributes/mentor/route');
const { parseProjectAiMode } = await import('../lib/ai/project-ai-mode');

const CONN = { vendor: 'openai', apiKey: 'sk-x', model: null };

function call(body: unknown = {}) {
    const request = new NextRequest('http://localhost/api/projects/proj_1/attributes/mentor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    return POST(request, { params: Promise.resolve({ id: 'proj_1' }) });
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
        aiMode: 'personal',
        productAttributes: [],
    });
    loadPersonalConnection.mockResolvedValue(CONN);
    runAiTask.mockResolvedValue({
        result: { questions: [], focus: '' },
        provider: 'personal',
        requestedProvider: 'personal',
        degraded: false,
    });
});

afterEach(() => vi.clearAllMocks());

describe('attributes/mentor 의 personal 모드', () => {
    it('버튼을 누른 본인의 연결을 읽어 personal 로 요청한다', async () => {
        await call({ userId: 'body_user' });
        expect(loadPersonalConnection).toHaveBeenCalledWith('user_9');
        expect(runAiTask.mock.calls[0][1]).toMatchObject({
            requested: 'personal',
            personalConnection: CONN,
        });
    });

    it('rule 모드에서는 개인 연결을 조회하지 않는다', async () => {
        findUniqueProject.mockResolvedValue({
            name: 'P',
            description: null,
            detailedDescription: null,
            aiMode: 'rule',
            productAttributes: [],
        });
        await call();
        expect(loadPersonalConnection).not.toHaveBeenCalled();
        expect(runAiTask.mock.calls[0][1]).toMatchObject({ requested: 'rule' });
    });

    it('키 미등록이어도 500 이 나지 않는다(null 이 그대로 넘어가 폴백을 탄다)', async () => {
        loadPersonalConnection.mockResolvedValue(null);
        const response = await call();
        expect(response.status).toBe(200);
        expect(runAiTask.mock.calls[0][1]).toMatchObject({
            requested: 'personal',
            personalConnection: null,
        });
    });
});

describe('프로젝트 AI 모드 파싱', () => {
    it('personal 을 personal 로 유지한다', () => {
        expect(parseProjectAiMode('personal')).toBe('personal');
    });

    it('모르는 값은 rule 로 폴백한다', () => {
        expect(parseProjectAiMode('unknown')).toBe('rule');
    });
});
