# Task 1 결과 보고서

## RESULT

PASS. 검증 브랜치의 `tests/google-forms.test.ts`를 편집 없이 포팅했다. 개별 테스트 10개와 전체 106파일·1,216개 테스트가 통과했고, CRAP 위험 표에서 `lib/google-forms.ts`의 3건이 사라져 전체 위험이 12건에서 9건으로 줄었다. `lib/**`, `app/**`, `components/**`와 패키지 파일은 변경하지 않았다.

## FILES CHANGED

- `tests/google-forms.test.ts`를 원격 검증 브랜치에서 251줄 그대로 가져왔다.
- `.gitignore` 끝에 저장소 루트의 CRAP·ESLint 로컬 측정 생성물 3개를 무시하는 규칙과 이유 주석을 추가했다.
- `docs/superpowers/plans/2026-09-05-crap-debt-paydown.md`의 Task 1 Step 1~3을 완료 처리했다.
- `docs/superpowers/reports/2026-09-05-crap-debt-paydown/task-1.md`에 검증 원문과 잔여 위험을 기록했다.

## COMMIT

- 작업 커밋은 `e6067b6 test: Google Forms CRAP 테스트를 포팅한다`이다.
- 보고서 커밋은 이 문서만 추가하는 두 번째 커밋 `docs: Task 1 결과 보고서`이며, 커밋 자체의 최종 해시는 본문에 선기록할 수 없어 채팅 완료 보고에 적는다.

## VERIFIED BY

### 브랜치 기준

- 사용자 워크시트 변경은 `stash@{0}`에 보관한 뒤 작업 트리를 정리했다.
- `git fetch origin main` 뒤 작업 브랜치를 `origin/main`에서 다시 시작했고 기준 커밋을 확인했다.

```text
git rev-parse --short HEAD
bf0aabf
```

### 원격 원본 대조

```text
git diff origin/claude/carp-inspection-46phhc -- tests/google-forms.test.ts
(출력 없음, exit code 0)
```

- 포팅한 테스트 파일은 원격 원본과 동일하다.

### 개별 테스트

```text
npx vitest run tests/google-forms.test.ts
Test Files  1 passed (1)
Tests  10 passed (10)
Duration  315ms (transform 32ms, setup 0ms, import 45ms, tests 9ms, environment 0ms)
```

### CRAP 재현

- 계획서의 첫 번째 명령으로 Vitest 버전과 같은 커버리지 provider를 `--no-save` 설치했다.

```text
npm install --no-save "@vitest/coverage-v8@$(node -p "require('./node_modules/vitest/package.json').version")"
added 14 packages, and audited 664 packages in 6s

195 packages are looking for funding
  run `npm fund` for details

15 vulnerabilities (1 low, 5 moderate, 9 high)

To address issues that do not require attention, run:
  npm audit fix

To address all issues (including breaking changes), run:
  npm audit fix --force

Run `npm audit` for details.
```

- `package-lock.json`의 설치 전후 SHA-256은 같았고 패키지 파일 diff는 비어 있다.

```text
6BD1684627EF90FCCD166F012A617C6A528441CFE49B8E8E0A2F2697311D6418
```

- 두 번째 명령은 출력 없이 종료 코드 0이었다.

```text
npx eslint lib --rule '{"complexity":["warn",{"max":0}]}' -f json -o eslint-complexity.json || true
(출력 없음, exit code 0)
```

- 세 번째 명령은 모든 테스트와 커버리지 JSON 생성을 끝냈지만 Dropbox가 임시 폴더 삭제를 잠가 종료 코드 1이었다. 같은 오류가 두 번 재현됐다.

```text
npx vitest run --pool=threads --coverage.enabled --coverage.provider=v8 --coverage.reporter=json --coverage.include='lib/**/*.ts' --coverage.reportsDirectory=coverage
Test Files  106 passed (106)
Tests  1216 passed (1216)
Duration  4.05s (transform 6.42s, setup 0ms, import 19.39s, tests 7.82s, environment 16ms)

Error: EBUSY: resource busy or locked, rmdir 'E:\Dropbox\codetest2\coverage\.tmp'
Serialized Error: { errno: -4082, code: 'EBUSY', syscall: 'rmdir', path: 'E:\Dropbox\codetest2\coverage\.tmp' }
```

- `coverage/coverage-final.json`은 770,627바이트로 생성됐고 네 번째 명령은 이를 읽어 종료 코드 0으로 보고서를 만들었다.

```text
node scripts/crap-report.mjs
| 지표 | 값 |
| --- | --- |
| 측정 함수 | 682 |
| 커버리지 100% 함수 | 540 (79%) |
| CRAP > 30 (위험) | 9 |
| 15 < CRAP ≤ 30 (주의) | 18 |
| 최대 CRAP | 132.0 |

### 위험 — CRAP > 30

| CRAP | 복잡도 | 커버리지 | 문장 | 함수 | 위치 |
| ---: | ---: | ---: | ---: | --- | --- |
| 132.0 | 11 | 0% | 0/13 | Function 'parseQfdTechnicals' | `lib/workbook-importer.ts:344` |
| 132.0 | 11 | 0% | 0/19 | Function 'parseTechRoadmap' | `lib/workbook-importer.ts:434` |
| 110.0 | 10 | 0% | 0/15 | Function 'parseAssets' | `lib/workbook-importer.ts:455` |
| 110.0 | 10 | 0% | 0/13 | Function 'parseFundingPlans' | `lib/workbook-importer.ts:470` |
| 72.0 | 8 | 0% | 0/11 | Function 'parseFundingSources' | `lib/workbook-importer.ts:491` |
| 56.0 | 7 | 0% | 0/1 | Function 'buildAttributeDraftPrompts' | `lib/ai/prompts.ts:59` |
| 56.0 | 7 | 0% | 0/8 | Function 'translateKanoCategory' | `lib/kano-algorithm.ts:95` |
| 42.0 | 6 | 0% | 0/14 | Async function 'sendSurveyInvitation' | `lib/email.ts:68` |
| 42.0 | 6 | 0% | 0/8 | Function 'getCellValue' | `lib/excel-parser.ts:109` |
```

- 위험 표에는 `lib/google-forms.ts` 행이 없다. 해당 화살표 함수는 커버리지 100%, CRAP 17.0의 주의 항목으로 내려갔다.

### 전체 게이트

```text
npx tsc --noEmit
(stdout/stderr 출력 없음, exit code 0)
```

```text
npx vitest run
Test Files  106 passed (106)
Tests  1216 passed (1216)
Duration  3.94s (transform 7.14s, setup 0ms, import 21.30s, tests 5.56s, environment 13ms)
```

```text
npx next lint
✔ No ESLint warnings or errors
```

### 변경 범위와 생성물

```text
git diff --stat bf0aabf HEAD -- lib app components
(출력 없음, exit code 0)
```

- `git check-ignore -v`로 `/crap-report.md`, `/crap-report.json`, `/eslint-complexity.json`, `coverage/coverage-final.json`이 모두 무시됨을 확인했다.
- 독립 검토에서 무시 규칙이 하위 경로의 동명 문서까지 숨길 수 있다는 지적을 반영해 세 신규 규칙을 저장소 루트에 한정했다.

## DEVIATIONS

- 계획서 Task 1 본문은 `it` 8개라고 적혀 있지만, 원격 원본은 10개이며 사용자 확정 계약도 10개다. 원본을 편집하지 않는 계약에 따라 10개를 그대로 포팅하고 실제 통과 수를 보고했다.
- 커버리지 Vitest는 테스트와 JSON 생성을 완료한 뒤 Dropbox의 `coverage/.tmp` 삭제 잠금으로 종료 코드 1이었다. 측정 파일을 읽은 CRAP 보고서 명령은 종료 코드 0이었고 위험 수는 계약값 9였다.
- 커버리지 provider 최초 설치는 샌드박스 네트워크 제한으로 실패했으며 권한 승인 후 같은 `--no-save` 명령이 성공했다. package.json과 lock 파일은 바뀌지 않았다.
- 원격 테스트 원본의 내용·단언·주석은 독립 검토 제안이 있어도 편집 금지 계약에 따라 변경하지 않았다.

## RISKS

- Dropbox 동기화가 `coverage/.tmp` 후처리를 잠그므로 같은 위치에서 커버리지 명령의 종료 코드 0을 얻지 못할 수 있다. CRAP 판정 산출물은 정상 생성됐지만 환경 잠금은 남아 있다.
- `npm install --no-save`가 보고한 기존 의존성 취약점은 15건이다. 이 Task는 패키지 변경을 금지하므로 수정하지 않았다.
- Task 시작 전 사용자 워크시트 변경은 `stash@{0}`에 보관돼 있으며 최종 작업 트리를 깨끗하게 유지하기 위해 아직 복원하지 않았다.

## QUESTIONS

- 없다.
