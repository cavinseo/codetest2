// OpenAI 호환 엔드포인트(Ollama, LM Studio, 헤르메스, 클라우드 API)를 하나의 클라이언트로 다룬다.
// 응답은 자유 텍스트가 아니라 JSON 스키마로 강제하고 Zod 로 검증한다. 검증에 실패하면 1회 교정 재시도한다.
import type { z } from 'zod';
import { extractModelIds, nativeTagsUrl, pickModel } from './endpoint-discovery';
import {
    buildAttributeDraftPrompts,
    buildMentorQuestionsPrompts,
    buildSpecDraftPrompts,
} from './prompts';
import {
    attributeDraftResultSchema,
    mentorQuestionsResultSchema,
    specDraftTreeSchema,
    type AiProvider,
    type AiProviderId,
    type AttributeDraftInput,
    type AttributeDraftResult,
    type MentorQuestionsInput,
    type MentorQuestionsResult,
    type SpecDraftInput,
    type SpecDraftTree,
} from './types';

export interface OpenAiCompatibleConfig {
    id: AiProviderId;
    label: string;
    // 후보 주소를 순서대로 두드려 실제로 응답하는 곳을 쓴다. 설정값이 맨 앞에 온다.
    baseUrls: string[];
    model?: string;
    // 모델 이름을 특정하지 않았을 때 목록에서 고를 힌트 (예: 'hermes')
    modelHint?: string;
    apiKey?: string;
    // 로컬 엔진은 localhost 계열만 허용해 SSRF 를 막는다. 클라우드 API 만 원격 호스트를 연다.
    allowRemoteHost?: boolean;
    timeoutMs?: number;
}

interface ResolvedEndpoint {
    baseUrl: string;
    model: string;
}

const DEFAULT_TIMEOUT_MS = 20_000;
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);

export class AiProviderError extends Error {}

export function assertAllowedBaseUrl(baseUrl: string, allowRemoteHost = false): URL {
    let url: URL;
    try {
        url = new URL(baseUrl);
    } catch {
        throw new AiProviderError(`잘못된 엔드포인트 주소입니다: ${baseUrl}`);
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new AiProviderError(`허용되지 않는 프로토콜입니다: ${url.protocol}`);
    }

    if (!allowRemoteHost && !LOCAL_HOSTNAMES.has(url.hostname)) {
        throw new AiProviderError(`로컬 엔진은 localhost 주소만 허용합니다: ${url.hostname}`);
    }

    return url;
}

function joinUrl(baseUrl: string, path: string): string {
    return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...init, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

export function createOpenAiCompatibleProvider(config: OpenAiCompatibleConfig): AiProvider {
    const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    let resolved: ResolvedEndpoint | null = null;

    const headers = (): Record<string, string> => ({
        'Content-Type': 'application/json',
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    });

    // 후보 주소를 차례로 확인해 살아 있는 엔드포인트와 쓸 모델을 정한다. 한 번 찾으면 캐시한다.
    async function resolveEndpoint(): Promise<ResolvedEndpoint | null> {
        if (resolved) return resolved;

        for (const baseUrl of config.baseUrls) {
            let url: URL;
            try {
                url = assertAllowedBaseUrl(baseUrl, config.allowRemoteHost);
            } catch {
                continue; // 허용되지 않는 주소는 건너뛴다.
            }
            void url;

            const modelIds = await probeModels(baseUrl);
            if (modelIds === null) continue;

            const model = pickModel(modelIds, config.model, config.modelHint);
            if (!model) continue;

            resolved = { baseUrl, model };
            return resolved;
        }

        return null;
    }

    // 모델 목록을 못 읽으면 null, 읽으면 모델 id 배열(빈 배열 포함)을 돌려준다.
    async function probeModels(baseUrl: string): Promise<string[] | null> {
        const probeTimeout = Math.min(timeoutMs, 5_000);

        try {
            const response = await fetchWithTimeout(
                joinUrl(baseUrl, 'models'),
                { method: 'GET', headers: headers() },
                probeTimeout
            );
            if (response.ok) {
                return extractModelIds(await response.json().catch(() => null));
            }
        } catch {
            // OpenAI 호환 경로가 없을 수 있으므로 네이티브 경로로 한 번 더 시도한다.
        }

        try {
            const response = await fetchWithTimeout(
                nativeTagsUrl(baseUrl),
                { method: 'GET', headers: headers() },
                probeTimeout
            );
            if (response.ok) {
                return extractModelIds(await response.json().catch(() => null));
            }
        } catch {
            return null;
        }

        return null;
    }

    // 입력 타입을 unknown 으로 고정해야 T 가 스키마의 출력 타입(기본값이 채워진 형태)으로 잡힌다.
    async function complete<T>(
        systemPrompt: string,
        userPrompt: string,
        schema: z.ZodType<T, z.ZodTypeDef, unknown>
    ): Promise<T> {
        const endpoint = await resolveEndpoint();
        if (!endpoint) {
            throw new AiProviderError(`${config.label} 엔드포인트를 찾지 못했습니다.`);
        }

        const url = joinUrl(endpoint.baseUrl, 'chat/completions');
        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
        ];

        let lastError = '';

        // 1차 시도 후, 스키마 검증에 실패하면 오류를 알려주고 한 번만 다시 요청한다.
        for (let attempt = 0; attempt < 2; attempt++) {
            const response = await fetchWithTimeout(
                url,
                {
                    method: 'POST',
                    headers: headers(),
                    body: JSON.stringify({
                        model: endpoint.model,
                        temperature: 0.2,
                        response_format: { type: 'json_object' },
                        messages: attempt === 0
                            ? messages
                            : [
                                ...messages,
                                { role: 'user', content: `직전 응답이 형식에 맞지 않았습니다(${lastError}). 설명 없이 JSON만 다시 출력하세요.` },
                            ],
                    }),
                },
                timeoutMs
            );

            if (!response.ok) {
                throw new AiProviderError(`${config.label} 응답 오류 (HTTP ${response.status})`);
            }

            const payload = await response.json().catch(() => null);
            const content = payload?.choices?.[0]?.message?.content;
            if (typeof content !== 'string') {
                lastError = '본문이 비어 있음';
                continue;
            }

            const parsed = safeJsonParse(content);
            if (!parsed) {
                lastError = 'JSON 파싱 실패';
                continue;
            }

            const validated = schema.safeParse(parsed);
            if (!validated.success) {
                lastError = validated.error.issues.map((issue) => issue.path.join('.')).join(', ') || '스키마 불일치';
                continue;
            }

            return validated.data;
        }

        throw new AiProviderError(`${config.label} 응답을 해석하지 못했습니다: ${lastError}`);
    }

    return {
        id: config.id,
        label: config.label,

        async isAvailable() {
            try {
                return (await resolveEndpoint()) !== null;
            } catch {
                return false;
            }
        },

        async mentorQuestions(input: MentorQuestionsInput): Promise<MentorQuestionsResult> {
            const prompts = buildMentorQuestionsPrompts(input);
            return complete(prompts.system, prompts.user, mentorQuestionsResultSchema);
        },

        async attributeDraft(input: AttributeDraftInput): Promise<AttributeDraftResult> {
            const prompts = buildAttributeDraftPrompts(input);
            return complete(prompts.system, prompts.user, attributeDraftResultSchema);
        },

        async specDraft(input: SpecDraftInput): Promise<SpecDraftTree> {
            const prompts = buildSpecDraftPrompts(input);
            return complete(prompts.system, prompts.user, specDraftTreeSchema);
        },
    };
}

// 브라우저 경유 호출에서 돌아온 원문도 같은 방식으로 파싱해야 해서 밖으로 연다.
export function safeJsonParse(content: string): unknown {
    const direct = tryParse(content);
    if (direct !== undefined) return direct;

    // 모델이 코드블록이나 설명을 덧붙인 경우 JSON 구간만 잘라낸다.
    const start = content.indexOf('{');
    const end = content.lastIndexOf('}');
    if (start === -1 || end <= start) return undefined;
    return tryParse(content.slice(start, end + 1));
}

function tryParse(value: string): unknown {
    try {
        return JSON.parse(value);
    } catch {
        return undefined;
    }
}

function summarizeRows(rows: MentorQuestionsInput['existingRows']): string {
    if (!rows || rows.length === 0) return '없음';
    return rows
        .slice(0, 10)
        .map((row) => [row.marketSegment, row.customerName, row.customerNeed, row.benefit].filter(Boolean).join(' / '))
        .filter(Boolean)
        .join(' | ') || '없음';
}
