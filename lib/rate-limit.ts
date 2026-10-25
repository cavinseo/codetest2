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

// expiresAt 은 마지막 시도 + 윈도. 이 시각이 지난 키는 다시 볼 일이 없어 지워도 된다.
type Store = Map<string, { hits: number[]; expiresAt: number }>;

// 키가 이만큼 쌓이면 만료된 키를 치운다. 그래도 넘치면 오래된 키부터 버린다 —
// 키마다 IP·이메일이 섞여 있어, 치우지 않으면 서로 다른 값으로 계속 두드리는 것만으로
// 프로세스 메모리가 끝없이 커졌다(2026-10-25 코드 리뷰 B14).
const SWEEP_THRESHOLD = 5_000;
const MAX_KEYS = 10_000;
// 전체 순회는 키 수만큼 걸리므로, 살아 있는 키가 많을 때 요청마다 돌지 않도록 간격을 둔다.
const SWEEP_INTERVAL_MS = 60_000;
let lastSweepAt = Number.NEGATIVE_INFINITY;

// 개발 중 핫리로드로 카운터가 초기화되지 않도록 globalThis 에 붙인다.
const globalStore = globalThis as unknown as { __rateLimitStore?: Store };
const store: Store = globalStore.__rateLimitStore ?? new Map();
globalStore.__rateLimitStore = store;

// 지웠다가 다시 넣어 Map 순서의 맨 뒤로 보낸다. 그러면 맨 앞 키가 가장 오래 안 쓰인 키다.
function remember(key: string, hits: number[], expiresAt: number): void {
    store.delete(key);
    store.set(key, { hits, expiresAt });
}

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
    const hits = (store.get(key)?.hits ?? []).filter((timestamp) => timestamp > windowStart);

    if (hits.length >= rule.max) {
        remember(key, hits, hits[hits.length - 1] + rule.windowMs);
        const oldest = hits[0];
        return {
            allowed: false,
            remaining: 0,
            retryAfterSeconds: Math.max(1, Math.ceil((oldest + rule.windowMs - now) / 1000)),
        };
    }

    hits.push(now);
    remember(key, hits, now + rule.windowMs);
    if (store.size > MAX_KEYS) {
        // 살아 있는 키만으로 넘치면 가장 오래 안 쓰인 키를 버린다. 방금 쓴 키는 맨 뒤라 안전하다.
        store.delete(store.keys().next().value as string);
    } else if (store.size > SWEEP_THRESHOLD && now - lastSweepAt >= SWEEP_INTERVAL_MS) {
        sweep(now);
    }
    return { allowed: true, remaining: rule.max - hits.length, retryAfterSeconds: 0 };
}

function sweep(now: number): void {
    lastSweepAt = now;
    for (const [key, entry] of store) {
        if (entry.expiresAt <= now) store.delete(key);
    }
}

/** 로그인 성공처럼 "이 클라이언트는 정상"이 확인됐을 때 카운터를 비운다. */
export function resetRateLimit(key: string): void {
    store.delete(key);
}

/**
 * 요청자 IP 를 추정한다.
 *
 * x-forwarded-for 의 첫 항목은 클라이언트가 마음대로 적어 보낼 수 있다. 그 값을 키로
 * 쓰면 요청마다 다른 값을 적는 것만으로 "IP+이메일" 제한이 매번 새 키가 되어 무력해졌다
 * (2026-10-25 코드 리뷰 B14). 그래서 앞단 프록시가 직접 채우는 x-real-ip 를 먼저 쓰고
 * (Vercel 이 클라이언트 값을 덮어쓴다), 없으면 x-forwarded-for 의 마지막 항목 — 우리
 * 쪽에 가장 가까운 프록시가 붙인 값 — 을 쓴다.
 */
export function clientIpFrom(headers: Headers): string {
    const realIp = headers.get('x-real-ip')?.trim();
    if (realIp) return realIp;
    const forwarded = headers.get('x-forwarded-for')?.split(',').map((part) => part.trim()).filter(Boolean);
    return forwarded?.[forwarded.length - 1] || 'unknown';
}

/** 테스트에서 저장된 키 수를 확인하기 위한 용도. */
export function rateLimitKeyCount(): number {
    return store.size;
}

/** 테스트에서 상태를 비우기 위한 용도. */
export function clearAllRateLimits(): void {
    store.clear();
    lastSweepAt = Number.NEGATIVE_INFINITY;
}
