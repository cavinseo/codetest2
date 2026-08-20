// 인증 엔드포인트용 슬라이딩 윈도 제한.
//
// 로그인·가입에 시도 제한이 전혀 없어, 알려진 관리자 이메일을 상대로 무제한
// 비밀번호 추측이 가능했다. 가입도 무제한이라 승인 대기 큐를 오염시킬 수 있었다.
//
// 한계: 저장소가 프로세스 메모리라 서버리스에서는 인스턴스마다 카운터가 따로 논다.
// 인스턴스 수만큼 임계값이 늘어나는 셈이라 완벽한 방어가 아니다. 그래도 단일
// 클라이언트의 고속 무차별 대입은 실질적으로 막힌다. durable 한 제한이 필요해지면
// Upstash 같은 외부 저장소로 이 모듈의 구현만 바꾸면 된다.

export interface RateLimitRule {
    /** 윈도 길이(밀리초) */
    windowMs: number;
    /** 윈도 안에서 허용할 최대 시도 횟수 */
    max: number;
}

export interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    /** 다시 시도할 수 있을 때까지 남은 초. 허용된 경우 0. */
    retryAfterSeconds: number;
}

export const LOGIN_RATE_LIMIT: RateLimitRule = { windowMs: 15 * 60 * 1000, max: 5 };
export const SIGNUP_RATE_LIMIT: RateLimitRule = { windowMs: 60 * 60 * 1000, max: 3 };

type Store = Map<string, number[]>;

// 개발 중 핫리로드로 카운터가 초기화되지 않도록 globalThis 에 붙인다.
const globalStore = globalThis as unknown as { __rateLimitStore?: Store };
const store: Store = globalStore.__rateLimitStore ?? new Map();
globalStore.__rateLimitStore = store;

/**
 * 시도를 1회 기록하고 허용 여부를 돌려준다.
 * 같은 key 로 windowMs 안에 max 번을 넘기면 거부한다.
 */
export function consumeRateLimit(
    key: string,
    rule: RateLimitRule,
    now: number = Date.now()
): RateLimitResult {
    const windowStart = now - rule.windowMs;
    const hits = (store.get(key) ?? []).filter((timestamp) => timestamp > windowStart);

    if (hits.length >= rule.max) {
        store.set(key, hits);
        const oldest = hits[0];
        return {
            allowed: false,
            remaining: 0,
            retryAfterSeconds: Math.max(1, Math.ceil((oldest + rule.windowMs - now) / 1000)),
        };
    }

    hits.push(now);
    store.set(key, hits);
    return { allowed: true, remaining: rule.max - hits.length, retryAfterSeconds: 0 };
}

/** 로그인 성공처럼 "이 클라이언트는 정상"이 확인됐을 때 카운터를 비운다. */
export function resetRateLimit(key: string): void {
    store.delete(key);
}

/**
 * 요청자 IP 를 추정한다. Vercel 은 x-forwarded-for 를 붙여 준다.
 * 헤더는 위조 가능하지만, 위조하면 그만큼 키가 분산돼 같은 클라이언트를 계속
 * 추적하지 못할 뿐이다. 그래서 이메일 기반 키와 함께 쓴다.
 */
export function clientIpFrom(headers: Headers): string {
    const forwarded = headers.get('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0].trim();
    return headers.get('x-real-ip')?.trim() || 'unknown';
}

/** 테스트에서 상태를 비우기 위한 용도. */
export function clearAllRateLimits(): void {
    store.clear();
}
