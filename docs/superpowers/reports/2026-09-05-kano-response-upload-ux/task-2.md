# Task 2 결과 보고서

## RESULT

PASS. 문구 정본과 파일명 정리 규칙을 재사용하는 자체 완결형 Kano 오프라인 HTML 설문지 생성기를 구현했고, 저장·복원·다운로드 및 주입 방어 계약을 테스트로 고정했다.

## FILES CHANGED

- `lib/kano-survey-document.ts`에서 기존 파일명 정리 파이프라인을 `kanoSurveyFileNameStem`으로 추출하고 기존 `.docx` 반환값을 보존했다.
- `lib/kano-offline-form.ts`를 신설해 초기 payload, 자체 완결 UI, 응답 복원과 HTML 재다운로드 스크립트를 구현했다.
- `tests/kano-survey-document.test.ts`에 파일명 어간의 경로 문자·빈 값·60자 절단 테스트 3개를 추가했다.
- `tests/kano-offline-form.test.ts`를 신설해 정적 HTML 계약과 fake DOM 저장·복원 동작을 검증했다.
- `stryker.crap.config.json`의 기존 순서를 유지하며 `lib/kano-offline-form.ts`를 mutate 대상에 추가했다.
- `docs/superpowers/plans/2026-09-05-kano-response-upload-ux.md`의 Task 2 Step 1~4를 완료 처리했다.

## COMMIT

- 작업 커밋은 `cd3ef95 feat: Kano 오프라인 HTML 설문지를 생성한다`이다.

## VERIFIED BY

### Step 0 선행 push

- 구현 전에 Task 1의 두 커밋을 지정 브랜치에 push했다.

```text
To https://github.com/cavinseo/codetest2.git
   66a2f71..f6ad5d3  claude/ws-6-response-upload-ui-gcng04 -> claude/ws-6-response-upload-ui-gcng04
branch 'claude/ws-6-response-upload-ui-gcng04' set up to track 'origin/claude/ws-6-response-upload-ui-gcng04'.
```

### RED → GREEN

- 생성기 구현 전 `npx vitest run tests/kano-offline-form.test.ts`가 모듈 부재로 RED를 보였다.

```text
Cannot find module '../lib/kano-offline-form'
Test Files  1 failed (1)
Tests  no tests
```

- 구현 및 검토 보강 뒤 관련 테스트를 함께 실행했다.

```text
npx vitest run tests/kano-offline-form.test.ts tests/kano-survey-document.test.ts tests/api-kano-survey-document.test.ts
Test Files  3 passed (3)
Tests  39 passed (39)
Duration  385ms (transform 131ms, setup 0ms, import 276ms, tests 64ms, environment 0ms)
```

### 게이트

- `npx tsc --noEmit`은 출력 없이 exit code 0으로 통과했다.

```text
(stdout/stderr 출력 없음, exit code 0)
```

- `npx vitest run`의 마지막 결과는 다음과 같다.

```text
Test Files  101 passed (101)
Tests  1154 passed (1154)
Duration  4.14s (transform 6.87s, setup 0ms, import 20.34s, tests 5.17s, environment 12ms)
```

- `npx next lint`의 마지막 출력 줄은 다음과 같다.

```text
✔ No ESLint warnings or errors
```

- `git diff --check`는 내용 출력 없이 exit code 0으로 통과했다.

### 뮤테이션

- `npx stryker run stryker.crap.config.json --mutate lib/kano-offline-form.ts`를 샌드박스 밖에서 최종 실행했고 exit code 0으로 끝났다. 총 24개 뮤턴트가 모두 사멸했다.

```text
All files             | 100.00 |  100.00 |       24 |         0 |          0 |        0 |        0 |
kano-offline-form.ts | 100.00 |  100.00 |       24 |         0 |          0 |        0 |        0 |
16:47:20 (21140) INFO MutationTestExecutor Done in 7 seconds.
```

- `npx stryker run stryker.crap.config.json --mutate lib/kano-survey-document.ts`를 샌드박스 밖에서 실행했고 exit code 0으로 끝났다. 총 54개 뮤턴트가 모두 사멸했다.

```text
All files                | 100.00 |  100.00 |       54 |         0 |          0 |        0 |        0 |
kano-survey-document.ts | 100.00 |  100.00 |       54 |         0 |          0 |        0 |        0 |
16:36:01 (38724) INFO MutationTestExecutor Done in 11 seconds.
```

- Stryker disable 주석은 추가하지 않았다. 제외 전·후 총 뮤턴트 수 감소는 0개다.

### 회귀 역검증

- 생성기 `serializePayload`의 `.replace(/</g, '\\u003c')` 한 줄만 임시 제거하고 `npx vitest run tests/kano-offline-form.test.ts`를 실행했다.

```text
AssertionError: expected [ '</script>', '</script>', …(2) ] to have a length of 2 but got 4
Test Files  1 failed (1)
Tests  1 failed | 13 passed (14)
```

- 해당 한 줄을 원복하고 같은 명령을 재실행했다.

```text
Test Files  1 passed (1)
Tests  14 passed (14)
```

- 원복된 최종 작업 diff 통계는 다음과 같다.

```text
docs/superpowers/plans/2026-09-05-kano-response-upload-ux.md |   8 +-
lib/kano-offline-form.ts                                    | 190 +++++++++++
lib/kano-survey-document.ts                                 |   9 +-
stryker.crap.config.json                                    |   1 +
tests/kano-offline-form.test.ts                             | 364 +++++++++++++++++++++
tests/kano-survey-document.test.ts                          |  15 +
6 files changed, 581 insertions(+), 6 deletions(-)
```

### 신설 실행물

- `npx tsx -e`로 `buildKanoOfflineFormHtml`을 한 번 직접 호출해 저장소 밖에 파일을 만들었다.

```text
C:/Users/Public/Documents/ESTsoft/CreatorTemp/kano-task2-sample.html
8343
<!DOCTYPE html>
```

### 독립 검토

- Blind Hunter, Edge Case Hunter, Acceptance Auditor가 기준 커밋 이후 diff를 독립 검토했다.
- Acceptance Auditor가 질문 방향과 라벨-점수 결합의 테스트 공백을 발견했다. 각 fieldset의 legend, radio name, 1~5 값, 라벨 전문과 순서를 정확 비교하도록 보강했다.
- 손상된 저장 파일 복구, 이메일 형식 검사, Enter 키 저장 등은 승인된 Task 2 계약 밖 동작이므로 추가하지 않았다.

## DEVIATIONS

- 계획서는 `kanoSurveyFileName`의 기존 테스트를 8개라고 적었지만 기준 커밋의 해당 `describe`에는 실제로 7개가 있었다. 기존 7개를 한 줄도 변경하지 않고 모두 통과시켰으며, 새 `kanoSurveyFileNameStem` 테스트 3개만 덧붙였다.
- 전체 기준 예상치는 100개 파일·1,137개 테스트였으나 최종 실제 실행은 101개 파일·1,154개 테스트였다. 테스트를 삭제하거나 제외하지 않고 실제 값을 기록했다.
- Stryker는 샌드박스에서 자식 프로세스 정리 권한 오류가 발생해 샌드박스 밖에서 재실행했다. 두 최종 실행 모두 exit code 0과 100%를 확인했다.
- 검토 보강 중 라벨 사이 결합 단언이 빠진 중간 상태에서 생성기 변이 점수가 95.83%로 내려갔다. 구조 단언을 복원한 뒤 24개 전부 사멸하는 100%를 재확인했다.
- `npx tsx`는 로컬 의존성이 없어 일회성 `tsx@4.23.13`을 받아 실행했다. `package.json`과 lockfile은 바꾸지 않았다.

## RISKS

- 실제 Chrome·Edge 브라우저에서 라디오 선택 → 저장 → 저장본 재열기 왕복은 하지 않았다. dev 서버와 브라우저 실계정 검증은 이번 실행 범위 밖이다.
- Vite는 CommonJS로 읽히는 `vitest.config.ts`의 ESM 문법이 향후 native config loader에서 지원되지 않을 수 있다고 경고했다. 현재 결과에는 영향이 없다.
- Browserslist의 `caniuse-lite` 데이터가 8개월 오래됐다는 경고가 있었다. 신규 의존성 금지와 좁은 변경 원칙에 따라 갱신하지 않았다.
- Stryker는 점수 산출과 정상 종료 뒤 `.stryker-tmp` 샌드박스 디렉터리 삭제 실패를 경고했다. 해당 경로는 Git 무시 대상이고 점수에는 영향이 없다.
- 원격 실DB, DB 쓰기 명령, dev 서버는 금지 계약에 따라 실행하지 않았다.

## QUESTIONS

- 없다.
