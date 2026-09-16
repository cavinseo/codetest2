---
title: '로그인 선택 역할과 계정 역할 일치 검증'
type: 'bugfix'
created: '2026-09-16'
status: 'done'
baseline_commit: '60ac842e4e685d9caee79c5c1085b28bcd4bdb8d'
context: ['AGENTS.md', 'CLAUDE.md', 'docs/superpowers/plans/2026-08-25-google-member-login.md', 'docs/superpowers/plans/2026-09-10-mentee-invite-login.md']
---

<frozen-after-approval reason="사용자가 요청한 정확한 포지션 로그인 제한">

## Intent

**Problem:** 로그인 화면에서 프로그램 매니저·멘토·멘티를 선택하지만, 현재 비밀번호 요청과 Google 로그인 상태에는 선택값이 들어가지 않아 다른 역할을 골라도 인증된다. 역할 선택이 안내에 그치므로 사용자가 잘못된 모드로 로그인하고 권한 화면을 혼동한다.

**Approach:** 비밀번호와 Google 로그인 모두 선택 역할을 서버가 검증해 DB 계정 역할과 정확히 일치할 때만 세션을 발급한다. 역할 불일치는 실제 계정 역할을 노출하지 않는 고정 안내로 거부하고, 관리자 전용 로그인과 멘티 초대코드 로그인은 기존 정책을 유지한다.

## Boundaries & Constraints

**Always:** 역할 검사는 올바른 비밀번호 또는 검증된 Google 이메일 뒤에 수행한다. 불일치·잘못된 DB 역할에는 세션 쿠키를 발급하거나 로그인 rate-limit을 초기화하지 않는다. 비밀번호·이메일·Google state·실제 계정 역할은 오류 응답과 로그에 남기지 않는다.

**Ask First:** 회원 역할 모델, 관리자 접근 판정, 초대코드 역할 정책 또는 DB 스키마를 바꿔야 한다면 구현을 중단하고 범위를 다시 확인한다.

**Never:** 클라이언트가 보낸 역할로 DB 역할이나 권한을 변경하지 않는다. 역할 생략을 일반 회원의 우회로로 허용하지 않는다. 실제 계정·Google·원격 DB·dev 서버로 검증하지 않는다.

## I/O & Edge-Case Matrix

| 상황 | 입력·상태 | 기대 동작 | 오류 처리 |
| --- | --- | --- | --- |
| 비밀번호 역할 일치 | 선택 `MENTOR`, DB `MENTOR`, 비밀번호 정상 | 기존 세션과 이동 흐름을 유지한다. | 없음. |
| 비밀번호 역할 불일치 | 선택 `MENTOR`, DB `MENTEE`, 비밀번호 정상 | 세션과 rate-limit 초기화 없이 거부한다. | 403, `LOGIN_ROLE_MISMATCH`, `선택한 로그인 역할과 계정 역할이 일치하지 않습니다. 계정에 맞는 역할을 선택하세요.` |
| 일반 회원 역할 생략 | 선택값 없음, DB가 일반 회원 역할 | 직접 API 호출 우회를 거부한다. | 역할 불일치와 같은 403 응답. |
| 관리자 전용 로그인 | 선택값 없음, DB `ADMIN` | 기존 관리자 폼과 2차 관리자 권한 확인을 유지한다. | 일반 회원은 통과하지 않는다. |
| 잘못된 DB 역할 | 알 수 없거나 비어 있는 역할 | 세션 없이 관리자 문의 안내를 반환한다. | 403, `ACCOUNT_ROLE_INVALID`. |
| Google 역할 일치 | 허용 역할이 서명 state에 있고 DB 역할과 같음 | 기존 Google 세션을 발급한다. | 없음. |
| Google 역할 불일치 | 서명 state 역할과 DB 역할이 다름 | 세션 없이 로그인 화면으로 돌린다. | `?error=role_mismatch`. |
| Google 역할 누락·변조 | 시작 역할 누락 또는 state 역할 변조 | OAuth 시작 전 또는 코드 교환 전에 거부한다. | `google_role` 또는 `google_state`. |
| 멘티 초대코드 | 초대코드 로그인 | 클라이언트 역할을 받지 않고 기존 DB 멘티 검증을 유지한다. | 기존 오류 계약 유지. |

</frozen-after-approval>

## Code Map

- `app/login/page.tsx` -- 선택 역할을 비밀번호 요청과 Google 시작 URL에 전달하고 오류를 표시한다.
- `app/api/auth/login/route.ts` -- 비밀번호 확인 뒤 선택 역할과 계정 역할을 비교한다.
- `lib/login-state.ts` -- Google 선택 역할을 서명 payload에 포함하고 검증된 역할만 복원한다.
- `app/api/auth/google/login/route.ts` -- 허용된 시작 역할만 서명 state로 발급한다.
- `app/api/auth/google/login/callback/route.ts` -- 검증된 state 역할과 DB 역할이 같을 때만 세션을 발급한다.
- `components/admin/AdminLoginForm.tsx` -- 변경하지 않고 역할 생략 관리자 로그인 회귀를 테스트한다.
- `tests/login-page.test.ts`, `tests/api-auth-login.test.ts`, `tests/login-state.test.ts`, `tests/api-google-login.test.ts` -- UI·API·서명·콜백 계약을 검증한다.

## Tasks & Acceptance

**Execution:**
- [x] 관련 테스트를 먼저 갱신해 일반 역할 전달, 불일치 거부, 관리자 회귀, Google state 역할 서명·변조 거부를 RED로 재현한다.
- [x] `app/login/page.tsx`와 `app/api/auth/login/route.ts`에서 비밀번호 선택 역할을 전달·검증하고 고정 오류 계약을 적용한다.
- [x] `lib/login-state.ts`와 Google 시작·콜백 라우트에서 역할을 state에 서명하고 DB 역할과 비교한다.
- [x] 직접 호출하는 통합 테스트에 역할을 추가하되, 관리자 폼과 초대코드 로그인 계약은 바꾸지 않는다.
- [x] 대상·전체 테스트, 타입, lint, 운영 빌드와 `lib/login-state.ts` 뮤테이션 검사를 완료한다.

**Acceptance Criteria:**
- Given 승인된 멘티 계정, when 멘토 또는 프로그램 매니저를 선택해 정상 비밀번호로 로그인하면, then 고정 역할 불일치 안내를 받고 세션이 발급되지 않는다.
- Given 승인된 멘토 계정, when 멘토를 선택해 로그인하면, then 기존 대시보드 또는 온보딩 이동을 유지한다.
- Given Google 로그인 state의 역할이 변조되거나 계정 역할과 다르면, when 콜백을 처리하면, then 코드 교환 또는 세션 발급 전에 안전하게 거부한다.
- Given 관리자 전용 폼 또는 멘티 초대코드 로그인, when 기존 정상 절차를 수행하면, then 역할 선택 기능 추가 전과 같은 방식으로 동작한다.

## Spec Change Log

- 2026-09-16. 사용자의 직접 구현 요청에 따라 비밀번호·Google 로그인 역할 검증 구현을 시작했다.
- 2026-09-16. 독립 검토에서 Google 정상 역할별 회귀 공백을 발견해 세 역할의 state 복원·세션 발급 테스트를 보강했다.

## Design Notes

일반 비밀번호 로그인 요청의 역할은 세 가지 회원 역할만 허용하고 선택적으로 파싱한다. 생략은 DB 역할이 `ADMIN`인 관리자 전용 폼에만 허용한다. Google state는 역할 필드를 포함하도록 컨텍스트 버전을 올려 배포 직전 발급된 무역할 state가 새 콜백에서 통과하지 않게 한다.

## Verification

**Commands:**
- `npx vitest run tests/login-page.test.ts tests/api-auth-login.test.ts tests/login-state.test.ts tests/api-google-login.test.ts` -- 역할별 로그인과 우회·변조 회귀가 통과한다.
- `npm test` -- 전체 회귀가 통과한다.
- `npx tsc --noEmit --incremental false` -- 타입 오류가 없다.
- 변경 파일 대상 `npx eslint`와 `npm run lint` -- 변경 파일 lint가 통과한다.
- `npx stryker run stryker.crap.config.json --mutate lib/login-state.ts` -- 뮤테이션 점수 100%를 유지한다.
- `npm run build` -- 운영 빌드가 성공한다.

## Suggested Review Order

**비밀번호 역할 검증**

- 올바른 비밀번호 뒤 DB 역할과 선택 역할을 비교해 세션 발급을 제한한다.
  [`route.ts:75`](../../../app/api/auth/login/route.ts#L75)

- 로그인 화면이 선택 역할을 비밀번호 요청에 함께 전달한다.
  [`page.tsx:72`](../../../app/login/page.tsx#L72)

**Google 역할 무결성**

- 허용 역할을 전용 v2 state에 서명하고 검증된 역할만 복원한다.
  [`login-state.ts:15`](../../../lib/login-state.ts#L15)

- OAuth 시작 전에 역할을 검증해 서명 state로 발급한다.
  [`route.ts:11`](../../../app/api/auth/google/login/route.ts#L11)

- 콜백이 서명 역할과 DB 역할 불일치 시 세션 없이 거부한다.
  [`route.ts:61`](../../../app/api/auth/google/login/callback/route.ts#L61)

- 로그인 화면의 Google 링크가 현재 선택 역할을 시작 요청에 고정한다.
  [`page.tsx:306`](../../../app/login/page.tsx#L306)

**회귀 검증**

- 비밀번호 세 역할 일치·불일치와 관리자 역할 생략을 함께 고정한다.
  [`api-auth-login.test.ts:136`](../../../tests/api-auth-login.test.ts#L136)

- Google 세 역할 state 복원과 동일 역할 세션 발급을 검증한다.
  [`api-google-login.test.ts:173`](../../../tests/api-google-login.test.ts#L173)
