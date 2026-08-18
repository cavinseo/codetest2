// 브라우저에서 사용자 PC의 로컬 LLM(Ollama, LM Studio)을 직접 부른다.
//
// 앱이 배포돼 있으면 서버의 localhost 는 서버 자신이라 사용자 PC의 LLM에 닿지 않는다.
// 브라우저는 사용자 PC에서 돌기 때문에 여기서 부르면 닿는다.
//
// 주의: 브라우저가 만든 결과는 신뢰할 수 없다. 여기서는 원문 문자열만 받아 오고,
// 파싱과 스키마 검증은 서버(spec/generate/complete)가 한다.
import { extractModelIds, nativeTagsUrl, pickModel } from './endpoint-discovery';

export interface BrowserLocalEndpoint {
    baseUrl: string;
    model: string;
}

export type BrowserLocalFailureHint = 'not-reachable' | 'timeout' | 'bad-response';

export class BrowserLocalError extends Error {
    hint: BrowserLocalFailureHint;

    constructor(message: string, hint: BrowserLocalFailureHint) {
        super(message);
        this.name = 'BrowserLocalError';
        this.hint = hint;
    }
}

const PROBE_TIMEOUT_MS = 3_000;
// 로컬 7B 급 모델은 느리다. 서버측(20초)보다 넉넉하게 잡는다.
const DEFAULT_CALL_TIMEOUT_MS = 90_000;

function joinUrl(baseUrl: string, path: string): string {
    return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

async function fetchWithTimeout(
    url: string,
    init: RequestInit,
    timeoutMs: number,
    externalSignal?: AbortSignal
): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onExternalAbort = () => controller.abort();
    externalSignal?.addEventListener('abort', onExternalAbort);

    try {
        return await fetch(url, { ...init, signal: controller.signal });
    } finally {
        clearTimeout(timer);
        externalSignal?.removeEventListener('abort', onExternalAbort);
    }
}

// 후보 주소를 차례로 두드려 살아 있는 엔드포인트와 쓸 모델을 정한다.
// CORS 로 막히면 fetch 가 TypeError 로 떨어지는데, 이는 "안 켜져 있음" 과 구분되지 않는다.
// 그래서 실패 사유를 단정하지 않고 null 을 돌려주고, 안내문에서 두 경우를 모두 짚는다.
export async function discoverBrowserLocalEndpoint(
    candidates: string[],
    preferredModel?: string,
    externalSignal?: AbortSignal
): Promise<BrowserLocalEndpoint | null> {
    for (const baseUrl of candidates) {
        const modelIds = await probeModels(baseUrl, externalSignal);
        if (modelIds === null) continue;

        const model = pickModel(modelIds, preferredModel);
        if (!model) continue;

        return { baseUrl, model };
    }
    return null;
}

async function probeModels(baseUrl: string, externalSignal?: AbortSignal): Promise<string[] | null> {
    // OpenAI 호환 경로를 먼저, 막혀 있으면 Ollama 네이티브 경로로 한 번 더 본다.
    for (const url of [joinUrl(baseUrl, 'models'), nativeTagsUrl(baseUrl)]) {
        try {
            const res = await fetchWithTimeout(url, { method: 'GET' }, PROBE_TIMEOUT_MS, externalSignal);
            if (!res.ok) continue;
            const modelIds = extractModelIds(await res.json());
            if (modelIds.length > 0) return modelIds;
        } catch {
            // 다음 후보로 넘어간다.
        }
    }
    return null;
}

// chat/completions 를 호출하고 모델이 돌려준 원문 문자열을 그대로 반환한다.
export async function callBrowserLocalLlm(
    endpoint: BrowserLocalEndpoint,
    prompts: { system: string; user: string },
    options: { timeoutMs?: number; signal?: AbortSignal } = {}
): Promise<string> {
    let res: Response;
    try {
        res = await fetchWithTimeout(
            joinUrl(endpoint.baseUrl, 'chat/completions'),
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: endpoint.model,
                    temperature: 0.2,
                    response_format: { type: 'json_object' },
                    messages: [
                        { role: 'system', content: prompts.system },
                        { role: 'user', content: prompts.user },
                    ],
                }),
            },
            options.timeoutMs ?? DEFAULT_CALL_TIMEOUT_MS,
            options.signal
        );
    } catch (error) {
        const aborted = error instanceof DOMException && error.name === 'AbortError';
        throw new BrowserLocalError(
            aborted ? '로컬 AI 응답이 너무 오래 걸립니다.' : '로컬 AI에 연결하지 못했습니다.',
            aborted ? 'timeout' : 'not-reachable'
        );
    }

    if (!res.ok) {
        throw new BrowserLocalError(`로컬 AI가 오류를 돌려줬습니다. (HTTP ${res.status})`, 'bad-response');
    }

    const payload = await res.json().catch(() => null);
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
        throw new BrowserLocalError('로컬 AI 응답이 비어 있습니다.', 'bad-response');
    }

    return content;
}
