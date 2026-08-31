# CRAP·뮤테이션 점검 조치 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 점검 보고서(`docs/2026-08-27-crap-mutation-report.md`)가 찾은 실질 결함 1건과
CRAP 위험 12건(전부 커버리지 0%)을 제거하고, 뮤테이션 게이트가 실제로 기동하도록
측정 체계를 복구한다.

**Architecture:** 새 도구도 새 추상화도 만들지 않는다. 이 저장소에는 이미
`tests/workbook-importer.test.ts` 의 `sheet()`·`workbook()` 픽스처 헬퍼,
`vi.mock('../lib/prisma')` 관례, 그리고 이번에 만들어진 `scripts/crap-report.mjs` +
`.github/workflows/crap.yml` 측정 장치가 있다. **각 Task 는 기존 테스트 파일에 케이스를
더하는 방식**으로 진행하며, 테스트를 위해 `lib` 의 private 함수를 export 로 열지 않는다.
`workbook-importer.ts` 의 파서 5종은 전부 module-private 이므로 공개 진입점
`parseWorkbookImport()` 에 시트 픽스처를 먹여서 덮는다.

**Tech Stack:** Next.js 15 App Router, React 19, Prisma 6.19 (PostgreSQL),
TypeScript 5 strict, Vitest 4, StrykerJS 10, zod 3

## Global Constraints

- **⚠️ `.env` 의 `POSTGRES_PRISMA_URL` 은 실데이터가 있는 원격 Supabase 다.**
  `prisma migrate deploy`/`db push`/`studio`, DB 에 쓰는 스크립트, **dev 서버 기동**을
  절대 하지 않는다. 이 계획의 모든 Task 는 테스트·설정 변경뿐이라 DB 접근이 없다.
- 새 소스 파일 첫 줄에 파일 역할을 설명하는 **한국어 한 줄 주석**을 둔다 (AGENTS.md).
  `*.config.*` 는 예외.
- 한국어 문장은 마침표·물음표·느낌표로 끝내고 콜론으로 끝내지 않는다.
- 들여쓰기 4칸. 주석은 "무엇"이 아니라 **"왜"** 를 적는다.
- 테스트는 `tests/` 평면 배치. 파일명은 기존 관례를 따른다.
- 요청과 직접 관련된 파일과 줄만 수정한다. 주변 코드·주석·포맷을 임의로 정리하지 않는다.
- **기준선:** Task 1 착수 전 `npx vitest run` 통과 수를 재서 Task 1 보고서에 적는다.
  이후 모든 Task 에서 이 수는 **늘어나기만** 해야 한다.
- 각 Task 완료 게이트: `npx tsc --noEmit && npx vitest run && npx next lint`
- 커밋 메시지는 한국어, 본문에 "왜"를 적는다.
  트레일러: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
- 보고서는 `docs/superpowers/reports/2026-08-27-crap-remediation/task-<식별자>.md` 에
  **작업 커밋과 별도의 둘째 커밋**으로 남긴다.

## 재측정 방법

로컬 npm 레지스트리가 조직 egress 정책으로 차단된 환경에서는 `claude/**` 브랜치에
push 하면 `.github/workflows/crap.yml` 이 자동 실행된다. npm 접근이 가능한 환경이라면
보고서 부록의 명령을 그대로 쓴다. **뮤테이션은 Node >= 22 가 필요하다.**

## 사용자 판단이 필요한 것 (코드로 대신할 수 없음)

### D-1. 표시 문자열 상수의 뮤테이션 정책

생존 뮤턴트 34건 중 **17건이 사용자에게 노출되는 문구 상수**다
(`MEMBER_AI_MODE_LABELS`·`MEMBER_AI_MODE_DESCRIPTIONS`·`INVITE_CODE_MESSAGES` 등).
`lib/ai/personal-vendors.ts` 는 생존 10건이 **전부** 이 부류라 68.8% 에 묶여 있고,
현 상태로는 CLAUDE.md 가 신규 순수 모듈에 요구하는 **뮤테이션 100% 를 이 파일에서
달성할 방법이 없다.** 둘 중 하나를 골라야 한다.

- **(가) 문구를 단언한다** — 문구가 바뀔 때마다 테스트도 고쳐야 한다. 문구가 제품
  사양인 경우(법적 고지, 결제 안내 등)에 맞는 선택이다.
- **(나) 문구 상수를 뮤테이션에서 제외한다** — `// Stryker disable next-line all`
  주석을 상수 맵 위에 둔다. 문구는 화면에서 눈으로 검수한다는 전제다.

**권고는 (나)다.** 이 저장소의 문구는 UX 카피이지 계약이 아니고, (가)를 택하면
카피 수정마다 테스트가 깨져 실질적 방어력 없이 마찰만 늘어난다. 다만 이 결정은
Task 6 의 전제이므로 착수 전에 확정해야 한다.

### D-2. 복잡도 자체가 신호인 함수의 분해 여부

아래 셋은 **커버리지가 이미 높은데도** CRAP 목록에 있다. CRAP 의 하한이 복잡도
그 자체이기 때문이라, 테스트 추가로는 점수가 내려가지 않는다. 분해가 답이지만
동작 변경 위험이 있어 이 계획에 넣지 않는다.

| 함수 | 복잡도 | 커버리지 | CRAP |
| --- | ---: | ---: | ---: |
| `lib/workbook-importer.ts:263` `parseSpec` | 25 | 90% | 25.7 |
| `lib/spec-ai-agent.ts:138` `normalizeContext` | 22 | 100% | 22.0 |
| `lib/ai/personal-store.ts:57` `upsertPersonalConnection` | 17 | 100% | 17.0 |

### D-3. CRAP 을 상시 게이트로 올릴지

지금은 `claude/**` 브랜치에서만 측정된다. `ci.yml` 에 합쳐 상시 게이트로 만들면
회귀를 막을 수 있지만 CI 시간이 늘어난다(뮤테이션 약 2분, 커버리지 약 1분). Task 8 참조.

---

## Phase 1 — 즉시 (저비용·고위험)

## Task 1: 캐스케이드 경고의 벤치마크 분기 단언

**보고서 §2(A). 이번 점검에서 나온 유일한 실질 결함이다.**

`hasCascadeImpact` 는 고객요구사항을 replace 로 덮어쓸 때 함께 지워질 데이터를
사용자에게 경고할지 정하는 판단이다. 뮤테이션이 `impact.benchmarks > 0` 을 `false` 로
바꿔도 테스트가 전부 통과했다 — 기존 테스트가 `kanoResponses` 와 `qfdMatrices` 만
확인하고 벤치마크 단독 케이스를 빠뜨렸기 때문이다. 이 항이 망가지면 **벤치마크만 있는
프로젝트는 "삭제될 데이터 없음"으로 판정돼 확인 절차 없이 덮어써진다.** 종합검진
H-3·H-4 가 세운 방어가 무증상으로 뚫리는 경로다.

**Files:**
- Modify: `tests/import-cascade-guard.test.ts` (`hasCascadeImpact` describe 블록)
- Modify 없음: `lib/import-cascade-guard.ts` 는 **고치지 않는다.** 코드는 정상이고
  빠진 것은 단언이다.

- [ ] **Step 1: 기준선 기록**

```sh
npx vitest run
```

통과 수와 파일 수를 Task 1 보고서 VERIFIED BY 에 적는다. 이후 Task 의 기준선이 된다.

- [ ] **Step 2: 벤치마크 단독 케이스 추가**

`tests/import-cascade-guard.test.ts` 의 `it('하나라도 0 이 아니면 true', ...)` 안에
한 줄을 더한다. 세 항 모두 독립적으로 true 를 만들어야 뮤테이션이 죽는다.

```typescript
        // 벤치마크만 있는 프로젝트가 "삭제될 데이터 없음"으로 판정되면 확인 절차
        // 없이 덮어써진다. 세 항을 각각 단독으로 확인해야 이 분기가 지켜진다.
        expect(hasCascadeImpact({ kanoResponses: 0, benchmarks: 3, qfdMatrices: 0 })).toBe(true);
```

- [ ] **Step 3: 뮤턴트가 죽었는지 확인** *(Node >= 22 필요)*

```sh
npx stryker run stryker.crap.config.json --mutate lib/import-cascade-guard.ts
```

Expected: `lib/import-cascade-guard.ts:34` 의 `ConditionalExpression` 생존이 사라진다.
`:50`·`:51` 의 `ObjectLiteral` 4건은 **남는다** — mock 흡수라 Task 6 에서 다룬다.
Node 20 환경이면 이 Step 을 건너뛰고 보고서 DEVIATIONS 에 사유를 적는다.

**Verification:** 게이트 통과 + 위 뮤턴트 소멸.

---

## Task 2: Node 버전 정렬 — 뮤테이션 게이트 복구

**보고서 §3-1.** StrykerJS 10 은 Node >= 22 를 요구하는데 `ci.yml` 은 20 이다. 실제로
측정 첫 시도가 `Error: Node.js version v20.20.2 detected. StrykerJS requires version to
match >=22.0.0` 로 즉사했다. 즉 **`npm run test:mutation` 은 프로젝트가 명시한 CI
환경에서 한 번도 실행될 수 없었고**, CLAUDE.md 가 신규 순수 모듈에 요구하는 뮤테이션
게이트도 그 환경에서는 성립하지 않는다.

**Files:**
- Modify: `.github/workflows/ci.yml` (`node-version: 20` → `22`)
- Modify: `package.json` (`engines` 추가)

- [ ] **Step 1: CI Node 버전 상향**

`.github/workflows/ci.yml` 의 `actions/setup-node` 블록을 고친다.

```yaml
      - uses: actions/setup-node@v4
        with:
          # StrykerJS 10 이 Node >= 22 를 요구한다. 20 이면 뮤테이션이 기동조차 못 한다.
          node-version: 22
          cache: npm
```

- [ ] **Step 2: engines 명시**

`package.json` 에 최상위 필드를 더한다. 로컬에서 Node 20 을 쓰면 `npm install` 이
경고하도록 만들어, 같은 사고가 조용히 반복되지 않게 한다.

```json
    "engines": {
        "node": ">=22"
    },
```

- [ ] **Step 3: 로컬 게이트 재확인**

```sh
npx tsc --noEmit && npx vitest run && npx next lint
```

Expected: Node 22 에서 전부 통과. 통과 수는 Task 1 기준선과 같아야 한다.

**Verification:** 게이트 통과 + CI 가 Node 22 로 green.

**주의:** `next` 15 와 `prisma` 6 은 Node 22 를 지원한다. 그래도 Step 3 에서 build 까지
확인하고 싶다면 `npm run build` 는 DB 에 접속하지 않으므로 안전하다.

---

## Phase 2 — CRAP 0% 구역 제거

> 위험 12건은 **전부 커버리지 0%** 다. Phase 2 는 그중 11건을 덮는다. 나머지 1건
> (`lib/ai/prompts.ts:59`)은 Task 5 에서 판단한다.

## Task 3: workbook-importer 미테스트 파서 5종

**CRAP 위험 12건 중 5건이 여기 몰려 있다.**

| CRAP | 함수 | 시트 별칭 |
| ---: | --- | --- |
| 132.0 | `parseQfdTechnicals` (`:344`) | `QFD` |
| 132.0 | `parseTechRoadmap` (`:434`) | `향후목표고객LIST` |
| 110.0 | `parseAssets` (`:455`) | `핵심자산과 보완자산표` |
| 110.0 | `parseFundingPlans` (`:470`) | `자금소요계획표` |
| 72.0 | `parseFundingSources` (`:491`) | `자금조달계획표` |

다섯 함수 모두 module-private 이고, 기존 테스트의 워크북 픽스처가 이 다섯 시트를
넣지 않아 한 번도 실행되지 않았다. **export 를 열지 말고** 기존 헬퍼로 시트를 추가한다.

**Files:**
- Modify: `tests/workbook-importer.test.ts`
- Modify 없음: `lib/workbook-importer.ts`

**Interfaces:**
- Consumes: `parseWorkbookImport(parsedData, options?)` → `ParsedWorkbookImport`
- 기존 헬퍼 `sheet(name, data, formulas?)` 와 `workbook(sheets)` 를 그대로 쓴다.

- [ ] **Step 1: 다섯 시트의 파싱 규칙 확인**

각 파서가 시트에서 무엇을 찾는지 먼저 읽는다. 픽스처를 잘못 만들면 파서가 빈 배열을
돌려주고 **테스트는 통과하지만 커버리지는 그대로**가 된다. 규칙은 다음과 같다.

- `parseQfdTechnicals` — 셀 하나가 `spec` 으로 정규화되는 행을 찾는다. 그 행이
  이름 행, `+1` 이 단위 행, `+3` 이 목표값 행이다. `측정단위` 를 포함한 열은 건너뛴다.
- `parseTechRoadmap` — `순위`·`개선`·`목표고객` 을 **모두** 포함한 헤더 행이 필요하다.
  열은 `개선방향`/`차별화`, `개선기능`/`성능향상`, `구현가능성`, `목표고객` 으로 찾는다.
- `parseAssets` — 행 전체를 이어 붙여 `핵심자산`/`보완자산` 이 나오면 타입이 바뀐다.
  `필요 항목`·`해결방안`·`도출표` 가 든 행은 건너뛴다.
- `parseFundingPlans` — `구분`·`항목` 헤더. 이후 행은 0열 구분, 1열 항목, 2~4열 연차 금액.
- `parseFundingSources` — `구분` 헤더. 데이터는 헤더 **+2행**부터. `합계` 행은 건너뛴다.

- [ ] **Step 2: 다섯 시트를 픽스처에 추가**

기존 `it('maps a filled workbook into importable project records', ...)` 의 워크북에
이어 붙이거나 새 `it` 으로 나눈다. 새 `it` 을 권한다 — 기존 케이스의 `totalImported`
단언을 건드리지 않아도 되기 때문이다.

```typescript
    it('QFD·로드맵·자산·자금 시트까지 레코드로 옮긴다', () => {
        const parsed = workbook([
            sheet('QFD', [
                ['Spec', '응답시간', '측정단위'],
                ['', 'ms', ''],
                [],
                ['', '200', ''],
            ]),
            sheet('향후목표고객LIST', [
                ['순위', '개선방향', '개선기능', '구현가능성', '목표고객'],
                [1, '자동화', '초기설정 단축', '높음', 'SMB'],
            ]),
            sheet('핵심자산과 보완자산표', [
                ['핵심자산'],
                ['특허', '온보딩 자동화 특허'],
                ['보완자산'],
                ['채널', '리셀러 네트워크'],
            ]),
            sheet('자금소요계획표', [
                ['구분', '항목', '1년차', '2년차', '3년차'],
                ['인건비', '개발자 2명', '1,200', '1,400', '1,600'],
            ]),
            sheet('자금조달계획표', [
                ['구분', '조달처', '금액'],
                [],
                ['자기자금', '대표 출자', '500'],
                ['합계', '', '500'],
            ]),
        ]);

        const result = parseWorkbookImport(parsed);

        expect(result.counts.technicalCharacteristics).toBeGreaterThan(0);
        expect(result.counts.techRoadmaps).toBeGreaterThan(0);
        expect(result.counts.assetItems).toBeGreaterThan(0);
        expect(result.counts.fundingPlans).toBeGreaterThan(0);
        expect(result.counts.fundingSources).toBeGreaterThan(0);
    });
```

> 위 픽스처는 **출발점이지 정답이 아니다.** Step 3 에서 값 단언을 붙이면서 실제 파서
> 동작에 맞게 조정한다. 특히 `parseFundingSources` 의 "헤더 +2행" 과
> `parseQfdTechnicals` 의 "+3행" 오프셋은 빈 행 위치에 민감하다.

- [ ] **Step 3: 값 단언으로 바꾸기**

`toBeGreaterThan(0)` 만으로는 파서가 **틀린 값**을 만들어도 통과한다. 각 시트마다
적어도 한 레코드의 실제 필드를 단언한다. 예를 들어 자금소요계획은 `1,200` 이 숫자
`1200` 으로 들어갔는지(`numberValue` 가 쉼표를 지운다), 자산은 `보완자산` 뒤 행의
`type` 이 `COMPLEMENTARY` 인지 확인한다.

- [ ] **Step 4: 커버리지로 확인**

```sh
npx vitest run --pool=threads --coverage.enabled --coverage.provider=v8 \
    --coverage.reporter=json --coverage.include='lib/**/*.ts' --coverage.reportsDirectory=coverage
npx eslint lib --rule '{"complexity":["warn",{"max":0}]}' -f json -o eslint-complexity.json
node scripts/crap-report.mjs
```

Expected: 위험 목록에서 위 5개 함수가 사라진다.

**Verification:** 게이트 통과 + CRAP 위험 12건 → 7건.

---

## Task 4: google-forms 테스트 신설

**CRAP 위험 3건이 여기 있고, 최대값 306.0 도 여기다.**

| CRAP | 복잡도 | 함수 |
| ---: | ---: | --- |
| 306.0 | 17 | `:209` 응답 파싱 화살표 함수 (`getFormResponses` 내부) |
| 90.0 | 9 | `createKanoForm` (`:42`) |
| 90.0 | 9 | `getFormResponses` (`:164`) |

이 모듈은 **전용 테스트가 아예 없다.** 그리고 2026-08-20 종합검진이 C-2(첫 실행부터
100% 실패하는 FK 버그)를 찾은 form-responses 라우트가 쓰는 모듈이 바로 이것이다.
그때 "테스트 437개가 전부 green 인데 이 버그가 사는 이유"로 지목된 맹점이 여기 남아 있다.

`:209` 는 Google Forms API 응답을 `any` 로 받아 질문 ID 와 답변을 짝지어 Kano 형식으로
바꾸는 코드다. **외부에서 온 구조를 인덱스로 훑기 때문에, 응답 형태가 예상과 어긋나면
예외 없이 조용히 틀린 데이터를 만든다.** 커버리지 0% 에서 가장 위험한 종류다.

**Files:**
- Create: `tests/google-forms.test.ts`
- Modify 없음: `lib/google-forms.ts`

**Interfaces:**
- Consumes: `createKanoForm(accessToken, projectName, requirements)`,
  `getFormResponses(accessToken, formId)`
- 외부 의존은 전역 `fetch` 4곳과 `./utils/korean-utils` 뿐이다. Prisma·Next 의존이
  없으므로 `vi.stubGlobal('fetch', ...)` 만으로 전부 덮인다.

- [ ] **Step 1: fetch 스텁 골격**

```typescript
// Google Forms API 래퍼가 외부 응답을 Kano 형식으로 옮기는 과정을 확인한다.
//
// 이 모듈은 응답 구조를 any 로 받아 인덱스로 훑는다. 형태가 어긋나도 예외가 나지
// 않고 조용히 틀린 데이터가 만들어지므로, 정상 응답뿐 아니라 어긋난 응답에서
// 무엇을 돌려주는지까지 고정해 둔다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createKanoForm, getFormResponses } from '../lib/google-forms';

const fetchMock = vi.fn();

beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
});

function jsonResponse(body: unknown, ok = true) {
    return { ok, status: ok ? 200 : 500, json: () => Promise.resolve(body), text: () => Promise.resolve('') };
}
```

- [ ] **Step 2: `createKanoForm` — 정상 경로와 실패 경로**

`fetchMock` 을 호출 순서대로 `mockResolvedValueOnce` 로 채운다. 확인할 것은
(1) 반환된 `formId`·`formUrl`·`editUrl`, (2) 요청에 `Authorization: Bearer <token>` 이
실렸는지, (3) 요구사항 개수만큼 질문이 만들어졌는지, (4) 중간 호출이 실패하면
어떻게 되는지다.

- [ ] **Step 3: `getFormResponses` — 응답 파싱 (CRAP 306 구간)**

여기가 이 Task 의 핵심이다. 최소 세 가지를 덮는다.

1. **정상** — 질문 ID 가 순서대로 있고 응답도 그 순서대로 온 경우.
   `requirementIndex`·`functional`·`dysfunctional` 이 맞게 짝지어지는지 단언한다.
2. **응답 없음** — `responses` 키가 없거나 빈 배열인 경우
   (`responsesData.responses || []` 경로). 빈 배열을 돌려줘야 한다.
3. **형태 어긋남** — 질문 ID 가 응답에 없거나 답변이 비는 경우. 예외를 던지지 않고
   무엇을 돌려주는지 **현재 동작을 그대로 고정**한다. 이 Step 의 목적은 동작 변경이
   아니라 기록이다. 만약 현재 동작이 명백히 잘못됐다고 판단되면 **고치지 말고**
   보고서 QUESTIONS 에 올린다.

- [ ] **Step 4: 재측정**

Task 3 Step 4 와 같은 명령. Expected: 위험 목록에서 위 3건이 사라진다.

**Verification:** 게이트 통과 + CRAP 위험 7건 → 4건.

**범위 밖:** 실제 Google Forms API 연동의 실기동 검증은 하지 않는다. dev 서버 기동이
금지돼 있고 실계정이 필요하다. 감리자 또는 사용자가 별도로 수행한다.

---

## Task 5: 잔여 CRAP 위험 4건

| CRAP | 복잡도 | 함수 | 성격 |
| ---: | ---: | --- | --- |
| 56.0 | 7 | `lib/kano-algorithm.ts:95` `translateKanoCategory` | `switch` 7분기 순수 매핑 |
| 56.0 | 7 | `lib/ai/prompts.ts:59` `buildAttributeDraftPrompts` | 분기 없음, `??` 6개 |
| 42.0 | 6 | `lib/email.ts:68` `sendSurveyInvitation` | 메일 본문 조립 + 발송 |
| 42.0 | 6 | `lib/excel-parser.ts:109` `getCellValue` | 셀 값 정규화 |

- [ ] **Step 1: `translateKanoCategory` — 7분기 전수 단언**

`tests/kano-algorithm.test.ts` 에 케이스를 더한다. 사용자에게 그대로 보이는 한글
라벨이므로 값을 직접 단언한다. `M`·`O`·`A`·`I`·`R`·`Q` 여섯과 default 하나다.

- [ ] **Step 2: `getCellValue` — 정규화 규칙 고정**

`lib/excel-parser.ts` 의 export 함수라 직접 부를 수 있다. 범위 밖 인덱스, 빈 셀,
숫자/문자 혼재를 덮는다. 새 파일 `tests/excel-parser.test.ts` 를 만든다.

- [ ] **Step 3: `sendSurveyInvitation` — 이스케이프 단언**

기존 `tests/email-send.test.ts` 는 `sendMail` 만 덮고 있다. 이 함수는 주석이 밝힌 대로
**프로젝트 이름을 이스케이프하지 않으면 외부 응답자에게 가는 메일에 피싱 링크를 심을
수 있는** 자리다. 프로젝트 이름에 `<a href=...>` 를 넣고 본문에 그대로 나오지 않는지
확인한다. `lib/logger.ts` 규칙에 따라 **수신자 주소가 로그·반환값에 남지 않는지**도
함께 단언한다.

- [ ] **Step 4: `buildAttributeDraftPrompts` — 판단**

이 함수는 **분기가 없다.** 복잡도 7 은 `??` 6개를 McCabe 가 분기로 센 결과이고
문장은 1개다. CRAP 56 은 구조적으로 부풀려진 값이라, 테스트를 넣어도 얻는 것이 적다.

권고는 **가벼운 스냅샷 한 건**이다. `input.answers` 의 필드가 전부 빈 경우와 전부 찬
경우 두 가지로 프롬프트 문자열이 만들어지는지만 확인하면 0% 는 벗어난다. 굳이 값
전체를 고정하지 않는다 — 프롬프트 문구는 자주 바뀐다.

**Verification:** 게이트 통과 + **CRAP 위험 0건.**

---

## Phase 3 — 측정 체계 강화

## Task 6: 뮤테이션 대상 확대와 표시 문자열 정책

**보고서 §3-2, §2(B), §2(C).** 세 가지를 함께 처리한다.

**Files:**
- Modify: `stryker.crap.config.json`
- Modify: `lib/ai/personal-vendors.ts`, `lib/invite-code.ts`,
  `lib/import-cascade-guard.ts` (D-1 에서 (나)를 택한 경우 주석만)
- Modify: `tests/import-cascade-guard.test.ts`

- [ ] **Step 1: 대상 확대**

Prisma·Next 에 의존하지 않는 순수 모듈은 71개인데 대상은 15개(21%)다. 아래 6개는
**전용 테스트를 이미 갖추고 있어** 추가 비용 없이 대상에 넣을 수 있다. 종합검진이
"코어 인프라 상급 품질"로 평가한 모듈들이라, 실제로 그런지 확인할 값어치가 있다.

```json
    "lib/settings-crypto.ts",
    "lib/upload-guard.ts",
    "lib/rate-limit.ts",
    "lib/password-policy.ts",
    "lib/qfd-benchmark-guards.ts",
    "lib/bulk-save-schemas.ts"
```

Task 4 가 끝났다면 `lib/google-forms.ts` 도 순수 모듈이므로 함께 넣을 수 있다.

> `stryker.crap.config.json` 의 `mutate` 배열은 현재 들여쓰기가 섞여 있다(18~21행이
> 4칸, 나머지는 8칸). 이 Task 에서 어차피 배열을 건드리므로 **그때 함께 8칸으로
> 맞춘다.** 무관한 줄을 정리하는 것이 아니라 편집하는 배열 안의 일이다.

- [ ] **Step 2: 표시 문자열 정책 적용 (D-1 결정 필요)**

(나)를 택했다면 상수 맵 위에 이유와 함께 주석을 둔다.

```typescript
// 이 맵은 화면에 그대로 나가는 UX 카피다. 문구를 테스트로 고정하면 카피를 고칠
// 때마다 테스트가 깨지기만 하고 잡히는 결함이 없어, 뮤테이션 대상에서 뺀다.
// Stryker disable next-line all
export const MEMBER_AI_MODE_LABELS: Record<MemberAiMode, string> = {
```

대상: `lib/ai/personal-vendors.ts` 의 `MEMBER_AI_MODE_LABELS`·
`MEMBER_AI_MODE_DESCRIPTIONS`, `lib/invite-code.ts` 의 `INVITE_CODE_MESSAGES`.

- [ ] **Step 3: mock 흡수 해소**

`import-cascade-guard.ts:50-51` 의 `{ where: { projectId } }` → `{}` 4건이 살아남는다.
테스트의 `CascadeCounter` 스텁이 인자를 보지 않기 때문이다. 설정 주석이 "라우트
핸들러는 mock 이 뮤턴트를 흡수해 점수가 실제보다 좋게 나오므로 넣지 않는다"고 밝힌
바로 그 현상이 **대상 파일 안에서** 일어나고 있다. 즉 이 파일의 88.9% 는 실제보다
후한 값이다.

스텁이 받은 인자를 단언하면 죽는다.

```typescript
        expect(counter.benchmark.count).toHaveBeenCalledWith({ where: { projectId: 'proj_1' } });
```

- [ ] **Step 4: 전체 재측정**

```sh
npm run test:mutation
node scripts/crap-report.mjs
```

Expected: 새로 넣은 6개 모듈의 점수가 나온다. **이 Step 의 목적은 100% 달성이 아니라
현재값 파악이다.** 새 모듈에서 생존이 나오면 그 자체가 다음 계획의 입력이며, 이번
Task 에서 전부 잡으려 하지 않는다. 결과를 보고서 RESULT 에 표로 남긴다.

**Verification:** 게이트 통과 + 뮤테이션 전체 점수가 **95.18% 이상**.

---

## Task 7: 남은 두 건 규명

- [ ] **Step 1: `import-json-schema.ts:21` 생존 원인**

`rows` 헬퍼(`<T>(schema: T) => z.array(schema).max(MAX_IMPORT_ROWS)`)가
`() => undefined` 로 바뀌었는데 살아남았다. 그런데 `tests/api-import-json-guards.test.ts:138`
에는 `MAX_IMPORT_ROWS + 1` 행을 보내 400 과 상한값 문구를 확인하는 테스트가 있고,
`rows` 는 스키마 7곳에서 쓰이므로 `undefined.optional()` 로 모듈 로드가 깨져야 정상이다.

**예상과 어긋나므로 테스트 공백으로 단정하지 않는다.** 확인할 것은 둘이다.

1. 그 뮤턴트만 골라 돌려 실제로 어떤 일이 일어나는지 본다
   (`npx stryker run stryker.crap.config.json --mutate lib/import-json-schema.ts`,
   HTML 리포터를 켜면 뮤턴트별 상태를 볼 수 있다).
2. StrykerJS 의 제네릭 화살표 함수 처리에 알려진 한계가 있는지 확인한다.

결론이 "도구 한계"면 보고서에 남기고 끝낸다. "테스트 공백"이면 테스트를 더한다.

- [ ] **Step 2: `oauth-nonce` payload 형태 가드**

생존 7건이 nonce payload 의 **형태 계약**을 지키는 가드다 — `.` 없는 값(`:48`),
userId 가 빠진 정상 서명(`:61`), exp 가 숫자가 아닌 정상 서명(`:62`),
경계값 `exp === now`(`:62`), catch 경로(`:65`, NoCoverage).

**지금 악용 가능한 취약점이 아니다.** HMAC 위조가 불가능하므로 공격자가 이런 payload 를
만들 수 없다. 다만 payload 구조를 손대는 향후 리팩터링에서 이 가드들이 무증상으로
무력화될 수 있으므로 안전망으로 덮는다.

`tests/oauth-nonce.test.ts` 의 기존 헬퍼(테스트 안에서 `createHmac` 으로 컨텍스트를
붙여 서명하는 방식)를 그대로 쓴다. 만료 검증 자체는 이미 테스트가 있고 정상 동작하므로
**건드리지 않는다.**

- [ ] **Step 3: 등가 뮤턴트 기록**

아래 둘은 테스트로 죽일 수 없다. 없애려면 코드를 고쳐야 하는데, 그건 이 계획의
범위가 아니다. **보고서에 기록만 하고 넘어간다.**

- `lib/oauth-nonce.ts:40` `'utf8'` → `""` — Node 는 falsy 인코딩을 utf8 로 처리한다.
- `lib/invite-code.ts:34` `value.trim()` → `value` — 뒤의
  `.replace(/[^A-Z0-9]/g, '')` 가 공백을 이미 지워 `trim()` 이 무의미하다.
  **죽은 코드로 보이지만 이 계획에서 지우지 않는다** (AGENTS.md — 그 밖의 죽은 코드는
  삭제하지 말고 보고한다).

**Verification:** 게이트 통과 + 결론이 보고서에 기록됨.

---

## Task 8: CRAP 상시화 (D-3 결정 필요)

- [ ] **Step 1: 회귀 방지 방식 결정**

지금은 `claude/**` 브랜치에서만 측정된다. main 으로 합쳐지고 나면 다시 회귀한다.
선택지는 셋이다.

- **(가) `ci.yml` 에 합친다** — 확실하지만 CI 가 약 3분 늘어난다.
- **(나) `crap.yml` 의 트리거를 `pull_request` 로 넓힌다** — PR 에서만 돌아
  main 푸시는 빨라진다. **권고안이다.**
- **(다) 주 1회 `schedule` 로 돌린다** — 가장 싸지만 회귀를 늦게 안다.

- [ ] **Step 2: 임계값 설정**

방식을 정했으면 실패 조건을 넣는다. `scripts/crap-report.mjs` 는 현재 항상 성공으로
끝난다. `CRAP > 30` 인 함수가 하나라도 있으면 0 이 아닌 코드로 끝내는 옵션
(`--fail-over=30`)을 더하는 것이 가장 단순하다. Phase 2 가 끝나면 위험이 0건이므로
그 시점의 상태가 그대로 기준선이 된다.

**Verification:** 새 위험 함수를 일부러 만든 브랜치에서 CI 가 실패하는지 확인.

---

## 완료 기준

- [ ] CRAP 위험(> 30) **0건**
- [ ] 뮤테이션 전체 점수 **95.18% 이상**, 대상 파일 21개 이상
- [ ] `npm run test:mutation` 이 `ci.yml` 환경에서 기동
- [ ] `npx tsc --noEmit && npx vitest run && npx next lint` 통과, 테스트 수가 기준선보다 증가
- [ ] Task 별 보고서가 `docs/superpowers/reports/2026-08-27-crap-remediation/` 에 존재
