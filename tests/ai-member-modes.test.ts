// 회원 AI 연결의 4모드 분기와 원격 URL SSRF 경계를 검증한다.
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ruleProvider } from '../lib/ai/provider-rule';
import {
    createPersonalProvider,
    verifyPersonalConnection,
    type PersonalAiConnection,
} from '../lib/ai/personal';
import { parseMemberAiMode } from '../lib/ai/personal-vendors';
import { assertPublicHttpsUrl, RemoteUrlError } from '../lib/ai/url-guard';

function connection(overrides: Partial<PersonalAiConnection> = {}): PersonalAiConnection {
    return {
        mode: 'rule',
        vendor: null,
        apiKey: null,
        model: null,
        mcpBaseUrl: null,
        mcpModel: null,
        localBaseUrl: null,
        localModel: null,
        ...overrides,
    };
}

function mentorResponse(): Response {
    return new Response(JSON.stringify({
        choices: [{
            message: {
                content: JSON.stringify({
                    questions: [{ id: 'q1', field: 'customerNeed', question: '?' }],
                    focus: '',
                }),
            },
        }],
    }), { status: 200 });
}

afterEach(() => vi.unstubAllGlobals());

describe('assertPublicHttpsUrl', () => {
    it.each([
        ['형식 오류', 'not a url', '올바른 URL 형식이 아닙니다.'],
        ['http', 'http://example.com/v1', '원격 엔드포인트는 https 만 허용됩니다.'],
        ['사용자명', 'https://user@example.com/v1', 'URL 에 인증 정보를 넣을 수 없습니다. 키 칸을 쓰세요.'],
        ['비밀번호', 'https://:secret@example.com/v1', 'URL 에 인증 정보를 넣을 수 없습니다. 키 칸을 쓰세요.'],
        ['공인 IPv4', 'https://8.8.8.8/v1', 'IP 주소가 아닌 도메인 주소를 입력하세요.'],
        ['IPv6', 'https://[::1]/v1', 'IP 주소가 아닌 도메인 주소를 입력하세요.'],
        ['localhost', 'https://localhost/v1', '내부망 주소는 사용할 수 없습니다.'],
        ['loopback', 'https://127.0.0.1/v1', 'IP 주소가 아닌 도메인 주소를 입력하세요.'],
        ['10 대역', 'https://10.0.0.1/v1', 'IP 주소가 아닌 도메인 주소를 입력하세요.'],
        ['192.168 대역', 'https://192.168.1.1/v1', 'IP 주소가 아닌 도메인 주소를 입력하세요.'],
        ['169.254 대역', 'https://169.254.169.254/v1', 'IP 주소가 아닌 도메인 주소를 입력하세요.'],
        ['172.16 대역', 'https://172.16.0.1/v1', 'IP 주소가 아닌 도메인 주소를 입력하세요.'],
    ])('%s 주소를 거부한다', (_label, raw, message) => {
        expect(() => assertPublicHttpsUrl(raw)).toThrow(message);
    });

    it.each([
        'https://127.example.com/v1',
        'https://10.example.com/v1',
        'https://192.168.example.com/v1',
        'https://169.254.example.com/v1',
        'https://172.16.example.com/v1',
        'https://172.20.example.com/v1',
        'https://172.31.example.com/v1',
    ])('사설 대역처럼 시작하는 호스트를 거부한다: %s', (raw) => {
        expect(() => assertPublicHttpsUrl(raw)).toThrow('내부망 주소는 사용할 수 없습니다.');
    });

    it.each([
        'https://localhost.example.com/v1',
        'https://172.15.example.com/v1',
        'https://172.32.example.com/v1',
        'https://example1/v1',
        'https://api.localhost/v1',
        'https://api.127.example.com/v1',
        'https://0.0.0.0.example.com/v1',
        'https://api.10.example.com/v1',
        'https://api.192.168.example.com/v1',
        'https://api.169.254.example.com/v1',
        'https://api.172.16.example.com/v1',
    ])('사설 호스트 패턴 경계 밖의 도메인은 허용한다: %s', (raw) => {
        expect(assertPublicHttpsUrl(raw)).toBe(raw);
    });

    it('공백·대문자 호스트·검색 문자열·끝 슬래시를 정규화한다', () => {
        expect(assertPublicHttpsUrl('  https://EXAMPLE.com/v1///?token=secret#part  '))
            .toBe('https://example.com/v1');
    });

    it('URL 생성자에 앞뒤 공백을 제거한 값을 건넨다', () => {
        const NativeUrl = URL;
        const inputs: string[] = [];
        class RecordingUrl extends NativeUrl {
            constructor(input: string | URL, base?: string | URL) {
                inputs.push(String(input));
                super(input, base);
            }
        }
        vi.stubGlobal('URL', RecordingUrl);

        expect(assertPublicHttpsUrl('  https://example.com/v1  ')).toBe('https://example.com/v1');
        expect(inputs).toEqual(['https://example.com/v1']);
    });

    it.each(['api.0.0.0.0', 'x::1', '::1x', 'x[::1]', '[::1]x'])(
        '사설 패턴의 정확한 양끝 경계를 유지한다: %s',
        (hostname) => {
            const hostnameValue = {
                includes: () => false,
                toString: () => hostname,
                [Symbol.toPrimitive]: () => hostname,
            };
            vi.stubGlobal('URL', class {
                protocol = 'https:';
                username = '';
                password = '';
                hostname = hostnameValue;
                origin = 'https://example.com';
                pathname = '/v1';
            });

            expect(assertPublicHttpsUrl('https://example.com/v1')).toBe('https://example.com/v1');
        }
    );
});

describe('parseMemberAiMode', () => {
    it.each(['rule', 'api', 'mcp', 'local'] as const)('%s 를 허용한다', (mode) => {
        expect(parseMemberAiMode(mode)).toBe(mode);
    });

    it.each([null, undefined, '', 'API', 'unknown', 1])('%s 를 거부한다', (value) => {
        expect(parseMemberAiMode(value)).toBeNull();
    });
});

describe('createPersonalProvider', () => {
    it('rule 모드는 네트워크 없는 ruleProvider 를 그대로 돌려준다', () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        const provider = createPersonalProvider(connection());

        expect(provider).toBe(ruleProvider);
        expect(provider.id).toBe('rule');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('api 모드는 벤더 프리셋 주소와 키를 쓴다', async () => {
        const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => mentorResponse());
        vi.stubGlobal('fetch', fetchMock);

        await createPersonalProvider(connection({
            mode: 'api',
            vendor: 'openai',
            apiKey: 'api-key',
        })).mentorQuestions({ project: { name: 'T' } });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0][0]).toBe('https://api.openai.com/v1/chat/completions');
        expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ Authorization: 'Bearer api-key' });
    });

    it('mcp 모드는 실행 직전 검사한 원격 주소를 쓴다', async () => {
        const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => mentorResponse());
        vi.stubGlobal('fetch', fetchMock);

        await createPersonalProvider(connection({
            mode: 'mcp',
            apiKey: 'mcp-key',
            mcpBaseUrl: 'https://mcp.example.com/v1/',
            mcpModel: 'mcp-model',
        })).mentorQuestions({ project: { name: 'T' } });

        expect(fetchMock.mock.calls[0][0]).toBe('https://mcp.example.com/v1/chat/completions');
        expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ Authorization: 'Bearer mcp-key' });
    });

    it('local 모드는 첫 localhost 기본 후보부터 탐색한다', async () => {
        const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({
            data: [{ id: 'local-model' }],
        }), { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);

        const available = await createPersonalProvider(connection({ mode: 'local' })).isAvailable();

        expect(available).toBe(true);
        expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:11434/v1/models');
    });

    it('mcp 사설 주소는 프로바이더 생성 시점에 거부한다', () => {
        expect(() => createPersonalProvider(connection({
            mode: 'mcp',
            mcpBaseUrl: 'https://localhost/v1',
        }))).toThrow(RemoteUrlError);
    });
});

describe('verifyPersonalConnection', () => {
    it('rule 모드는 연결 확인 없이 성공한다', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        await expect(verifyPersonalConnection(connection())).resolves.toEqual({
            ok: true,
            message: '규칙 기반은 별도 연결이 필요 없습니다.',
        });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('모델 없는 mcp 모드는 models 경로를 GET 한다', async () => {
        const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => (
            new Response(JSON.stringify({ data: [] }), { status: 200 })
        ));
        vi.stubGlobal('fetch', fetchMock);

        await expect(verifyPersonalConnection(connection({
            mode: 'mcp',
            apiKey: 'mcp-key',
            mcpBaseUrl: 'https://mcp.example.com/v1',
        }))).resolves.toEqual({ ok: true, message: '연결에 성공했습니다.' });

        expect(fetchMock.mock.calls[0][0]).toBe('https://mcp.example.com/v1/models');
        expect(fetchMock.mock.calls[0][1]).toMatchObject({
            method: 'GET',
            headers: { Authorization: 'Bearer mcp-key' },
        });
    });

    it('local 모드 연결 실패는 규칙 기반 자동 전환을 알린다', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => {
            throw new Error('ECONNREFUSED');
        }));

        await expect(verifyPersonalConnection(connection({ mode: 'local' }))).resolves.toEqual({
            ok: false,
            message: '서버에서 로컬 엔진에 연결하지 못했습니다. 온라인 환경에서는 정상이며, 규칙 기반으로 자동 전환됩니다.',
        });
    });
});
