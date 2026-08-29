# Task 1 결과 보고서

## RESULT

임시 비밀번호 변경 전이거나 역할별 프로필이 미완성인 계정은 `requireAuth`에서 403과 `onboarding_required` 코드를 받도록 했다. 기본값은 차단이며, 온보딩을 끝내는 GET·PUT `/api/me/profile`와 POST `/api/admin/password`만 명시적으로 통과시킨다. ADMIN도 예외 없이 같은 관문을 지난다.

## FILES CHANGED

- `lib/auth.ts`에 온보딩 옵션, 프로필 select, 완료 관문을 추가했다.
- `app/api/me/profile/route.ts`의 GET·PUT에 옵트인을 추가했다.
- `app/api/admin/password/route.ts`의 POST에 옵트인을 추가했다.
- `tests/api-onboarding-gate.test.ts`에 실제 `requireAuth`를 검증하는 테스트 11개를 추가했다.
- `tests/auth.test.ts`와 `tests/authorization.test.ts`의 승인된 사용자 픽스처를 완료 상태로 확장했다.
- `docs/superpowers/plans/2026-08-30-onboarding-gate.md`의 Task 1 Step 1~10 체크박스를 완료로 갱신했다.

## COMMIT

- 작업 커밋: `19c202c feat: 온보딩을 마치기 전에는 API 를 쓰지 못하게 막는다`.

## VERIFIED BY

- `npx vitest run tests/api-onboarding-gate.test.ts`를 구현 전에 실행했다.
  - RED 결과 원문: `      Tests  5 failed | 6 passed (11)`.
  - 출력 마지막 줄 원문: `   Duration  593ms (transform 90ms, setup 0ms, import 175ms, tests 23ms, environment 0ms)`.
- `npx vitest run tests/api-onboarding-gate.test.ts tests/auth.test.ts tests/authorization.test.ts`를 구현 후 실행했다.
  - 결과 원문: `      Tests  58 passed (58)` 및 ` Test Files  3 passed (3)`.
  - 출력 마지막 줄 원문: `   Duration  610ms (transform 227ms, setup 0ms, import 472ms, tests 54ms, environment 0ms)`.
- `npx tsc --noEmit`을 실행했다.
  - 출력이 없어 마지막 출력 줄이 없다.
- `npx vitest run`을 실행했다.
  - 결과 원문: `      Tests  1045 passed (1045)` 및 ` Test Files  92 passed (92)`.
  - 출력 마지막 줄 원문: `   Duration  8.37s (transform 5.29s, setup 0ms, import 17.19s, tests 12.34s, environment 11ms)`.
- `npx next lint`를 실행했다.
  - 출력 마지막 줄 원문: `✔ No ESLint warnings or errors`.
- `bash -lc "grep -rn 'allowIncompleteOnboarding' app/"`을 실행했다.
  - 출력 원문: `app/api/admin/password/route.ts:25:    const authResult = await requireAuth(request, { allowIncompleteOnboarding: true });`
  - 출력 원문: `app/api/me/profile/route.ts:26:    const authResult = await requireAuth(request, { allowIncompleteOnboarding: true });`
  - 출력 마지막 줄 원문: `app/api/me/profile/route.ts:63:    const authResult = await requireAuth(request, { allowIncompleteOnboarding: true });`.
- `rg -n "isAccessExpired|const role|allowIncompleteOnboarding|dbUser\.profile \?\? null" lib/auth.ts`를 실행했다.
  - 출력 마지막 줄 원문: `188:            || !isProfileCompleteForRole(role, dbUser.profile ?? null))) {`.
- `rg -n "ADMIN|isAdmin" lib/auth.ts`를 실행했다.
  - 출력 마지막 줄 원문: `199:        isAdmin: dbUser.isAdmin,`.
- `Test-Path middleware.ts`를 실행했다.
  - 출력 마지막 줄 원문: `False`.

## DEVIATIONS

`tests/auth.test.ts`의 Step 7 계획서 예시 프로필은 공통 필드만 있어, 실제 `requireAuth`가 누락 role을 MENTEE로 낮춘 뒤 새 관문에서 미완성으로 판정했다. 부분 검증에서 이 기존 테스트 하나가 403을 받아, 허용된 픽스처 확장 안에서 `companyName`과 `industry`를 추가했다. `tests/authorization.test.ts`를 포함해 그 밖의 기존 테스트는 수정할 필요가 없었다. PowerShell에는 `grep`이 없어 동일한 `grep -rn` 검색을 bash로 실행했다.

## RISKS

dev 서버 실기동 검증은 범위 밖이며 실행하지 않았다. 실제 로그인 후 페이지 UX 리디렉션도 후속 작업 범위라 검증하지 않았고, 이 Task는 API 403 강제만 검증했다.

## QUESTIONS

없다.
