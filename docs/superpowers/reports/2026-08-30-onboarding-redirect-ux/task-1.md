# Task 1 결과 보고서

## RESULT

온보딩 관문이 낸 403 응답의 `code: 'onboarding_required'`만 판정해 일반 화면에서 `/onboarding`으로 보낸다. 전역 fetch를 한 겹 감싸 호출부 147곳을 바꾸지 않았고, 온보딩·로그인·가입 경로는 무한 이동을 막기 위해 제외했다.

## FILES CHANGED

- `lib/onboarding-redirect.ts`에 순수 403·경로 판정 함수를 추가했다.
- `tests/onboarding-redirect.test.ts`에 순수 판정 테스트 10개를 추가했다.
- `components/OnboardingRedirect.tsx`에 전역 fetch 래퍼와 복원 cleanup을 추가했다.
- `app/layout.tsx`에 `OnboardingRedirect`를 루트 마운트했다.
- `stryker.crap.config.json`에 순수 판정 모듈을 등록했다.
- `docs/superpowers/plans/2026-08-30-onboarding-redirect-ux.md`의 Task 1 Step 1~9 체크박스를 완료로 갱신했다.

## COMMIT

- 작업 커밋: `3cf40d4 feat: 온보딩 관문에 막히면 온보딩 화면으로 보낸다`.

## VERIFIED BY

- `npx vitest run tests/onboarding-redirect.test.ts`를 구현 전에 실행했다.
  - RED 결과 원문: `      Tests  no tests`.
  - 출력 마지막 줄 원문: `   Duration  406ms (transform 17ms, setup 0ms, import 0ms, tests 0ms, environment 0ms)`.
- `npx vitest run tests/onboarding-redirect.test.ts`를 순수 모듈 구현 후 실행했다.
  - 결과 원문: `      Tests  10 passed (10)` 및 ` Test Files  1 passed (1)`.
  - 출력 마지막 줄 원문: `   Duration  408ms (transform 22ms, setup 0ms, import 33ms, tests 3ms, environment 0ms)`.
- `npx stryker run stryker.crap.config.json --mutate lib/onboarding-redirect.ts`를 실행했다.
  - 점수 원문: ` onboarding-redirect.ts | 100.00 |  100.00 |       37 |         0 |          0 |        0 |        0 |`.
  - 출력 마지막 줄 원문: `03:37:24 (14932) INFO TemporaryDirectory Failed to delete stryker temp directory E:\Dropbox\codetest2\.stryker-tmp\sandbox-NJFPOT`.
- `npx tsc --noEmit`을 실행했다.
  - 출력이 없어 마지막 출력 줄이 없다.
- `npx vitest run`을 실행했다.
  - 결과 원문: `      Tests  1055 passed (1055)` 및 ` Test Files  93 passed (93)`.
  - 출력 마지막 줄 원문: `   Duration  8.48s (transform 6.46s, setup 0ms, import 17.14s, tests 12.32s, environment 11ms)`.
- `npx next lint`를 실행했다.
  - 출력 마지막 줄 원문: `✔ No ESLint warnings or errors`.
- `rg -n "onboarding-redirect|OnboardingRedirect|response\.clone|window\.fetch" lib/onboarding-redirect.ts components/OnboardingRedirect.tsx app/layout.tsx stryker.crap.config.json`을 실행했다.
  - 출력 마지막 줄 원문: `stryker.crap.config.json:22:    "lib/onboarding-redirect.ts",`.

## DEVIATIONS

없다.

## RISKS

dev 서버 실기동 검증은 범위 밖이라 실행하지 않았다. 컴포넌트 테스트 인프라가 없어 `OnboardingRedirect.tsx` 자체는 렌더링 테스트하지 않았고, 조건 분기는 순수 모듈 테스트와 Stryker로 검증했다. Stryker가 `.stryker-tmp` 샌드박스 삭제에 실패했으나 설정상 무시 대상이므로 삭제하지 않았다.

## QUESTIONS

없다.
