/**
 * Kano 모델 분류 알고리즘
 */

export type KanoAnswer = 1 | 2 | 3 | 4 | 5;
// 1: 좋다, 2: 당연하다, 3: 무관심, 4: 참을 수 있다, 5: 싫다

export type KanoCategory = 'M' | 'O' | 'A' | 'I' | 'R' | 'Q';
// M: Must-be (당연적)
// O: One-dimensional (일원적)
// A: Attractive (매력적)
// I: Indifferent (무관심)
// R: Reverse (역)
// Q: Questionable (의문)

// Kano 분류 테이블
const KANO_TABLE: Record<KanoAnswer, Record<KanoAnswer, KanoCategory>> = {
    1: { 1: 'Q', 2: 'A', 3: 'A', 4: 'A', 5: 'O' }, // 긍정: 좋다
    2: { 1: 'R', 2: 'I', 3: 'I', 4: 'I', 5: 'M' }, // 긍정: 당연하다
    3: { 1: 'R', 2: 'I', 3: 'I', 4: 'I', 5: 'M' }, // 긍정: 무관심
    4: { 1: 'R', 2: 'I', 3: 'I', 4: 'I', 5: 'M' }, // 긍정: 참을 수 있다
    5: { 1: 'R', 2: 'R', 3: 'R', 4: 'R', 5: 'Q' }, // 긍정: 싫다
};

/**
 * 개별 응답의 Kano 카테고리 결정
 */
export function classifyKanoResponse(
    positiveAnswer: KanoAnswer,
    negativeAnswer: KanoAnswer
): KanoCategory {
    return KANO_TABLE[positiveAnswer][negativeAnswer];
}

/**
 * 여러 응답의 Kano 카테고리 집계
 */
export interface KanoCategoryCount {
    M: number; // Must-be
    O: number; // One-dimensional
    A: number; // Attractive
    I: number; // Indifferent
    R: number; // Reverse
    Q: number; // Questionable
    total: number;
    dominantCategory: KanoCategory;
}

export function aggregateKanoResponses(
    responses: Array<{ positive: KanoAnswer; negative: KanoAnswer }>
): KanoCategoryCount {
    const counts: Record<KanoCategory, number> = {
        M: 0,
        O: 0,
        A: 0,
        I: 0,
        R: 0,
        Q: 0,
    };

    responses.forEach(({ positive, negative }) => {
        const category = classifyKanoResponse(positive, negative);
        counts[category]++;
    });

    const total = responses.length;

    // 가장 많은 카테고리 찾기 (Q와 R 제외)
    const validCategories: KanoCategory[] = ['M', 'O', 'A', 'I'];
    let dominantCategory: KanoCategory = 'I';
    let maxCount = 0;

    for (const cat of validCategories) {
        if (counts[cat] > maxCount) {
            maxCount = counts[cat];
            dominantCategory = cat;
        }
    }

    return {
        ...counts,
        total,
        dominantCategory,
    };
}

/**
 * Better-Worse 계수 계산
 */
export interface BetterWorseCoefficients {
    better: number; // 만족도 증가 계수
    worse: number; // 불만족도 감소 계수
}

export function calculateBetterWorse(counts: KanoCategoryCount): BetterWorseCoefficients {
    const { A, O, M, I } = counts;
    const denominator = A + O + M + I;

    if (denominator === 0) {
        return { better: 0, worse: 0 };
    }

    const better = (A + O) / denominator;
    const worse = -((O + M) / denominator);

    return {
        better: Math.round(better * 100) / 100, // 소수점 2자리
        worse: Math.round(worse * 100) / 100,
    };
}

/**
 * TIMKO 카테고리 결정 (Better 기반)
 */
export type TimkoCategory = '매력' | '일원' | '당연' | '무관심';

export function getTimkoCategory(better: number): TimkoCategory {
    if (better >= 0.7) return '매력';
    if (better >= 0.5) return '일원';
    if (better >= 0.3) return '당연';
    return '무관심';
}

/**
 * 만족계수 그래프용 사분면 결정
 */
export type SatisfactionQuadrant =
    | 'ATTRACTIVE' // 매력적 (Better 높음, |Worse| 낮음)
    | 'ONE_DIMENSIONAL' // 일원적 (Better 높음, |Worse| 높음)
    | 'MUST_BE' // 당연적 (Better 낮음, |Worse| 높음)
    | 'INDIFFERENT'; // 무관심 (Better 낮음, |Worse| 낮음)

export function getSatisfactionQuadrant(
    better: number,
    worse: number
): SatisfactionQuadrant {
    const absWorse = Math.abs(worse);

    if (better >= 0.5 && absWorse < 0.5) return 'ATTRACTIVE';
    if (better >= 0.5 && absWorse >= 0.5) return 'ONE_DIMENSIONAL';
    if (better < 0.5 && absWorse >= 0.5) return 'MUST_BE';
    return 'INDIFFERENT';
}

/**
 * 개선 우선순위 점수 계산
 * Better 계수가 높을수록 우선순위가 높음
 */
export function calculatePriorityScore(
    better: number,
    worse: number,
    currentPerformance: number = 0.5 // 0-1 범위
): number {
    // 개선 잠재력 = Better 계수 * (1 - 현재 만족도)
    const improvementPotential = better * (1 - currentPerformance);

    // 불만족 감소 효과 = |Worse| 계수 * 현재 만족도
    const dissatisfactionReduction = Math.abs(worse) * currentPerformance;

    // 총 점수 = 개선 잠재력 + 불만족 감소 효과
    return improvementPotential + dissatisfactionReduction;
}
