// 본인 AI 연결 API가 키를 숨기고 세션 사용자의 연결만 관리하는지 확인한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const findUniqueConn = vi.fn();
const upsertConn = vi.fn();
const deleteManyConn = vi.fn();

vi.mock('../lib/prisma', () => ({
    prisma: {
        userAiConnection: {
            findUnique: findUniqueConn,
            upsert: upsertConn,
            deleteMany: deleteManyConn,
        },
    },
}));

const requireAuth = vi.fn();
vi.mock('../lib/auth', () => ({
    requireAuth: (...args: unknown[]) => requireAuth(...(args as [])),
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

const verifyPersonalConnection = vi.fn();
vi.mock('../lib/ai/personal', () => ({
    verifyPersonalConnection: (...args: unknown[]) => verifyPersonalConnection(...(args as [])),
}));

// settings-crypto 는 실제 구현을 쓰되 키 재료를 환경변수로 준다.
vi.stubEnv('SETTINGS_ENCRYPTION_KEY', 'test-key-material-for-ai-connection');

const { encryptSettingsValue } = await import('../lib/settings-crypto');
const { GET, PUT, DELETE } = await import('../app/api/me/ai-connection/route');
const { POST } = await import('../app/api/me/ai-connection/verify/route');

function authAs(userId = 'user_1') {
    requireAuth.mockResolvedValue({
        userId,
        email: 'u@x.com',
        name: '사용자',
        isAdmin: false,
        role: 'MENTEE',
        accessExpiresAt: null,
    });
}

function jsonRequest(method: string, body?: unknown): NextRequest {
    return new NextRequest('http://localhost/api/me/ai-connection', {
        method,
        headers: { 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
}

beforeEach(() => {
    authAs();
    findUniqueConn.mockResolvedValue(null);
    upsertConn.mockResolvedValue({});
    deleteManyConn.mockResolvedValue({ count: 1 });
    verifyPersonalConnection.mockResolvedValue({ ok: true, message: '연결에 성공했습니다.' });
});

afterEach(() => vi.clearAllMocks());

describe('저장', () => {
    it('키를 암호화해 저장한다(평문이 DB 로 가지 않는다)', async () => {
        const res = await PUT(jsonRequest('PUT', { vendor: 'openai', apiKey: 'sk-plain-secret' }));
        expect(res.status).toBe(200);
        const saved = upsertConn.mock.calls[0][0];
        expect(saved.create.apiKey).toMatch(/^enc:v1:/);
        expect(JSON.stringify(saved)).not.toContain('sk-plain-secret');
    });

    it('응답에 키가 어떤 형태로도 실리지 않는다', async () => {
        findUniqueConn.mockResolvedValue({ vendor: 'openai', model: null, updatedAt: new Date() });
        const res = await PUT(jsonRequest('PUT', { vendor: 'openai', apiKey: 'sk-plain-secret' }));
        const serialized = JSON.stringify(await res.json());
        expect(serialized).not.toContain('sk-plain-secret');
        expect(serialized).not.toContain('enc:v1:');
        expect(serialized).not.toContain('apiKey');
    });

    it('키를 로그에 남기지 않는다', async () => {
        await PUT(jsonRequest('PUT', { vendor: 'openai', apiKey: 'sk-log-secret' }));

        const serializedLogs = JSON.stringify([
            logInfo.mock.calls,
            logWarn.mock.calls,
            logError.mock.calls,
        ]);
        expect(serializedLogs).not.toContain('sk-log-secret');
        expect(serializedLogs).not.toContain('enc:v1:');
        expect(serializedLogs).not.toContain('apiKey');
    });

    it('모르는 벤더를 막는다', async () => {
        expect((await PUT(jsonRequest('PUT', { vendor: 'azure', apiKey: 'k' }))).status).toBe(400);
        expect(upsertConn).not.toHaveBeenCalled();
    });

    it('새 등록에 키가 없으면 막는다', async () => {
        expect((await PUT(jsonRequest('PUT', { vendor: 'openai' }))).status).toBe(400);
    });

    it('같은 벤더의 모델만 바꿀 때는 키를 다시 받지 않는다', async () => {
        findUniqueConn.mockResolvedValue({ vendor: 'openai', model: null, updatedAt: new Date() });
        const res = await PUT(jsonRequest('PUT', { vendor: 'openai', model: 'gpt-4o' }));
        expect(res.status).toBe(200);
        // apiKey 를 update 에 싣지 않아 기존 키가 유지된다.
        expect(upsertConn.mock.calls[0][0].update.apiKey).toBeUndefined();
    });

    it('벤더를 바꾸면 새 키를 요구한다', async () => {
        findUniqueConn.mockResolvedValue({ vendor: 'openai', model: null, updatedAt: new Date() });
        expect((await PUT(jsonRequest('PUT', { vendor: 'gemini' }))).status).toBe(400);
    });
});

describe('조회·삭제', () => {
    it('GET 은 요약만 준다', async () => {
        findUniqueConn.mockResolvedValue({
            vendor: 'gemini',
            model: 'gemini-2.0-flash',
            updatedAt: new Date(),
        });
        const body = await (await GET(jsonRequest('GET'))).json();
        expect(body.connection.vendor).toBe('gemini');
        expect(JSON.stringify(body)).not.toContain('apiKey');
    });

    it('DELETE 는 행이 없어도 성공한다', async () => {
        deleteManyConn.mockResolvedValue({ count: 0 });
        expect((await DELETE(jsonRequest('DELETE'))).status).toBe(200);
    });

    it('본문·쿼리의 userId 를 무시하고 세션 userId 만 쓴다', async () => {
        authAs('session_user');
        const request = new NextRequest(
            'http://localhost/api/me/ai-connection?userId=query_user',
            {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: 'body_user',
                    vendor: 'openai',
                    apiKey: 'k',
                }),
            }
        );

        await PUT(request);

        expect(findUniqueConn.mock.calls.every(
            ([query]) => query.where.userId === 'session_user'
        )).toBe(true);
        expect(upsertConn.mock.calls[0][0].where).toEqual({ userId: 'session_user' });
        expect(upsertConn.mock.calls[0][0].create.userId).toBe('session_user');
    });
});

describe('연결 확인', () => {
    it('등록된 연결이 없으면 400을 돌려준다', async () => {
        expect((await POST(jsonRequest('POST'))).status).toBe(400);
        expect(verifyPersonalConnection).not.toHaveBeenCalled();
    });

    it('verifyPersonalConnection 결과를 그대로 전달한다', async () => {
        const result = { ok: false, message: 'API 키가 유효하지 않습니다.' };
        findUniqueConn.mockResolvedValue({
            userId: 'user_1',
            vendor: 'anthropic',
            apiKey: encryptSettingsValue('stored-secret'),
            model: 'claude-haiku-4-5',
            createdAt: new Date(),
            updatedAt: new Date(),
        });
        verifyPersonalConnection.mockResolvedValue(result);

        const res = await POST(jsonRequest('POST'));

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual(result);
        expect(verifyPersonalConnection).toHaveBeenCalledWith({
            vendor: 'anthropic',
            apiKey: 'stored-secret',
            model: 'claude-haiku-4-5',
        });
    });
});
