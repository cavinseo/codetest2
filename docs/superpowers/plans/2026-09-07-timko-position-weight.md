# TIMKO 차트 위치 기반 가중치 기준표 적용과 집계표 번호 Implementation Plan

> **For agentic workers:** 이 계획서가 각 Task 의 정본이다. Step 은 체크박스(`- [ ]`)로
> 추적하고, 완료 시 `- [x]` 로 갱신해 코드와 함께 커밋한다.

**Goal:** 사용자 요청 두 가지다.

1. TIMKO 차트에서 각 항목의 위치(만족 계수 × 불만족 계수)에 따라 부여되는 **가중치를
   사용자가 준 기준표대로** 맞춘다.
2. WS-6·WS-7 의 **KANO분석 집계표 설문항목에 번호**를 붙인다 — 차트의 점 번호와 같은
   번호여야 표와 점을 맞춰 볼 수 있다.

## 사용자 기준표를 격자로 옮긴 것 (감리자가 정리 — 이것이 정본이다)

사용자 원문에는 오타가 있다(`민족계수`→만족계수, `1.0~-0.50`→`1.0~0.50`,
`-1.0~0.91`→`-1.0~-0.91`, 4.4 의 첫 구간 `-0.4~-0.0`→`-0.4~-0.31`, `만조계수`→만족계수).
오타를 걷어내면 기준표는 아래 10×10 격자 하나로 정리된다. **행 0 = 만족 계수 1.0~0.91**
(위), **행 4 = 0.6~0.50**, **행 5 = 0.49~0.41**, … **행 9 = 0.1~0.0**(아래).
**열 0 = 불만족 계수 -1.0~-0.91**(왼쪽), **열 4 = -0.6~-0.50**, **열 5 = -0.49~-0.41**, …
**열 9 = -0.1~0.0**(오른쪽). 이 행·열 구간은 두 차트의 눈금
(`components/Kano2DChart.tsx:39-62`, `components/project/KanoSatisfactionGraph.tsx:43-66`)과
같다.

```
        열0   열1   열2   열3   열4  |  열5   열6   열7   열8   열9
행0     3.2   3.4   3.6   3.8   4.0  |  4.2   4.4   4.6   4.8   5.0
행1     3.2   3.4   3.6   3.8   3.8  |  4.2   4.4   4.6   4.8   4.8
행2     3.2   3.4   3.6   3.6   3.6  |  4.2   4.4   4.6   4.6   4.6
행3     3.2   3.4   3.4   3.4   3.4  |  4.2   4.4   4.4   4.4   4.4
행4     3.2   3.2   3.2   3.2   3.2  |  4.2   4.2   4.2   4.2   4.2
---------------------------------------------------------------
행5~9    3     3     3     3     3   |   2     2     2     2     2
```

- 위 왼쪽(2사분면 일원적): L 자 띠. 열 0 + 행 4 가 3.2, 안쪽으로 한 칸씩 3.4·3.6·3.8,
  꼭짓점(행 0·열 4 = 만족 1.0~0.91 · 불만족 -0.6~-0.50)이 4.0.
- 위 오른쪽(1사분면 매력적): 열 5 + 행 4 가 4.2, 안쪽으로 4.4·4.6·4.8, 꼭짓점(행 0·열 9)이 5.0.
- 아래 왼쪽(3사분면 당연적) 3, 아래 오른쪽(4사분면 무관심) 2.
- 계수는 `calculateBetterWorse`(`lib/kano-algorithm.ts:115-130`)가 소수 둘째 자리로
  반올림해 주므로 구간 경계는 항상 `0.60`/`0.61`, `-0.50`/`-0.49` 같은 백분율 정수 경계다.

## 검증된 사실 (감리자가 직접 확인 — 재조사하지 마라)

### 가중치 계산의 좌표

- 가중치를 계산하는 곳은 **한 함수**다. `lib/kano-algorithm.ts:181-196`
  `calculateSatisfactionGraphWeight(better, worse)`. 띠 계산 helper 세 개가
  `:166-179`(`verticalRadialBandFromCenter`, `horizontalAttractiveBandFromCenter`,
  `horizontalOneDimensionalBandFromCenter`)에 있다.
- 소비처는 두 라우트다. `app/api/projects/[id]/kano/analysis/route.ts:65-69` 가
  `autoKanoWeight` 를 만들고 `kanoWeight = savedKanoWeight ?? autoKanoWeight`,
  `timkoCategory = getWeightedTimkoCategory(kanoWeight)` 로 집계표에 내려보낸다.
  `app/api/projects/[id]/qfd/analysis/route.ts:57-60` 은 같은 함수로 QFD 중요도를 만든다.
  `lib/qfd-worksheet.ts:3` 이 같은 함수를 재export 한다. **이 함수 하나를 고치면 WS-6·WS-7
  집계표·QFD 전부에 반영된다.** 라우트·컴포넌트는 손댈 필요가 없다.
- 집계표의 가중치 칸(`components/project/KanoAggregationTable.tsx:150-162`)은 이 값을
  `defaultValue` 로 보여 주고, 사용자가 손으로 고쳐 blur 하면 PATCH 로 DB(`kanoWeight`)에
  저장한다. 저장값이 있으면 자동값을 덮는다 — 이 동작은 그대로 둔다(계약 참조).

### 현재 구현과 기준표의 차이 — 일원적 사분면만 좌우가 뒤집혀 있다

감리자가 현재 함수를 그대로 복제해 100개 셀 × (네 모서리 + 중점) = 500개 표본으로
기준표와 대조했다.

- **매력적(행0~4·열5~9)·당연적·무관심: 불일치 0건.** 이미 기준표와 같다. 건드리지 마라.
- **일원적(행0~4·열0~4): 125개 표본 중 70건 불일치.** 현재 구현이 주는 격자는 이렇다.

```
행0     4.0   3.8   3.6   3.4   3.2      ← 기준표는 3.2 3.4 3.6 3.8 4.0
행1     3.8   3.8   3.6   3.4   3.2      ← 기준표는 3.2 3.4 3.6 3.8 3.8
행2     3.6   3.6   3.6   3.4   3.2      ← 기준표는 3.2 3.4 3.6 3.6 3.6
행3     3.4   3.4   3.4   3.4   3.2      ← 기준표는 3.2 3.4 3.4 3.4 3.4
행4     3.2   3.2   3.2   3.2   3.2      ← 같음
```

  원인은 `lib/kano-algorithm.ts:194` 가 `horizontalOneDimensionalBandFromCenter`(중앙
  -0.5 에서 멀어질수록 0→4)를 그대로 써서 **왼쪽 바깥 열(-1.0)이 가장 높은 띠**가 되기
  때문이다. 기준표(그리고 차트 상단 눈금 `components/TimkoWorksheetGrid.tsx:39-45` 의
  `3.2 + col × 0.2`, 셀 색 `:16-22` 의 darkRed L 띠)는 반대로 **왼쪽 바깥 열이 3.2, 중앙
  쪽 열이 4.0** 이다. 즉 차트 그림은 이미 맞고 숫자만 틀리다.
- **기존 테스트가 이걸 못 잡은 이유**: `tests/kano-algorithm.test.ts:112-124` 와
  `tests/qfd-worksheet.test.ts:27-32` 의 일원적 표본 `(0.8,-0.8)→3.6`, `(0.7,-0.7)→3.4` 는
  전부 좌우를 뒤집어도 값이 같은 대각선 셀이다. 위 표에서 `같음` 인 칸만 찍었다.
- **기존 단언 15개는 기준표와 전부 일치한다**(감리자 대조). 기존 테스트를 고치거나
  지울 이유가 없다 — 하나라도 바꿔야 한다면 구현이 틀린 것이다.

### 수정 방향 — 검증된 것 하나, 함정 하나

- **채택안(경계 500표본 불일치 0건 확인)**: 일원적 분기에서 가로 띠를
  `4 - horizontalOneDimensionalBandFromCenter(worse)` 로 뒤집는다. 세로 띠·매력적 분기·
  helper 본문은 그대로 둔다. 한 줄 수정이다.
- **함정(쓰지 마라)**: `Math.floor(((1 - Math.abs(worse)) * 10) + Number.EPSILON)` 처럼
  왼쪽 가장자리부터 새로 세는 부동소수점 식은 `worse = -0.8`(`1 - 0.8 = 0.19999999999999996`,
  ×10 = `1.9999999999999996`, EPSILON 을 더해도 2 에 못 미침) 등 **경계 6곳에서 한 칸
  낮게** 나온다. 감리자가 확인했다. 기존 helper 가 경계에서 맞는 것은 검증됐으니 그것을
  재사용한다.
- 현재 구현이 틀리는 대표값(RED 테스트가 반드시 실패해야 하는 값):
  `(0.95,-0.95)` 현재 4.0 → 기준 3.2, `(0.95,-0.55)` 현재 3.2 → 기준 4.0,
  `(0.85,-0.65)` 현재 3.4 → 기준 3.8, `(1.0,-1.0)` 4.0 → 3.2, `(1.0,-0.5)` 3.2 → 4.0,
  `(0.61,-0.5)` 3.2 → 3.4.

### 집계표 번호의 좌표

- 차트 점 번호는 배열 순서 `idx + 1` 이다 — WS-6 `components/Kano2DChart.tsx:184`,
  WS-7 `components/project/KanoSatisfactionGraph.tsx:180`.
- 집계표는 **컴포넌트 하나** `components/project/KanoAggregationTable.tsx` 다. WS-6
  (`components/project/KanoManager.tsx:1348-1355`)과 WS-7(`app/project/[id]/page.tsx:425-432`)
  이 같은 컴포넌트를 쓴다. 한 곳만 고치면 두 화면 다 바뀐다.
- 두 화면 모두 **차트와 집계표에 같은 배열을 같은 순서로** 넘긴다. WS-6 은
  `analysis.requirements` 를 `:1331` 과 `:1351` 에서 각각 map 하고, WS-7 은 `:417` 에서
  만든 `analysis` 상수 하나를 `:424` 와 `:431` 에 넘긴다. 배열은 API 가 요구사항 `order`
  로 정렬해 준다(`app/api/projects/[id]/kano/analysis/route.ts:84-88`). 따라서 집계표의
  `idx + 1` 이 곧 차트 점 번호다.
- 이름 칸은 `KanoAggregationTable.tsx:138-140`, 헤더는 `:113`. 이름이 없으면 이미
  `요구사항 ${idx + 1}` 로 대체한다(`:139`).
- WS-7 의 상세표(`KanoSatisfactionGraph.tsx:195, 207`)에는 이미 `No` 열이 있다. 같은
  모양으로 맞춘다.

### 테스트 인프라 — 컴포넌트 렌더링은 실행된 적이 없다

- `package.json` 에 jsdom·happy-dom·@testing-library 가 없다. `tests/` 의 어떤 테스트도
  `.tsx` 컴포넌트를 import 하지 않는다. `tsconfig.json:18` 은 `"jsx": "preserve"`,
  `vitest.config.ts` 는 `include: ['tests/**/*.test.ts']` 에 별칭 `@` 만 잡혀 있다.
- `react-dom/server` 의 `renderToStaticMarkup` 은 node 에서 DOM 없이 돌지만, **vitest 가
  `jsx: preserve` 상태에서 `.tsx` 를 변환해 주는지는 이 저장소에서 확인된 적이 없다.**
  Task 2 Step 1 이 이 잠복 지점을 다루는 방식(허용된 설정 변경 한 가지와 중단 규칙)을
  따르라.

## Global Constraints

- CLAUDE.md 최우선 제약: `.env` 의 DB 는 원격 실DB 다. `prisma migrate deploy`/`db push`/
  `studio`, DB 에 쓰는 스크립트, **dev 서버 기동** 전부 금지. 이번 두 Task 는 DB 도 서버도
  필요 없다(순수 함수 + JSX 열 추가). 실화면 검증은 감리자·사용자가 한다.
- git `reset`/`checkout`/`rebase`/브랜치 이동/`push`/reflog 조작 금지. 커밋만 허용.
- 들여쓰기 4칸. 주석은 한국어 "~다" 체, 무엇이 아니라 **왜**를 적는다.
- 게이트: `npx tsc --noEmit && npx vitest run && npx next lint`.
- `npx prisma generate` 가 `EPERM ... query_engine-windows.dll.node` 로 실패하면 dev 서버가
  DLL 을 잠근 것이다. 직접 죽이지 말고 중단·보고한다. (이번 Task 는 prisma generate 가
  필요 없다 — 게이트 셋 다 generate 없이 돈다.)
- 계획서 체크박스 `[x]` 갱신을 각 Task 의 작업 커밋에 포함한다.
- 보고서는 `docs/superpowers/reports/2026-09-07-timko-position-weight/task-<n>.md` 로
  작업 커밋과 **별도의 둘째 커밋**(`docs: Task <n> 결과 보고서`). 형식은 RESULT / FILES
  CHANGED / COMMIT / VERIFIED BY / DEVIATIONS / RISKS / QUESTIONS.

---

### Task 1: 일원적 사분면 가중치를 기준표 방향으로 뒤집는다

**Files:**
- 수정: `lib/kano-algorithm.ts` (`:194` 한 줄 + 주석)
- 수정: `tests/kano-algorithm.test.ts` (테스트 1개 추가 — 기존 테스트는 손대지 않는다)

**Interfaces:** 없음. `calculateSatisfactionGraphWeight(better, worse): number` 시그니처와
반환 범위(2, 3, 3.2~5.0) 그대로. export 목록 변경 없음.

- [ ] **Step 1: RED — 기준표 100개 셀의 네 모서리를 전부 찍는 테스트를 추가한다**

`tests/kano-algorithm.test.ts` 의 `'assigns satisfaction graph weights from radial
Better-Worse positions'` 테스트 **바로 아래**에 추가한다(기존 테스트는 그대로 둔다).

```ts
    it('워크시트 TIMKO 격자 100개 셀의 네 모서리마다 기준표 가중치를 돌려준다', () => {
        // 사용자 기준표를 격자(행 0 = 만족 1.0~0.91, 열 0 = 불만족 -1.0~-0.91)로 옮긴
        // 것이다. 위 5행은 왼쪽 L 띠 3.2→4.0, 오른쪽 L 띠 4.2→5.0, 아래 5행은 당연적 3·
        // 무관심 2 다. 셀마다 한 점만 찍으면 좌우가 뒤집힌 구현도 대각선 셀에서는
        // 통과하므로(실제로 그렇게 통과해 왔다) 네 모서리를 전부 찍는다.
        const bands = [
            [91, 100], [81, 90], [71, 80], [61, 70], [50, 60],
            [41, 49], [31, 40], [21, 30], [11, 20], [0, 10],
        ];
        const expectedGrid = [
            [3.2, 3.4, 3.6, 3.8, 4.0, 4.2, 4.4, 4.6, 4.8, 5.0],
            [3.2, 3.4, 3.6, 3.8, 3.8, 4.2, 4.4, 4.6, 4.8, 4.8],
            [3.2, 3.4, 3.6, 3.6, 3.6, 4.2, 4.4, 4.6, 4.6, 4.6],
            [3.2, 3.4, 3.4, 3.4, 3.4, 4.2, 4.4, 4.4, 4.4, 4.4],
            [3.2, 3.2, 3.2, 3.2, 3.2, 4.2, 4.2, 4.2, 4.2, 4.2],
            [3, 3, 3, 3, 3, 2, 2, 2, 2, 2],
            [3, 3, 3, 3, 3, 2, 2, 2, 2, 2],
            [3, 3, 3, 3, 3, 2, 2, 2, 2, 2],
            [3, 3, 3, 3, 3, 2, 2, 2, 2, 2],
            [3, 3, 3, 3, 3, 2, 2, 2, 2, 2],
        ];

        expectedGrid.forEach((rowWeights, row) => {
            rowWeights.forEach((expected, col) => {
                const [betterLow, betterHigh] = bands[row];
                const [worseLow, worseHigh] = bands[col];
                for (const better of [betterLow, betterHigh]) {
                    for (const worse of [worseLow, worseHigh]) {
                        expect(
                            calculateSatisfactionGraphWeight(better / 100, -worse / 100),
                            `만족 ${better / 100} · 불만족 ${-worse / 100} (행 ${row}, 열 ${col})`,
                        ).toBe(expected);
                    }
                }
            });
        });
    });
```

```sh
npx vitest run tests/kano-algorithm.test.ts
```

Expected: **새 테스트 1개 실패**, 나머지 10개 통과. 실패 메시지의 첫 불일치는 행 0·열 0
(`만족 0.91 · 불만족 -0.91`, 받은 값 4 ≠ 기대 3.2) 이어야 한다. 실패하지 않으면 테스트가
잘못 옮겨진 것이니 구현으로 넘어가지 마라.

- [ ] **Step 2: GREEN — 일원적 분기의 가로 띠를 뒤집는다**

`lib/kano-algorithm.ts:194` 를 다음으로 바꾼다. helper 세 개와 매력적 분기는 그대로.

```ts
    // 일원적 사분면은 워크시트가 불만족 계수 -1.0 열(가장 왼쪽)을 3.2, 중앙 -0.5 열을
    // 4.0 으로 두므로 매력적 사분면과 반대로 중앙에서 먼 열일수록 띠가 낮다. 경계에서
    // 검증된 중앙 기준 띠를 뒤집어 쓴다 — 왼쪽부터 새로 세는 부동소수점 식은
    // -0.8 같은 경계에서 한 칸 낮게 나온다.
    const band = Math.min(verticalBand, 4 - horizontalOneDimensionalBandFromCenter(worse));
```

```sh
npx vitest run tests/kano-algorithm.test.ts tests/qfd-worksheet.test.ts
```

Expected: 전부 통과(기존 단언 수정 없이).

- [ ] **Step 3: 전체 게이트와 뮤테이션**

```sh
npx tsc --noEmit
npx vitest run
npx next lint
npx stryker run stryker.crap.config.json --mutate lib/kano-algorithm.ts
```

Expected: tsc 출력 없음 / vitest 전체 통과(테스트 수 = 기존 + 1) / lint 0건 /
stryker 는 `calculateSatisfactionGraphWeight` 와 helper 세 개 범위(수정 후 대략
`lib/kano-algorithm.ts:166-200`)에 **Survived·NoCoverage 뮤턴트 0개**. 파일 전체 점수와
그 범위 밖 생존 뮤턴트는 보고서에 원문으로 적되 고치지 않는다(범위 밖). 등가 뮤턴트가
있으면 CLAUDE.md 규칙대로 `// Stryker disable next-line <Mutator>: <이유>` 로 제외하고,
disable 전후 총 뮤턴트 수 차이를 보고서에 적는다.

- [ ] **Step 4: 커밋**

```sh
git add lib/kano-algorithm.ts tests/kano-algorithm.test.ts \
        docs/superpowers/plans/2026-09-07-timko-position-weight.md
git commit
```

메시지: `fix: 일원적 사분면 TIMKO 가중치를 워크시트 기준표 방향으로 맞춘다`
본문에 **왜**: 일원적 분기가 중앙 기준 띠를 그대로 써서 왼쪽 바깥 열(-1.0)이 4.0, 중앙 쪽
열이 3.2 로 기준표·차트 눈금과 거울상이었다는 것, 기존 테스트가 대각선 셀만 찍어 못
잡았다는 것. 트레일러는 CLAUDE.md 저장소 관례를 따른다.

- [ ] **Step 5: 보고서를 둘째 커밋으로**

`docs/superpowers/reports/2026-09-07-timko-position-weight/task-1.md`,
커밋 메시지 `docs: Task 1 결과 보고서`. VERIFIED BY 에 Step 1 의 RED 출력(실패 메시지
첫 줄), Step 3 네 명령의 마지막 줄, stryker 의 해당 범위 뮤턴트 표를 원문으로 담는다.

---

### Task 2: KANO분석 집계표 설문항목에 차트 점과 같은 번호 열을 붙인다

**Files:**
- 수정: `components/project/KanoAggregationTable.tsx` (`:113` 헤더, `:138` 본문 앞에 열 추가)
- 신규(가능한 경우): `tests/kano-aggregation-table.test.ts`
- 수정(필요한 경우에만, 한 항목만): `vitest.config.ts`

**Interfaces:** 없음. `KanoAggregationTableProps` 그대로. 번호는 새 prop 이 아니라
`analysis.map((item, idx) => …)` 의 `idx + 1` 이다 — 차트가 쓰는 규칙과 같다.

- [ ] **Step 1: RED — 정적 렌더링 테스트를 시도한다 (중단 규칙 있음)**

`tests/kano-aggregation-table.test.ts` 를 만든다.

```ts
// KANO분석 집계표를 DOM 없이 정적 HTML 로 렌더링해 번호 열을 검증한다.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import KanoAggregationTable from '../components/project/KanoAggregationTable';

describe('KanoAggregationTable', () => {
    it('각 행 맨 앞에 차트 점과 같은 번호(배열 순서 + 1)를 붙인다', () => {
        // 번호는 이름이 아니라 배열 순서에서 나온다 — 차트 점 라벨과 같은 배열을 같은
        // 순서로 받으므로 순서가 곧 대응 관계다. 이름이 비어 대체 문구가 들어가는 행도
        // 같은 규칙이어야 점과 어긋나지 않는다.
        const analysis = ['첫째 항목', '둘째 항목', undefined].map((name, idx) => ({
            requirementId: `req-${idx}`,
            requirementName: name,
            aggregated: { M: 0, O: 0, A: 1, I: 0, R: 0, Q: 0, total: 1, dominantCategory: 'A' as const },
            better: 1,
            worse: 0,
        }));

        const html = renderToStaticMarkup(createElement(KanoAggregationTable, { analysis }));

        expect(html).toContain('>No<');
        expect(html).toMatch(/>1<\/td><td[^>]*>첫째 항목</);
        expect(html).toMatch(/>2<\/td><td[^>]*>둘째 항목</);
        expect(html).toMatch(/>3<\/td><td[^>]*>요구사항 3</);
    });
});
```

```sh
npx vitest run tests/kano-aggregation-table.test.ts
```

세 가지 결과 중 하나다.

1. **단언 실패로 RED** (`>No<` 없음): 정상. Step 2 로.
2. **`.tsx` 변환 실패**(JSX 구문 오류, `Unexpected token '<'` 류): `vitest.config.ts` 에
   다음 **한 항목만** 추가하고 다시 돌린다. 그 외 vitest 설정(`include`·`exclude`·
   `alias`)은 절대 바꾸지 않는다.

   ```ts
       esbuild: {
           // 집계표를 node 에서 정적 렌더링하는 테스트가 .tsx 를 읽는다. tsconfig 의
           // jsx: preserve 는 Next 빌드용이라 vitest 에서는 자동 런타임으로 바꿔 준다.
           jsx: 'automatic',
       },
   ```

   이후 1 번이 되면 진행. 그래도 변환·import 오류가 나면 **3 번**.
3. **위 한 가지 설정으로도 안 되면**: 테스트 파일과 `vitest.config.ts` 변경을 **되돌리고**
   (새 패키지 설치·다른 설정 변경 금지), Step 2 로 진행한다. 보고서 DEVIATIONS 에 시도한
   명령과 오류 원문을 적고, RISKS 에 "번호 열은 자동 테스트 없이 화면 검증으로 이월"
   이라고 적는다.

- [ ] **Step 2: GREEN — `No` 열을 추가한다**

`components/project/KanoAggregationTable.tsx:113` 의 `설문항목(요구사항)` 헤더 **앞**에:

```tsx
                                <th rowSpan={2} className="px-3 py-4 w-12 border-r border-white/5 font-bold">No</th>
```

`:138` 의 이름 `<td>` **앞**에:

```tsx
                                        {/* 차트 점 라벨과 같은 배열·같은 순서(idx + 1)라 이 번호로 점을 찾는다. */}
                                        <td className="px-3 py-3 text-gray-500 border-r border-white/5">{idx + 1}</td>
```

이름 칸의 `요구사항 ${idx + 1}` 대체 문구, 가중치 input, 배지, `saveWeight` 는 손대지
않는다. `colSpan={7}`(KANO 응답 집계 헤더)은 그대로다 — 새 열은 그 앞이라 영향이 없다.

```sh
npx vitest run tests/kano-aggregation-table.test.ts   # Step 1 이 1·2 번이었을 때만
```

Expected: 통과.

- [ ] **Step 3: 전체 게이트**

```sh
npx tsc --noEmit
npx vitest run
npx next lint
```

Expected: tsc 출력 없음 / vitest 전체 통과(Step 1 이 1·2 번이면 테스트 수 = Task 1 후 + 1,
3 번이면 변동 없음) / lint 0건.

- [ ] **Step 4: 커밋**

```sh
git add components/project/KanoAggregationTable.tsx \
        docs/superpowers/plans/2026-09-07-timko-position-weight.md
# Step 1 이 1·2 번이면 추가로:
git add tests/kano-aggregation-table.test.ts        # 2 번이면 vitest.config.ts 도
git commit
```

메시지: `feat: KANO 분석 집계표 설문항목에 차트 점과 같은 번호를 붙인다`
본문에 **왜**: 차트의 점은 1부터 번호가 붙는데 집계표에는 번호가 없어 점과 행을 맞춰
볼 수 없었다는 것, 집계표 컴포넌트 하나를 WS-6·WS-7 이 공유하고 차트와 같은 배열을 같은
순서로 받으므로 `idx + 1` 이 곧 점 번호라는 것.

- [ ] **Step 5: 보고서를 둘째 커밋으로**

`docs/superpowers/reports/2026-09-07-timko-position-weight/task-2.md`,
커밋 메시지 `docs: Task 2 결과 보고서`. Step 1 이 몇 번 경로였는지, 그 근거(명령·출력
원문)를 VERIFIED BY 또는 DEVIATIONS 에 반드시 담는다.

---

## 감리 체크리스트 (Task 승인 게이트)

1. **경계**: diff 가 `lib/kano-algorithm.ts` 한 줄(+주석), `tests/kano-algorithm.test.ts`
   추가분, `KanoAggregationTable.tsx` 두 곳, (있다면) 새 테스트 1개와 `vitest.config.ts`
   `esbuild.jsx` 한 항목, 계획서·보고서 — 이 밖의 파일이 없는가. 기존 테스트의 단언이
   하나라도 바뀌거나 지워지지 않았는가(바뀌었으면 구현이 틀린 것이다).
2. **표본 대조**: (a) `:194` 가 `4 - horizontalOneDimensionalBandFromCenter(worse)` 인가,
   helper 본문·매력적 분기가 그대로인가. (b) 새 테스트의 `expectedGrid` 가 이 계획서의
   격자와 한 칸도 다르지 않은가. (c) `No` 열의 값이 `idx + 1` 인가(이름·id 에서 파생하지
   않았는가).
3. **회귀 역검증**: `:194` 를 원래대로 임시로 되돌리면 새 테스트가 실패하는가(행 0·열 0
   에서). 되돌려도 통과하면 테스트가 기준표를 못 옮긴 것이다.
4. **게이트 직접 재실행**: tsc 0 · vitest 전체 통과 · lint 0 · stryker 해당 범위 생존 0.
5. **화면 검증(감리자·사용자, 실브라우저)**: WS-6 TIMKO 탭과 WS-7 탭 각각에서 (a) 집계표
   첫 열에 1부터 번호가 있고 차트 점의 번호와 같은 항목을 가리키는가, (b) 일원적
   사분면(왼쪽 위)에 찍힌 항목의 가중치가 그 점이 놓인 열의 상단 눈금(3.2~4.0)과 L 띠
   규칙대로 나오는가 — 특히 왼쪽 바깥 열의 점이 3.2 인가, (c) 저장된 수동 가중치가 있는
   항목은 그 값이 유지되는가.

## 계획 밖 (사람이 하는 일 / 사용자 결정)

- **실화면 검증** — dev 서버 기동은 실행 AI 에게 위임하지 않는다. 위 체크리스트 5 번.
- **이미 DB 에 저장된 수동 가중치**: 자동값은 DB 에 쓰지 않으므로 이번 수정으로 자동값이
  바뀌어도 저장값이 있는 항목은 옛 값이 그대로 보인다. 옛 알고리즘의 자동값을 사용자가
  손으로 "확정"해 저장한 적이 있다면 그 항목만 다시 비워(입력칸을 지우고 blur) 자동값으로
  돌려야 한다. 일괄 초기화 기능은 이번 범위가 아니다 — 필요하면 별도 계획.
- **수동 가중치 덮어쓰기 유지 여부**: 사용자 요청 1 은 "위치에 따라 부여"라고만 했다.
  기존의 손 입력 → PATCH 저장 → 자동값 덮기 동작은 요청에 없는 삭제라 유지한다. 위치
  기반 자동값만 쓰게 하려면(입력칸을 읽기 전용으로) 별도 지시가 필요하다.
- **`lib/kano-algorithm.ts` 를 `stryker.crap.config.json` `mutate` 목록에 올릴지**: 이번엔
  일회성 실행으로 점수만 보고한다. 목록 등재는 파일 전체 100% 를 요구하므로 범위 밖
  생존 뮤턴트를 먼저 봐야 한다.
