# Google 회원 로그인 (소셜 로그인) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로그인 화면에 「Google 계정으로 로그인」을 추가한다. 이미 가입·승인된 회원이 비밀번호 없이 Google OAuth 로 로그인한다. 미가입 이메일은 계정을 만들지 않고 가입 화면으로 안내한다.

**Architecture:** 기존 Google OAuth(관리자 서비스 연동, Forms 권한)와 완전히 분리된 로그인 전용 흐름을 만든다. 같은 클라이언트 자격증명(ServiceSetting)을 쓰되 ① 스코프는 `openid email` 만 ② redirect URI 는 `/api/auth/google/login/callback` ③ CSRF state 는 전용 컨텍스트(`google-login-state.v1`)로 서명해 세션 쿠키·관리자 nonce 와 서명 공간을 3중 분리한다. 콜백은 이메일을 **대소문자 무시**로 대조해 기존 세션 쿠키(HMAC + sessionVersion)를 발급한다.

**Tech Stack:** 기존과 동일. 외부 라이브러리 추가 없음(id_token 은 서명 검증 없이 payload 만 읽는다 — 코드 교환 직후 Google 토큰 엔드포인트가 준 값이라 위조 여지가 없다. 이 근거를 주석으로 남길 것).

**Spec:** 이 문서 "확정 설계" 절 (대화 확정: 자동 가입 없음 / 승인 회원만 / Google 먼저).

## Global Constraints

- CLAUDE.md 최우선 제약 그대로: 원격 실DB — migrate/db push/DB 쓰기 스크립트/dev 서버 기동 금지.
- git reset/checkout/브랜치 이동/push/reflog 조작 전면 금지. 커밋만 허용.
- 이메일·토큰·코드값을 로그에 남기지 않는다 (lib/logger.ts 규칙).
- 들여쓰기 4칸, 한국어 "~다" 주석. 테스트 tests/ 평면, prisma mock.
- 완료 기준: tsc 0건 + vitest 전체 + lint 0건 (+ 지정 시 stryker 100%).
- 계획서 체크박스 [x] 갱신·동커밋 허용 (FILES CHANGED + DEVIATIONS 선언).
- 보고서는 docs/superpowers/reports/2026-08-25-google-member-login/task-<n>.md 로
  별도 커밋 (CLAUDE.md 결과 보고서 관례).

## 확정 설계 (모든 Task 공통 문맥)

- 흐름: `/login` 버튼 → GET `/api/auth/google/login` (state 서명 발급 + lax 쿠키,
  Google 로 리디렉트) → Google → GET `/api/auth/google/login/callback`
  (state 쿠키·파라미터 대조 → code 교환 → id_token 에서 email·email_verified →
  대소문자 무시 조회 → 게이트 → 세션 쿠키 발급 → 리디렉트).
- 게이트와 실패 리디렉트 (전부 `/login?error=<코드>` 로 — 콜백 화면은 없다):
  - `google_unconfigured` 서비스에 Google 자격증명 미설정
  - `google_denied` 사용자가 동의 거부 / `google_failed` 교환·검증 실패
  - `google_state` state 불일치·만료 (CSRF 의심)
  - `google_unverified` email_verified 가 아님
  - `no_account` 미가입 — 자동 가입하지 않는다
  - `pending` 승인 대기 / `expired` 이용 기간 만료
- 성공 리디렉트: mustChangePassword 또는 프로필 미완성 → `/onboarding`, 아니면
  `/dashboard` (app/api/auth/login/route.ts 의 판정 로직과 동일 기준).
- state: `lib/login-state.ts` — 익명(userId 없음) 서명 토큰
  `{ nonce, exp(300s) }`, 컨텍스트 `google-login-state.v1`. 시작 시 같은 값을
  httpOnly·sameSite:'lax' 쿠키(`google_login_state`)로도 심고 콜백에서
  파라미터와 쿠키 **둘 다 검증 + 동일성 대조**한다(lax 라 최상위 리디렉트에 실린다).
- 파일 지도:
  - Task 1: `lib/login-state.ts`(신규), `lib/google-auth.ts`(로그인용 URL·프로필 함수 추가),
    `tests/login-state.test.ts`(신규), `tests/google-login-auth.test.ts`(신규),
    `stryker.crap.config.json`(login-state 추가)
  - Task 2: `app/api/auth/google/login/route.ts`(신규),
    `app/api/auth/google/login/callback/route.ts`(신규), `tests/api-google-login.test.ts`(신규)
  - Task 3: `app/login/page.tsx`(버튼 + error 코드 문구)

---

### Task 1: 로그인 state 서명 + Google 로그인용 헬퍼

**Files:** 위 파일 지도 Task 1.

**Interfaces (Task 2 가 그대로 임포트):**
- `issueLoginState(): string` / `verifyLoginState(value: string | undefined): boolean`
- `getGoogleLoginAuthUrl(redirectUri: string, state: string): Promise<string>`
- `exchangeLoginCodeForEmail(code: string, redirectUri: string): Promise<{ email: string; verified: boolean }>`

- [x] **Step 1: `lib/login-state.ts`** — lib/oauth-nonce.ts 의 구조를 따르되 익명이다:

```ts
// Google 로그인 흐름의 CSRF state 서명.
//
// 콜백은 google.com 발 교차 사이트 리디렉트라 strict 세션 쿠키가 실리지 않고,
// 로그인 전이라 신원도 없다. 그래서 익명 서명 토큰을 시작 시점에 발급해
// lax 쿠키와 URL 파라미터 양쪽으로 보내고, 콜백에서 둘을 대조한다.
//
// 컨텍스트 분리: 세션 쿠키(auth.ts)와 관리자 nonce(oauth-nonce.ts)가 같은
// 시크릿을 쓰므로, 전용 컨텍스트가 없으면 그 값들이 state 로 통과한다.
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { getSessionSecret } from './auth';

const STATE_MAX_AGE_SECONDS = 300;
const STATE_CONTEXT = 'google-login-state.v1';

interface LoginStatePayload {
    nonce: string;
    exp: number;
}

function signPayload(payload: string): string {
    return createHmac('sha256', getSessionSecret())
        .update(`${STATE_CONTEXT}.${payload}`)
        .digest('base64url');
}

export function issueLoginState(): string {
    const body: LoginStatePayload = {
        nonce: randomUUID(),
        exp: Math.floor(Date.now() / 1000) + STATE_MAX_AGE_SECONDS,
    };
    const payload = Buffer.from(JSON.stringify(body), 'utf8').toString('base64url');
    return `${payload}.${signPayload(payload)}`;
}

export function verifyLoginState(value: string | undefined): boolean {
    if (!value) return false;
    const dot = value.lastIndexOf('.');
    if (dot <= 0) return false;

    const payload = value.slice(0, dot);
    const signature = value.slice(dot + 1);
    const expected = signPayload(payload);

    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false;

    try {
        const body = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as LoginStatePayload;
        return typeof body.exp === 'number' && body.exp > Math.floor(Date.now() / 1000);
    } catch {
        return false;
    }
}
```

- [x] **Step 2: `lib/google-auth.ts` 끝에 추가** (기존 함수·SCOPES 는 건드리지 않는다):

```ts
// ─── 회원 로그인용 (관리자 서비스 연동과 별개 흐름) ─────────────────

// 로그인은 신원 확인만 필요하다. Forms 권한을 섞으면 로그인하려는 회원에게
// 폼 접근 동의까지 요구하게 된다.
const LOGIN_SCOPES = 'openid email';

export async function getGoogleLoginAuthUrl(redirectUri: string, state: string): Promise<string> {
    const google = await getGoogleSettings();
    const params = new URLSearchParams({
        client_id: google.clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: LOGIN_SCOPES,
        // 계정 선택을 항상 보여준다. 브라우저에 여러 Google 계정이 있을 때
        // 엉뚱한 계정으로 조용히 로그인되는 것을 막는다.
        prompt: 'select_account',
        state,
    });
    return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/**
 * code 를 교환해 이메일을 얻는다. id_token 은 서명 검증 없이 payload 만 읽는다 —
 * 방금 우리가 client_secret 으로 Google 토큰 엔드포인트에서 직접 받은 값이라
 * 전송 경로에 공격자가 끼어들 자리가 없다(서버-서버 TLS).
 */
export async function exchangeLoginCodeForEmail(
    code: string,
    redirectUri: string
): Promise<{ email: string; verified: boolean }> {
    const google = await getGoogleSettings();
    const response = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            code,
            client_id: google.clientId,
            client_secret: google.clientSecret,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
        }),
    });
    if (!response.ok) {
        throw new Error('Google 코드 교환에 실패했습니다.');
    }

    const data = await response.json();
    const idToken: unknown = data.id_token;
    if (typeof idToken !== 'string') {
        throw new Error('id_token 이 없습니다.');
    }
    const parts = idToken.split('.');
    if (parts.length !== 3) {
        throw new Error('id_token 형식이 올바르지 않습니다.');
    }
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (typeof claims.email !== 'string' || !claims.email) {
        throw new Error('이메일 정보를 받지 못했습니다.');
    }
    return { email: claims.email, verified: claims.email_verified === true };
}
```

- [x] **Step 3: 테스트 (RED→GREEN)**
  - `tests/login-state.test.ts`: 발급→검증 왕복 / 서명 변조 거부 / 만료 거부
    (vi.useFakeTimers 로 301초 진행) / undefined·빈문자열·점 없는 값 거부 /
    **세션 쿠키 모양의 값(auth.ts encodeSessionCookie 산출물)이 state 로
    통과하지 않는다** / **관리자 nonce(issueOAuthNonce 산출물)도 통과하지
    않는다** (컨텍스트 분리 증명 — oauth-nonce 테스트의 패턴 참조.
    SESSION_SECRET 은 vi.stubEnv 로 주입).
  - `tests/google-login-auth.test.ts`: fetch mock 으로 — 로그인 URL 에
    scope=openid+email·prompt=select_account·state 포함 / 교환 성공 시
    email·verified 반환 / id_token 없음·형식 오류·email 없음 각각 throw /
    교환 실패(response !ok) throw.
- [x] **Step 4: stryker** — mutate 배열의 `"lib/ai/url-guard.ts",` 아래에
  `"lib/login-state.ts",` 추가, `npx stryker run ... --mutate lib/login-state.ts`
  → 100% (미달 시 보강).
- [x] **Step 5: 전체 게이트 → 작업 커밋 1개**
  ("feat: Google 로그인용 서명 state 와 인증 헬퍼를 추가한다" — 본문에 컨텍스트
  3중 분리 이유) → 보고서 커밋.

---

### Task 2: 로그인 시작·콜백 라우트

**Files:** 위 파일 지도 Task 2.

**Interfaces:** GET `/api/auth/google/login`, GET `/api/auth/google/login/callback`.

- [ ] **Step 1: 시작 라우트** `app/api/auth/google/login/route.ts`:

```ts
// Google 회원 로그인 시작. 관리자 서비스 연동(app/api/auth/google)과 별개 흐름이다.
import { NextRequest, NextResponse } from 'next/server';
import { isGoogleConfigured } from '@/lib/service-settings';
import { getGoogleLoginAuthUrl } from '@/lib/google-auth';
import { issueLoginState } from '@/lib/login-state';

const STATE_COOKIE = 'google_login_state';

export async function GET(request: NextRequest) {
    const { origin } = new URL(request.url);

    if (!(await isGoogleConfigured())) {
        return NextResponse.redirect(new URL('/login?error=google_unconfigured', origin));
    }

    const state = issueLoginState();
    const authUrl = await getGoogleLoginAuthUrl(`${origin}/api/auth/google/login/callback`, state);

    const response = NextResponse.redirect(authUrl);
    // 콜백은 google.com 발 최상위 리디렉트라 strict 쿠키가 실리지 않는다.
    // lax 는 최상위 GET 내비게이션에 실리므로 state 대조용으로 딱 맞는다.
    response.cookies.set(STATE_COOKIE, state, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 300,
        path: '/api/auth/google/login',
    });
    return response;
}
```

- [ ] **Step 2: 콜백 라우트** `app/api/auth/google/login/callback/route.ts`:

```ts
// Google 회원 로그인 콜백. 승인된 기존 회원만 로그인시킨다 — 자동 가입 없음.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { encodeSessionCookie } from '@/lib/auth';
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from '@/lib/constants';
import { exchangeLoginCodeForEmail } from '@/lib/google-auth';
import { verifyLoginState } from '@/lib/login-state';
import { isAccessExpired, parseMemberRole } from '@/lib/member-roles';
import { isProfileCompleteForRole } from '@/lib/member-profile';
import { createLogger } from '@/lib/logger';

const log = createLogger('api/auth/google/login/callback');
const STATE_COOKIE = 'google_login_state';

function fail(origin: string, code: string): NextResponse {
    const response = NextResponse.redirect(new URL(`/login?error=${code}`, origin));
    response.cookies.delete(STATE_COOKIE);
    return response;
}

export async function GET(request: NextRequest) {
    const { searchParams, origin } = new URL(request.url);

    if (searchParams.get('error')) return fail(origin, 'google_denied');

    const code = searchParams.get('code');
    const stateParam = searchParams.get('state');
    const stateCookie = request.cookies.get(STATE_COOKIE)?.value;

    // 파라미터·쿠키 각각 서명 검증 + 상호 동일성. 쿠키만 믿으면 공격자가 자기
    // 브라우저의 쿠키로 피해자 URL 을 열게 하는 고정 공격이 남는다.
    if (!code || !verifyLoginState(stateParam ?? undefined)
        || !verifyLoginState(stateCookie) || stateParam !== stateCookie) {
        return fail(origin, 'google_state');
    }

    try {
        const { email, verified } = await exchangeLoginCodeForEmail(
            code, `${origin}/api/auth/google/login/callback`
        );
        if (!verified) return fail(origin, 'google_unverified');

        // 비밀번호 로그인은 정확 일치 조회지만, Google 은 이메일을 소문자로
        // 정규화해 주므로 DB 의 혼합 표기(Mentee1@…)와 대소문자 무시로 맞춘다.
        const user = await prisma.user.findFirst({
            where: { email: { equals: email, mode: 'insensitive' } },
        });

        if (!user) return fail(origin, 'no_account');
        if (user.status !== 'APPROVED') return fail(origin, 'pending');
        if (isAccessExpired(user.accessExpiresAt)) return fail(origin, 'expired');

        const [profile] = await Promise.all([
            prisma.memberProfile.findUnique({ where: { userId: user.id } }),
        ]);
        const role = parseMemberRole(user.role) ?? 'MENTEE';
        const needsOnboarding = user.mustChangePassword
            || !isProfileCompleteForRole(role, profile);

        const response = NextResponse.redirect(
            new URL(needsOnboarding ? '/onboarding' : '/dashboard', origin)
        );
        response.cookies.delete(STATE_COOKIE);
        response.cookies.set(SESSION_COOKIE_NAME, encodeSessionCookie(
            { userId: user.id, email: user.email, name: user.name },
            { sessionVersion: user.sessionVersion }
        ), {
            httpOnly: true,
            sameSite: 'strict',
            secure: process.env.NODE_ENV === 'production',
            maxAge: SESSION_MAX_AGE_SECONDS,
            path: '/',
        });

        // 이메일은 로그에 남기지 않는다. userId 만.
        log.info('Google 로그인 성공', { userId: user.id });
        return response;
    } catch (error) {
        log.error('Google 로그인 콜백 실패', error);
        return fail(origin, 'google_failed');
    }
}
```

주의: `encodeSessionCookie` 의 실제 시그니처와 옵션 인자 모양을 lib/auth.ts 40행에서
확인하고 위 코드를 맞춰라(비밀번호 로그인 라우트 app/api/auth/login/route.ts 94~105행이
정본 사용례다). 다르면 그 사용례를 따르고 DEVIATIONS 에 적어라.

- [ ] **Step 3: 테스트** `tests/api-google-login.test.ts` (RED→GREEN, mock 패턴은
  tests/api-google-callback-auth.test.ts 참조): 시작 — 미설정 시 error 리디렉트 /
  설정 시 Google URL 로 리디렉트 + state 쿠키. 콜백 — state 파라미터·쿠키 불일치
  각각 거부 / 세션 쿠키 값이 state 로 통과 안 됨 / 미가입 no_account (user.create
  호출 없음 단언 — 자동 가입 금지 증명) / PENDING·만료 각각 차단 + 세션 쿠키
  미발급 단언 / 대소문자 무시 조회(findFirst 인자 mode:'insensitive' 단언) /
  성공 시 세션 쿠키 발급 + sessionVersion 반영 / email_verified 아니면 거부.
- [ ] **Step 4: 전체 게이트 → 작업 커밋**
  ("feat: Google 계정으로 회원 로그인을 추가한다" — 본문에 자동 가입을 막은 이유)
  → 보고서 커밋.

---

### Task 3: 로그인 화면 버튼 + 오류 문구

**Files:** `app/login/page.tsx`

- [ ] 로그인 버튼 아래에 구분선("또는")과 Google 버튼 추가 —
  `<a href="/api/auth/google/login" className="w-full btn-secondary py-3.5 …">`
  형태(전체 페이지 이동이므로 fetch 아님). 문구: "Google 계정으로 로그인".
- [ ] useEffect 의 URLSearchParams 처리에 error 코드 → 문구 매핑 추가:
  google_unconfigured("Google 로그인이 아직 설정되지 않았습니다. 관리자에게 문의하세요.") /
  google_denied("Google 로그인을 취소했습니다.") / google_state("로그인 시도가 만료되었습니다. 다시 시도하세요.") /
  google_unverified("확인되지 않은 Google 이메일입니다.") /
  no_account("이 Google 계정으로 가입된 회원이 없습니다. 먼저 회원가입을 해주세요.") /
  pending("가입 승인 대기 중입니다. 관리자 승인 후 이용할 수 있습니다.") /
  expired("이용 기간이 만료되었습니다. 관리자에게 연장을 요청하세요.") /
  google_failed("Google 로그인에 실패했습니다. 다시 시도하세요.")
  — error 는 기존 `error` state(빨간 박스)로 표시.
- [ ] 게이트(tsc·vitest·lint) → 작업 커밋("feat: 로그인 화면에 Google 로그인을 붙인다")
  → 보고서 커밋.

---

## 감리 체크리스트

1. state 3중 분리: 세션 쿠키·관리자 nonce 가 state 로 통과하지 않는 테스트 존재
2. 자동 가입 금지: 콜백 테스트에 user.create 미호출 단언 존재
3. 게이트 보존: PENDING·만료 차단 시 세션 쿠키 미발급 단언 존재
4. 이메일·토큰 로그 금지 / 원격 DB·dev 서버 무접촉
5. tsc 0 · vitest 전체 · lint 0 · (1) login-state 뮤테이션 100%

## 계획 밖 (사람이 하는 일)

- **Google Cloud Console 에 redirect URI 등록**: 기존 OAuth 클라이언트의
  "승인된 리디렉션 URI" 에 `http://localhost:3000/api/auth/google/login/callback`
  (및 배포 도메인 버전) 추가 — 이것이 없으면 Google 이 redirect_uri_mismatch 로
  거부한다. 전체 완료 후 실검증: 승인 회원 Google 로그인 성공 / 미가입 계정
  안내 / PENDING 계정 차단.
