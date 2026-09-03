# Task 1 결과 보고서

## RESULT

`lib/oauth-nonce.ts`의 뮤테이션 점수가 `80.85%`에서 `100.00%`가 됐다. 서명은 유효하지만 `userId`가 없거나 `exp` 형식·경계가 잘못된 payload와 JSON이 아닌 payload를 거부하는 테스트를 추가했다. 실측으로 확정된 등가 뮤턴트 네 범위는 지정한 뮤테이터만 disable 주석으로 제외했다.

## FILES CHANGED

- `tests/oauth-nonce.test.ts`에 OAuth nonce 거부 테스트 네 개와 fake timer 정리를 추가했다.
- `lib/oauth-nonce.ts`에 등가 뮤턴트 네 범위의 Stryker disable 주석만 추가했다.

## COMMIT

- 작업 커밋: `44ed5d8 test: OAuth nonce 검증 가드를 뮤테이션으로 못 박는다`.

## VERIFIED BY

- `npx stryker run stryker.crap.config.json --mutate lib/oauth-nonce.ts`를 테스트 추가 전에 실행했다.
  - 점수 원문: `oauth-nonce.ts |  80.85 |   82.61 |       38 |         0 |          8 |        1 |        0 |`.
  - 출력 마지막 줄 원문: `01:46:05 (35116) INFO TemporaryDirectory Failed to delete stryker temp directory E:\Dropbox\codetest2\.stryker-tmp\sandbox-sDGYuW`.
- `npx vitest run tests/oauth-nonce.test.ts`를 실행했다.
  - 출력 마지막 줄 원문: `   Duration  550ms (transform 45ms, setup 0ms, import 131ms, tests 7ms, environment 0ms)`.
- `npx stryker run stryker.crap.config.json --mutate lib/oauth-nonce.ts`를 테스트 추가 후 실행했다.
  - 점수 원문: `oauth-nonce.ts | 100.00 |  100.00 |       39 |         0 |          0 |        0 |        0 |`.
  - 출력 마지막 줄 원문: `01:46:51 (33876) INFO TemporaryDirectory Failed to delete stryker temp directory E:\Dropbox\codetest2\.stryker-tmp\sandbox-K2DJm7`.
- `npx tsc --noEmit`을 실행했다.
  - 출력이 없어 마지막 출력 줄이 없다.
- `npx vitest run`을 실행했다.
  - 출력 마지막 줄 원문: `   Duration  10.08s (transform 5.02s, setup 0ms, import 24.86s, tests 11.78s, environment 10ms)`.
  - 결과 원문: `      Tests  1032 passed (1032)` 및 ` Test Files  91 passed (91)`.
- `npx next lint`를 실행했다.
  - 출력 마지막 줄 원문: `✔ No ESLint warnings or errors`.

## DEVIATIONS

없다.

## RISKS

전체 Stryker 실행은 수행하지 않아 전체 `All files` 점수는 이번 Task에서 재측정하지 않았다. Stryker가 `.stryker-tmp` 샌드박스 삭제에 실패했으나, 설정상 무시 대상이므로 삭제하지 않았다.

## QUESTIONS

없다.
