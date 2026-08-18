// 어떤 엔진이 결과를 만들었는지 화면 배지로 보여주기 위한 라벨.
// 서버측 로컬 LLM 과 브라우저가 직접 부른 로컬 LLM 을 구분한다.
import type { AiEngineTag } from './types';

const ENGINE_LABELS: Record<AiEngineTag, string> = {
    rule: '기본 엔진',
    local: '로컬 AI(서버)',
    'browser-local': '로컬 AI(브라우저)',
    hermes: '헤르메스',
    api: '클라우드 API',
};

export function describeAiEngine(data: { provider?: string; degraded?: boolean }): string {
    const label = ENGINE_LABELS[(data.provider ?? 'rule') as AiEngineTag] ?? ENGINE_LABELS.rule;
    return data.degraded ? `${label}(폴백)` : label;
}
