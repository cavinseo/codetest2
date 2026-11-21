// 회원이 직접 적는 "내 로컬 AI 주소"의 허용 범위를 정한다.
//
// 로컬 모드는 서버가 그 주소로 GET /models, GET /api/tags, POST /chat/completions 를
// 보낸다. 예전에는 호스트가 localhost 인지만 봐서, 일반 회원이 http://127.0.0.1:6379/x
// 같은 주소를 저장하고 연결 확인을 누르면 서버 자신의 내부 포트·경로로 요청을 보내게
// 할 수 있었다. 성공·실패 문구가 갈려 어떤 내부 포트가 열려 있는지도 알 수 있었다(감리 B9).
//
// 관리자가 정하는 서비스 로컬 엔진 주소는 신뢰하는 값이라 lib/ai/openai-compatible 의
// assertAllowedBaseUrl 을 그대로 쓴다. 여기 규칙은 회원이 정하는 값에만 적용한다.
import { AiProviderError } from './openai-compatible';

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

// 로컬 LLM 서버가 흔히 쓰는 포트만 연다.
//   11434 Ollama · 1234 LM Studio · 8000 vLLM · 8080 llama.cpp 서버/LocalAI
export const MEMBER_LOCAL_AI_PORTS = ['11434', '1234', '8000', '8080'] as const;

// OpenAI 호환 API 의 기준 경로만 받고, 끝 슬래시를 뗀 저장 형태로 바꾼다. 서버가
// 이 뒤에 /models 등을 붙인다. 경로를 비워 적어도 URL 이 '/' 로 바꿔 주므로 빈 키는 없다.
const NORMALIZED_PATHS = new Map([['/', ''], ['/v1', '/v1'], ['/v1/', '/v1']]);

export const MEMBER_LOCAL_AI_URL_RULE =
    `로컬 AI 주소는 localhost 의 ${MEMBER_LOCAL_AI_PORTS.join('·')} 포트와 /v1 경로만 쓸 수 있습니다. 예: http://localhost:11434/v1`;

/** 회원이 적은 로컬 AI 주소를 검사하고, 끝 슬래시를 뗀 정규화 주소를 돌려준다. */
export function assertMemberLocalBaseUrl(value: string): string {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw new AiProviderError(MEMBER_LOCAL_AI_URL_RULE);
    }
    const path = NORMALIZED_PATHS.get(url.pathname);
    const allowed = url.protocol === 'http:'
        && LOOPBACK_HOSTNAMES.has(url.hostname)
        && (MEMBER_LOCAL_AI_PORTS as readonly string[]).includes(url.port)
        && path !== undefined
        && !url.username && !url.password
        && !url.search && !url.hash;
    if (!allowed) throw new AiProviderError(MEMBER_LOCAL_AI_URL_RULE);
    return `${url.origin}${path}`;
}

/** 저장된 값이 규칙에 맞으면 정규화 주소를, 아니면 null 을 돌려준다(예전에 저장된 값 대비). */
export function memberLocalBaseUrlOrNull(value: string | null | undefined): string | null {
    // Stryker disable next-line ConditionalExpression: 빈 값은 이 줄이 없어도 아래 new URL 이 던져 null 이 되므로 결과가 같다. 타입을 좁히고 의도를 드러내려고 남긴다.
    if (!value) return null;
    try {
        return assertMemberLocalBaseUrl(value);
    } catch {
        return null;
    }
}
