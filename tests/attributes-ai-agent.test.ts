import { describe, expect, it } from 'vitest';
import {
    generateAttributeDraft,
    generateAttributeMentorQuestions,
} from '../lib/attributes-ai-agent';

const project = { name: '동호회 운영 서비스', description: null, detailedDescription: null };

describe('WS-3 멘토링 문진', () => {
    it('입력이 비어 있으면 네 항목을 모두 묻는다', () => {
        const result = generateAttributeMentorQuestions({ project, existingRows: [] });

        expect(result.questions.map((q) => q.field)).toEqual([
            'marketSegment',
            'marketSegment',
            'customerName',
            'customerNeed',
            'benefit',
        ]);
        expect(result.focus).toContain('세분시장');
    });

    it('이미 채워진 항목은 보완 질문으로 바뀐다', () => {
        const result = generateAttributeMentorQuestions({
            project,
            existingRows: [{ marketSegment: '소규모 동호회', customerName: '운영진' }],
        });

        const segmentQuestion = result.questions.find((q) => q.id === 'market-segments');
        const needQuestion = result.questions.find((q) => q.id === 'customer-problems');

        expect(segmentQuestion?.question).toContain('보완');
        expect(needQuestion?.question).not.toContain('보완');
    });
});

describe('WS-3 초안 생성', () => {
    it('세분시장별 고객명마다 행을 만들고 니즈·혜택은 같은 값을 넣는다', () => {
        const result = generateAttributeDraft({
            project,
            answers: {
                marketSegments: '소규모 비영리 동호회\n중대형 동호회',
                customerNames: '소규모 비영리 동호회: 운영진, 총무\n중대형 동호회: 대표',
                customerProblems: '소규모 비영리 동호회: 명단과 회비를 혼자 관리\n중대형 동호회: 정기 일정 조율 부담',
                expectedBenefits: '소규모 비영리 동호회: 운영 시간 절감\n중대형 동호회: 참여율 향상',
            },
        });

        expect(result.rows).toEqual([
            {
                marketSegment: '소규모 비영리 동호회',
                customerName: '운영진',
                customerNeed: '명단과 회비를 혼자 관리',
                benefit: '운영 시간 절감',
            },
            {
                marketSegment: '소규모 비영리 동호회',
                customerName: '총무',
                customerNeed: '명단과 회비를 혼자 관리',
                benefit: '운영 시간 절감',
            },
            {
                marketSegment: '중대형 동호회',
                customerName: '대표',
                customerNeed: '정기 일정 조율 부담',
                benefit: '참여율 향상',
            },
        ]);
    });

    it('세분시장 접두사가 없는 답변은 모든 세분시장에 공통 적용한다', () => {
        const result = generateAttributeDraft({
            project,
            answers: {
                marketSegments: '소규모 동호회\n중대형 동호회',
                customerNames: '소규모 동호회: 운영진\n중대형 동호회: 대표',
                customerProblems: '수기 관리로 시간 낭비',
                expectedBenefits: '운영 시간 절감',
            },
        });

        expect(result.rows.map((row) => row.customerNeed)).toEqual([
            '수기 관리로 시간 낭비',
            '수기 관리로 시간 낭비',
        ]);
    });

    it('세분시장이 없으면 오류를 돌려준다', () => {
        const result = generateAttributeDraft({ project, answers: {} });

        expect(result.rows).toEqual([]);
        expect(result.issues[0]).toMatchObject({ severity: 'error' });
    });

    it('고객명이나 문제가 비면 경고를 남기고 빈 칸으로 둔다', () => {
        const result = generateAttributeDraft({
            project,
            answers: { marketSegments: '소규모 동호회' },
        });

        expect(result.rows).toEqual([
            { marketSegment: '소규모 동호회', customerName: '', customerNeed: '', benefit: '' },
        ]);
        expect(result.issues.some((issue) => issue.severity === 'warning')).toBe(true);
    });
});
