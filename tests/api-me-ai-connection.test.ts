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

function connectionSummary(overrides: Record<string, unknown> = {}) {
    return {
        mode: 'api',
        vendor: 'openai',
        model: null,
        remoteBaseUrl: null,
        remoteModel: null,
        localBaseUrl: null,
        localModel: null,
        updatedAt: new Date(),
        ...overrides,
    };
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
        const res = await PUT(jsonRequest('PUT', {
            mode: 'api',
            vendor: 'openai',
            apiKey: 'sk-plain-secret',
        }));
        expect(res.status).toBe(200);
        const saved = upsertConn.mock.calls[0][0];
        expect(saved.create.mode).toBe('api');
        expect(saved.create.apiKey).toMatch(/^enc:v1:/);
        expect(JSON.stringify(saved)).not.toContain('sk-plain-secret');
    });

    it('응답에 키가 어떤 형태로도 실리지 않는다', async () => {
        findUniqueConn.mockResolvedValue(connectionSummary());
        const res = await PUT(jsonRequest('PUT', {
            mode: 'api',
            vendor: 'openai',
            apiKey: 'sk-plain-secret',
        }));
        const serialized = JSON.stringify(await res.json());
        expect(serialized).not.toContain('sk-plain-secret');
        expect(serialized).not.toContain('enc:v1:');
        expect(serialized).not.toContain('apiKey');
    });

    it('키를 로그에 남기지 않는다', async () => {
        await PUT(jsonRequest('PUT', {
            mode: 'api',
            vendor: 'openai',
            apiKey: 'sk-log-secret',
        }));

        const serializedLogs = JSON.stringify([
            logInfo.mock.calls,
            logWarn.mock.calls,
            logError.mock.calls,
        ]);
        expect(serializedLogs).not.toContain('sk-log-secret');
        expect(serializedLogs).not.toContain('enc:v1:');
        expect(serializedLogs).not.toContain('apiKey');
    });

    it('모르는 모드를 막는다', async () => {
        const res = await PUT(jsonRequest('PUT', {
            mode: 'unknown',
            vendor: 'openai',
            apiKey: 'k',
        }));

        expect(res.status).toBe(400);
        expect(upsertConn).not.toHaveBeenCalled();
    });

    it('모르는 벤더를 막는다', async () => {
        expect((await PUT(jsonRequest('PUT', {
            mode: 'api',
            vendor: 'azure',
            apiKey: 'k',
        }))).status).toBe(400);
        expect(upsertConn).not.toHaveBeenCalled();
    });

    it('api 모드에는 벤더가 필요하다', async () => {
        expect((await PUT(jsonRequest('PUT', { mode: 'api', apiKey: 'k' }))).status).toBe(400);
        expect(upsertConn).not.toHaveBeenCalled();
    });

    it('새 등록에 키가 없으면 막는다', async () => {
        expect((await PUT(jsonRequest('PUT', { mode: 'api', vendor: 'openai' }))).status).toBe(400);
    });

    it('같은 벤더의 모델만 바꿀 때는 키를 다시 받지 않는다', async () => {
        findUniqueConn.mockResolvedValue(connectionSummary());
        const res = await PUT(jsonRequest('PUT', {
            mode: 'api',
            vendor: 'openai',
            model: 'gpt-4o',
        }));
        expect(res.status).toBe(200);
        // apiKey 를 update 에 싣지 않아 기존 키가 유지된다.
        expect(upsertConn.mock.calls[0][0].update.apiKey).toBeUndefined();
    });

    it('벤더를 바꾸면 새 키를 요구한다', async () => {
        findUniqueConn.mockResolvedValue(connectionSummary());
        expect((await PUT(jsonRequest('PUT', {
            mode: 'api',
            vendor: 'gemini',
        }))).status).toBe(400);
    });

    it('mcp 주소는 https 공인 도메인만 허용하고 오류 메시지를 돌려준다', async () => {
        const res = await PUT(jsonRequest('PUT', {
            mode: 'remote',
            remoteBaseUrl: 'http://localhost:3000/v1',
        }));

        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ error: '원격 엔드포인트는 https 만 허용됩니다.' });
        expect(upsertConn).not.toHaveBeenCalled();
    });

    it('mcp 키에도 암호화·응답 무키·로그 무키·세션 userId 불변식을 지킨다', async () => {
        authAs('session_user');
        findUniqueConn.mockResolvedValue(connectionSummary({
            mode: 'mcp',
            vendor: null,
            remoteBaseUrl: 'https://mcp.example.com/v1',
            remoteModel: 'remote-model',
        }));
        const res = await PUT(jsonRequest('PUT', {
            userId: 'body_user',
            mode: 'remote',
            remoteBaseUrl: 'https://mcp.example.com/v1///?ignored=1',
            remoteModel: 'remote-model',
            apiKey: 'mcp-plain-secret',
        }));

        expect(res.status).toBe(200);
        const saved = upsertConn.mock.calls[0][0];
        expect(saved.where).toEqual({ userId: 'session_user' });
        expect(saved.create.userId).toBe('session_user');
        // 원격 모드는 DB 에 예전 이름 그대로 저장한다(N3, lib/ai/personal-vendors).
        expect(saved.create.mode).toBe('mcp');
        expect(saved.create.remoteBaseUrl).toBe('https://mcp.example.com/v1');
        expect(saved.create.apiKey).toMatch(/^enc:v1:/);
        expect(JSON.stringify(saved)).not.toContain('mcp-plain-secret');
        const responseBody = await res.json();
        expect(responseBody.connection.mode).toBe('remote');
        expect(JSON.stringify(responseBody)).not.toContain('apiKey');
        expect(JSON.stringify([logInfo.mock.calls, logWarn.mock.calls, logError.mock.calls]))
            .not.toContain('mcp-plain-secret');
    });

    it('mcp 모드는 키 없이도 저장한다', async () => {
        const res = await PUT(jsonRequest('PUT', {
            mode: 'remote',
            remoteBaseUrl: 'https://mcp.example.com/v1',
        }));

        expect(res.status).toBe(200);
        expect(upsertConn.mock.calls[0][0].create.apiKey).toBeNull();
        // 남아 있을지 모를 예전 키도 지운다(B11).
        expect(upsertConn.mock.calls[0][0].update.apiKey).toBeNull();
    });

    describe('저장된 키는 입력한 곳에만 보낸다 (B11)', () => {
        it('api 에서 키 없이 mcp 로 바꾸면 벤더 키를 지워 새 주소로 보내지 않는다', async () => {
            findUniqueConn.mockResolvedValue(connectionSummary());
            const res = await PUT(jsonRequest('PUT', { mode: 'remote', remoteBaseUrl: 'https://attacker.example.com/v1' }));

            expect(res.status).toBe(200);
            expect(upsertConn.mock.calls[0][0].update).toMatchObject({ vendor: null, apiKey: null });
        });

        it('mcp 주소를 바꾸면서 키를 비우면 예전 MCP 키를 지운다', async () => {
            findUniqueConn.mockResolvedValue(connectionSummary({ mode: 'mcp', vendor: null, remoteBaseUrl: 'https://old.example.com/v1' }));
            await PUT(jsonRequest('PUT', { mode: 'remote', remoteBaseUrl: 'https://new.example.com/v1' }));

            expect(upsertConn.mock.calls[0][0].update.apiKey).toBeNull();
        });

        it('같은 mcp 주소에서 모델만 바꾸면 키를 유지한다', async () => {
            findUniqueConn.mockResolvedValue(connectionSummary({ mode: 'mcp', vendor: null, remoteBaseUrl: 'https://mcp.example.com/v1' }));
            await PUT(jsonRequest('PUT', { mode: 'remote', remoteBaseUrl: 'https://mcp.example.com/v1', remoteModel: 'other' }));

            expect(upsertConn.mock.calls[0][0].update).not.toHaveProperty('apiKey');
        });

        it('벤더가 남은 예전 mcp 행은 키의 출처를 알 수 없어 지운다', async () => {
            findUniqueConn.mockResolvedValue(connectionSummary({ mode: 'mcp', vendor: 'openai', remoteBaseUrl: 'https://mcp.example.com/v1' }));
            await PUT(jsonRequest('PUT', { mode: 'remote', remoteBaseUrl: 'https://mcp.example.com/v1' }));

            expect(upsertConn.mock.calls[0][0].update.apiKey).toBeNull();
        });

        it('rule 을 거쳐 같은 mcp 주소로 돌아오면 키를 다시 받는다', async () => {
            findUniqueConn.mockResolvedValue(connectionSummary({ mode: 'rule', vendor: null, remoteBaseUrl: 'https://mcp.example.com/v1' }));
            await PUT(jsonRequest('PUT', { mode: 'remote', remoteBaseUrl: 'https://mcp.example.com/v1' }));

            expect(upsertConn.mock.calls[0][0].update.apiKey).toBeNull();
        });

        it('새 키를 함께 보내면 주소가 바뀌어도 그 키로 저장한다', async () => {
            findUniqueConn.mockResolvedValue(connectionSummary());
            await PUT(jsonRequest('PUT', { mode: 'remote', remoteBaseUrl: 'https://mcp.example.com/v1', apiKey: 'new-mcp-key' }));

            expect(upsertConn.mock.calls[0][0].update.apiKey).toMatch(/^enc:v1:/);
        });

        it('mcp 에서 같은 벤더 이름이 남아 있어도 api 로 돌아가면 새 키를 요구한다', async () => {
            findUniqueConn.mockResolvedValue(connectionSummary({ mode: 'mcp', vendor: 'openai', remoteBaseUrl: 'https://mcp.example.com/v1' }));
            const res = await PUT(jsonRequest('PUT', { mode: 'api', vendor: 'openai' }));

            expect(res.status).toBe(400);
            expect(upsertConn).not.toHaveBeenCalled();
        });

        it('rule 을 거쳐 같은 벤더의 api 로 돌아오면 그 벤더 키를 유지한다', async () => {
            findUniqueConn.mockResolvedValue(connectionSummary({ mode: 'rule', vendor: 'openai' }));
            const res = await PUT(jsonRequest('PUT', { mode: 'api', vendor: 'openai' }));

            expect(res.status).toBe(200);
            expect(upsertConn.mock.calls[0][0].update).not.toHaveProperty('apiKey');
        });
    });

    it('local 모드는 비운 주소를 허용한다', async () => {
        const res = await PUT(jsonRequest('PUT', { mode: 'local', localModel: 'qwen' }));

        expect(res.status).toBe(200);
        expect(upsertConn.mock.calls[0][0].update).toEqual({
            mode: 'local',
            localBaseUrl: null,
            localModel: 'qwen',
        });
    });

    it('local 모드는 localhost 주소만 허용한다', async () => {
        const allowed = await PUT(jsonRequest('PUT', {
            mode: 'local',
            localBaseUrl: 'http://localhost:11434/v1',
        }));
        expect(allowed.status).toBe(200);
        expect(upsertConn.mock.calls[0][0].update.localBaseUrl)
            .toBe('http://localhost:11434/v1');

        upsertConn.mockClear();
        const denied = await PUT(jsonRequest('PUT', {
            mode: 'local',
            localBaseUrl: 'https://example.com/v1',
        }));
        expect(denied.status).toBe(400);
        expect(await denied.json()).toEqual({
            error: '로컬 엔진은 localhost 주소만 허용합니다: example.com',
        });
        expect(upsertConn).not.toHaveBeenCalled();
    });

    it('rule 모드는 부가 필드를 모두 무시한다', async () => {
        const res = await PUT(jsonRequest('PUT', {
            mode: 'rule',
            vendor: 'azure',
            apiKey: 'ignored-secret',
            model: 'ignored-model',
            remoteBaseUrl: 'http://localhost/internal',
            remoteModel: 'ignored-mcp',
            localBaseUrl: 'https://example.com/internal',
            localModel: 'ignored-local',
        }));

        expect(res.status).toBe(200);
        const saved = upsertConn.mock.calls[0][0];
        expect(saved.update).toEqual({ mode: 'rule' });
        expect(saved.create).toMatchObject({
            mode: 'rule',
            vendor: null,
            apiKey: null,
            model: null,
            remoteBaseUrl: null,
            remoteModel: null,
            localBaseUrl: null,
            localModel: null,
        });
        expect(JSON.stringify([saved, await res.json(), logInfo.mock.calls]))
            .not.toContain('ignored-secret');
    });

    it('모드를 바꿔도 다른 모드의 저장 필드를 update 에 싣지 않는다', async () => {
        findUniqueConn.mockResolvedValue(connectionSummary({
            mode: 'api',
            vendor: 'openai',
            model: 'gpt-4o',
            localBaseUrl: 'http://localhost:11434/v1',
            localModel: 'local-model',
        }));

        const res = await PUT(jsonRequest('PUT', {
            mode: 'remote',
            remoteBaseUrl: 'https://mcp.example.com/v1',
            remoteModel: 'remote-model',
        }));

        expect(res.status).toBe(200);
        // local 필드는 건드리지 않는다. 벤더와 키는 MCP 로 새지 않게 일부러 지운다(B11).
        expect(upsertConn.mock.calls[0][0].update).toEqual({
            mode: 'mcp',
            vendor: null,
            apiKey: null,
            remoteBaseUrl: 'https://mcp.example.com/v1',
            remoteModel: 'remote-model',
        });
    });
});

describe('조회·삭제', () => {
    it('GET 은 요약만 준다', async () => {
        const summary = connectionSummary({
            mode: 'mcp',
            vendor: 'gemini',
            model: 'gemini-2.0-flash',
            remoteBaseUrl: 'https://mcp.example.com/v1',
            remoteModel: 'remote-model',
        });
        findUniqueConn.mockResolvedValue(summary);
        const body = await (await GET(jsonRequest('GET'))).json();
        expect(body.connection).toEqual({
            ...summary,
            // DB 의 예전 이름 mcp 는 화면에 remote 로 나간다(N3).
            mode: 'remote',
            updatedAt: summary.updatedAt.toISOString(),
        });
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
                    mode: 'api',
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
    it('등록된 연결이 없으면 rule 모드로 성공한다', async () => {
        const res = await POST(jsonRequest('POST'));

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ ok: true, message: '연결에 성공했습니다.' });
        expect(verifyPersonalConnection).toHaveBeenCalledWith({
            mode: 'rule',
            vendor: null,
            apiKey: null,
            model: null,
            remoteBaseUrl: null,
            remoteModel: null,
            localBaseUrl: null,
            localModel: null,
        });
    });

    it('verifyPersonalConnection의 안전한 필드만 전달한다', async () => {
        const result = {
            ok: false,
            message: 'API 키가 유효하지 않습니다.',
            vendorDetail: 'vendor-detail-must-not-leak',
        };
        findUniqueConn.mockResolvedValue({
            userId: 'user_1',
            mode: 'api',
            vendor: 'anthropic',
            apiKey: encryptSettingsValue('stored-secret'),
            model: 'claude-haiku-4-5',
            remoteBaseUrl: null,
            remoteModel: null,
            localBaseUrl: null,
            localModel: null,
            createdAt: new Date(),
            updatedAt: new Date(),
        });
        verifyPersonalConnection.mockResolvedValue(result);

        const res = await POST(jsonRequest('POST'));

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({
            ok: false,
            message: 'API 키가 유효하지 않습니다.',
        });
        expect(verifyPersonalConnection).toHaveBeenCalledWith({
            mode: 'api',
            vendor: 'anthropic',
            apiKey: 'stored-secret',
            model: 'claude-haiku-4-5',
            remoteBaseUrl: null,
            remoteModel: null,
            localBaseUrl: null,
            localModel: null,
        });
    });
});
