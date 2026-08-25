// 개인 키 프로바이더. DB 를 모른다 — 복호화된 연결 정보를 받아 프로바이더만 만든다.
// (DB 접근은 lib/ai/personal-store.ts 가 맡아, 이 파일은 fetch mock 만으로 테스트된다.)
import { buildCandidateBaseUrls, LOCAL_BASE_URL_DEFAULTS } from './endpoint-discovery';
import { AiProviderError, createOpenAiCompatibleProvider } from './openai-compatible';
import {
    PERSONAL_AI_VENDOR_PRESETS,
    resolvePersonalModel,
    type MemberAiMode,
    type PersonalAiVendor,
} from './personal-vendors';
import { ruleProvider } from './provider-rule';
import type { AiProvider } from './types';
import { assertPublicHttpsUrl } from './url-guard';

export interface PersonalAiConnection {
    mode: MemberAiMode;
    vendor: PersonalAiVendor | null;
    apiKey: string | null;
    model: string | null;
    mcpBaseUrl: string | null;
    mcpModel: string | null;
    localBaseUrl: string | null;
    localModel: string | null;
}

export function createPersonalProvider(conn: PersonalAiConnection): AiProvider {
    switch (conn.mode) {
        case 'api': {
            if (!conn.vendor || !conn.apiKey) {
                throw new AiProviderError('API 연결에 필요한 벤더와 키가 없습니다. 설정을 확인하세요.');
            }
            const preset = PERSONAL_AI_VENDOR_PRESETS[conn.vendor];
            return createOpenAiCompatibleProvider({
                id: 'personal', label: '내 AI',
                baseUrls: [preset.baseUrl],
                model: resolvePersonalModel(conn.vendor, conn.model),
                apiKey: conn.apiKey, allowRemoteHost: true, directEndpoint: true,
            });
        }
        case 'mcp': {
            if (!conn.mcpBaseUrl) {
                throw new AiProviderError('원격 MCP 주소가 없습니다. 설정을 확인하세요.');
            }
            // 저장 시에도 검사하지만, 저장 후 규칙이 바뀌었을 수 있어 실행 직전에 다시 검사한다.
            const baseUrl = assertPublicHttpsUrl(conn.mcpBaseUrl);
            return createOpenAiCompatibleProvider({
                id: 'personal', label: '내 AI',
                baseUrls: [baseUrl],
                model: conn.mcpModel ?? undefined,
                apiKey: conn.apiKey ?? undefined,
                allowRemoteHost: true,
                // 모델을 지정했으면 탐색 생략, 아니면 /models 탐색에 맡긴다.
                directEndpoint: Boolean(conn.mcpModel),
            });
        }
        case 'local':
            return createOpenAiCompatibleProvider({
                id: 'personal', label: '내 AI',
                baseUrls: buildCandidateBaseUrls(conn.localBaseUrl ?? undefined, LOCAL_BASE_URL_DEFAULTS),
                model: conn.localModel ?? undefined,
                apiKey: 'local',
                allowRemoteHost: false, // localhost 만 — 기존 로컬 엔진과 같은 경계다
            });
        case 'rule':
        default:
            return ruleProvider;
    }
}

const VERIFY_TIMEOUT_MS = 10_000;

/**
 * 키가 실제로 통하는지 최소 비용으로 확인한다(짧은 chat 요청 1회).
 * 응답 본문은 버린다 — 필요한 것은 인증이 통과했는가 뿐이다.
 */
export async function verifyPersonalConnection(
    conn: PersonalAiConnection
): Promise<{ ok: boolean; message: string }> {
    if (conn.mode === 'rule') {
        return { ok: true, message: '규칙 기반은 별도 연결이 필요 없습니다.' };
    }

    if (conn.mode === 'local') {
        const available = await createPersonalProvider(conn).isAvailable();
        return available
            ? { ok: true, message: '연결에 성공했습니다.' }
            : {
                ok: false,
                message: '서버에서 로컬 엔진에 연결하지 못했습니다. 온라인 환경에서는 정상이며, 규칙 기반으로 자동 전환됩니다.',
            };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);

    try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (conn.apiKey) headers.Authorization = `Bearer ${conn.apiKey}`;

        let url: string;
        let init: RequestInit;
        if (conn.mode === 'api') {
            if (!conn.vendor || !conn.apiKey) {
                return { ok: false, message: 'API 연결에 필요한 벤더와 키가 없습니다. 설정을 확인하세요.' };
            }
            const preset = PERSONAL_AI_VENDOR_PRESETS[conn.vendor];
            url = `${preset.baseUrl}/chat/completions`;
            init = {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    model: resolvePersonalModel(conn.vendor, conn.model),
                    max_tokens: 8,
                    messages: [{ role: 'user', content: 'ping' }],
                }),
                signal: controller.signal,
            };
        } else {
            if (!conn.mcpBaseUrl) {
                return { ok: false, message: '원격 MCP 주소가 없습니다. 설정을 확인하세요.' };
            }
            const baseUrl = assertPublicHttpsUrl(conn.mcpBaseUrl);
            url = conn.mcpModel ? `${baseUrl}/chat/completions` : `${baseUrl}/models`;
            init = conn.mcpModel
                ? {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        model: conn.mcpModel,
                        max_tokens: 8,
                        messages: [{ role: 'user', content: 'ping' }],
                    }),
                    signal: controller.signal,
                }
                : { method: 'GET', headers, signal: controller.signal };
        }

        const response = await fetch(url, init);

        if (response.ok) return { ok: true, message: '연결에 성공했습니다.' };
        if (response.status === 401 || response.status === 403) {
            return { ok: false, message: 'API 키가 유효하지 않습니다. 키를 다시 확인하세요.' };
        }
        if (response.status === 404) {
            return { ok: false, message: '모델을 찾을 수 없습니다. 모델 이름을 확인하세요.' };
        }
        if (response.status === 429) {
            return { ok: false, message: '요청 한도를 초과했습니다. 벤더 계정의 한도를 확인하세요.' };
        }
        return { ok: false, message: `벤더 응답 오류 (HTTP ${response.status})` };
    } catch {
        return { ok: false, message: '벤더에 연결하지 못했습니다. 네트워크를 확인하세요.' };
    } finally {
        clearTimeout(timer);
    }
}
