// AI 작업 계약. UI와 API 라우트는 이 계약만 알고, 실제 엔진이 무엇인지는 모른다.
import { z } from 'zod';
import type { SpecAiContext } from '../spec-ai-agent';

export const AI_PROVIDER_IDS = ['rule', 'local', 'hermes', 'api'] as const;
export type AiProviderId = (typeof AI_PROVIDER_IDS)[number];

// 브라우저가 자기 PC의 LLM을 직접 호출한 경우를 화면에 구분해 보여주기 위한 태그.
// 서버에서 health check 할 수 있는 대상이 아니라 AI_PROVIDER_IDS 에는 넣지 않는다.
export type AiEngineTag = AiProviderId | 'browser-local';

export const AI_MENTOR_FIELDS = ['marketSegment', 'customerName', 'customerNeed', 'benefit'] as const;
export type AiMentorField = (typeof AI_MENTOR_FIELDS)[number];

// ─────────────────────────────────────────
// 작업 1: 문진 질문 생성 (grill-me)
// ─────────────────────────────────────────
export const mentorQuestionSchema = z.object({
    id: z.string().min(1),
    field: z.enum(AI_MENTOR_FIELDS),
    question: z.string().min(1),
    hint: z.string().default(''),
    examples: z.array(z.string()).default([]),
});

export const mentorQuestionsResultSchema = z.object({
    questions: z.array(mentorQuestionSchema).min(1),
    focus: z.string().default(''),
});

export type MentorQuestion = z.infer<typeof mentorQuestionSchema>;
export type MentorQuestionsResult = z.infer<typeof mentorQuestionsResultSchema>;

export interface MentorQuestionsInput {
    project: {
        name: string;
        description?: string | null;
        detailedDescription?: string | null;
    };
    // 이미 채워진 행이 있으면 비어 있는 항목 위주로 질문한다.
    existingRows?: Array<{
        marketSegment?: string | null;
        customerName?: string | null;
        customerNeed?: string | null;
        benefit?: string | null;
    }>;
}

// ─────────────────────────────────────────
// 작업 2: 제품속성서 행 초안 생성
// ─────────────────────────────────────────
export const attributeDraftRowSchema = z.object({
    marketSegment: z.string().min(1),
    customerName: z.string().default(''),
    customerNeed: z.string().default(''),
    benefit: z.string().default(''),
});

export const attributeDraftIssueSchema = z.object({
    severity: z.enum(['info', 'warning', 'error']),
    message: z.string().min(1),
});

export const attributeDraftResultSchema = z.object({
    rows: z.array(attributeDraftRowSchema),
    issues: z.array(attributeDraftIssueSchema).default([]),
});

export type AttributeDraftRow = z.infer<typeof attributeDraftRowSchema>;
export type AttributeDraftIssue = z.infer<typeof attributeDraftIssueSchema>;
export type AttributeDraftResult = z.infer<typeof attributeDraftResultSchema>;

export interface AttributeDraftInput {
    project: {
        name: string;
        description?: string | null;
        detailedDescription?: string | null;
    };
    // 문진 단계에서 사용자가 답한 내용
    answers: {
        segmentationBasis?: string;
        marketSegments?: string;
        customerNames?: string;
        customerProblems?: string;
        expectedBenefits?: string;
    };
}

// ─────────────────────────────────────────
// 작업 3: WS-2 AS-IS 스펙표 FAST 초안
// ─────────────────────────────────────────
// LLM 에는 나무 구조만 만들게 하고, id·order 부여와 검증·추천은 서버가 한다.
// 규칙 기반·서버 LLM·브라우저 LLM 세 경로가 같은 후처리를 거치게 하기 위함이다.
export const specDraftDetailSchema = z.object({
    name: z.string().min(1).max(80),
    technology: z.string().max(80).default(''),
});

export const specDraftSubSchema = z.object({
    name: z.string().min(1).max(80),
    details: z.array(specDraftDetailSchema).min(1).max(6),
});

export const specDraftCoreSchema = z.object({
    name: z.string().min(1).max(80),
    subs: z.array(specDraftSubSchema).min(1).max(6),
});

export const specDraftTreeSchema = z.object({
    cores: z.array(specDraftCoreSchema).min(1).max(8),
});

export type SpecDraftDetail = z.infer<typeof specDraftDetailSchema>;
export type SpecDraftSub = z.infer<typeof specDraftSubSchema>;
export type SpecDraftCore = z.infer<typeof specDraftCoreSchema>;
export type SpecDraftTree = z.infer<typeof specDraftTreeSchema>;

// 규칙 기반 엔진은 요약이 아니라 원본 문맥 전체가 필요하므로 기존 컨텍스트를 그대로 쓴다.
// 프롬프트 빌더(lib/ai/prompts.ts)가 여기서 필요한 만큼만 뽑아 요약한다.
export type SpecDraftInput = SpecAiContext;

// ─────────────────────────────────────────
// 프로바이더 인터페이스
// ─────────────────────────────────────────
export interface AiProvider {
    id: AiProviderId;
    label: string;
    // 네트워크가 필요한 프로바이더는 여기서 health check 한다.
    isAvailable(): Promise<boolean>;
    mentorQuestions(input: MentorQuestionsInput): Promise<MentorQuestionsResult>;
    attributeDraft(input: AttributeDraftInput): Promise<AttributeDraftResult>;
    specDraft(input: SpecDraftInput): Promise<SpecDraftTree>;
}

// 어떤 엔진이 처리했는지, 폴백이 일어났는지 호출자에게 알린다.
export interface AiTaskOutcome<T> {
    result: T;
    provider: AiProviderId;
    requestedProvider: AiProviderId;
    degraded: boolean;
    degradedReason?: string;
}
