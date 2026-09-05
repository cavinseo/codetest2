# Task 2 결과 보고서

## RESULT

PASS. 원격 검증 브랜치의 `tests/workbook-importer.test.ts`를 편집 없이 포팅했다. 개별 테스트 12개와 전체 106파일·1,217개 테스트가 통과했고, CRAP 위험 표에서 `lib/workbook-importer.ts`의 5건이 사라져 전체 위험이 9건에서 4건으로 줄었다. 제품 코드와 금지 경로는 변경하지 않았다.

## FILES CHANGED

- `tests/workbook-importer.test.ts`에 원격 검증본의 단일 특성화 테스트 79줄을 그대로 포팅했다.
- `docs/superpowers/plans/2026-09-05-crap-debt-paydown.md`의 Task 2 Step 1~2를 완료 처리했다.
- `docs/superpowers/reports/2026-09-05-crap-debt-paydown/task-2.md`에 검증 결과와 잔여 위험을 기록했다.

## COMMIT

- 기준 병합 커밋은 `b45b147`이다.
- 작업 커밋은 `5278cf4 test: 워크북 임포터 CRAP 테스트를 포팅한다`이다.
- 보고서 커밋은 이 문서만 추가하는 `docs: Task 2 결과 보고서`이며, 커밋 자체의 최종 해시는 본문에 선기록할 수 없어 채팅 완료 보고에 적는다.

## VERIFIED BY

### 기준 브랜치 병합

```text
git fetch origin
git checkout claude/ws-6-response-upload-ui-gcng04
git merge origin/main
Auto-merging docs/superpowers/plans/2026-09-05-crap-debt-paydown.md
Merge made by the 'ort' strategy.
 docs/superpowers/plans/2026-09-05-crap-debt-paydown.md | 8 +++++++-
```

- 충돌 없이 `origin/main`을 병합했고 병합 커밋은 `b45b147`이다.

### 원격 원본 대조와 개수

```text
git show b45b147:tests/workbook-importer.test.ts | grep -c "it("
11

grep -c "it(" tests/workbook-importer.test.ts
12

git diff origin/claude/carp-inspection-46phhc -- tests/workbook-importer.test.ts
(출력 없음, exit code 0)
```

- 포팅한 테스트 파일은 원격 원본과 동일하다.

### 개별 테스트

```text
npx vitest run tests/workbook-importer.test.ts
Test Files  1 passed (1)
Tests  12 passed (12)
Duration  366ms (transform 50ms, setup 0ms, import 66ms, tests 9ms, environment 0ms)
```

### CRAP 재현

```text
npm install --no-save "@vitest/coverage-v8@$(node -p "require('./node_modules/vitest/package.json').version")"
up to date, audited 664 packages in 3s
```

- 설치 뒤 `package.json`과 `package-lock.json` diff는 비어 있다.

```text
npx eslint lib --rule '{"complexity":["warn",{"max":0}]}' -f json -o eslint-complexity.json || true
(출력 없음, exit code 0)
```

```text
npx vitest run --pool=threads --coverage.enabled --coverage.provider=v8 --coverage.reporter=json --coverage.include='lib/**/*.ts' --coverage.reportsDirectory=coverage
Test Files  106 passed (106)
Tests  1217 passed (1217)
Duration  4.22s (transform 5.80s, setup 0ms, import 19.67s, tests 7.80s, environment 15ms)
```

```text
node scripts/crap-report.mjs
| 지표 | 값 |
| --- | --- |
| 측정 함수 | 682 |
| 커버리지 100% 함수 | 545 (80%) |
| CRAP > 30 (위험) | 4 |
| 15 < CRAP ≤ 30 (주의) | 17 |
| 최대 CRAP | 56.0 |

### 위험 — CRAP > 30

| CRAP | 복잡도 | 커버리지 | 문장 | 함수 | 위치 |
| ---: | ---: | ---: | ---: | --- | --- |
| 56.0 | 7 | 0% | 0/1 | Function 'buildAttributeDraftPrompts' | `lib/ai/prompts.ts:59` |
| 56.0 | 7 | 0% | 0/8 | Function 'translateKanoCategory' | `lib/kano-algorithm.ts:95` |
| 42.0 | 6 | 0% | 0/14 | Async function 'sendSurveyInvitation' | `lib/email.ts:68` |
| 42.0 | 6 | 0% | 0/8 | Function 'getCellValue' | `lib/excel-parser.ts:109` |
```

- 위험 표에는 `lib/workbook-importer.ts` 행이 없다.

### 전체 게이트

```text
npx tsc --noEmit
(stdout/stderr 출력 없음, exit code 0)
```

```text
npx vitest run
Test Files  106 passed (106)
Tests  1217 passed (1217)
Duration  4.61s (transform 7.65s, setup 0ms, import 23.73s, tests 5.35s, environment 14ms)
```

```text
npx next lint
✔ No ESLint warnings or errors
```

### 변경 범위

```text
git diff origin/main HEAD -- lib app components
(출력 없음, exit code 0)
```

- `package.json`, `package-lock.json`, `.gitignore`, Stryker 설정, 워크플로, 환경·Prisma 파일과 `tests/google-forms.test.ts`의 변경은 없다.
- 세 관점의 독립 검토에서 포팅 자체의 수용기준 위반은 발견되지 않았다.

## DEVIATIONS

- 첫 번째 커버리지 provider 설치 시 샌드박스 네트워크·캐시 권한으로 `EACCES`가 발생했다. 권한 승인 뒤 같은 `--no-save` 명령이 성공했고 패키지 파일은 바뀌지 않았다.
- 작업자 검증에서는 전체 테스트와 커버리지 JSON 생성 뒤 예고된 `coverage/.tmp` `EBUSY`가 한 번 발생했다. 주 작업자의 동일 명령 재검증은 EBUSY 없이 종료 코드 0으로 통과했고 CRAP 결과는 두 실행 모두 위험 4건으로 같았다.
- 독립 검토가 제안한 추가 경계조건 테스트는 기존 파서의 별도 테스트 설계에 해당한다. 이번 Task의 원격 검증본 무편집 포팅 계약에 따라 추가하거나 수정하지 않았다.

## RISKS

- Dropbox 동기화 환경에서는 `coverage/.tmp` 정리 시 간헐적인 `EBUSY`가 다시 발생할 수 있다. 생성된 커버리지와 CRAP 결과의 유효성에는 영향이 없었다.
- `npm install --no-save`가 기존 의존성 취약점 15건을 보고했다. 이 Task는 패키지 변경을 금지하므로 수정하지 않았다.
- Task 1 시작 전 사용자 워크시트 변경은 `stash@{0}`에 보관돼 있으며 아직 복원하지 않았다.

## QUESTIONS

- 없다.
