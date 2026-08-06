// AI 작업 계약. UI와 API 라우트는 이 계약만 알고, 실제 엔진이 무엇인지는 모른다.
import { z } from 'zod';

export const AI_PROVIDER_IDS = ['rule', 'local', 'hermes', 'api'] as const;
export type AiProviderId = (typeof AI_PROVIDER_IDS)[number];

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
// 프로바이더 인터페이스
// ─────────────────────────────────────────
export interface AiProvider {
    id: AiProviderId;
    label: string;
    // 네트워크가 필요한 프로바이더는 여기서 health check 한다.
    isAvailable(): Promise<boolean>;
    mentorQuestions(input: MentorQuestionsInput): Promise<MentorQuestionsResult>;
    attributeDraft(input: AttributeDraftInput): Promise<AttributeDraftResult>;
}

// 어떤 엔진이 처리했는지, 폴백이 일어났는지 호출자에게 알린다.
export interface AiTaskOutcome<T> {
    result: T;
    provider: AiProviderId;
    requestedProvider: AiProviderId;
    degraded: boolean;
    degradedReason?: string;
}
