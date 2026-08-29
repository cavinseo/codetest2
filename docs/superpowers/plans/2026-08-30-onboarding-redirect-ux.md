# 온보딩 관문 403 리디렉션 (UX) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:test-driven-development.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 온보딩 관문이 낸 403 을 화면이 알아보고 `/onboarding` 으로 보낸다. 지금은 미완료 계정이 `/dashboard` 를 열면 화면 뼈대만 뜨고 모든 API 가 403 이라 빈 화면에 오류만 보인다.

**Architecture:** 전역 `window.fetch` 를 한 겹 감싸 403 + `code: 'onboarding_required'` 응답을 가로채 `/onboarding` 으로 보낸다. 판정 로직은 순수 모듈로 빼서 테스트하고, 컴포넌트는 그 판정을 부르는 얇은 껍데기로 둔다. 루트 레이아웃에 한 번만 마운트한다.

**Tech Stack:** 기존과 동일. 외부 라이브러리 추가 없음.

**Spec:** `docs/superpowers/specs/2026-08-30-onboarding-gate-design.md` 9절 「범위 외 — 페이지 리디렉션(UX)」이 이 계획으로 넘긴 항목이다. 선행 작업은 `docs/superpowers/plans/2026-08-30-onboarding-gate.md` (커밋 `19c202c`).

## Global Constraints

- CLAUDE.md 최우선 제약: 원격 실DB — `prisma migrate deploy`/`db push`/`studio`, DB 에
  쓰는 스크립트, **dev 서버 기동** 전부 금지. 이번 작업에는 DB 도 서버도 필요 없다.
- git `reset`/`checkout`/브랜치 이동/`push`/reflog 조작 전면 금지. 커밋만 허용.
- 들여쓰기 4칸. 주석은 한국어 "~다" 체이고 무엇이 아니라 **왜**를 적는다.
- 테스트는 `tests/` 평면 배치.
- 완료 기준: `npx tsc --noEmit` 0건 + `npx vitest run` 전체 통과 + `npx next lint` 0건
  + 신규 순수 모듈 stryker 100%.
- 계획서 체크박스 `[x]` 갱신을 작업 커밋에 포함한다.
- 보고서는 `docs/superpowers/reports/2026-08-30-onboarding-redirect-ux/task-1.md` 로
  작업 커밋과 **별도의 둘째 커밋**.

## 왜 전역 fetch 를 감싸는가

호출부마다 처리하는 안은 불가능하다. `fetch(` 가 **35개 파일에 147곳** 흩어져 있고
공용 래퍼가 없다. 147곳을 고치는 것은 회귀 위험이 이 작업의 값어치를 넘는다.

페이지마다 진입 시 `/api/me/profile` 을 먼저 물어보는 안도 뺐다. 모든 페이지 이동마다
왕복이 한 번씩 더 생기는데, 정작 필요한 순간은 403 이 실제로 났을 때뿐이다. fetch 를
감싸면 **아무 일 없을 때 비용이 0** 이고 403 이 났을 때만 움직인다.

`app/layout.tsx` 는 서버 컴포넌트지만 이미 클라이언트 컴포넌트(`ThemeToggle`)를
마운트하고 있다. 같은 자리에 하나 더 붙이면 모든 페이지가 덮인다.

## 왜 판정을 순수 모듈로 빼는가

이 저장소에는 컴포넌트 테스트 인프라가 없다(jsdom·`@testing-library` 미설치,
`tests/` 에 `.tsx` 없음). 인프라를 새로 들이는 것은 이 작업의 범위가 아니다.
그래서 **판정은 순수 함수로 빼서 테스트하고, 컴포넌트는 그 함수를 부르기만 한다.**
테스트되지 않는 코드가 컴포넌트 안에 남지만, 그 안에 조건 분기가 없으므로 위험이 작다.

## File Structure

| 파일 | 책임 | 변경 |
|---|---|---|
| `lib/onboarding-redirect.ts` | 403 응답이 온보딩 관문의 것인지, 지금 경로에서 보내야 하는지 판정 | Create |
| `tests/onboarding-redirect.test.ts` | 위 판정의 테스트 | Create |
| `components/OnboardingRedirect.tsx` | 전역 fetch 를 감싸고 판정 결과대로 이동 | Create |
| `app/layout.tsx` | 위 컴포넌트를 마운트 | Modify |
| `stryker.crap.config.json` | 신규 순수 모듈을 뮤테이션 대상에 등록 | Modify |

---

### Task 1: 403 리디렉션

**Files:** 위 File Structure 전부.

**Interfaces:**
- Produces: `isOnboardingBlock(status: number, body: unknown): boolean`,
  `shouldRedirectToOnboarding(pathname: string, status: number, body: unknown): boolean`
- Consumes: `lib/auth.ts` 의 `requireAuth` 가 내는 403 응답 본문
  `{ error: string, code: 'onboarding_required' }` (커밋 `19c202c` 에서 도입).

- [ ] **Step 1: 실패하는 테스트를 쓴다** — `tests/onboarding-redirect.test.ts`

```typescript
// 온보딩 관문이 낸 403 만 골라내고, 이미 온보딩 화면이면 다시 보내지 않는지 확인한다.
import { describe, expect, it } from 'vitest';
import { isOnboardingBlock, shouldRedirectToOnboarding } from '../lib/onboarding-redirect';

const BLOCK = { error: '온보딩을 먼저 마쳐야 합니다.', code: 'onboarding_required' };

describe('isOnboardingBlock', () => {
    it('403 이고 code 가 onboarding_required 면 참이다', () => {
        expect(isOnboardingBlock(403, BLOCK)).toBe(true);
    });

    it('상태가 403 이 아니면 거짓이다', () => {
        expect(isOnboardingBlock(401, BLOCK)).toBe(false);
        expect(isOnboardingBlock(200, BLOCK)).toBe(false);
    });

    it('403 이어도 code 가 다르면 거짓이다', () => {
        // 승인 대기·기간 만료도 403 이다. 그 응답까지 온보딩으로 보내면 안 된다.
        expect(isOnboardingBlock(403, { error: '관리자 승인 대기 중인 계정입니다.' })).toBe(false);
        expect(isOnboardingBlock(403, { code: 'something_else' })).toBe(false);
    });

    it('본문이 객체가 아니면 거짓이다', () => {
        expect(isOnboardingBlock(403, null)).toBe(false);
        expect(isOnboardingBlock(403, undefined)).toBe(false);
        expect(isOnboardingBlock(403, 'onboarding_required')).toBe(false);
        expect(isOnboardingBlock(403, ['onboarding_required'])).toBe(false);
    });
});

describe('shouldRedirectToOnboarding', () => {
    it('일반 화면에서 관문에 막히면 보낸다', () => {
        expect(shouldRedirectToOnboarding('/dashboard', 403, BLOCK)).toBe(true);
        expect(shouldRedirectToOnboarding('/project/abc', 403, BLOCK)).toBe(true);
    });

    it('이미 온보딩 화면이면 보내지 않는다', () => {
        // 온보딩 화면 자신도 403 을 받을 수 있다. 그때 또 보내면 무한 이동이 된다.
        expect(shouldRedirectToOnboarding('/onboarding', 403, BLOCK)).toBe(false);
    });

    it('로그인·가입 화면에서도 보내지 않는다', () => {
        expect(shouldRedirectToOnboarding('/login', 403, BLOCK)).toBe(false);
        expect(shouldRedirectToOnboarding('/signup', 403, BLOCK)).toBe(false);
    });

    it('예외 경로의 하위 경로도 보내지 않는다', () => {
        expect(shouldRedirectToOnboarding('/onboarding/step2', 403, BLOCK)).toBe(false);
    });

    it('예외 경로와 앞부분만 같은 경로는 보낸다', () => {
        // '/loginsomething' 이 '/login' 으로 시작한다고 예외가 되면 안 된다.
        expect(shouldRedirectToOnboarding('/loginsomething', 403, BLOCK)).toBe(true);
    });

    it('관문이 아닌 403 은 보내지 않는다', () => {
        expect(shouldRedirectToOnboarding('/dashboard', 403, { error: '권한이 없습니다.' })).toBe(false);
    });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/onboarding-redirect.test.ts`
Expected: FAIL — `Cannot find module '../lib/onboarding-redirect'`

- [ ] **Step 3: 순수 모듈을 만든다** — `lib/onboarding-redirect.ts`

```typescript
// 온보딩 관문이 막은 응답인지 판정한다.
//
// lib/auth.ts 의 requireAuth 는 온보딩 미완료에 403 과 code:'onboarding_required'
// 를 낸다. 승인 대기·이용기간 만료도 403 이므로 상태 코드만 보면 안 되고,
// 문구는 바뀔 수 있으므로 code 로 판정한다.

const ONBOARDING_CODE = 'onboarding_required';

// 이 경로들에서는 보내지 않는다. 온보딩 화면 자신이 403 을 받았을 때 또 보내면
// 무한 이동이 되고, 로그인·가입 화면은 애초에 세션이 없거나 만드는 중이다.
const EXEMPT_PATHS = ['/onboarding', '/login', '/signup'];

export function isOnboardingBlock(status: number, body: unknown): boolean {
    if (status !== 403) return false;
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return false;
    return (body as { code?: unknown }).code === ONBOARDING_CODE;
}

export function shouldRedirectToOnboarding(
    pathname: string,
    status: number,
    body: unknown
): boolean {
    if (!isOnboardingBlock(status, body)) return false;
    // startsWith 만 쓰면 '/loginsomething' 까지 예외가 된다. 경계를 명시한다.
    return !EXEMPT_PATHS.some(
        (path) => pathname === path || pathname.startsWith(`${path}/`)
    );
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/onboarding-redirect.test.ts`
Expected: PASS (12개)

- [ ] **Step 5: stryker 대상에 등록하고 100% 를 확인한다**

`stryker.crap.config.json` 의 `mutate` 배열에서 `"lib/login-state.ts",` 줄 아래에
`"lib/onboarding-redirect.ts",` 를 추가한다.

Run: `npx stryker run stryker.crap.config.json --mutate lib/onboarding-redirect.ts`
Expected: `onboarding-redirect.ts | 100.00`

미달이면 생존 뮤턴트를 죽이는 테스트를 보강하라. **등가 뮤턴트라고 판단되면
disable 주석으로 넘기기 전에 중단하고 보고하라** — 이 모듈은 분기가 단순해 등가가
나올 자리가 거의 없다.

- [ ] **Step 6: 컴포넌트를 만든다** — `components/OnboardingRedirect.tsx`

```tsx
'use client';
// 온보딩 관문(lib/auth.ts requireAuth)이 낸 403 을 잡아 온보딩 화면으로 보낸다.
//
// fetch 호출이 35개 파일에 147곳 흩어져 있고 공용 래퍼가 없다. 호출부마다 고치면
// 회귀 위험이 이 기능의 값어치를 넘으므로, 전역 fetch 를 한 겹 감싸 한 곳으로 모은다.
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { shouldRedirectToOnboarding } from '@/lib/onboarding-redirect';

export default function OnboardingRedirect() {
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        const originalFetch = window.fetch;

        window.fetch = async (...args: Parameters<typeof fetch>) => {
            const response = await originalFetch(...args);

            if (response.status === 403) {
                // 복제본에서 읽는다. 원본 스트림을 소비하면 호출부가 빈 본문을 받는다.
                const body = await response.clone().json().catch(() => null);
                if (shouldRedirectToOnboarding(pathname, response.status, body)) {
                    router.replace('/onboarding');
                }
            }

            return response;
        };

        return () => {
            window.fetch = originalFetch;
        };
    }, [pathname, router]);

    return null;
}
```

- [ ] **Step 7: 루트 레이아웃에 마운트한다** — `app/layout.tsx`

`ThemeToggle` import 아래에 한 줄을 더한다.

```tsx
import OnboardingRedirect from "@/components/OnboardingRedirect";
```

`<body>` 안 `<ThemeToggle />` 아래에 놓는다.

```tsx
            <body className={`${inter.variable} ${outfit.variable} antialiased bg-noise`}>
                <ThemeToggle />
                <OnboardingRedirect />
                {children}
            </body>
```

- [ ] **Step 8: 전체 게이트를 돌린다**

```sh
npx tsc --noEmit
npx vitest run
npx next lint
```

Expected: tsc 출력 없음 / vitest 전체 통과, 테스트 수 **1045 + 12 = 1057 이상** /
lint `✔ No ESLint warnings or errors`.

- [ ] **Step 9: 커밋한다**

계획서 체크박스 `[x]` 갱신을 포함한다.

```sh
git add lib/onboarding-redirect.ts tests/onboarding-redirect.test.ts \
        components/OnboardingRedirect.tsx app/layout.tsx stryker.crap.config.json \
        docs/superpowers/plans/2026-08-30-onboarding-redirect-ux.md
git commit
```

메시지: `feat: 온보딩 관문에 막히면 온보딩 화면으로 보낸다`
본문에 **왜**를 적는다 — 호출부가 147곳이라 전역 fetch 를 감쌌다는 것과,
승인 대기·기간 만료도 403 이라 code 로 판정한다는 것.
트레일러: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

그다음 보고서를 `docs/superpowers/reports/2026-08-30-onboarding-redirect-ux/task-1.md`
로 쓰고 **둘째 커밋** (`docs: Task 1 결과 보고서`). 형식은 RESULT / FILES CHANGED /
COMMIT / VERIFIED BY / DEVIATIONS / RISKS / QUESTIONS.

---

## 감리 체크리스트 (Task 승인 게이트)

1. `isOnboardingBlock` 이 **code 로 판정**하는가 — 문구 비교나 상태 코드만으로
   판정하면 승인 대기·기간 만료 403 까지 온보딩으로 보낸다
2. 예외 경로 판정이 `pathname === path || startsWith(path + '/')` 인가 —
   순수 `startsWith` 면 `/loginsomething` 이 예외가 된다 (테스트 존재)
3. 컴포넌트가 `response.clone()` 에서 읽는가 — 원본을 읽으면 호출부가 빈 본문을 받는다
4. `useEffect` cleanup 이 원래 `fetch` 를 복원하는가
5. `lib/onboarding-redirect.ts` 가 stryker `mutate` 목록에 있고 점수가 100% 인가
6. 감리자 직접 재실행: tsc 0 · vitest 전체(1057 이상) · lint 0

## 계획 밖 (사람이 하는 일)

- **실기동 검증** — dev 서버 기동은 실행 AI 에게 위임하지 않는다. 감리자·사용자가
  수행한다. 이 계획의 검증 항목: 임시 비밀번호 계정으로 로그인 → `/dashboard` 직접
  이동 → **자동으로 `/onboarding` 으로 이동** → 온보딩 완료 후 정상 이용.
  아직 열려 있는 Google 회원 로그인 실검증과 같은 세션에서 함께 본다.
- **컴포넌트 테스트 인프라** — jsdom·`@testing-library` 도입은 이 작업의 범위가
  아니다. 도입하면 `OnboardingRedirect.tsx` 자체도 테스트할 수 있다.
