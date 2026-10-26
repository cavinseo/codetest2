// 개인 AI 키가 붙을 수 있는 벤더 프리셋.
//
// 세 벤더 모두 OpenAI 호환 엔드포인트를 공식 제공하므로 기존 클라이언트
// (openai-compatible.ts)를 그대로 쓴다. 주소를 자유 입력으로 열지 않고 여기
// 프리셋으로 고정하는 이유: 사용자가 내부망 주소를 넣어 서버가 대신 두드리게
// 만드는 SSRF 를 원천 차단하기 위해서다.
export const PERSONAL_AI_VENDORS = ['openai', 'anthropic', 'gemini'] as const;
export type PersonalAiVendor = (typeof PERSONAL_AI_VENDORS)[number];

export const PERSONAL_AI_VENDOR_LABELS: Record<PersonalAiVendor, string> = {
    openai: 'OpenAI (ChatGPT)',
    anthropic: 'Claude (Anthropic)',
    gemini: 'Gemini (Google)',
};

// 기본 모델은 각 벤더의 저가 라인으로 둔다. 개인 키라 요금이 본인에게
// 청구되므로, 기본값이 비싼 모델이면 안 된다. 화면에서 바꿀 수 있다.
export const PERSONAL_AI_VENDOR_PRESETS: Record<PersonalAiVendor, { baseUrl: string; defaultModel: string }> = {
    openai: { baseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o-mini' },
    anthropic: { baseUrl: 'https://api.anthropic.com/v1', defaultModel: 'claude-haiku-4-5' },
    gemini: { baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', defaultModel: 'gemini-2.0-flash' },
};

export function parsePersonalAiVendor(value: unknown): PersonalAiVendor | null {
    return PERSONAL_AI_VENDORS.includes(value as PersonalAiVendor)
        ? (value as PersonalAiVendor)
        : null;
}

/** 쓸 모델을 정한다. 지정이 없거나 공백뿐이면 벤더 기본 모델이다. */
export function resolvePersonalModel(vendor: PersonalAiVendor, model: string | null | undefined): string {
    const trimmed = model?.trim();
    return trimmed || PERSONAL_AI_VENDOR_PRESETS[vendor].defaultModel;
}

// ─── 회원 AI 연결 모드 ─────────────────────────────────────────

export const MEMBER_AI_MODES = ['rule', 'api', 'remote', 'local'] as const;
export type MemberAiMode = (typeof MEMBER_AI_MODES)[number];

export const MEMBER_AI_MODE_LABELS: Record<MemberAiMode, string> = {
    rule: '규칙 기반',
    api: 'API 연결 (OpenAI · Claude · Gemini)',
    remote: '원격 엔드포인트 (Remote/HTTP)',
    local: '로컬 AI (Ollama · LM Studio)',
};

export const MEMBER_AI_MODE_DESCRIPTIONS: Record<MemberAiMode, string> = {
    rule: '설정 없이 바로 씁니다. 프로젝트 문맥으로 초안을 조립합니다.',
    api: '본인의 벤더 API 키로 호출합니다. 요금은 본인 벤더 계정에 청구됩니다.',
    remote: '본인이 운영하는 원격 OpenAI 호환 엔드포인트(https)로 호출합니다.',
    local: '내 PC의 로컬 LLM을 씁니다. 온라인 서버에서는 연결되지 않을 수 있으며, 그 경우 규칙 기반으로 자동 전환됩니다.',
};

/**
 * 원격 모드는 처음에 'mcp' 라는 이름으로 만들어졌지만 MCP 프로토콜이 아니라 일반 원격 OpenAI
 * 호환 주소다(2026-10-25 코드 리뷰 N3). 코드에서는 'remote' 로 부르되, 실데이터가 있는 DB 의
 * 저장값은 마이그레이션 없이 'mcp' 그대로 둔다 — 읽을 때 옮기고 쓸 때 되돌린다.
 */
export const STORED_REMOTE_MODE = 'mcp';

/** 저장값·요청값을 모드로 읽는다. 예전 이름 'mcp' 도 원격 모드로 받는다. */
export function parseMemberAiMode(value: unknown): MemberAiMode | null {
    const mode = value === STORED_REMOTE_MODE ? 'remote' : value;
    return MEMBER_AI_MODES.includes(mode as MemberAiMode) ? (mode as MemberAiMode) : null;
}

/** DB 에 쓸 저장값. 원격 모드만 예전 이름으로 바꾼다. */
export function toStoredMemberAiMode(mode: MemberAiMode): string {
    return mode === 'remote' ? STORED_REMOTE_MODE : mode;
}
