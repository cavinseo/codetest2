// Kano 응답 가운데 모순 응답(회의적 Q)을 응답자·문항 단위로 요약한다.
//
// 같은 기능에 "있으면 좋다"와 "없어도 좋다"(또는 둘 다 "싫다")를 동시에 고르면 Kano 표에서
// Q 로 분류된다. 문항을 잘못 읽었거나 성의 없이 답했을 가능성이 커서, 집계표만 보고
// 결론을 내리기 전에 분석자가 알아야 한다. 화면에는 누가 그랬는지 대신 몇 명·어느 문항인지만
// 보낸다 — 응답자 이메일은 응답 본문에 싣지 않는다(lib/logger.ts 규칙).
import { classifyKanoResponse, type KanoAnswer } from './kano-algorithm';

export interface QuestionableSourceResponse {
    requirementId: string;
    invitationId?: string | null;
    respondentEmail?: string | null;
    positiveAnswer?: number | null;
    negativeAnswer?: number | null;
}

export interface KanoQuestionableSummary {
    /** 모순 응답을 한 건이라도 한 응답자 수. */
    respondentCount: number;
    /** 모순 응답 건수(응답자 × 문항). */
    responseCount: number;
    /** 모순 응답이 나온 문항과 그 건수. 입력 순서대로다. */
    requirements: Array<{ requirementId: string; count: number }>;
}

// 응답자를 구분하는 키 — countUniqueProjectRespondents 와 같은 규칙이어야 전체 응답자 수와 맞는다.
function respondentKey(response: QuestionableSourceResponse): string {
    return String(response.respondentEmail || response.invitationId || '').trim();
}

// 분석 라우트가 빈 답을 무관심(3)으로 읽는 것과 같게 맞춘다.
function answerOf(value: number | null | undefined): KanoAnswer {
    return (value || 3) as KanoAnswer;
}

export function summarizeQuestionableResponses(responses: QuestionableSourceResponse[]): KanoQuestionableSummary {
    const questionable = responses.filter((response) =>
        classifyKanoResponse(answerOf(response.positiveAnswer), answerOf(response.negativeAnswer)) === 'Q'
    );

    const respondents = new Set(questionable.map(respondentKey).filter(Boolean));
    const countByRequirement = new Map<string, number>();
    questionable.forEach(({ requirementId }) => {
        countByRequirement.set(requirementId, (countByRequirement.get(requirementId) ?? 0) + 1);
    });

    return {
        respondentCount: respondents.size,
        responseCount: questionable.length,
        requirements: [...countByRequirement].map(([requirementId, count]) => ({ requirementId, count })),
    };
}
