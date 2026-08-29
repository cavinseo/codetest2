# 온보딩 관문 서버 강제 설계

작성일: 2026-08-30
상태: 확정 (사용자 승인)

## 1. 배경

`2026-08-21-member-management.md` 의 「이 계획에서 의도적으로 뺀 것」이 이렇게 적어 두었다.

> **임시 비밀번호 강제 변경 화면** — … 실제 강제 이동은 기존 비밀번호 변경 화면을
> 일반 사용자용으로 여는 별도 작업이라 분리했다. **이 상태로는 임시 비밀번호가 계속
> 유효하므로, 운영 전에 반드시 후속 작업으로 닫아야 한다.**

화면(`app/onboarding/page.tsx`)은 그 뒤에 만들어졌다. 그러나 **강제는 아직 없다.**
2026-08-30 감리 실측:

- `middleware.ts` 가 없다 (루트·`app/`·`src/` 전부).
- `app/dashboard/page.tsx` 는 `'use client'` 이고 서버 가드도 `mustChangePassword`
  검사도 없다.
- API 67개 중 `mustChangePassword` 를 접근 게이트로 쓰는 곳이 **0개**다.
  `app/api/me/profile/route.ts:35` 가 화면 표시용으로 읽을 뿐이다.
- 유일한 리디렉션은 `app/login/page.tsx:58` 의 클라이언트 `router.push` 다.

따라서 `mustChangePassword: true` 인 계정이 주소창으로 `/dashboard` 를 열면 그대로
들어가고, 메일로 평문 전달된 임시 비밀번호가 무기한 유효하다.

인증 자체는 촘촘하다. `requireAuth` + `requireProjectAccess` + `requireAdmin` 로
61/67 라우트가 덮이고(3절), 남는 6개는 로그인 전 공개 경로다. 관리자 라우트 4개도
전부 `requireAdmin` 을 지난다. **인증 구멍은 없다. 빠진 것은 온보딩 강제 한 겹뿐이다.**

## 2. 결정 사항

| 항목 | 결정 | 근거 |
|---|---|---|
| 강제 범위 | 임시 비밀번호 **+ 프로필 미완성** 둘 다 | 사용자 확정 |
| 관리자 예외 | **없음.** ADMIN 도 동일하게 강제 | 예외 없는 단일 규칙이라 감리가 단순하고, 권한이 가장 큰 계정에 구멍을 남기지 않는다 |
| 관문 위치 | `requireAuth` 한 곳 | 아래 3절 |
| 페이지 차단 | **하지 않는다** (범위 밖) | API 만 막아도 보안 목표가 달성된다. 9절 |

## 3. 관문 위치 — 왜 `requireAuth` 인가

`lib/auth.ts:118` 의 `requireAuth` 가 단일 관문이다.
`requireAdmin`(`lib/authorization.ts:83`)도 `requireProjectAccess`
(`lib/authorization.ts:96`)도 내부에서 `requireAuth` 를 부른다.

- **57개**는 세 함수 중 하나를 직접 부른다.
- **4개**(`dev-plan`·`sales`·`tech-roadmap`·`tech-tree`)는 라우트 파일에 인증 호출이
  보이지 않지만 `lib/bulk-worksheet-route.ts:51,71` 의 팩토리를 통해
  `requireProjectAccess` 를 탄다. 즉 게이트 대상이다.
- 합쳐 **61/67 라우트가 `requireAuth` 하나로 수렴**한다.

나머지 6개는 로그인 전이거나 토큰 기반 공개 경로라 애초에 대상이 아니다:
`auth/signup`, `auth/logout`, `auth/google/login`, `auth/google/login/callback`,
`survey/[token]`, `survey/[token]/submit`.

`requireAuth` 는 이미 매 요청 `prisma.user.findUnique` 로 PK 조회를 한다. 판정에
필요한 값을 그 조회에 얹으므로 **쿼리 수가 늘지 않는다.**

### 검토했으나 채택하지 않은 안

**Next middleware + 세션 쿠키 플래그.** 쿠키에 완료 플래그를 심고 middleware 가
HMAC 만 검증해 페이지·API 를 함께 처리하는 안. 페이지까지 덮고 DB 조회가 없다는
장점이 있으나 **플래그가 낡는다**. 프로필 저장(`/api/me/profile` PUT)은 쿠키를
재발급하지 않고, 무엇보다 **관리자가 역할을 바꾸면 "완성"의 기준 자체가 달라진다**
— MENTEE 를 MENTOR 로 올리면 `expertise`·`careerYears` 가 새로 필수가 되는데 쿠키는
여전히 완성이라 말한다. 재발급 지점을 빠짐없이 심어야 하고 그 자체가 취약점이 된다.
또한 middleware 는 dev 서버 없이 검증하기 어려워 원격 실DB 제약과 부딪힌다.

**라우트 그룹 서버 레이아웃.** 페이지 30개를 `app/(protected)/` 로 옮겨 서버 컴포넌트
레이아웃에서 redirect 하는 안. 완전하지만 페이지 30개 이동은 거대한 diff 와 회귀
위험을 낳는다. 그런데 이건 보안이 아니라 UX 다(9절).

## 4. 인터페이스

```ts
export interface RequireAuthOptions {
    /** 온보딩 미완료 계정도 통과시킨다. 온보딩을 끝내는 경로에만 준다. */
    allowIncompleteOnboarding?: boolean;
}

export async function requireAuth(
    request: NextRequest,
    options: RequireAuthOptions = {}
): Promise<AuthenticatedUser | NextResponse>;
```

기본값이 "막힘"이다. 앞으로 추가되는 라우트는 아무것도 하지 않아도 게이트된다
(fail closed). 통과시키려면 호출부가 명시적으로 옵트인해야 한다.

`AuthenticatedUser` 의 모양은 바꾸지 않는다. 게이트를 통과한 시점에 온보딩은 이미
완료이므로 호출부에 새 필드를 줄 이유가 없다.

## 5. 판정 규칙

`select` 에 `mustChangePassword` 와 `profile` 관계를 얹는다
(`User.profile` → `MemberProfile?`, `prisma/schema.prisma:46`).

차단 조건:

```
mustChangePassword === true
  또는
isProfileCompleteForRole(role, profile ?? null) === false
```

`role` 은 기존 코드와 같이 `parseMemberRole(dbUser.role) ?? 'MENTEE'` 로 낮춰 읽는다.

**`?? null` 이 빠지면 안 된다.** `isProfileCompleteForRole`
(`lib/member-profile.ts:68`)은 `profile === null` 만 걸러내므로 `undefined` 가 들어오면
`undefined.organization` 에서 TypeError 로 죽는다. 이것은 테스트로 못 박는다.

역할별 완성 기준은 `lib/member-profile.ts` 가 이미 정본이다. 이 설계는 그 판정을
쓰기만 하고 새로 정의하지 않는다.

## 6. 게이트 순서

새 게이트는 기존 검사 **뒤, 반환 직전**에 놓는다.

```
1. 쿠키 서명·만료          → 401
2. 계정 존재                → 401
3. status !== APPROVED      → 403 승인 대기
4. sessionVersion 불일치    → 401
5. 이용 기간 만료           → 403 만료
6. ★ 온보딩 미완료          → 403 onboarding_required
7. 통과
```

순서가 뒤집히면 승인 대기 중인 계정이 "온보딩을 마치라"는 엉뚱한 안내를 받는다.
6번이 마지막이어야 각 사용자가 자기 상태에 맞는 메시지를 받는다.

## 7. 응답

```json
{ "error": "온보딩을 먼저 마쳐야 합니다.", "code": "onboarding_required" }
```

HTTP 403. `code` 를 두는 이유는 클라이언트가 문구 대조 없이 분기할 수 있게 하기
위해서다 — 9절의 후속 UX 작업이 이 값을 쓴다.

`lib/logger.ts` 규칙대로 이메일·토큰은 응답과 로그 어디에도 넣지 않는다.

## 8. 예외 경로

옵트인 대상은 세 호출 지점뿐이다. 온보딩 화면(`app/onboarding/page.tsx:27,56,81`)이
실제로 부르는 것이 이 셋이다.

| 파일 | 메서드 | 이유 |
|---|---|---|
| `app/api/me/profile/route.ts:24` | GET | 온보딩 화면이 현재 상태를 읽는다 |
| `app/api/me/profile/route.ts:59` | PUT | 프로필을 저장한다 |
| `app/api/admin/password/route.ts` | POST | 임시 비밀번호를 바꾼다 |

`/api/auth/logout` 은 `getSessionUser` 를 쓰므로 `requireAuth` 를 타지 않는다. 손대지
않는다.

**이 목록이 이 설계의 안전장치다.** 하나라도 빠지면 온보딩을 끝낼 방법이 없어져
전원이 영구 잠긴다. 반대로 불필요하게 늘리면 게이트에 구멍이 난다.

## 9. 범위 외

**페이지 리디렉션(UX).** 페이지 30개는 전부 클라이언트 컴포넌트이고 데이터를 API 로만
얻는다. 따라서 API 게이트가 서면 미완료 계정은 아무것도 읽거나 쓰지 못한다 —
**보안 목표는 이 설계로 닫힌다.** 다만 주소창으로 `/dashboard` 를 열면 화면 뼈대는
뜨고 API 가 전부 403 을 내므로 빈 화면에 오류가 보인다. 이것을 매끄럽게 만드는 것,
즉 클라이언트가 `code: 'onboarding_required'` 를 보고 `/onboarding` 으로 보내는 작업은
별도 Task 로 분리한다.

**실기동 검증.** CLAUDE.md 상 dev 서버 기동은 실행 AI 에게 위임하지 않는다. 감리자가
직접 수행하며, 미검증 상태로 남아 있는 Google 회원 로그인 실검증과 같은 세션에서
함께 본다.

**기존 프로필 없는 계정의 일괄 수집.** member-management 가 이미 범위 밖으로 둔
사안이다. 이 설계에서 그 계정들은 차단되는 것이 아니라 온보딩을 한 번 거치게 된다.

## 10. 테스트

신규 `tests/api-onboarding-gate.test.ts`. **핵심은 실제 `requireAuth` 를 돌리는
것이다** — 기존 라우트 테스트 26개처럼 `vi.mock('../lib/auth')` 로 스텁하면 게이트가
전혀 검증되지 않는다.

- `mustChangePassword: true` → 403 이고 본문 `code` 가 `onboarding_required`
- `profile: null` → **TypeError 가 아니라 403** (5절 `?? null` 회귀 방지)
- MENTOR 인데 `expertise` 없음 → 403
- MENTEE 인데 `companyName` 없음 → 403
- **ADMIN 도 미완료면 403** (2절 결정의 증명 — 예외 없음)
- 예외 3경로는 미완료 상태에서도 통과
- 온보딩 완료 계정은 통과 (회귀)
- PENDING 계정은 `onboarding_required` 가 아니라 승인 대기 메시지 (6절 순서 증명)

기존 테스트 중 **실제 `requireAuth` 를 돌리는 것은 `tests/auth.test.ts` 와
`tests/authorization.test.ts` 둘뿐**이다(나머지 26개는 `lib/auth` 또는
`lib/authorization` 을 스텁한다). 이 둘의 user mock 에 `mustChangePassword: false` 와
완성 `profile` 을 더한다. 그 밖에 손댈 테스트는 없다.

## 11. 완료 기준

- `npx tsc --noEmit` 0건 · `npx vitest run` 전체 통과 · `npx next lint` 0건
- 위 10절 테스트 전부 통과
- `lib/auth.ts` 는 뮤테이션 대상 목록에 없으므로 stryker 요구는 없다
  (CLAUDE.md 「뮤테이션 회귀 방지」는 목록에 오른 파일에만 적용된다)
- 원격 DB 명령·dev 서버 무접촉
