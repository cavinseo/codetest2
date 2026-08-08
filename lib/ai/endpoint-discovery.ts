// 로컬 엔진과 헤르메스는 설치 방식에 따라 포트가 제각각이라 규격을 미리 못 박기 어렵다.
// 그래서 알려진 후보 주소를 순서대로 두드려 보고, 실제로 응답하는 곳을 쓴다.

// Ollama, LM Studio, vLLM 순으로 흔히 쓰이는 기본 포트
export const LOCAL_BASE_URL_DEFAULTS = [
    'http://localhost:11434/v1',
    'http://localhost:1234/v1',
    'http://localhost:8000/v1',
];

// 헤르메스는 자체 서버로 뜨거나 Ollama/LM Studio 위에 모델로 올라가는 경우가 모두 있다.
export const HERMES_BASE_URL_DEFAULTS = [
    'http://localhost:8080/v1',
    'http://localhost:11434/v1',
    'http://localhost:1234/v1',
];

// 설정값을 맨 앞에 두고, 중복을 없앤 후보 목록을 만든다.
export function buildCandidateBaseUrls(configured: string | undefined, defaults: string[]): string[] {
    const candidates: string[] = [];
    const seen = new Set<string>();

    for (const value of [configured ?? '', ...defaults]) {
        const trimmed = value.trim().replace(/\/+$/, '');
        if (!trimmed || seen.has(trimmed)) continue;
        seen.add(trimmed);
        candidates.push(trimmed);
    }

    return candidates;
}

// OpenAI 호환 /models 응답과 Ollama 네이티브 /api/tags 응답을 모두 받아낸다.
export function extractModelIds(payload: unknown): string[] {
    if (!payload || typeof payload !== 'object') return [];
    const source = payload as Record<string, unknown>;

    const fromData = Array.isArray(source.data)
        ? source.data.map((item) => (item as Record<string, unknown>)?.id).filter(isNonEmptyString)
        : [];
    if (fromData.length > 0) return fromData;

    const fromModels = Array.isArray(source.models)
        ? source.models.map((item) => (item as Record<string, unknown>)?.name).filter(isNonEmptyString)
        : [];

    return fromModels;
}

// 설정한 모델이 실제로 있으면 그대로 쓰고, 없으면 힌트에 맞는 모델을, 그것도 없으면 첫 모델을 쓴다.
export function pickModel(modelIds: string[], preferred: string | undefined, hint?: string): string {
    const wanted = preferred?.trim() ?? '';

    if (modelIds.length === 0) return wanted;
    if (wanted && modelIds.some((id) => id === wanted)) return wanted;

    // "qwen2.5:7b" 로 적었는데 실제로는 "qwen2.5:7b-instruct" 인 경우까지 받아준다.
    if (wanted) {
        const partial = modelIds.find((id) => id.startsWith(wanted) || wanted.startsWith(id));
        if (partial) return partial;
    }

    if (hint) {
        const byHint = modelIds.find((id) => id.toLowerCase().includes(hint.toLowerCase()));
        if (byHint) return byHint;
    }

    return modelIds[0];
}

// OpenAI 호환 경로가 막혀 있으면 Ollama 네이티브 경로로도 한 번 확인한다.
export function nativeTagsUrl(baseUrl: string): string {
    return `${baseUrl.replace(/\/v1\/?$/, '').replace(/\/+$/, '')}/api/tags`;
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}
