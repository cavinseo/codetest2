/**
 * 애플리케이션 전반에서 사용되는 상수 정의.
 * 매직 문자열·숫자를 모두 이곳에 집중시켜 변경 시 한 곳만 수정합니다.
 */

// ─── 인증 ──────────────────────────────────────────────────────────────

/** bcrypt 해싱 라운드 수. 숫자가 클수록 안전하지만 느려짐 (10 ≈ 100ms). */
export const BCRYPT_ROUNDS = 10;

/** 세션 쿠키 유효 기간 (초). 7일. */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

/** 세션 쿠키 이름. */
export const SESSION_COOKIE_NAME = 'session';

// ─── 프로젝트 역할 ─────────────────────────────────────────────────────

export const PROJECT_ROLES = ['OWNER', 'EDITOR', 'COACH', 'ADMIN'] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

/** 팀원 초대 시 허용 역할 (OWNER는 초대 불가). */
export const INVITABLE_ROLES = ['EDITOR', 'COACH'] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

// ─── Kano ─────────────────────────────────────────────────────────────

/**
 * Kano 설문 답변을 수치로 변환하는 매핑.
 * 1 = 좋다(Like), 5 = 싫다(Dislike).
 */
export const KANO_ANSWER_SCORE = {
    LIKE: 1,
    EXPECT: 2,
    NEUTRAL: 3,
    TOLERATE: 4,
    DISLIKE: 5,
} as const satisfies Record<string, 1 | 2 | 3 | 4 | 5>;

export type KanoAnswer = keyof typeof KANO_ANSWER_SCORE;
export type KanoScore = (typeof KANO_ANSWER_SCORE)[KanoAnswer];
