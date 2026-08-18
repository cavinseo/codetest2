// 프로젝트별 AI 에이전트 연결 방식.
// 전역 AI 설정(lib/service-settings.ts)은 globalThis 싱글턴이라 서버리스에서
// 인스턴스 간 공유가 안 되므로, 프로젝트 단위 선택은 DB(Project.aiMode)에 둔다.
import { z } from 'zod';

export const PROJECT_AI_MODES = ['rule', 'local'] as const;
export type ProjectAiMode = (typeof PROJECT_AI_MODES)[number];

export const projectAiModeSchema = z.enum(PROJECT_AI_MODES);

export const DEFAULT_PROJECT_AI_MODE: ProjectAiMode = 'rule';

export const PROJECT_AI_MODE_LABELS: Record<ProjectAiMode, string> = {
    rule: '규칙 기반만 사용',
    local: '로컬 AI 연결 (Ollama · LM Studio)',
};

export const PROJECT_AI_MODE_DESCRIPTIONS: Record<ProjectAiMode, string> = {
    rule: '설치나 설정 없이 바로 씁니다. 프로젝트 문맥으로 초안을 조립합니다.',
    local: '내 PC의 로컬 LLM을 씁니다. 찾지 못하면 규칙 기반으로 자동 전환되므로 실패해도 작업이 멈추지 않습니다.',
};

// DB나 요청 본문에서 온 값을 안전하게 좁힌다. 모르는 값은 기본값으로 떨어뜨린다.
export function parseProjectAiMode(value: unknown): ProjectAiMode {
    const parsed = projectAiModeSchema.safeParse(value);
    return parsed.success ? parsed.data : DEFAULT_PROJECT_AI_MODE;
}
