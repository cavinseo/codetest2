// 브라우저가 되돌린 LLM 원문을 검증한다.
//
// 신뢰 경계: 이 값은 사용자의 브라우저를 거쳐 오므로 조작될 수 있다. 다만 결과는
// 자기 프로젝트의 "초안 제안"일 뿐이라 사용자가 표를 직접 채우는 것과 같은 권한
// 범위다. 그래도 서버가 저장·가공하는 값이므로 크기 상한과 스키마로 막는다.
import { safeJsonParse } from './openai-compatible';
import { specDraftTreeSchema, type SpecDraftTree } from './types';

export const RELAY_CONTENT_MAX_LENGTH = 200_000;

export type RelayParseResult =
    | { ok: true; tree: SpecDraftTree }
    | { ok: false; error: string };

export function parseRelaySpecDraftContent(content: unknown): RelayParseResult {
    if (typeof content !== 'string' || !content.trim()) {
        return { ok: false, error: '로컬 AI 응답이 비어 있습니다.' };
    }
    if (content.length > RELAY_CONTENT_MAX_LENGTH) {
        return { ok: false, error: '로컬 AI 응답이 너무 깁니다.' };
    }

    const parsed = safeJsonParse(content);
    if (parsed === undefined) {
        return { ok: false, error: '로컬 AI 응답을 JSON 으로 읽지 못했습니다.' };
    }

    const validated = specDraftTreeSchema.safeParse(parsed);
    if (!validated.success) {
        const issue = validated.error.issues[0];
        return {
            ok: false,
            error: `로컬 AI 응답 형식이 올바르지 않습니다. (${issue.path.join('.') || 'root'})`,
        };
    }

    return { ok: true, tree: validated.data };
}
