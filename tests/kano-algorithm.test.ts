import { describe, expect, it } from 'vitest';
import {
    aggregateKanoResponses,
    calculateBetterWorse,
    calculatePriorityScore,
    calculateSatisfactionGraphWeight,
    classifyKanoResponse,
    getSatisfactionQuadrant,
    getWeightedTimkoCategory,
    translateKanoCategory,
} from '../lib/kano-algorithm';

describe('kano algorithm', () => {
    it('classifies individual response pairs using the Kano table', () => {
        expect(classifyKanoResponse(1, 2)).toBe('A');
        expect(classifyKanoResponse(1, 5)).toBe('O');
        expect(classifyKanoResponse(2, 5)).toBe('M');
        expect(classifyKanoResponse(3, 3)).toBe('I');
        expect(classifyKanoResponse(5, 1)).toBe('R');
        expect(classifyKanoResponse(1, 1)).toBe('Q');
    });

    it('matches the worksheet Kano classification formulas for all 25 answer pairs', () => {
        const worksheetClassify = (positive: number, negative: number) => {
            if (positive === 1 && [2, 3, 4].includes(negative)) return 'A';
            if (positive === 1 && negative === 5) return 'O';
            if ([2, 3, 4].includes(positive) && negative === 5) return 'M';
            if (
                (negative === 1 && [2, 3, 4, 5].includes(positive)) ||
                (positive === 5 && [1, 2, 3, 4].includes(negative))
            ) return 'R';
            if ([2, 3, 4].includes(positive) && [2, 3, 4].includes(negative)) return 'I';
            return 'Q';
        };

        for (let positive = 1; positive <= 5; positive++) {
            for (let negative = 1; negative <= 5; negative++) {
                expect(classifyKanoResponse(positive as 1 | 2 | 3 | 4 | 5, negative as 1 | 2 | 3 | 4 | 5)).toBe(
                    worksheetClassify(positive, negative)
                );
            }
        }
    });

    it('aggregates responses and selects the dominant category', () => {
        const result = aggregateKanoResponses([
            { positive: 1, negative: 2 },
            { positive: 1, negative: 3 },
            { positive: 2, negative: 5 },
            { positive: 3, negative: 3 },
        ]);

        expect(result).toMatchObject({
            A: 2,
            M: 1,
            I: 1,
            O: 0,
            R: 0,
            Q: 0,
            total: 4,
            dominantCategory: 'A',
        });
    });

    it('returns indifferent as dominant category for empty response sets', () => {
        expect(aggregateKanoResponses([])).toMatchObject({
            total: 0,
            dominantCategory: 'I',
        });
    });

    it('calculates rounded better and worse coefficients', () => {
        const counts = aggregateKanoResponses([
            { positive: 1, negative: 2 },
            { positive: 1, negative: 5 },
            { positive: 2, negative: 5 },
            { positive: 3, negative: 3 },
        ]);

        expect(calculateBetterWorse(counts)).toEqual({
            better: 0.5,
            worse: -0.5,
        });
    });

    it('uses the same Better-Worse denominator as the worksheet', () => {
        const counts = aggregateKanoResponses([
            { positive: 1, negative: 1 },
            { positive: 5, negative: 5 },
            { positive: 1, negative: 2 },
            { positive: 1, negative: 5 },
            { positive: 2, negative: 5 },
            { positive: 3, negative: 3 },
            { positive: 5, negative: 2 },
        ]);

        const worksheetDenominator = counts.A + counts.O + counts.M + counts.I;
        expect(worksheetDenominator).toBe(4);
        expect(calculateBetterWorse(counts)).toEqual({
            better: (counts.A + counts.O) / worksheetDenominator,
            worse: -((counts.O + counts.M) / worksheetDenominator),
        });
    });

    it('maps better/worse coefficients into satisfaction quadrants', () => {
        expect(getSatisfactionQuadrant(0.7, -0.2)).toBe('ATTRACTIVE');
        expect(getSatisfactionQuadrant(0.7, -0.7)).toBe('ONE_DIMENSIONAL');
        expect(getSatisfactionQuadrant(0.2, -0.7)).toBe('MUST_BE');
        expect(getSatisfactionQuadrant(0.2, -0.2)).toBe('INDIFFERENT');
    });

    it('assigns satisfaction graph weights from radial Better-Worse positions', () => {
        expect(calculateSatisfactionGraphWeight(0.5, -0.2)).toBe(4.2);
        expect(calculateSatisfactionGraphWeight(0.6, -0.1)).toBe(4.2);
        expect(calculateSatisfactionGraphWeight(0.68, -0.16)).toBe(4.4);
        expect(calculateSatisfactionGraphWeight(0.79, -0.16)).toBe(4.6);
        expect(calculateSatisfactionGraphWeight(0.8, -0.3)).toBe(4.6);
        expect(calculateSatisfactionGraphWeight(0.75, -0.35)).toBe(4.4);
        expect(calculateSatisfactionGraphWeight(0.4, -0.25)).toBe(2);
        expect(calculateSatisfactionGraphWeight(0.49, -0.49)).toBe(2);
        expect(calculateSatisfactionGraphWeight(0, 0)).toBe(2);
        expect(calculateSatisfactionGraphWeight(0.4, -0.7)).toBe(3);
        expect(calculateSatisfactionGraphWeight(0.8, -0.8)).toBe(3.6);
    });

    it('maps worksheet TIMKO weights into quality results', () => {
        expect(getWeightedTimkoCategory(4.2)).toBe('매력');
        expect(getWeightedTimkoCategory(3.2)).toBe('일원');
        expect(getWeightedTimkoCategory(2.2)).toBe('당연');
        expect(getWeightedTimkoCategory(2.19)).toBe('무관심');
        expect(getWeightedTimkoCategory(null)).toBeNull();
    });

    it('calculates priority score from improvement and dissatisfaction effects', () => {
        expect(calculatePriorityScore(0.8, -0.6, 0.25)).toBeCloseTo(0.75);
    });

    it('여섯 Kano 분류를 각각 한글 명칭으로 옮기고, 모르는 값은 기본 문구를 쓴다', () => {
        // 화면과 보고서에 그대로 나가는 라벨이라 값을 직접 고정한다. 한 분기라도
        // 빠지면 사용자에게 다른 분류로 보이는데 계산은 정상이라 드러나지 않는다.
        expect(translateKanoCategory('M')).toBe('당연적');
        expect(translateKanoCategory('O')).toBe('일원적');
        expect(translateKanoCategory('A')).toBe('매력적');
        expect(translateKanoCategory('I')).toBe('무관심');
        expect(translateKanoCategory('R')).toBe('역');
        expect(translateKanoCategory('Q')).toBe('회의적');
        expect(translateKanoCategory('알 수 없는 값' as never)).toBe('알 수 없음');
    });
});
