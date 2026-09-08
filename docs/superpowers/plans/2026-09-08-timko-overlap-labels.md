# TIMKO 차트 겹친 점의 번호 표시 Implementation Plan

> **For agentic workers:** 이 계획서가 각 Task 의 정본이다. Step 은 체크박스(`- [ ]`)로
> 추적하고, 완료 시 `- [x]` 로 갱신해 코드와 함께 커밋한다.

**Goal:** TIMKO 차트(WS-6·WS-7)에서 좌표가 같거나 겹치는 항목은 뒤에 그려진 점이 앞 점을
덮어 번호가 보이지 않는다. 사용자 요청은 "겹쳐지더라도 항목번호가 보일 수 있도록
표기하라"다. 사용자 프로젝트에서는 15개 중 4번(7번 아래)과 11번(15번 아래)이 안 보인다.

## 검증된 사실 (감리자가 직접 확인 — 재조사하지 마라)

### 점과 번호를 그리는 곳 — 두 컴포넌트, 구조가 같다

- WS-6 `components/Kano2DChart.tsx:177-187`. 항목마다 `<g>` 하나에 `<circle r="8">`(`:180`,
  `<title>` 툴팁 포함)과 번호 `<text fontSize="9">`(`:183-185`, `{idx + 1}`)를 함께 그린다.
  점 좌표는 `:65-86` 의 `points` useMemo 가 만든다(`x = padding + (worse+1)·plotWidth`,
  `y = height − padding − better·plotHeight`, plot 480×480 → 계수 0.01 = 4.8px).
  모듈 상수는 `:30-35`(`chartFont`, `width`, `padding`, `plotWidth`…).
- WS-7 `components/project/KanoSatisfactionGraph.tsx:148-185`. 항목마다 `<g onClick>` 안에
  클릭용 투명 원 `r="12"`(`:156-161`), 보이는 원 `r="6"`(`:162-170`), 번호
  `<text fontSize="8">`(`:171-181`), `<title>`(`:182`). 좌표는 `:68-80`(plot 586×536).
  모듈 상수는 `:21`(`KOREAN_CHART_FONT`) 하나뿐이고 나머지 치수는 컴포넌트 안(`:30-36`)이다.
- 두 파일 모두 사분면 이름을 **흰 글자 + 진한 테두리(`stroke="#1e293b" strokeWidth="3"
  strokeLinejoin="round" paintOrder="stroke"`)** 로 그린다(`Kano2DChart.tsx:162`,
  `KanoSatisfactionGraph.tsx:141`). 겹친 점 위에 번호를 읽히게 하는 데 같은 기법을 쓴다.

### 왜 안 보이는가 — 좌표가 완전히 같다

- 집계표 좌표 기준 4번·7번은 (0.86, −0.71), 11번·15번은 (0.95, −0.62)로 **동일**하다. 같은
  입력 → 같은 픽셀이므로 SVG 순서상 나중 항목(7·15)이 앞 항목(4·11)을 완전히 덮는다.
- 그다음으로 가까운 쌍은 1번·13번으로 WS-6 에서 19.2px 떨어져 있다(원 지름 16px) — 겹치지
  않는다. 즉 이번 데이터의 문제는 "완전 중복" 둘뿐이지만, 응답자가 많아지면 계수 간격이
  0.01~0.02(5~10px)까지 좁아져 부분 겹침도 생긴다. 해법은 부분 겹침까지 다뤄야 한다.

### 채택한 해법 — 점은 그대로 두고, 겹치는 점끼리 번호를 한 라벨로 모은다

- **점을 옮기지 않는다.** 지난 계획(2026-09-07)에서 확정했듯 점이 놓인 칸이 곧 가중치다.
  겹침을 피하려고 점을 몇 px 밀면 칸 경계(0.60/0.61 등)를 넘어 보여 차트에서 가중치를 잘못
  읽게 된다.
- 대신 **원이 서로 겹치는 점(중심 거리 < 2·반지름)끼리 묶고**, 묶음마다 번호를 `4·7` 처럼
  한 줄로 이어 묶음 중심에 그린다. 번호 라벨은 점을 전부 그린 **뒤** 맨 위 층에 그려 다른
  원에 가려지지 않게 한다. 라벨은 `pointer-events-none` 이라 클릭·툴팁은 그대로 원이 받는다.
- 묶기는 순수 함수(`lib/timko-point-clusters.ts`)로 빼서 vitest + stryker 로 검증한다.
  컴포넌트 렌더링 테스트는 이 저장소에서 불가능하다(2026-09-07 계획 Task 2: Vitest 4 의
  oxc 변환기가 `jsx: preserve` 인 `.tsx` 를 못 읽는다 — 재시도하지 마라). JSX 통합은 화면
  검증으로 이월한다.
- 감리자가 아래 알고리즘을 node 로 돌려 확인한 것: 시나리오 7개 통과, 사용자 데이터 15개를
  WS-6(r=8)·WS-7(r=6) 좌표계에 넣으면 **묶음은 `4·7`, `11·15` 둘뿐**이고 나머지 13개는 단독.
- 사슬 묶임(A–B 겹침, B–C 겹침, A–C 는 안 겹침 → 셋이 한 묶음)은 허용한다. 번호가 전부
  라벨에 들어가므로 정보는 잃지 않는다.

### 뮤테이션 — 등가 뮤턴트를 피한 구조

- 바깥 반복은 `for (let a = 0; a < n; …)` 대신 `points.forEach((origin, a) => …)` 를 쓴다.
  `for` 로 쓰면 `a < n` → `a <= n` 뮤턴트가 안쪽 반복이 돌지 않아 **등가**가 된다
  (감리자 확인). 안쪽 `for (let b = a + 1; b < n; b += 1)` 은 `<=`·`a - 1`·`b -= 1` 전부
  `points[-1]`/`points[n]` 접근 오류나 무한 루프(Timeout)로 죽는다.
- `while (parent[root] !== root)` 의 `===` 뮤턴트는 무한 루프 → Stryker 가 Timeout 으로 죽인다.
- 경계 `<` vs `<=` 는 "거리 정확히 2r(닿기만 함) → 안 묶음" 테스트가 죽인다. `radius * 2` →
  `radius / 2` 는 거리 1.5r 테스트가 죽인다. `-` → `+`(dx·dy) 는 좌표를 100 근처에 두면
  합이 임계값을 넘어 죽는다 — 테스트 좌표를 0 근처에 두지 마라.

## Global Constraints

- CLAUDE.md 최우선 제약: `.env` 의 DB 는 원격 실DB 다. `prisma migrate deploy`/`db push`/
  `studio`, DB 에 쓰는 스크립트, **dev 서버 기동** 전부 금지. 이번 Task 는 DB 도 서버도
  필요 없다(순수 함수 + JSX 라벨 층). 실화면 검증은 감리자·사용자가 한다.
- git `reset`/`checkout`/`rebase`/브랜치 이동/`push`/reflog 조작 금지. 커밋만 허용.
- 들여쓰기 4칸. 주석은 한국어 "~다" 체, 무엇이 아니라 **왜**를 적는다.
- 게이트: `npx tsc --noEmit && npx vitest run && npx next lint`.
- 신규 순수 모듈은 `npx stryker run stryker.crap.config.json --mutate <파일>` 100% 가 기준.
  등가 뮤턴트는 테스트를 비틀지 말고 `// Stryker disable next-line <Mutator>: <이유>` 로
  제외하고, disable 전후 총 뮤턴트 수 차이를 보고서에 적는다. 이유 없는 disable 금지.
- 계획서 체크박스 `[x]` 갱신을 각 Task 의 작업 커밋에 포함한다.
- 보고서는 `docs/superpowers/reports/2026-09-08-timko-overlap-labels/task-<n>.md` 로
  작업 커밋과 **별도의 둘째 커밋**(`docs: Task <n> 결과 보고서`). 형식은 RESULT / FILES
  CHANGED / COMMIT / VERIFIED BY / DEVIATIONS / RISKS / QUESTIONS.

---

### Task 1: 겹치는 점을 묶는 순수 모듈

**Files:**
- 신규: `lib/timko-point-clusters.ts`
- 신규: `tests/timko-point-clusters.test.ts`
- 수정: `stryker.crap.config.json` (`mutate` 목록에 한 줄 추가)

**Interfaces:**

```ts
export interface ChartPoint { x: number; y: number; }
/** members = 입력 배열의 0 기준 인덱스(오름차순). x·y = 구성원 좌표의 평균. */
export interface PointCluster { members: number[]; x: number; y: number; }
export function clusterOverlappingPoints(points: ChartPoint[], radius: number): PointCluster[];
/** 0 기준 인덱스를 1 기준 번호로 바꿔 '4·7' 처럼 잇는다. */
export function clusterLabel(members: number[]): string;
```

반환 순서: 묶음은 가장 작은 구성원 인덱스 순, 구성원은 오름차순. 입력 순서 = 차트 점 번호
순서이므로 이 규칙이 곧 "번호 순서"다.

- [ ] **Step 1: RED — 테스트를 먼저 쓴다**

`tests/timko-point-clusters.test.ts`:

```ts
// 겹치는 점의 번호를 한 라벨로 모으는 규칙을 검증한다.
//
// 지키는 성질은 둘이다. (1) 원이 겹치는 점(중심 거리 < 지름)만 묶이고 닿기만 하는 점은
// 묶이지 않는다 — 임계값이 느슨하면 멀쩡히 보이던 번호까지 합쳐진다. (2) 번호 순서와
// 묶음 중심이 결정적이다 — 차트는 이 결과를 그대로 좌표와 글자로 쓴다.
import { describe, expect, it } from 'vitest';
import { clusterLabel, clusterOverlappingPoints } from '../lib/timko-point-clusters';

const RADIUS = 8;

describe('clusterOverlappingPoints', () => {
    it('겹치지 않는 점은 각자 한 묶음이고 입력 순서와 좌표를 그대로 돌려준다', () => {
        expect(clusterOverlappingPoints([
            { x: 100, y: 100 }, { x: 200, y: 100 }, { x: 100, y: 200 },
        ], RADIUS)).toEqual([
            { members: [0], x: 100, y: 100 },
            { members: [1], x: 200, y: 100 },
            { members: [2], x: 100, y: 200 },
        ]);
    });

    it('좌표가 완전히 같은 점은 한 묶음이 되고 나머지는 단독이다', () => {
        // 사용자 데이터의 4번·7번(같은 만족·불만족 계수)이 이 경우다.
        expect(clusterOverlappingPoints([
            { x: 100, y: 100 }, { x: 150, y: 150 }, { x: 100, y: 100 },
        ], RADIUS)).toEqual([
            { members: [0, 2], x: 100, y: 100 },
            { members: [1], x: 150, y: 150 },
        ]);
    });

    it('중심 거리가 지름과 같으면(닿기만 함) 묶지 않는다', () => {
        expect(clusterOverlappingPoints([{ x: 100, y: 100 }, { x: 116, y: 100 }], RADIUS))
            .toHaveLength(2);
    });

    it('중심 거리가 지름보다 짧으면 가로·세로 어느 방향이든 묶고 중심은 평균이다', () => {
        expect(clusterOverlappingPoints([{ x: 100, y: 100 }, { x: 115, y: 100 }], RADIUS))
            .toEqual([{ members: [0, 1], x: 107.5, y: 100 }]);
        expect(clusterOverlappingPoints([{ x: 100, y: 100 }, { x: 100, y: 115 }], RADIUS))
            .toEqual([{ members: [0, 1], x: 100, y: 107.5 }]);
        // 반지름의 1.5배 거리도 겹침이다 — 임계값이 반지름(지름의 절반)으로 줄면 여기서 갈린다.
        expect(clusterOverlappingPoints([{ x: 100, y: 100 }, { x: 112, y: 100 }], RADIUS))
            .toHaveLength(1);
    });

    it('사슬로 이어진 점은 양 끝이 안 겹쳐도 한 묶음이다', () => {
        expect(clusterOverlappingPoints([
            { x: 100, y: 100 }, { x: 110, y: 100 }, { x: 120, y: 100 },
        ], RADIUS)).toEqual([{ members: [0, 1, 2], x: 110, y: 100 }]);
    });

    it('뒤 점이 먼저 묶여도 구성원은 오름차순, 묶음은 가장 작은 번호 순이다', () => {
        expect(clusterOverlappingPoints([
            { x: 100, y: 100 }, { x: 300, y: 300 }, { x: 300, y: 300 }, { x: 100, y: 100 },
        ], RADIUS)).toEqual([
            { members: [0, 3], x: 100, y: 100 },
            { members: [1, 2], x: 300, y: 300 },
        ]);
    });

    it('점이 없으면 빈 배열이다', () => {
        expect(clusterOverlappingPoints([], RADIUS)).toEqual([]);
    });
});

describe('clusterLabel', () => {
    it('0 기준 인덱스를 1 기준 번호로 바꿔 가운뎃점으로 잇는다', () => {
        expect(clusterLabel([3, 6])).toBe('4·7');
        expect(clusterLabel([10, 14])).toBe('11·15');
        expect(clusterLabel([0])).toBe('1');
    });
});
```

```sh
npx vitest run tests/timko-point-clusters.test.ts
```

Expected: 모듈이 없어 **import 실패로 RED**. 마지막 줄에 `Test Files  1 failed` 가 있어야 한다.

- [ ] **Step 2: GREEN — 모듈 작성**

`lib/timko-point-clusters.ts`:

```ts
// TIMKO 차트에서 서로 겹치는 점의 번호를 한 라벨로 모으는 규칙.
//
// 좌표가 같은 항목은 나중에 그린 점이 앞 점을 완전히 덮어 번호가 사라진다. 점을 몇 px
// 밀어서 피하는 방법은 쓰지 않는다 — 점이 놓인 칸이 곧 가중치라 위치를 흐트러뜨리면
// 차트에서 가중치를 잘못 읽는다. 대신 원이 겹치는 점끼리 묶어 번호를 '4·7' 처럼 한 줄로
// 그린다. 두 차트(WS-6 Kano2DChart, WS-7 KanoSatisfactionGraph)가 같이 쓴다.

export interface ChartPoint {
    x: number;
    y: number;
}

export interface PointCluster {
    /** 입력 배열의 0 기준 인덱스, 오름차순. 입력 순서가 곧 차트 번호 순서다. */
    members: number[];
    /** 구성원 좌표의 평균 — 라벨을 놓는 자리. */
    x: number;
    y: number;
}

/**
 * 중심 거리가 지름(2·radius)보다 짧은 점끼리 묶는다. 정확히 지름이면 닿기만 하고 번호가
 * 다 보이므로 묶지 않는다. 사슬(A–B, B–C 겹침)은 한 묶음이 된다 — 번호가 전부 라벨에
 * 들어가므로 정보는 잃지 않는다.
 */
export function clusterOverlappingPoints(points: ChartPoint[], radius: number): PointCluster[] {
    // 각 점이 속한 묶음의 대표 인덱스. 처음엔 자기 자신이다(union-find).
    const parent = points.map((_, index) => index);
    const find = (index: number): number => {
        let root = index;
        while (parent[root] !== root) root = parent[root];
        return root;
    };

    const minDistance = radius * 2;
    // 바깥 반복을 for 대신 forEach 로 쓰는 이유: for 의 `a < n` 이 `a <= n` 으로 변이되면
    // 안쪽 반복이 돌지 않아 어떤 테스트로도 못 잡는 등가 뮤턴트가 된다.
    points.forEach((origin, a) => {
        for (let b = a + 1; b < points.length; b += 1) {
            if (Math.hypot(points[b].x - origin.x, points[b].y - origin.y) < minDistance) {
                parent[find(b)] = find(a);
            }
        }
    });

    // 인덱스 오름차순으로 훑으므로 Map 삽입 순서가 곧 "가장 작은 번호 순"이 된다.
    const membersByRoot = new Map<number, number[]>();
    points.forEach((_, index) => {
        const root = find(index);
        const members = membersByRoot.get(root) ?? [];
        members.push(index);
        membersByRoot.set(root, members);
    });

    return [...membersByRoot.values()].map((members) => ({
        members,
        x: members.reduce((sum, index) => sum + points[index].x, 0) / members.length,
        y: members.reduce((sum, index) => sum + points[index].y, 0) / members.length,
    }));
}

/** 0 기준 인덱스를 차트 번호(1 기준)로 바꿔 가운뎃점으로 잇는다. */
export function clusterLabel(members: number[]): string {
    return members.map((index) => index + 1).join('·');
}
```

```sh
npx vitest run tests/timko-point-clusters.test.ts
```

Expected: 8개 전부 통과.

- [ ] **Step 3: 뮤테이션 100% 와 `mutate` 목록 등재**

```sh
npx stryker run stryker.crap.config.json --mutate lib/timko-point-clusters.ts
```

Expected: `lib/timko-point-clusters.ts` 행이 **100.00**, Survived 0, NoCoverage 0. 100% 가
아니면 살아남은 뮤턴트마다 (a) 죽이는 테스트를 추가하거나 (b) 등가임을 증명하고
`// Stryker disable next-line <Mutator>: <이유>` 로 제외한다. disable 을 걸면 전후 총
뮤턴트 수를 보고서에 적는다. 테스트의 기대값을 구현에 맞춰 바꾸는 것은 금지다.

`stryker.crap.config.json` 의 `mutate` 배열 마지막 항목 `"lib/feature-flags.ts"` 뒤에
`"lib/timko-point-clusters.ts"` 를 추가한다(들여쓰기는 바로 위 항목과 같게). CI 의
CRAP / Mutation 워크플로가 이후 회귀를 잡도록 하는 것이다.

- [ ] **Step 4: 전체 게이트**

```sh
npx tsc --noEmit
npx vitest run
npx next lint
```

Expected: tsc 출력 없음 / vitest 전체 통과(테스트 수 = 기존 1,235 + 8) / lint 0건.

- [ ] **Step 5: 커밋**

```sh
git add lib/timko-point-clusters.ts tests/timko-point-clusters.test.ts \
        stryker.crap.config.json docs/superpowers/plans/2026-09-08-timko-overlap-labels.md
git commit
```

메시지: `feat: TIMKO 차트에서 겹치는 점의 번호를 한 라벨로 묶는 규칙을 추가한다`
본문에 **왜**: 좌표가 같은 항목은 뒤 점이 앞 점을 덮어 번호가 사라진다는 것, 점을 밀지
않고 번호만 모으는 이유(칸 = 가중치). 트레일러는 CLAUDE.md 저장소 관례를 따른다.

- [ ] **Step 6: 보고서를 둘째 커밋으로**

`docs/superpowers/reports/2026-09-08-timko-overlap-labels/task-1.md`, 커밋 메시지
`docs: Task 1 결과 보고서`. VERIFIED BY 에 Step 1 의 RED 마지막 줄, Step 3 의 stryker 표
원문(해당 파일 행), Step 4 세 명령의 마지막 줄을 담는다.

---

### Task 2: 두 차트에 번호 라벨 층을 넣는다

**Files:**
- 수정: `components/Kano2DChart.tsx` (import 1줄, 상수 1줄, useMemo 1개, 점 블록 교체)
- 수정: `components/project/KanoSatisfactionGraph.tsx` (같은 구조)

**Interfaces:** 없음. 두 컴포넌트의 props 그대로. 점의 좌표·색·반지름·툴팁·클릭 동작은
바뀌지 않는다 — 바뀌는 것은 번호 `<text>` 를 점 `<g>` 밖의 별도 층으로 옮기고 묶음 단위로
그리는 것뿐이다.

- [ ] **Step 1: WS-6 `components/Kano2DChart.tsx`**

(a) `:4` 아래에 import 추가:

```tsx
import { clusterLabel, clusterOverlappingPoints } from '@/lib/timko-point-clusters';
```

(b) `:35` `plotHeight` 아래에 상수 추가:

```tsx
const pointRadius = 8;
```

(c) `points` useMemo(`:86`) 바로 아래에 추가:

```tsx
    // 같은 좌표이거나 겹치는 점은 번호가 서로 가려 보이지 않으므로 겹치는 점끼리 묶어
    // 번호를 한 라벨로 그린다. 점 자체는 옮기지 않는다 — 점이 놓인 칸이 곧 가중치라
    // 위치를 흐트러뜨리면 차트에서 가중치를 읽을 수 없게 된다.
    const labelClusters = useMemo(() => clusterOverlappingPoints(points, pointRadius), [points]);
```

(d) `:177-187` 의 데이터 포인트 블록을 다음으로 교체(`r="8"` 을 상수로 바꾸고 번호를 분리):

```tsx
                {/* 데이터 포인트 */}
                {points.map((p) => (
                    <circle key={p.id} cx={p.x} cy={p.y} r={pointRadius} fill={p.color} stroke="#fff" strokeWidth="2" className="cursor-pointer hover:r-10 transition-all">
                        <title>{p.name} (만족 계수: {p.better.toFixed(2)}, 불만족 계수: {p.worse.toFixed(2)})</title>
                    </circle>
                ))}

                {/* 점 번호 — 점을 전부 그린 뒤 맨 위 층에 그려 다른 점에 가려지지 않게 한다.
                    겹친 점은 번호를 '4·7' 처럼 한데 적고 진한 테두리로 원 위에서 읽히게 한다. */}
                {labelClusters.map((cluster) => (
                    <text
                        key={cluster.members.join('-')}
                        x={cluster.x}
                        y={cluster.y + 3}
                        textAnchor="middle"
                        fill="#fff"
                        fontSize="9"
                        fontWeight="bold"
                        stroke={cluster.members.length > 1 ? '#1e293b' : undefined}
                        strokeWidth={cluster.members.length > 1 ? 3 : undefined}
                        strokeLinejoin="round"
                        paintOrder="stroke"
                        className="pointer-events-none"
                    >
                        {clusterLabel(cluster.members)}
                    </text>
                ))}
```

단독 점의 번호는 지금과 똑같이 흰 글자만이다(테두리 없음). 묶음 라벨만 테두리를 얻는다.

- [ ] **Step 2: WS-7 `components/project/KanoSatisfactionGraph.tsx`**

(a) `:4` 아래에 같은 import 추가.

(b) `:21` `KOREAN_CHART_FONT` 아래에 모듈 상수 추가(컴포넌트 안에 두면
`react-hooks/exhaustive-deps` 가 useMemo 의존성에 넣으라고 한다):

```tsx
const POINT_RADIUS = 6;
```

(c) `points` useMemo(`:80`) 바로 아래에 Step 1(c)와 같은 주석·코드로 `labelClusters` 추가
(`clusterOverlappingPoints(points, POINT_RADIUS)`, 의존성 `[points]`).

(d) `:148-185` 의 데이터 포인트 블록을 다음으로 교체. 투명 클릭 원·보이는 원·`<title>`·
`onClick` 은 그대로 두고 `r="6"` 만 상수로 바꾸며, 번호 `<text>` 를 `<g>` 밖 라벨 층으로 옮긴다:

```tsx
                        {/* 데이터 포인트 */}
                        {points.map((p) => (
                            <g
                                key={p.requirementId}
                                className="cursor-pointer"
                                onClick={() => onSelectRequirement?.(p.requirementId)}
                            >
                                <circle
                                    cx={p.x}
                                    cy={p.y}
                                    r="12"
                                    fill="transparent"
                                />
                                <circle
                                    cx={p.x}
                                    cy={p.y}
                                    r={POINT_RADIUS}
                                    fill={p.quadrant === 'ATTRACTIVE' ? quadrantColors.attractive : p.quadrant === 'ONE_DIMENSIONAL' ? quadrantColors.oneDimensional : p.quadrant === 'MUST_BE' ? quadrantColors.mustBe : quadrantColors.indifferent}
                                    stroke="#ffffff"
                                    strokeWidth="2"
                                    className="filter drop-shadow-sm"
                                />
                                <title>{p.requirementName}</title>
                            </g>
                        ))}

                        {/* 점 번호 — 점을 전부 그린 뒤 맨 위 층에 그려 다른 점에 가려지지 않게 한다.
                            겹친 점은 번호를 '4·7' 처럼 한데 적고 진한 테두리로 원 위에서 읽히게 한다. */}
                        {labelClusters.map((cluster) => (
                            <text
                                key={cluster.members.join('-')}
                                x={cluster.x}
                                y={cluster.y + 3}
                                textAnchor="middle"
                                fill="#fff"
                                fontSize="8"
                                fontWeight="bold"
                                stroke={cluster.members.length > 1 ? '#1e293b' : undefined}
                                strokeWidth={cluster.members.length > 1 ? 3 : undefined}
                                strokeLinejoin="round"
                                paintOrder="stroke"
                                className="pointer-events-none"
                            >
                                {clusterLabel(cluster.members)}
                            </text>
                        ))}
```

`:190` 이후의 상세표(`No` 열 포함)는 손대지 않는다.

- [ ] **Step 3: 전체 게이트**

```sh
npx tsc --noEmit
npx vitest run
npx next lint
```

Expected: tsc 출력 없음 / vitest 전체 통과(테스트 수 = Task 1 후와 같음) / lint 0건.
컴포넌트 렌더링 테스트는 만들지 않는다(불가능이 확인됨 — 검증된 사실 참조).
dev 서버도 띄우지 않는다.

- [ ] **Step 4: 커밋**

```sh
git add components/Kano2DChart.tsx components/project/KanoSatisfactionGraph.tsx \
        docs/superpowers/plans/2026-09-08-timko-overlap-labels.md
git commit
```

메시지: `fix: TIMKO 차트에서 겹친 항목의 번호가 가려지지 않게 한 라벨로 표시한다`
본문에 **왜**: 4·7번, 11·15번처럼 계수가 같은 항목은 뒤 점이 앞 점을 덮어 번호가
사라졌다는 것, 점을 밀지 않는 이유, 번호 층을 점 위에 따로 그리는 이유.

- [ ] **Step 5: 보고서를 둘째 커밋으로**

`docs/superpowers/reports/2026-09-08-timko-overlap-labels/task-2.md`, 커밋 메시지
`docs: Task 2 결과 보고서`. RISKS 에 "라벨 층은 자동 테스트 없이 화면 검증으로 이월"을
적는다.

---

## 감리 체크리스트 (Task 승인 게이트)

1. **경계**: diff 가 신규 모듈·테스트, `stryker.crap.config.json` 한 줄, 두 컴포넌트, 계획서·
   보고서뿐인가. 두 컴포넌트에서 점의 좌표식·색 분기·반지름 값·`<title>`·`onClick` 이
   그대로인가(반지름은 상수로 옮겼을 뿐 값이 8·6 인가). 기존 테스트 단언 변경·삭제 없음.
2. **표본 대조**: (a) 임계값이 `radius * 2` 이고 비교가 `<` 인가. (b) 바깥 반복이 `forEach`
   인가(등가 뮤턴트 회피). (c) 라벨 층이 `points.map` **뒤**에 있고 `pointer-events-none`
   인가. (d) 묶음 라벨에만 테두리(`#1e293b`, 3)가 붙고 단독 라벨은 흰 글자뿐인가.
3. **회귀 역검증**: `< minDistance` 를 `<= minDistance` 로 임시로 바꾸면 "닿기만 함"
   테스트가 실패하는가. `forEach` 안의 union 을 주석 처리하면 중복·사슬 테스트가 실패하는가.
4. **게이트 직접 재실행**: tsc 0 · vitest 전체 통과 · lint 0 · stryker 해당 파일 100%
   (disable 이 있으면 이유와 뮤턴트 수 차이 확인).
5. **화면 검증(감리자·사용자, 실브라우저)**: WS-6 TIMKO 탭과 WS-7 탭 각각에서
   (a) 겹친 자리에 `4·7`, `11·15` 라벨이 보이고 나머지 13개 번호가 전부 보이는가,
   (b) 점의 위치·색이 이전과 같은가(점이 밀리지 않았는가),
   (c) WS-6 에서 점에 마우스를 올리면 툴팁이, WS-7 에서 점을 클릭하면 선택이 전과 같이
   동작하는가.

## 계획 밖 (사람이 하는 일 / 사용자 결정)

- **실화면 검증** — dev 서버 기동은 실행 AI 에게 위임하지 않는다. 위 체크리스트 5 번.
- **완전히 겹친 점의 클릭**: WS-7 에서 좌표가 같은 두 항목은 지금도 나중 항목만 클릭된다.
  이번 수정은 번호 표시만 다루며 클릭 대상 선택(예: 클릭할 때마다 번갈아 선택)은 별도
  요청이 있을 때 계획한다.
- **묶음이 커질 때의 라벨 길이**: 항목 4개 이상이 한 자리에 몰리면 `1·4·7·9` 처럼 라벨이
  이웃 점까지 덮을 수 있다. 실데이터에서 그런 경우가 보이면 그때 배치 규칙을 추가한다.
