// 규칙 기반 기본 프로바이더. 외부 의존성이 없어 항상 가용하며, 다른 프로바이더의 최종 폴백이다.
import { generateAttributeDraft, generateAttributeMentorQuestions } from '../attributes-ai-agent';
import { generateSpecDraftCores } from '../spec-ai-agent';
import type {
    AiProvider,
    AttributeDraftInput,
    AttributeDraftResult,
    MentorQuestionsInput,
    MentorQuestionsResult,
    SpecDraftInput,
    SpecDraftTree,
} from './types';

export const ruleProvider: AiProvider = {
    id: 'rule',
    label: '기본 엔진(규칙 기반)',

    async isAvailable() {
        return true;
    },

    async mentorQuestions(input: MentorQuestionsInput): Promise<MentorQuestionsResult> {
        return generateAttributeMentorQuestions(input);
    },

    async attributeDraft(input: AttributeDraftInput): Promise<AttributeDraftResult> {
        return generateAttributeDraft(input);
    },

    async specDraft(input: SpecDraftInput): Promise<SpecDraftTree> {
        return { cores: generateSpecDraftCores(input) };
    },
};
