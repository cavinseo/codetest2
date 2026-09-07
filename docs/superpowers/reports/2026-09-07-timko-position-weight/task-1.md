# RESULT

Task 1 완료. 일원적 가로 띠만 반전했으며 기존 단언을 유지한 채 100셀 × 네 모서리 400개 표본을 통과했다.

# FILES CHANGED

- lib/kano-algorithm.ts — 계산 한 줄과 이유 주석 네 줄.
- tests/kano-algorithm.test.ts — 계획서 스니펫 그대로 테스트 한 개 추가.
- docs/superpowers/plans/2026-09-07-timko-position-weight.md — Task 1 체크박스 갱신.
- 이 보고서.

# COMMIT

작업 커밋 `5ff2fa5`. 보고서는 별도 `docs: Task 1 결과 보고서` 커밋으로 기록한다.

# VERIFIED BY

`npx vitest run tests/kano-algorithm.test.ts` — 수정 전 RED, 종료 코드 1. 실패 첫 줄과 요약 원문.

```text
AssertionError: 만족 0.91 · 불만족 -0.91 (행 0, 열 0): expected 4 to be 3.2 // Object.is equality
 Test Files  1 failed (1)
      Tests  1 failed | 11 passed (12)
   Duration  227ms (transform 32ms, setup 0ms, import 48ms, tests 9ms, environment 0ms)
```

`npx vitest run tests/kano-algorithm.test.ts tests/qfd-worksheet.test.ts` — GREEN, 종료 코드 0.

```text
 Test Files  2 passed (2)
      Tests  20 passed (20)
   Duration  244ms (transform 80ms, setup 0ms, import 132ms, tests 15ms, environment 0ms)
```

`npx tsc --noEmit` — 종료 코드 0, 출력 없음.

`npx vitest run` — 종료 코드 0. 기존 1,234개에 신규 한 개를 더한 1,235개이며 기존 테스트 삭제·단언 변경 없음.

```text
 Test Files  107 passed (107)
      Tests  1235 passed (1235)
   Duration  4.39s (transform 6.61s, setup 0ms, import 20.11s, tests 5.59s, environment 12ms)
```

`npx next lint` — 종료 코드 0. 마지막 줄 원문.

```text
✔ No ESLint warnings or errors
```

`npx stryker run stryker.crap.config.json --mutate lib/kano-algorithm.ts` — 확장 권한 재실행 종료 코드 0. 총 205개, 파일 전체 93.66%. 대상 166–200행의 helper 세 개와 calculateSatisfactionGraphWeight는 45개 모두 Killed이며 Survived 0, NoCoverage 0이다. disable 추가 없음, 두 실행 모두 총 205개로 분모 변화 0이다.

JSON 보고서의 대상 범위를 status로 집계한 출력 원문.

```text
Name   Count
----   -----
Killed    45
```

파일 전체 점수와 범위 밖 Survived 11개·NoCoverage 2개의 Stryker 출력 원문.

```text
[NoCoverage] BlockStatement
lib/kano-algorithm.ts:119:28
-       if (denominator === 0) {
-           return { better: 0, worse: 0 };
-       }
+       if (denominator === 0) {}

[NoCoverage] ObjectLiteral
lib/kano-algorithm.ts:120:16
-           return { better: 0, worse: 0 };
+           return {};

[Survived] StringLiteral
lib/kano-algorithm.ts:69:51
-       const validCategories: KanoCategory[] = ['M', 'O', 'A', 'I', 'R', 'Q'];
+       const validCategories: KanoCategory[] = ['M', "", 'A', 'I', 'R', 'Q'];
Tests ran:
    qfd worksheet calculations keeps a virtual project Kano survey reliable through QFD weighting
    kano algorithm aggregates responses and selects the dominant category
    kano algorithm returns indifferent as dominant category for empty response sets
  and 2 more tests!


[Survived] StringLiteral
lib/kano-algorithm.ts:69:66
-       const validCategories: KanoCategory[] = ['M', 'O', 'A', 'I', 'R', 'Q'];
+       const validCategories: KanoCategory[] = ['M', 'O', 'A', 'I', "", 'Q'];
Tests ran:
    qfd worksheet calculations keeps a virtual project Kano survey reliable through QFD weighting
    kano algorithm aggregates responses and selects the dominant category
    kano algorithm returns indifferent as dominant category for empty response sets
  and 2 more tests!


[Survived] StringLiteral
lib/kano-algorithm.ts:70:42
-       let dominantCategory: KanoCategory = 'I';
+       let dominantCategory: KanoCategory = "";
Tests ran:
    qfd worksheet calculations keeps a virtual project Kano survey reliable through QFD weighting
    kano algorithm aggregates responses and selects the dominant category
    kano algorithm returns indifferent as dominant category for empty response sets
  and 2 more tests!


[Survived] StringLiteral
lib/kano-algorithm.ts:69:71
-       const validCategories: KanoCategory[] = ['M', 'O', 'A', 'I', 'R', 'Q'];
+       const validCategories: KanoCategory[] = ['M', 'O', 'A', 'I', 'R', ""];
Tests ran:
    qfd worksheet calculations keeps a virtual project Kano survey reliable through QFD weighting
    kano algorithm aggregates responses and selects the dominant category
    kano algorithm returns indifferent as dominant category for empty response sets
  and 2 more tests!


[Survived] UnaryOperator
lib/kano-algorithm.ts:71:20
-       let maxCount = -1; // 초기값을 -1로 하여 0개 항목이더라도 첫 항목이 들어가게 함
+       let maxCount = +1; // 초기값을 -1로 하여 0개 항목이더라도 첫 항목이 들어가게 함
Tests ran:
    qfd worksheet calculations keeps a virtual project Kano survey reliable through QFD weighting
    kano algorithm aggregates responses and selects the dominant category
    kano algorithm returns indifferent as dominant category for empty response sets
  and 2 more tests!


[Survived] EqualityOperator
lib/kano-algorithm.ts:74:13
-           if (counts[cat] > maxCount) {
+           if (counts[cat] >= maxCount) {
Tests ran:
    qfd worksheet calculations keeps a virtual project Kano survey reliable through QFD weighting
    kano algorithm aggregates responses and selects the dominant category
    kano algorithm returns indifferent as dominant category for empty response sets
  and 2 more tests!


[Survived] ConditionalExpression
lib/kano-algorithm.ts:119:9
-       if (denominator === 0) {
+       if (false) {
Tests ran:
    qfd worksheet calculations keeps a virtual project Kano survey reliable through QFD weighting
    kano algorithm calculates rounded better and worse coefficients
    kano algorithm uses the same Better-Worse denominator as the worksheet


[Survived] ConditionalExpression
lib/kano-algorithm.ts:138:28
-       if (weight === null || weight === undefined || Number.isNaN(weight)) return null;
+       if (weight === null || false || Number.isNaN(weight)) return null;
Tests ran:
    kano algorithm maps worksheet TIMKO weights into quality results


[Survived] ConditionalExpression
lib/kano-algorithm.ts:161:26
-       if (better >= 0.5 && absWorse >= 0.5) return 'ONE_DIMENSIONAL';
+       if (better >= 0.5 && true) return 'ONE_DIMENSIONAL';
Tests ran:
    qfd worksheet calculations matches the satisfaction graph weight formula used as QFD importance input
    kano algorithm maps better/worse coefficients into satisfaction quadrants
    kano algorithm assigns satisfaction graph weights from radial Better-Worse positions
  and 1 more test!


[Survived] ConditionalExpression
lib/kano-algorithm.ts:162:9
-       if (better < 0.5 && absWorse >= 0.5) return 'MUST_BE';
+       if (true && absWorse >= 0.5) return 'MUST_BE';
Tests ran:
    qfd worksheet calculations matches the satisfaction graph weight formula used as QFD importance input
    qfd worksheet calculations keeps a virtual project Kano survey reliable through QFD weighting
    kano algorithm maps better/worse coefficients into satisfaction quadrants
  and 2 more tests!


[Survived] EqualityOperator
lib/kano-algorithm.ts:162:9
-       if (better < 0.5 && absWorse >= 0.5) return 'MUST_BE';
+       if (better <= 0.5 && absWorse >= 0.5) return 'MUST_BE';
Tests ran:
    qfd worksheet calculations matches the satisfaction graph weight formula used as QFD importance input
    qfd worksheet calculations keeps a virtual project Kano survey reliable through QFD weighting
    kano algorithm maps better/worse coefficients into satisfaction quadrants
  and 2 more tests!


Ran 1.42 tests per mutant on average.
-------------------|------------------|----------|-----------|------------|----------|----------|
                   | % Mutation score |          |           |            |          |          |
File               |  total | covered | # killed | # timeout | # survived | # no cov | # errors |
-------------------|--------|---------|----------|-----------|------------|----------|----------|
All files          |  93.66 |   94.58 |      192 |         0 |         11 |        2 |        0 |
 kano-algorithm.ts |  93.66 |   94.58 |      192 |         0 |         11 |        2 |        0 |
-------------------|--------|---------|----------|-----------|------------|----------|----------|
03:38:56 (12528) INFO JsonReporter Your report can be found at: file:///E:/Dropbox/codetest2/stryker-crap-report.json
03:38:56 (12528) INFO MutationTestExecutor Done in 17 seconds.
03:38:57 (12528) INFO TemporaryDirectory Failed to delete stryker temp directory E:\Dropbox\codetest2\.stryker-tmp\sandbox-g6Potc
```

# DEVIATIONS

- 시작 시 알고리즘 테스트는 계획서의 10개가 아니라 11개였다. 기존 한국어 분류 번역 테스트도 유지하여 Task 1 후 12개다.
- 첫 Stryker 실행은 검사 결과를 완성했으나 자체 프로세스 정리 중 다음 오류로 종료 코드 1이었다. 확장 권한으로 동일 명령 재실행 후 종료 코드 0을 확인했다. 개발 서버를 직접 종료하지 않았다.

```text
Error: Command failed: taskkill /pid 18468 /T /F
ERROR: Access denied
    at genericNodeError (node:internal/errors:985:15)
    at wrappedFn (node:internal/errors:539:14)
    at ChildProcess.exithandler (node:child_process:417:12)
    at ChildProcess.emit (node:events:508:28)
    at maybeClose (node:internal/child_process:1101:16)
    at ChildProcess._handle.onexit (node:internal/child_process:305:5)
Node.js v24.13.1
```

- 재실행은 임시 디렉터리 삭제 실패 안내를 남겼지만 검사와 명령은 정상 종료했다. 임시 디렉터리는 Git 추적 대상이 아니다.
- Vite의 기존 CommonJS 설정 안내, next lint 폐기 예정 안내, Browserslist 데이터 갱신 안내는 설정 변경 없이 유지했다. ESLint 진단은 0개다.
- .git 쓰기 권한 제한으로 최초 커밋 시도가 실패하여 승인된 확장 권한으로 커밋했다.

# RISKS

실화면·배포·push는 미검증이며 실행하지 않았다. DB와 개발 서버를 사용하지 않았다. 저장된 수동 가중치가 자동값을 덮는 기존 동작은 유지된다. 범위 밖 뮤턴트는 위 원문대로 남겨 두었다.

# QUESTIONS

없음.

