/**
 * Kano 분석에 필요한 공유 로직
 *
 * 이 모듈은 여러 API 라우트에서 공통으로 사용되는 Kano 분류 로직을 제공합니다.
 * 중복 구현을 방지하고 일관성을 유지하기 위해 이 곳에 정의합니다.
 */

/**
 * Kano 이중 질문 교차표 (Functional × Dysfunctional).
 * 결과값: M(Must-be), O(One-dimensional), A(Attractive), I(Indifferent), R(Reverse), Q(Questionable)
 */
const KANO_TABLE: Record<string, Record<string, string>> = {
    LIKE: { LIKE: 'Q', EXPECT: 'A', NEUTRAL: 'A', TOLERATE: 'A', DISLIKE: 'O' },
    EXPECT: { LIKE: 'R', EXPECT: 'I', NEUTRAL: 'I', TOLERATE: 'I', DISLIKE: 'M' },
    NEUTRAL: { LIKE: 'R', EXPECT: 'I', NEUTRAL: 'I', TOLERATE: 'I', DISLIKE: 'M' },
    TOLERATE: { LIKE: 'R', EXPECT: 'I', NEUTRAL: 'I', TOLERATE: 'I', DISLIKE: 'M' },
    DISLIKE: { LIKE: 'R', EXPECT: 'R', NEUTRAL: 'R', TOLERATE: 'R', DISLIKE: 'Q' },
};

/**
 * Kano 이중 질문(기능적/역기능적) 답변으로부터 카노 카테고리를 분류합니다.
 *
 * @param functional - 기능적 질문 답변 (예: 'LIKE', 'EXPECT', ...)
 * @param dysfunctional - 역기능적 질문 답변
 * @returns 카노 카테고리 (M, O, A, I, R, Q)
 */
export function classifyKano(functional: string, dysfunctional: string): string {
    return KANO_TABLE[functional]?.[dysfunctional] ?? 'I';
}
