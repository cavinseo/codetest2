import { describe, expect, it } from 'vitest';
import {
    aggregateKanoResponses,
    calculateBetterWorse,
    type KanoAnswer,
} from '../lib/kano-algorithm';
import { parseWorksheetMatrixRows } from '../lib/kano-upload-parser';
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
        expect(calculateSatisfactionGraphWeight(0.7, -0.3)).toBe(4.4);
        expect(calculateSatisfactionGraphWeight(0.3, -0.7)).toBe(3);
        expect(calculateSatisfactionGraphWeight(0.7, -0.7)).toBe(3.4);
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

    it('keeps unanswered Kano requirements out of QFD technical importance', () => {
        const result = calculateQfdWorksheet({
            requirements: [
                { id: 'answered', category: 'A', requirement: 'Answered need', importance: 5 },
                { id: 'unanswered', category: 'B', requirement: 'Unanswered need', importance: 0 },
            ],
            technicals: [
                { id: 'tech', name: 'Technical characteristic' },
            ],
            relationships: [
                { requirementId: 'answered', technicalCharId: 'tech', strength: 'STRONG' },
                { requirementId: 'unanswered', technicalCharId: 'tech', strength: 'STRONG' },
            ],
            benchmarks: [],
        });

        expect(result.requirements).toMatchObject([
            { requirementId: 'answered', weight: 5, weightPercent: 100 },
            { requirementId: 'unanswered', weight: 0, weightPercent: 0, rank: null },
        ]);
        expect(result.technicals[0]).toMatchObject({
            technicalCharId: 'tech',
            totalScore: 45,
            rank: 1,
        });
    });

    it('keeps a virtual project Kano survey reliable through QFD weighting', () => {
        const requirements = [
            { id: 'req-attractive', category: 'Group A', subcategory: 'A-1', requirement: 'Fast onboarding' },
            { id: 'req-must', category: 'Group B', subcategory: 'B-1', requirement: 'Data safety' },
            { id: 'req-indifferent', category: 'Group C', subcategory: 'C-1', requirement: 'Theme picker' },
        ];
        const respondentStarts = [3, 15, 27];
        const answerPairs: Array<Array<[KanoAnswer, KanoAnswer]>> = [
            [[1, 2], [1, 3], [2, 5]],
            [[2, 5], [3, 5], [4, 5]],
            [[2, 2], [3, 3], [4, 4]],
        ];
        const rows: unknown[][] = [
            [],
            [],
            ...requirements.flatMap((_, index) => [[index + 1, 0, 'positive'], ['', '', 'negative']]),
        ];

        respondentStarts.forEach((startCol, respondentIndex) => {
            rows[0][startCol] = respondentIndex + 1;
            rows[1][startCol] = '(1)like';
            rows[1][startCol + 1] = '(2)expect';
            rows[1][startCol + 2] = '(3)neutral';
            rows[1][startCol + 3] = '(4)tolerate';
            rows[1][startCol + 4] = '(5)dislike';

            answerPairs.forEach((pairsByRespondent, reqIndex) => {
                const [positive, negative] = pairsByRespondent[respondentIndex];
                rows[2 + reqIndex * 2][startCol + positive - 1] = 1;
                rows[3 + reqIndex * 2][startCol + negative - 1] = 1;
            });
        });

        const parsedAnswers = parseWorksheetMatrixRows(rows, requirements.length);
        expect(parsedAnswers).toHaveLength(9);

        const analyzedRequirements = requirements.map((requirement, reqIndex) => {
            const responses = parsedAnswers
                .filter((answer) => answer.requirementIndex === reqIndex)
                .map((answer) => ({
                    positive: answer.positiveAnswer,
                    negative: answer.negativeAnswer,
                }));
            const categories = aggregateKanoResponses(responses);
            const { better, worse } = calculateBetterWorse(categories);

            return {
                ...requirement,
                categories,
                better,
                worse,
                importance: calculateSatisfactionGraphWeight(better, worse),
            };
        });

        expect(analyzedRequirements.map((item) => item.categories.dominantCategory)).toEqual(['A', 'M', 'I']);
        expect(analyzedRequirements.map((item) => item.importance)).toEqual([4.4, 3, 2]);

        const qfd = calculateQfdWorksheet({
            requirements: analyzedRequirements,
            technicals: [
                { id: 'tech-flow', name: 'Flow automation' },
                { id: 'tech-security', name: 'Security control' },
            ],
            relationships: [
                { requirementId: 'req-attractive', technicalCharId: 'tech-flow', strength: 'STRONG' },
                { requirementId: 'req-must', technicalCharId: 'tech-flow', strength: 'WEAK' },
                { requirementId: 'req-must', technicalCharId: 'tech-security', strength: 'STRONG' },
                { requirementId: 'req-indifferent', technicalCharId: 'tech-security', strength: 'MEDIUM' },
            ],
            benchmarks: [
                { requirementId: 'req-attractive', company: 'self', score: 2 },
                { requirementId: 'req-attractive', company: 'competitor', score: 4 },
                { requirementId: 'req-must', company: 'self', score: 4 },
                { requirementId: 'req-must', company: 'competitor', score: 4 },
                { requirementId: 'req-indifferent', company: 'self', score: 5 },
                { requirementId: 'req-indifferent', company: 'competitor', score: 3 },
            ],
        });

        expect(qfd.requirements).toMatchObject([
            { requirementId: 'req-attractive', weight: 4.4, absoluteImportance: 8.8, rank: 1 },
            { requirementId: 'req-must', weight: 3, absoluteImportance: 3, rank: 2 },
            { requirementId: 'req-indifferent', weight: 2, absoluteImportance: 2, rank: 3 },
        ]);
        expect(qfd.technicals).toMatchObject([
            { technicalCharId: 'tech-flow', totalScore: 42.6, rank: 1 },
            { technicalCharId: 'tech-security', totalScore: 33, rank: 2 },
        ]);
        expect(qfd.totals.weight).toBe(9.4);
    });
});
