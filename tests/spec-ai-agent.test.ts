// 스펙 AI 에이전트의 초안 생성과 추천 메타데이터를 검증하는 테스트
import { describe, expect, it } from 'vitest';
import { generateSpecAiDraft } from '../lib/spec-ai-agent';

const baseContext = {
    project: {
        name: 'AI 고객 상담 플랫폼',
        description: '상담 요청을 접수하고 고객 요구를 분석해 상담원을 추천하는 웹 플랫폼',
        detailedDescription: '응답 속도와 추천 정확도가 중요하다.',
    },
    productAttributes: [
        {
            marketSegment: 'B2B',
            customerName: '고객센터',
            customerNeed: '문의 처리 시간을 줄이고 싶다',
            benefit: '빠른 상담 연결',
            attribute: '상담원 매칭',
            techCapability: 'Matching logic',
        },
    ],
    customerRequirements: [
        { category: '속도', subcategory: '응답', requirement: '문의가 빠르게 배정되어야 한다' },
    ],
    qfdTechnicals: [{ name: '응답 시간', unit: 'ms', targetValue: '500ms 이하' }],
    targetSpecs: [{ category: '성능', subCategory: '추천', specItem: '추천 정확도' }],
};

describe('spec AI agent', () => {
    it('creates a draft without saving and returns quality metadata', () => {
        const result = generateSpecAiDraft('draft', {
            ...baseContext,
            structuredInput: {
                productService: 'AI 고객 상담 플랫폼',
                currentFunctions: '상담 접수, 상담원 추천',
                technologies: 'Matching logic, NLP',
            },
        });

        expect(result.specFunctions.some((spec) => spec.level === 'CORE')).toBe(true);
        expect(result.specFunctions.some((spec) => spec.level === 'DETAIL' && spec.technology)).toBe(true);
        expect(result.contextSummary.productAttributeCount).toBe(1);
        expect(Array.isArray(result.issues)).toBe(true);
    });

    it('uses existing specs in technology mode and recommends downstream links', () => {
        const result = generateSpecAiDraft('technology', {
            ...baseContext,
            existingSpecs: [
                { id: 'core-1', level: 'CORE', name: '상담 처리', order: 0 },
                { id: 'sub-1', level: 'SUB', parentId: 'core-1', name: '상담 배정', order: 1 },
                { id: 'detail-1', level: 'DETAIL', parentId: 'sub-1', name: '상담원 추천', order: 2 },
            ],
        });

        expect(result.specFunctions).toContainEqual(expect.objectContaining({
            level: 'DETAIL',
            name: '상담원 추천',
            technology: expect.any(String),
        }));
        expect(result.recommendations.some((item) => item.type === 'qfd' || item.type === 'targetSpec')).toBe(true);
    });
});
