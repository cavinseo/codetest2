import { describe, expect, it } from 'vitest';
import {
    calculateQfdWorksheet,
    calculateSatisfactionGraphWeight,
    excelRankDescending,
    relationshipWeight,
} from '../lib/qfd-worksheet';

describe('qfd worksheet calculations', () => {
    it('uses the worksheet relationship weights', () => {
        expect(relationshipWeight('STRONG')).toBe(9);
        expect(relationshipWeight('MEDIUM')).toBe(3);
        expect(relationshipWeight('WEAK')).toBe(1);
        expect(relationshipWeight('NONE')).toBe(0);
    });

    it('ranks ties like Excel RANK in descending order', () => {
        expect(excelRankDescending([10, 8, 8, 1])).toEqual([1, 2, 2, 4]);
    });

    it('matches the satisfaction graph weight formula used as QFD importance input', () => {
        expect(calculateSatisfactionGraphWeight(0.3, -0.3)).toBe(2);
        expect(calculateSatisfactionGraphWeight(0.7, -0.3)).toBe(5);
        expect(calculateSatisfactionGraphWeight(0.3, -0.7)).toBe(3);
        expect(calculateSatisfactionGraphWeight(0.7, -0.7)).toBe(4);
    });

    it('matches the QFD worksheet formulas for right-side quality columns and technical importance', () => {
        const result = calculateQfdWorksheet({
            requirements: [
                { id: 'r1', category: 'A', subcategory: 'A-1', requirement: 'Need 1', importance: 4 },
                { id: 'r2', category: 'B', subcategory: 'B-1', requirement: 'Need 2', importance: 2 },
            ],
            technicals: [
                { id: 't1', name: 'Tech 1', unit: 'ms', targetValue: '100 이하' },
                { id: 't2', name: 'Tech 2', unit: '%', targetValue: '95 이상' },
            ],
            relationships: [
                { requirementId: 'r1', technicalCharId: 't1', strength: 'STRONG' },
                { requirementId: 'r1', technicalCharId: 't2', strength: 'WEAK' },
                { requirementId: 'r2', technicalCharId: 't1', strength: 'MEDIUM' },
                { requirementId: 'r2', technicalCharId: 't2', strength: 'STRONG' },
            ],
            benchmarks: [
                { requirementId: 'r1', company: 'self', score: 2 },
                { requirementId: 'r1', company: 'competitor', score: 4 },
                { requirementId: 'r2', company: 'self', score: 4 },
                { requirementId: 'r2', company: 'competitor', score: 3 },
            ],
        });

        expect(result.requirements).toMatchObject([
            {
                requirementId: 'r1',
                weight: 4,
                weightPercent: 66.67,
                selfScore: 2,
                competitorScore: 4,
                planQuality: 4,
                improvementRate: 2,
                absoluteImportance: 8,
                qualityImportancePercent: 80,
                rank: 1,
            },
            {
                requirementId: 'r2',
                weight: 2,
                weightPercent: 33.33,
                selfScore: 4,
                competitorScore: 3,
                planQuality: 4,
                improvementRate: 1,
                absoluteImportance: 2,
                qualityImportancePercent: 20,
                rank: 2,
            },
        ]);

        expect(result.technicals).toMatchObject([
            { technicalCharId: 't1', totalScore: 42, rank: 1, importancePercent: 70 },
            { technicalCharId: 't2', totalScore: 22, rank: 2, importancePercent: 36.67 },
        ]);

        expect(result.totals.weight).toBe(6);
        expect(result.totals.absoluteImportance).toBe(10);
    });

    it('uses the highest added competitor score for the worksheet competitor comparison', () => {
        const result = calculateQfdWorksheet({
            requirements: [
                { id: 'r1', category: 'A', subcategory: 'A-1', requirement: 'Need 1', importance: 4 },
            ],
            technicals: [],
            relationships: [],
            benchmarks: [
                { requirementId: 'r1', company: 'self', score: 2 },
                { requirementId: 'r1', company: 'competitor', score: 3 },
                { requirementId: 'r1', company: '경쟁사 2', score: 5 },
                { requirementId: 'r1', company: '경쟁사 3', score: 4 },
            ],
        });

        expect(result.requirements[0]).toMatchObject({
            selfScore: 2,
            competitorScore: 5,
            planQuality: 5,
            improvementRate: 2.5,
            absoluteImportance: 10,
        });
    });

    it('keeps customer requirement rows linked by id and in worksheet input order', () => {
        const result = calculateQfdWorksheet({
            requirements: [
                { id: 'r-later', category: '동일 그룹', subcategory: '반복 그룹', requirement: '두 번째 저장 항목', importance: 5 },
                { id: 'r-first', category: '동일 그룹', subcategory: '반복 그룹', requirement: '첫 번째 저장 항목', importance: 3 },
            ],
            technicals: [
                { id: 't-speed', name: '처리 속도' },
            ],
            relationships: [
                { requirementId: 'r-first', technicalCharId: 't-speed', strength: 'STRONG' },
                { requirementId: 'r-later', technicalCharId: 't-speed', strength: 'WEAK' },
            ],
            benchmarks: [],
        });

        expect(result.requirements.map((row) => row.requirementId)).toEqual(['r-later', 'r-first']);
        expect(result.requirements.map((row) => row.requirement)).toEqual(['두 번째 저장 항목', '첫 번째 저장 항목']);
        expect(result.technicals[0].totalScore).toBe(32);
    });
});
