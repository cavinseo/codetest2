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
