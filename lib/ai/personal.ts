// 개인 키 프로바이더. DB 를 모른다 — 복호화된 연결 정보를 받아 프로바이더만 만든다.
// (DB 접근은 lib/ai/personal-store.ts 가 맡아, 이 파일은 fetch mock 만으로 테스트된다.)
import { createOpenAiCompatibleProvider } from './openai-compatible';
import {
    PERSONAL_AI_VENDOR_PRESETS,
    resolvePersonalModel,
    type PersonalAiVendor,
} from './personal-vendors';
import type { AiProvider } from './types';

export interface PersonalAiConnection {
    vendor: PersonalAiVendor;
    apiKey: string;
    model: string | null;
}

export function createPersonalProvider(conn: PersonalAiConnection): AiProvider {
    const preset = PERSONAL_AI_VENDOR_PRESETS[conn.vendor];
    return createOpenAiCompatibleProvider({
        id: 'personal',
        label: '내 AI',
        baseUrls: [preset.baseUrl],
        model: resolvePersonalModel(conn.vendor, conn.model),
        apiKey: conn.apiKey,
        allowRemoteHost: true,
        directEndpoint: true,
    });
}

const VERIFY_TIMEOUT_MS = 10_000;

/**
 * 키가 실제로 통하는지 최소 비용으로 확인한다(짧은 chat 요청 1회).
 * 응답 본문은 버린다 — 필요한 것은 인증이 통과했는가 뿐이다.
 */
export async function verifyPersonalConnection(
    conn: PersonalAiConnection
): Promise<{ ok: boolean; message: string }> {
    const preset = PERSONAL_AI_VENDOR_PRESETS[conn.vendor];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);

    try {
        const response = await fetch(`${preset.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${conn.apiKey}`,
            },
            body: JSON.stringify({
                model: resolvePersonalModel(conn.vendor, conn.model),
                max_tokens: 8,
                messages: [{ role: 'user', content: 'ping' }],
            }),
            signal: controller.signal,
        });

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
