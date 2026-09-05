# CRAP 위험 12건 상환 Implementation Plan

> **For agentic workers:** 이 계획서가 각 Task 의 정본이다. Step 은 체크박스(`- [ ]`)로 추적하고, 완료 시 `- [x]` 로 갱신해 코드와 함께 커밋한다.

**Goal:** `main` 의 CRAP 위험(>30) 함수 12건을 0으로 만들고, 그 뒤 측정 워크플로에 `push` 트리거를 더해 **게이트로 무장**한다. 지금은 계측기만 있고(수동 실행), 부채 때문에 자동화하지 못한 상태다.

**Architecture:** **새 테스트를 설계하는 작업이 아니라, 이미 검증된 테스트를 옮기는 작업이다.** 위험 12건은 미병합 브랜치 `claude/carp-inspection-46phhc` 가 테스트를 더해 이미 0으로 만들었고(그 브랜치의 CRAP 실행 #20 이 `--fail-over=30` 을 켠 채 성공했다), 그 테스트들만 병합되지 않았다. 위험한 lib 6개 파일은 `main` 과 그 브랜치에서 **바이트 단위로 동일**하므로 테스트가 그대로 붙는다. **lib 코드는 한 줄도 바꾸지 않는다** — 동작을 바꾸는 순간 이 작업은 포팅이 아니라 리팩터가 되고, 검증 근거가 사라진다.

**Tech Stack:** vitest (Prisma 전부 mock), `@vitest/coverage-v8`(로컬 검증 시 `--no-save` 설치), Stryker, GitHub Actions. **신규 의존성을 `package.json` 에 넣지 않는다.**

**Spec:** 측정 원본은 `docs/2026-09-05-crap-baseline.md`. 위험 12건의 목록·수치가 거기 있다.

## Global Constraints

- **원격 DB 절대 금지**: `prisma migrate deploy`/`db push`/`studio`, DB 에 쓰는 스크립트, **dev 서버 기동** 전부 금지. 이 계획은 스키마도 화면도 건드리지 않는다.
- **`lib/**` 를 수정하지 않는다.** 이번 작업의 산출물은 `tests/**` 뿐이다(+ Task 4 의 워크플로 한 줄). lib 을 고쳐야 위험이 사라진다고 판단되면 **중단·보고**하라.
- 키·비밀번호·이메일을 로그·응답 본문에 남기지 않는다(`lib/logger.ts` 규칙). 포팅하는 `tests/email-send.test.ts` 가 바로 그 규칙을 단언하는 테스트다 — 단언을 약화하지 마라.
- 들여쓰기 4칸, 주석은 한국어 "~다" 체로 **왜**를 적는다. 테스트는 `tests/` 평면 배치.
- 커밋 메시지는 한국어, 본문에 "왜". 트레일러 `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- 각 Task 완료 기준: `npx tsc --noEmit` + `npx vitest run` 전체 + `npx next lint` 통과.
- **브랜치**: `claude/ws-6-response-upload-ui-gcng04` 를 최신 `main` 에서 다시 시작한다(그 브랜치의 기존 이력은 이미 `main` 에 병합됐다). 기준 커밋 `3fc84a8`.

## 배경 — 감리자가 직접 확인한 사실 (재조사하지 마라)

- 분기점은 `a632555`(`docs: Task 3 결과 보고서`). **`main` 은 분기점 이후 아래 6개 테스트 파일을 한 줄도 고치지 않았다.** 따라서 브랜치 버전을 **통째로 가져오는 것이 곧 브랜치의 추가분을 적용하는 것**과 같고, `main` 의 것을 잃지 않는다.
- 위험 12건이 걸린 lib 6개는 `main` 과 브랜치가 동일하다: `google-forms.ts`, `workbook-importer.ts`, `excel-parser.ts`, `kano-algorithm.ts`, `email.ts`, `ai/prompts.ts`.
- 위험 함수 ↔ 포팅할 테스트의 대응(감리자가 좌표와 테스트 제목을 대조해 확인):

| 위험 | CRAP | 함수 / 위치 | 포팅할 테스트 |
| --- | ---: | --- | --- |
| 1 | 306.0 | Arrow function `lib/google-forms.ts:209` (`responsesData.responses.map(...)`) | `tests/google-forms.test.ts` (신규 251줄) |
| 2 | 90.0 | `createKanoForm` `lib/google-forms.ts:42` | 〃 |
| 3 | 90.0 | `getFormResponses` `lib/google-forms.ts:164` | 〃 |
| 4 | 132.0 | `parseQfdTechnicals` `lib/workbook-importer.ts:344` | `tests/workbook-importer.test.ts` (+79줄) |
| 5 | 132.0 | `parseTechRoadmap` `lib/workbook-importer.ts:434` | 〃 |
| 6 | 110.0 | `parseAssets` `lib/workbook-importer.ts:455` | 〃 |
| 7 | 110.0 | `parseFundingPlans` `lib/workbook-importer.ts:470` | 〃 |
| 8 | 72.0 | `parseFundingSources` `lib/workbook-importer.ts:491` | 〃 |
| 9 | 42.0 | `getCellValue` `lib/excel-parser.ts:109` | `tests/excel-parser.test.ts` (신규 45줄) |
| 10 | 56.0 | `translateKanoCategory` `lib/kano-algorithm.ts:95` | `tests/kano-algorithm.test.ts` (+13줄) |
| 11 | 42.0 | `sendSurveyInvitation` `lib/email.ts:68` | `tests/email-send.test.ts` (+64/−1줄) |
| 12 | 56.0 | `buildAttributeDraftPrompts` `lib/ai/prompts.ts:59` | `tests/ai-spec-draft.test.ts` (+37줄) |

- 신규 2개(`google-forms`, `excel-parser`)는 `main` 에 없으므로 충돌이 없고, `vitest` 와 대상 lib 만 import 한다(숨은 의존성 없음). `getCellValue`·`createKanoForm`·`getFormResponses` 는 `main` 에서 export 돼 있다. `parseQfdTechnicals` 등 5개는 **비공개 함수**라 공개 진입점을 통해 커버된다(테스트 제목 "QFD·로드맵·자산·자금 시트를 레코드로 옮긴다").
- **범위 밖**: 브랜치가 건드린 나머지 7개 테스트(`oauth-nonce`, `product-attributes-utils`, `import-cascade-guard`, `api-spec-save`, `api-worksheet-cascade`, `signup-prefill`, `unsaved-changes`)는 위험 12건과 무관하다. 특히 `oauth-nonce` 는 `main` 도 수정했고 lib 도 달라 충돌 가능하다. 손대지 마라.
- **뮤테이션 생존 15건도 범위 밖**이다(`import-cascade-guard` 88.9%, `invite-code` 90.3%, `import-json-schema` 92.3%). 전체 점수 98.47% 는 이번 작업으로 바뀌지 않아도 된다.
- Google Forms 연동은 화면·라우트에서 비활성(`lib/feature-flags.ts`)이지만 **`lib/google-forms.ts` 코드는 살아 있고 CRAP 은 그것을 센다.** lib 은 플래그를 모르므로 테스트에 플래그 mock 이 필요 없다.

## 설계 요약

### 포팅 방법 — 통째로 가져오기

`main` 이 손대지 않은 파일이므로, 브랜치 버전을 그대로 체크아웃하는 것이 정확하고 안전하다. 손으로 옮겨 적지 마라.

```sh
git fetch origin claude/carp-inspection-46phhc
git checkout origin/claude/carp-inspection-46phhc -- tests/google-forms.test.ts
```

가져온 뒤 **반드시** `npx vitest run <파일>` 로 `main` 의 코드에 대해 통과하는지 확인한다. 통과하지 않으면 lib 을 고치지 말고 **중단·보고**하라 — lib 이 동일하다는 전제가 깨진 것이므로 감리자가 다시 봐야 한다.

### 로컬에서 CRAP 재현하기

워크플로가 하는 일과 같다. 커버리지 provider 는 `package.json` 에 없으므로 `--no-save` 로 설치한다(lock 파일을 바꾸지 마라).

```sh
npm install --no-save "@vitest/coverage-v8@$(node -p "require('./node_modules/vitest/package.json').version")"
npx eslint lib --rule '{"complexity":["warn",{"max":0}]}' -f json -o eslint-complexity.json || true
npx vitest run --pool=threads --coverage.enabled --coverage.provider=v8 --coverage.reporter=json \
  --coverage.include='lib/**/*.ts' --coverage.reportsDirectory=coverage
node scripts/crap-report.mjs
```

`crap-report.md` 의 "위험 — CRAP > 30" 표가 판정 근거다. `--fail-over=30` 은 **붙이지 마라** — 중간 Task 에서는 아직 위험이 남아 있어 종료 코드가 1이 된다. 보고서에는 표를 그대로 옮긴다.

생성물은 **커밋하지 않는다.** `.gitignore` 를 감리자가 확인한 결과, `coverage`(7행)·`.stryker-tmp/`(80행)·`stryker-crap-report.json`(81행)은 이미 무시되지만 **`crap-report.md`·`crap-report.json`·`eslint-complexity.json` 세 개는 무시되지 않는다.** 이것을 더하는 것이 Task 1 Step 3 이다.

### 결정 사항

| # | 항목 | 결정 | 이유 |
| --- | --- | --- | --- |
| 1 | 접근법 | **포팅**(테스트 추가), lib 무변경 | 브랜치가 이미 12→0 을 달성했고 lib 이 동일하다. 새로 설계하면 검증된 결과를 버리고 위험을 다시 진다 |
| 2 | 가져오는 방식 | `git checkout <브랜치> -- <파일>` 로 통째로 | `main` 이 그 파일들을 손대지 않았으므로 통째로가 곧 추가분 적용이다. 손으로 옮기면 누락·오타가 생긴다 |
| 3 | Task 분할 기준 | **lib 파일별** | 각 Task 가 "위험 N건이 표에서 사라졌다"로 제3자 판정된다 |
| 4 | 범위 | 위험 12건만 | 나머지 브랜치 테스트 7개와 뮤테이션 생존 15건은 별개 부채다. 한 번에 묶으면 충돌 가능 파일(`oauth-nonce`)까지 끌고 들어온다 |
| 5 | 무장 시점 | 위험 0 확인 **후** Task 4 | 사용자 결정(2026-09-05): 부채를 갚을 때까지 계측기로만 둔다 |
| 6 | 임계값 | `--fail-over=30` 유지 | CRAP 원 논문 기준선이자 브랜치가 쓰던 값. 낮춰서 초록불을 만드는 것은 게이트 변조다 |
| 7 | 커버리지 provider | `--no-save` 설치 | 로컬·CI 검증에만 쓰는 도구를 런타임 의존성 목록에 넣지 않는다 |

### 파일 지도

- Task 1: `tests/google-forms.test.ts`(신규), `.gitignore`(필요 시)
- Task 2: `tests/workbook-importer.test.ts`(교체)
- Task 3: `tests/excel-parser.test.ts`(신규), `tests/kano-algorithm.test.ts`·`tests/email-send.test.ts`·`tests/ai-spec-draft.test.ts`(교체)
- Task 4: `.github/workflows/crap.yml`, `docs/2026-09-05-crap-baseline.md`

Task 1·2·3 은 서로 독립이다. Task 4 는 셋 다 끝난 뒤에만 한다.

---

### Task 1: Google Forms — 위험 3건 (306.0 / 90.0 / 90.0)

**Files:** Create `tests/google-forms.test.ts` · Modify `.gitignore`(필요 시)

- [x] **Step 1: 테스트를 가져온다**

```sh
git checkout origin/claude/carp-inspection-46phhc -- tests/google-forms.test.ts
npx vitest run tests/google-forms.test.ts
```

`describe` 는 `createKanoForm` 과 `getFormResponses` 둘이고 `it` 은 8개다. `fetch` 를 mock 하므로 네트워크에 나가지 않는다.

- [x] **Step 2: CRAP 을 재현해 위험 3건이 사라졌는지 본다**

"로컬에서 CRAP 재현하기" 절의 4줄을 실행하고 `crap-report.md` 의 위험 표를 확인한다. `lib/google-forms.ts` 행 3개가 사라져 **위험이 12 → 9** 가 되어야 한다.

- [x] **Step 3: 측정 생성물이 커밋되지 않게 한다**

`git status` 에 `coverage/`·`eslint-complexity.json`·`crap-report.md`·`crap-report.json` 이 보이면 `.gitignore` 에 더한다. 이미 무시되고 있으면 `.gitignore` 를 고치지 마라.

**완료 판정**
1. 게이트 3종 그린 — 각 명령의 출력 마지막 줄 원문.
2. `npx vitest run tests/google-forms.test.ts` 가 8개 통과 — 출력 원문.
3. CRAP 위험 표에 `lib/google-forms.ts` 가 없고 총 위험 수가 9 다 — 표를 보고서에 그대로 옮긴다.
4. `git diff --stat` 에 `lib/` 변경이 **없다**.
5. `git status` 가 깨끗하다(측정 생성물이 남지 않았다).

---

### Task 2: 워크북 임포터 — 위험 5건 (132.0 ×2 / 110.0 ×2 / 72.0)

**Files:** Modify `tests/workbook-importer.test.ts`

- [ ] **Step 1: 테스트를 가져온다**

```sh
git checkout origin/claude/carp-inspection-46phhc -- tests/workbook-importer.test.ts
npx vitest run tests/workbook-importer.test.ts
```

`main` 이 이 파일을 분기점 이후 고치지 않았으므로 통째로 가져와도 기존 `it` 이 사라지지 않는다. 감리자가 미리 센 값은 **`main` 11개 → 브랜치 12개**다. `grep -c "it(" tests/workbook-importer.test.ts` 가 12 가 아니면 전제가 깨진 것이니 중단·보고하라.

추가되는 것은 `it('QFD·로드맵·자산·자금 시트를 레코드로 옮긴다')` 한 개다. 대상 5개 함수는 비공개이므로 공개 진입점을 통해 커버된다.

- [ ] **Step 2: CRAP 재현 — `lib/workbook-importer.ts` 행 5개가 사라져야 한다**

**완료 판정**
1. 게이트 3종 그린 — 출력 마지막 줄 원문.
2. `grep -c "it(" tests/workbook-importer.test.ts` 가 **12** 다(가져오기 전 11).
3. CRAP 위험 표에 `lib/workbook-importer.ts` 가 없다 — 표를 보고서에.
4. `git diff --stat` 에 `lib/` 변경이 없다.

---

### Task 3: 나머지 4건 (56.0 / 56.0 / 42.0 / 42.0)

**Files:** Create `tests/excel-parser.test.ts` · Modify `tests/kano-algorithm.test.ts`, `tests/email-send.test.ts`, `tests/ai-spec-draft.test.ts`

- [ ] **Step 1: 네 파일을 가져온다**

```sh
git checkout origin/claude/carp-inspection-46phhc -- \
  tests/excel-parser.test.ts tests/kano-algorithm.test.ts \
  tests/email-send.test.ts tests/ai-spec-draft.test.ts
npx vitest run tests/excel-parser.test.ts tests/kano-algorithm.test.ts tests/email-send.test.ts tests/ai-spec-draft.test.ts
```

교체되는 3개 파일의 `it` 개수는 감리자가 미리 셌다. 가져온 뒤 `grep -c "it(" <파일>` 이 아래 오른쪽 값과 다르면 중단·보고하라.

| 파일 | 가져오기 전(`main`) | 가져온 뒤(기대값) |
| --- | ---: | ---: |
| `tests/kano-algorithm.test.ts` | 10 | **11** |
| `tests/email-send.test.ts` | 3 | **6** |
| `tests/ai-spec-draft.test.ts` | 17 | **19** |

`tests/email-send.test.ts` 의 추가분은 `sendSurveyInvitation` 이 프로젝트 이름의 마크업을 이스케이프하고, SMTP 미설정·발송 거부 시 **수신자와 설문 링크를 로그에 남기지 않는지**를 단언한다. CLAUDE.md 의 개인정보 규칙을 지키는 테스트이니 단언을 약화하지 마라.

- [ ] **Step 2: CRAP 재현 — 위험 표가 비고 총 위험 수가 0 이어야 한다**

이 시점에 `node scripts/crap-report.mjs --fail-over=30` 을 붙여 실행해 **종료 코드 0** 을 확인한다(앞 Task 와 달리 여기서는 붙인다).

**완료 판정**
1. 게이트 3종 그린 — 출력 마지막 줄 원문.
2. 교체한 3개 파일의 `it` 개수가 각각 11 / 6 / 19 다(Step 1 의 표).
3. `node scripts/crap-report.mjs --fail-over=30` 종료 코드 0, "CRAP > 30 (위험) | 0" — 요약 표를 보고서에.
4. `npx vitest run` 전체 테스트 수가 기준(1,206)보다 **늘었고** 줄지 않았다 — 숫자를 보고한다.
5. `git diff --stat` 에 `lib/` 변경이 없다.

---

### Task 4: 게이트 무장 — `push` 트리거

**Files:** Modify `.github/workflows/crap.yml`, `docs/2026-09-05-crap-baseline.md`

**Task 1~3 이 모두 승인된 뒤에만 착수한다.** 위험이 0 이 아닌 상태에서 무장하면 `main` 이 붉게 선다.

- [ ] **Step 1: 트리거를 더한다**

```yaml
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  workflow_dispatch:
```

기존 주석(D-3 결정) 아래에 이유를 한 줄 더한다 — 이 저장소는 PR 없이 `main` 에 직접 커밋하므로(CLAUDE.md "단일 브랜치에 연속 커밋") `pull_request` 트리거만으로는 이 워크플로가 돌지 않는다. 별도 워크플로라 `ci.yml` 과 병렬로 돌아 푸시를 늦추지 않으므로 D-3 의 근거와 충돌하지 않는다.

- [ ] **Step 2: 기준선 문서를 갱신한다**

`docs/2026-09-05-crap-baseline.md` 의 "현재 운용 방식과 남은 결정" 절을 상환 후 상태로 고친다 — 위험 0, `push` 트리거로 무장됨, 상환에 쓴 Task 와 커밋.

**완료 판정**
1. 게이트 3종 그린.
2. 푸시 후 CRAP 워크플로가 `push` 로 자동 실행되어 **성공**한다 — run URL 과 결론을 보고서에.
3. `docs/2026-09-05-crap-baseline.md` 가 상환 후 상태를 반영한다.

---

## 감리 검증 계획 (감리자용)

원격 세션은 `npm ci` 가 403 으로 막혀 게이트를 직접 돌릴 수 없다. 그러나 **이번 계획은 CRAP 워크플로 덕분에 감리자가 직접 판정할 수 있다.**

| 단계 | 누가 | 무엇 |
| --- | --- | --- |
| 경계 확인 | 감리자(원격) | diff 가 `tests/**` 에 국한되는지, `lib/**` 변경이 0 인지, 기존 `it` 이 사라지지 않았는지 |
| 표본 대조 | 감리자(원격) | 가져온 파일이 브랜치 원본과 동일한지 `git diff origin/claude/carp-inspection-46phhc -- <파일>` 로 확인(빈 출력이어야 한다) |
| **CRAP 재측정** | **감리자(원격)** | Task 마다 GitHub Actions 에서 "CRAP / Mutation" 을 해당 커밋 기준으로 **수동 실행**하고 위험 수 감소를 로그에서 직접 읽는다 — 실행 AI 보고에 의존하지 않는다 |
| 게이트 재실행 | CI | `main` 병합 시 `ci.yml` 이 lint·tsc·test·build 를 돌린다 |
| 뮤테이션 회귀 | **감리자(원격)** | 같은 CRAP 실행의 뮤테이션 표에서 전체 점수가 98.47% 아래로 떨어지지 않았는지 확인 |
