// 모순 응답(회의적 Q) 요약 규칙을 검증한다.
//
// 지키는 성질은 셋이다. (1) Kano 표에서 Q 로 분류되는 응답(좋다·좋다, 싫다·싫다)만 센다.
// (2) 응답자는 이메일 → 초대 id 순으로 구분해 한 사람이 여러 문항에서 모순이어도 한 명이다.
// (3) 문항별 건수는 처음 나온 순서대로 돌려준다 — 화면은 이 값을 표 번호로 바꿔 쓴다.
import { describe, expect, it } from 'vitest';
import { summarizeQuestionableResponses } from '../lib/kano-questionable-summary';

describe('summarizeQuestionableResponses', () => {
    it('모순 응답이 없으면 0 명·0 건·빈 목록이다', () => {
        expect(summarizeQuestionableResponses([
            { requirementId: 'r1', invitationId: 'i1', respondentEmail: 'a@x.com', positiveAnswer: 1, negativeAnswer: 5 },
            { requirementId: 'r1', invitationId: 'i2', respondentEmail: 'b@x.com', positiveAnswer: 5, negativeAnswer: 1 },
        ])).toEqual({ respondentCount: 0, responseCount: 0, requirements: [] });
    });

    it('좋다·좋다와 싫다·싫다만 모순으로 세고, 한 응답자는 한 명으로 센다', () => {
        expect(summarizeQuestionableResponses([
            { requirementId: 'r1', invitationId: 'i1', respondentEmail: 'a@x.com', positiveAnswer: 1, negativeAnswer: 1 },
            { requirementId: 'r2', invitationId: 'i1', respondentEmail: 'a@x.com', positiveAnswer: 5, negativeAnswer: 5 },
            { requirementId: 'r2', invitationId: 'i2', respondentEmail: 'b@x.com', positiveAnswer: 1, negativeAnswer: 1 },
            { requirementId: 'r3', invitationId: 'i2', respondentEmail: 'b@x.com', positiveAnswer: 1, negativeAnswer: 2 },
        ])).toEqual({
            respondentCount: 2,
            responseCount: 3,
            requirements: [{ requirementId: 'r1', count: 1 }, { requirementId: 'r2', count: 2 }],
        });
    });

    it('이메일이 없으면 초대 id 로 응답자를 구분하고, 둘 다 없으면 인원에서 뺀다', () => {
        expect(summarizeQuestionableResponses([
            { requirementId: 'r1', invitationId: 'i1', respondentEmail: '', positiveAnswer: 1, negativeAnswer: 1 },
            { requirementId: 'r1', invitationId: 'i1', respondentEmail: null, positiveAnswer: 5, negativeAnswer: 5 },
            { requirementId: 'r1', invitationId: ' i2 ', respondentEmail: undefined, positiveAnswer: 1, negativeAnswer: 1 },
            { requirementId: 'r1', invitationId: 'i2', positiveAnswer: 1, negativeAnswer: 1 },
            { requirementId: 'r1', invitationId: null, respondentEmail: '  ', positiveAnswer: 1, negativeAnswer: 1 },
            { requirementId: 'r1', invitationId: null, respondentEmail: null, positiveAnswer: 1, negativeAnswer: 1 },
        ])).toEqual({
            respondentCount: 2,
            responseCount: 6,
            requirements: [{ requirementId: 'r1', count: 6 }],
        });
    });

    it('빈 답은 분석과 같이 무관심(3)으로 읽어 모순으로 세지 않는다', () => {
        expect(summarizeQuestionableResponses([
            { requirementId: 'r1', invitationId: 'i1', positiveAnswer: null, negativeAnswer: null },
            { requirementId: 'r1', invitationId: 'i1', positiveAnswer: 1, negativeAnswer: 0 },
            { requirementId: 'r1', invitationId: 'i1', positiveAnswer: 0, negativeAnswer: 5 },
        ])).toEqual({ respondentCount: 0, responseCount: 0, requirements: [] });
    });
});
