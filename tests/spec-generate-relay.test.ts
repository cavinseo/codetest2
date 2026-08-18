import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    RELAY_CONTENT_MAX_LENGTH,
    parseRelaySpecDraftContent,
} from '../lib/ai/relay-content';
import {
    BrowserLocalError,
    callBrowserLocalLlm,
    discoverBrowserLocalEndpoint,
} from '../lib/ai/browser-local';

const validTree = {
    cores: [
        {
            name: '회원 관리 기술',
            subs: [{ name: '명부 처리', details: [{ name: '명부 통합', technology: '데이터 정규화' }] }],
        },
    ],
};

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('parseRelaySpecDraftContent', () => {
    it('정상 JSON 원문을 받아들인다', () => {
        const result = parseRelaySpecDraftContent(JSON.stringify(validTree));
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.tree.cores[0].name).toBe('회원 관리 기술');
    });

    it('모델이 코드블록으로 감싸도 JSON 구간만 뽑아낸다', () => {
        const wrapped = `다음과 같이 정리했습니다.\n\`\`\`json\n${JSON.stringify(validTree)}\n\`\`\`\n확인해 주세요.`;
        const result = parseRelaySpecDraftContent(wrapped);
        expect(result.ok).toBe(true);
    });

    it('빈 값을 거부한다', () => {
        expect(parseRelaySpecDraftContent('').ok).toBe(false);
        expect(parseRelaySpecDraftContent('   ').ok).toBe(false);
        expect(parseRelaySpecDraftContent(undefined).ok).toBe(false);
    });

    it('문자열이 아닌 값을 거부한다', () => {
        // 브라우저가 조작된 본문을 보낼 수 있으므로 타입부터 막는다.
        expect(parseRelaySpecDraftContent({ cores: [] }).ok).toBe(false);
    });

    it('상한을 넘는 응답을 거부한다', () => {
        const huge = 'x'.repeat(RELAY_CONTENT_MAX_LENGTH + 1);
        const result = parseRelaySpecDraftContent(huge);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toContain('너무 깁니다');
    });

    it('JSON 이 아닌 응답을 거부한다', () => {
        const result = parseRelaySpecDraftContent('죄송합니다. 표를 만들 수 없습니다.');
        expect(result.ok).toBe(false);
    });

    it('스키마에 맞지 않는 구조를 거부한다', () => {
        const result = parseRelaySpecDraftContent(JSON.stringify({ cores: [{ name: '핵심만 있음' }] }));
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toContain('형식이 올바르지 않습니다');
    });

    it('상한을 넘는 핵심기술 수를 거부한다', () => {
        const many = {
            cores: Array.from({ length: 9 }, (_, index) => ({
                name: `핵심 ${index}`,
                subs: [{ name: '세부', details: [{ name: '기능' }] }],
            })),
        };
        expect(parseRelaySpecDraftContent(JSON.stringify(many)).ok).toBe(false);
    });
});

describe('discoverBrowserLocalEndpoint', () => {
    it('OpenAI 호환 /models 로 찾는다', async () => {
        vi.stubGlobal('fetch', vi.fn(async (url: string) => {
            if (url.endsWith('/models')) {
                return { ok: true, json: async () => ({ data: [{ id: 'qwen2.5:7b' }] }) } as Response;
            }
            return { ok: false } as Response;
        }));

        const endpoint = await discoverBrowserLocalEndpoint(['http://localhost:11434/v1'], 'qwen2.5:7b');
        expect(endpoint).toEqual({ baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5:7b' });
    });

    it('/models 가 막히면 Ollama 네이티브 경로로 넘어간다', async () => {
        vi.stubGlobal('fetch', vi.fn(async (url: string) => {
            if (url.endsWith('/api/tags')) {
                return { ok: true, json: async () => ({ models: [{ name: 'llama3.1:8b' }] }) } as Response;
            }
            return { ok: false } as Response;
        }));

        const endpoint = await discoverBrowserLocalEndpoint(['http://localhost:11434/v1']);
        expect(endpoint?.model).toBe('llama3.1:8b');
    });

    it('두 번째 후보에서 찾으면 그것을 쓴다', async () => {
        vi.stubGlobal('fetch', vi.fn(async (url: string) => {
            if (url.startsWith('http://localhost:1234') && url.endsWith('/models')) {
                return { ok: true, json: async () => ({ data: [{ id: 'local-model' }] }) } as Response;
            }
            return { ok: false } as Response;
        }));

        const endpoint = await discoverBrowserLocalEndpoint([
            'http://localhost:11434/v1',
            'http://localhost:1234/v1',
        ]);
        expect(endpoint?.baseUrl).toBe('http://localhost:1234/v1');
    });

    it('CORS 차단처럼 fetch 자체가 실패하면 null 을 돌려준다', async () => {
        // CORS 실패는 TypeError 로만 떨어져 "안 켜져 있음" 과 구분되지 않는다.
        vi.stubGlobal('fetch', vi.fn(async () => {
            throw new TypeError('Failed to fetch');
        }));

        const endpoint = await discoverBrowserLocalEndpoint(['http://localhost:11434/v1']);
        expect(endpoint).toBeNull();
    });

    it('모든 후보가 실패하면 null 을 돌려준다', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false } as Response)));
        const endpoint = await discoverBrowserLocalEndpoint(['http://a/v1', 'http://b/v1']);
        expect(endpoint).toBeNull();
    });
});

describe('callBrowserLocalLlm', () => {
    const endpoint = { baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5:7b' };
    const prompts = { system: 'system', user: 'user' };

    it('모델이 돌려준 원문을 그대로 반환한다', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: true,
            json: async () => ({ choices: [{ message: { content: '{"cores":[]}' } }] }),
        } as Response)));

        expect(await callBrowserLocalLlm(endpoint, prompts)).toBe('{"cores":[]}');
    });

    it('연결 실패를 구분 가능한 오류로 던진다', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => {
            throw new TypeError('Failed to fetch');
        }));

        await expect(callBrowserLocalLlm(endpoint, prompts)).rejects.toBeInstanceOf(BrowserLocalError);
    });

    it('HTTP 오류를 오류로 던진다', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 } as Response)));
        await expect(callBrowserLocalLlm(endpoint, prompts)).rejects.toThrow('HTTP 500');
    });

    it('빈 응답을 오류로 던진다', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: true,
            json: async () => ({ choices: [{ message: { content: '   ' } }] }),
        } as Response)));

        await expect(callBrowserLocalLlm(endpoint, prompts)).rejects.toThrow('비어 있습니다');
    });
});
