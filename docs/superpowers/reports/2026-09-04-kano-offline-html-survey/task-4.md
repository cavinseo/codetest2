# Task 4 결과 보고서

## RESULT

계획서(`docs/superpowers/plans/2026-09-04-kano-offline-html-survey.md`) Task 4의 Step 0~3을 완료했다. 먼저 저장한 HTML을 다시 열었을 때 비어 있던 복사 폴백을 응답 섬의 JSON으로 복원했다. 이어서 자기 저장형 HTML과 JSON 응답을 순수하게 추출·검증하고 현재 질문 세트와 2단계로 대조하는 모듈을 구현했다.

파서는 16종의 실패 사유만 반환하고 파일 내용이나 이메일을 오류에 담지 않는다. 제출 시각은 미래 5분까지 허용하고 나머지 잘못된 시각은 현재 시각으로 대체하며, 이메일은 trim·소문자로 정규화한다. 세트가 바뀐 경우 현재 id와 문항 해시가 같은 답을 먼저 확정한 뒤 삭제된 id만 유일한 문구 해시 후보에 재매칭해 같은 현재 문항이 중복되는 회귀를 막는다.

## FILES CHANGED

- `lib/kano-offline-survey.ts` — 저장된 HTML을 다시 열 때 응답 JSON을 복사 textarea에 복원하고 폴백을 표시한다.
- `tests/kano-offline-survey.test.ts` — `DOMContentLoaded` 복원 블록을 문자열로 고정하는 회귀 테스트를 추가했다.
- `lib/kano-offline-response.ts` — 응답 섬 추출, 16종 사유 검증, 시각·이메일 정규화, 2단계 질문 대조와 식별자·중복·변경 요약 헬퍼를 추가했다.
- `tests/kano-offline-response.test.ts` — 파싱·대조·헬퍼와 뮤테이션 경계를 검증하는 102개 테스트를 추가했다.
- `stryker.crap.config.json` — `lib/kano-offline-response.ts`를 뮤테이션 대상에 추가했다.
- `docs/superpowers/plans/2026-09-04-kano-offline-html-survey.md` — Task 4 Step 0~3을 완료로 표시했다.
- `docs/superpowers/reports/2026-09-04-kano-offline-html-survey/task-4.md` — 이 결과 보고서를 추가했다.

## COMMIT

- Step 0 커밋은 `bde6bda1ac606767b9b0d27dfd999b7c4a0d65dc`(`fix: 다시 연 설문의 복사 폴백을 복원한다`)다.
- Task 4 본체 커밋은 `e4fc9481cf3db4dcbab21376050c3315200af7da`(`feat: 오프라인 Kano 응답을 검증하고 대조한다`)다.
- 보고서 커밋은 이 파일과 계획서 체크박스를 포함한다. 자기 자신의 해시는 본문에 넣을 수 없어 커밋 후 `git log`로 확인한다.
- 기준 커밋은 `847ac3e`이고 브랜치는 `claude/admin-account-password-recovery-o93xgy`다. push와 배포는 하지 않았다.

## VERIFIED BY

### Step 0 RED

`npx vitest run tests/kano-offline-survey.test.ts`.

```text
 Test Files  1 failed (1)
      Tests  1 failed | 19 passed (20)
   Duration  237ms (transform 54ms, setup 0ms, import 74ms, tests 20ms, environment 0ms)
```

새 복원 테스트만 실패했고 기존 19개 테스트는 통과했다.

### Step 0 GREEN

`npx vitest run tests/kano-offline-survey.test.ts`.

```text
 Test Files  1 passed (1)
      Tests  20 passed (20)
   Duration  501ms (transform 63ms, setup 0ms, import 85ms, tests 16ms, environment 0ms)
```

### Task 4 RED

`npx vitest run tests/kano-offline-response.test.ts`.

```text
 Test Files  1 failed (1)
      Tests  no tests
   Duration  191ms (transform 31ms, setup 0ms, import 0ms, tests 0ms, environment 0ms)
```

신규 `lib/kano-offline-response.ts`가 없어 import 단계에서 실패했다.

### Task 4 GREEN

`npx vitest run tests/kano-offline-response.test.ts`.

```text
 Test Files  1 passed (1)
      Tests  102 passed (102)
   Duration  260ms (transform 68ms, setup 0ms, import 95ms, tests 13ms, environment 0ms)
```

16개 실패 사유 각각의 독립 케이스와 문구 중복·삭제 답 선행 순서의 2단계 대조 회귀 케이스를 포함한다.

### 타입 검사

`npx tsc --noEmit`.

```text
(출력 없음, exit 0)
```

### 전체 테스트

`npx vitest run`.

```text
 Test Files  102 passed (102)
      Tests  1276 passed (1276)
   Duration  4.72s (transform 7.62s, setup 0ms, import 23.23s, tests 5.28s, environment 12ms)
```

### lint

`npx next lint`.

```text
✔ No ESLint warnings or errors
```

### 인코딩

`npm run check:encoding`.

```text
> kano-qfd-webapp@0.1.0 check:encoding
> node scripts/check-text-encoding.mjs

한글 인코딩 검사 통과.
```

### 뮤테이션 테스트

`npx stryker run stryker.crap.config.json --mutate lib/kano-offline-survey.ts`.

```text
All files               | 100.00 |  100.00 |       68 |         0 |          0 |        0 |        0 |
 kano-offline-survey.ts | 100.00 |  100.00 |       68 |         0 |          0 |        0 |        0 |
```

Step 0은 기존 `SCRIPT` 문자열의 동작만 보강했으며 Task 3의 CSS 제외 규칙과 최종 분모 68개는 변하지 않았다.

`npx stryker run stryker.crap.config.json --mutate lib/kano-offline-response.ts`.

```text
All files                 | 100.00 |  100.00 |      374 |         0 |          0 |        0 |        0 |
 kano-offline-response.ts | 100.00 |  100.00 |      374 |         0 |          0 |        0 |        0 |
```

등가 제외 전에는 총 384개 중 379개 제거, 5개 생존이었다. 빈 catch도 다음 `isRecord(undefined)`가 같은 `not-json`을 반환하는 `BlockStatement` 1개를 제외했다. `ANSWER_VALUES.has`가 비문자열을 엄격 비교로 이미 거부해 중복되는 타입 조건에는 `ConditionalExpression,LogicalOperator`를 제외했으며, 줄 단위 지시문이 생존 4개와 이미 제거되던 5개를 함께 빼서 이 위치의 분모가 9개 줄었다. 두 지시문으로 전체 분모는 384개에서 374개로 정확히 10개 줄었다.

## DEVIATIONS

기능 계약과 export 표면은 계획서 코드 블록과 같다. 등가 뮤턴트 제외를 위해 근거 주석 두 개를 추가했고, `BlockStatement` 지시문이 catch를 가리키도록 `} catch {`를 줄바꿈했지만 실행 의미는 바뀌지 않는다.

Step 0은 `DOMContentLoaded`에서 응답 섬의 trim된 텍스트를 한 번 읽어 `payloadBox.value`에 복원하고 `fallback.hidden = false`로 표시한다. 기존 상태 문구와 저장 클릭 경로는 바꾸지 않았다.

## RISKS

지침에 따라 브라우저에서 저장한 파일을 다시 열어 textarea와 폴백이 복원되는 실제 DOM 동작은 실행하지 않았고 렌더된 스크립트 문자열로만 검증했다. 이 브라우저 왕복은 감리자가 직접 확인한다.

원격 DB, dev 서버, 배포는 실행하지 않았다. Stryker 최종 실행은 exit 0이었지만 Windows에서 무시 대상 임시 sandbox 디렉터리 정리 경고를 출력했다.

## QUESTIONS

없음.
