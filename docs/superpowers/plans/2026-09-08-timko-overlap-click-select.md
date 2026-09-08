# WS-7 겹친 점의 클릭 대상 선택 Implementation Plan

> **For agentic workers:** 이 계획서가 각 Task 의 정본이다. Step 은 체크박스(`- [ ]`)로
> 추적하고, 완료 시 `- [x]` 로 갱신해 코드와 함께 커밋한다.

**Goal:** WS-7 만족계수 그래프에서 좌표가 같은 항목(사용자 데이터의 4·7번, 11·15번)은
나중에 그린 점이 앞 점을 덮어 **앞 항목을 클릭으로 고를 수 없다**. 겹친 자리를 거듭 누르면
구성원을 차례로 돌아가며 고르게 해 모든 항목에 닿게 한다.

## ⚠️ 먼저 알아야 할 것 — 클릭은 지금 아무 일도 하지 않는다

감리자가 확인한 사실이다. `app/project/[id]/page.tsx:424` 가 이 컴포넌트를
`<KanoSatisfactionGraph analysis={analysis} />` 로만 부른다. `selectedRequirementId` 도
`onSelectRequirement` 도 넘기지 않는다. 그래서 지금 상태는 이렇다.

- `KanoSatisfactionGraph.tsx:160` 의 `onClick={() => onSelectRequirement?.(p.requirementId)}`
  은 optional chaining 이라 **호출돼도 아무 일이 없다**.
- `:219` 의 `isSelected` 는 항상 false 라 `:221` 의 앰버 강조 스타일이 **한 번도 켜지지
  않는다**. 스타일은 이미 다 만들어져 있는데 연결만 안 돼 있다.
- `:158` 의 `cursor-pointer` 때문에 **눌러도 되는 것처럼 보이지만 반응이 없다**.

따라서 이번 작업은 "겹침 처리"만이 아니라 **끊어져 있는 선택 기능을 잇는 것**이 먼저다.
겹침 순환은 그 위에 얹는다. 이미 만들어져 있는 표 강조 스타일을 그대로 쓰므로 새 디자인은
없다.

## 검증된 사실 (감리자가 직접 확인 — 재조사하지 마라)

### 좌표

- 컴포넌트: `components/project/KanoSatisfactionGraph.tsx` (243줄). WS-7 전용이고
  소비처는 `app/project/[id]/page.tsx:424` **한 곳뿐**이다. WS-6 은 다른 컴포넌트
  (`components/Kano2DChart.tsx`)를 쓰며 클릭 기능 자체가 없다 — 이번 범위 밖이다.
- `:31` props 는 `{ analysis, selectedRequirementId, onSelectRequirement }`. 뒤 둘은 선택적
  이고 아무도 넘기지 않는다.
- `:70-85` `points` useMemo 가 `analysis` 를 그대로 map 하므로 **`points[i]` 와
  `analysis[i]` 는 같은 항목**이다. 배열 순서가 곧 차트 번호(`i + 1`)다.
- `:87` `labelClusters` useMemo 가 `clusterOverlappingPoints(points, POINT_RADIUS)` 로 겹친
  점 묶음을 이미 만들어 둔다(2026-09-08 겹침 라벨 계획). **이 묶음을 그대로 재사용한다.**
- `:156-179` 점 `<g>`: `onClick` 이 `<g>` 에 있고, 안에 클릭용 투명 원 `r="12"`(`:163-168`),
  보이는 원 `r={POINT_RADIUS}`(`:169-176`), `<title>`(`:177`)이 있다.
- `:181-200` 번호 라벨 층: `labelClusters` 를 map 해 `{clusterLabel(cluster.members)}` 를
  그린다. `pointer-events-none` 이라 클릭은 아래 원이 받는다.
- `:205-240` 상세표. `:219` `isSelected`, `:221` 앰버 강조
  (`bg-amber-400/[0.12] ring-amber-400/30`). Tailwind `amber-400` = `#fbbf24`.
- `tsconfig.json:11` `"strict": true` 이지만 `noUncheckedIndexedAccess` 는 없다 —
  `analysis[i]` 는 `AnalysisResult` 로 좁혀지므로 `undefined` 가드가 필요 없다(가드를 넣으면
  도달 불가 분기가 생겨 뮤턴트가 살아남는다).
- `Fragment` 사용 전례가 있다(`components/project/FitnessWrapper.tsx:3, 561`).

### 왜 겹친 점의 앞 항목이 안 눌리는가

좌표가 같으면 SVG 순서상 나중 `<g>`(7·15번)가 위에 깔려 클릭을 가로챈다. 앞 `<g>`(4·11번)의
투명 원은 영원히 가려진다. 그러므로 **"어느 원이 눌렸나"로는 앞 항목에 닿을 수 없다.**
클릭이 들어오면 그 점이 속한 묶음을 찾아 **현재 선택의 다음 구성원**으로 넘기는 방식이어야
한다. 이러면 4·7 묶음을 눌렀을 때 4 → 7 → 4 로 돌아간다.

### 순환 규칙의 알고리즘 — 감리자가 node 로 검증했다

아래 함수와 시나리오 9개를 감리자가 직접 돌려 통과를 확인했고, 변이 5가지
(`position + 1`→`- 1`, `?? -1`→`?? +1`, `!cluster` 조건 제거, `includes`→`true`,
`%`→`*`)가 **전부 시나리오에 걸려 죽는 것**까지 확인했다. 아래 구현과 테스트를 그대로 쓰라.

- `?? -1` → `?? +1` 뮤턴트는 **구성원에 1 이 들어 있는 묶음**(`[1, 4, 9]`)을 선택 없이
  누르는 시나리오만이 죽인다(`indexOf(1)` 이 0 이 되어 두 번째 구성원을 돌려준다).
  그 시나리오를 빼면 등가 뮤턴트가 되니 반드시 남겨라.
- `%` → `*` 뮤턴트는 **단독 묶음이 이미 선택된 상태**와 순환 마지막 구성원이 죽인다.
- `!cluster` 조기 반환은 **어느 묶음에도 없는 인덱스**를 넣는 시나리오가 죽인다.

## Global Constraints

- CLAUDE.md 최우선 제약: `.env` 의 DB 는 원격 실DB 다. `prisma migrate deploy`/`db push`/
  `studio`, DB 에 쓰는 스크립트, **dev 서버 기동** 전부 금지. 이번 Task 는 DB 도 서버도
  필요 없다(순수 함수 + 컴포넌트 상태). 실화면 검증은 감리자·사용자가 한다.
- git `reset`/`checkout`/`rebase`/브랜치 이동/`push`/reflog 조작 금지. 커밋만 허용.
- 들여쓰기 4칸. 주석은 한국어 "~다" 체, 무엇이 아니라 **왜**를 적는다.
- 게이트: `npx tsc --noEmit && npx vitest run && npx next lint`.
- `lib/timko-point-clusters.ts` 는 `stryker.crap.config.json` `mutate` 목록에 **이미 올라
  있고 현재 100%** 다. 이 파일을 고치는 Task 는 stryker 를 재실행해 **100% 유지**를 보고서
  VERIFIED BY 에 담아야 한다. 게이트 3종은 뮤테이션 점수 하락을 잡지 못한다.
- 등가 뮤턴트는 테스트를 비틀지 말고 `// Stryker disable next-line <Mutator>: <이유>` 로
  제외하고, disable 전후 총 뮤턴트 수 차이를 보고서에 적는다. 이유 없는 disable 금지.
- 컴포넌트 렌더링 테스트는 이 저장소에서 **불가능하다**(Vitest 4 의 oxc 변환기가
  `jsx: preserve` 인 `.tsx` 를 못 읽는다 — 2026-09-07 계획 Task 2 에서 확인). 재시도·패키지
  설치·`vitest.config.ts` 변경 금지. JSX 통합은 화면 검증으로 이월한다.
- 계획서 체크박스 `[x]` 갱신을 각 Task 의 작업 커밋에 포함한다.
- 보고서는 `docs/superpowers/reports/2026-09-08-timko-overlap-click-select/task-<n>.md` 로
  작업 커밋과 **별도의 둘째 커밋**(`docs: Task <n> 결과 보고서`). 형식은 RESULT / FILES
  CHANGED / COMMIT / VERIFIED BY / DEVIATIONS / RISKS / QUESTIONS.

---

### Task 1: 순환 규칙을 순수 모듈에 더한다

**Files:**
- 수정: `lib/timko-point-clusters.ts` (함수 1개 추가 — 기존 두 함수는 손대지 않는다)
- 수정: `tests/timko-point-clusters.test.ts` (`describe` 블록 1개 추가 — 기존 8개는 그대로)

**Interfaces:**

```ts
/**
 * 겹친 점을 눌렀을 때 다음에 선택할 항목의 인덱스. 선택이 없으면(null 또는 -1) 묶음의
 * 첫(가장 작은 번호) 구성원, 이미 그 묶음이 선택돼 있으면 다음 구성원으로 순환한다.
 */
export function nextSelectedMember(
    clusters: PointCluster[],
    clickedIndex: number,
    selectedIndex: number | null,
): number;
```

- [ ] **Step 1: RED — 테스트를 먼저 쓴다**

`tests/timko-point-clusters.test.ts` 의 **맨 끝**(`clusterLabel` describe 블록 뒤)에 추가한다.
파일 위쪽 import 에 `nextSelectedMember` 를 더한다(기존 두 이름은 그대로 둔다).

```ts
import { clusterLabel, clusterOverlappingPoints, nextSelectedMember } from '../lib/timko-point-clusters';
```

```ts
describe('nextSelectedMember', () => {
    // 좌표가 같은 점은 나중에 그린 것이 클릭을 가로채므로 "어느 원이 눌렸나"로는 앞
    // 항목에 닿을 수 없다. 눌린 점이 속한 묶음 안에서 차례를 넘겨야 전부 고를 수 있다.
    const clusters = [
        { members: [0], x: 0, y: 0 },
        { members: [3, 6], x: 1, y: 1 },
        { members: [1, 4, 9], x: 2, y: 2 },
    ];

    it('겹치지 않은 점은 자기 자신을 돌려준다', () => {
        expect(nextSelectedMember(clusters, 0, null)).toBe(0);
    });

    it('겹치지 않은 점은 이미 선택돼 있어도 자기 자신이다', () => {
        // 단독 묶음에서 나머지 연산이 곱셈으로 바뀌면 여기서 범위를 벗어난다.
        expect(nextSelectedMember(clusters, 0, 0)).toBe(0);
    });

    it('겹친 자리를 처음 누르면 가려져 있던 첫 구성원을 고른다', () => {
        // 사용자 데이터의 4·7 묶음이 이 경우다. 위에 있는 7 을 눌러도 4 가 먼저 잡혀야
        // 클릭만으로 4 에 닿을 수 있다.
        expect(nextSelectedMember(clusters, 6, null)).toBe(3);
    });

    it('선택이 -1 이어도 선택 없음으로 본다', () => {
        // 화면은 findIndex 결과를 그대로 넘긴다 — 못 찾으면 -1 이다.
        expect(nextSelectedMember(clusters, 6, -1)).toBe(3);
    });

    it('같은 자리를 다시 누르면 다음 구성원으로 넘어간다', () => {
        expect(nextSelectedMember(clusters, 6, 3)).toBe(6);
    });

    it('마지막 구성원에서 다시 누르면 처음으로 돌아온다', () => {
        expect(nextSelectedMember(clusters, 6, 6)).toBe(3);
    });

    it('구성원이 셋이면 셋을 차례로 돈다', () => {
        // 구성원에 1 이 들어 있는 묶음을 선택 없이 누르는 이 시나리오만이
        // 'selectedIndex ?? -1' 의 -1 을 +1 로 바꾼 뮤턴트를 죽인다.
        expect(nextSelectedMember(clusters, 1, null)).toBe(1);
        expect(nextSelectedMember(clusters, 1, 1)).toBe(4);
        expect(nextSelectedMember(clusters, 1, 4)).toBe(9);
        expect(nextSelectedMember(clusters, 1, 9)).toBe(1);
    });

    it('다른 묶음이 선택돼 있으면 누른 묶음의 첫 구성원부터 시작한다', () => {
        expect(nextSelectedMember(clusters, 6, 1)).toBe(3);
    });

    it('어느 묶음에도 없는 인덱스는 그대로 돌려준다', () => {
        expect(nextSelectedMember(clusters, 99, null)).toBe(99);
    });
});
```

```sh
npx vitest run tests/timko-point-clusters.test.ts
```

Expected: **import 실패로 RED**(`nextSelectedMember` 가 없다). 기존 8개도 함께 실패한다 —
파일 전체가 import 단계에서 죽기 때문이다.

- [ ] **Step 2: GREEN — 함수를 더한다**

`lib/timko-point-clusters.ts` 의 `clusterLabel` **아래**에 추가한다. 기존 두 함수와 주석은
한 글자도 바꾸지 않는다.

```ts
/**
 * 겹친 점을 눌렀을 때 다음에 선택할 항목의 인덱스.
 *
 * 좌표가 같은 점은 나중에 그린 쪽이 클릭을 가로채므로 눌린 점만 보면 가려진 항목에는
 * 영원히 닿지 못한다. 그래서 눌린 점이 속한 묶음을 찾아 현재 선택의 다음 구성원으로
 * 넘긴다 — 같은 자리를 거듭 누르면 구성원을 한 바퀴 돈다. 선택이 없거나(null·-1) 다른
 * 묶음에 있으면 가장 작은 번호부터 시작해 가려진 항목이 먼저 잡히게 한다.
 */
export function nextSelectedMember(
    clusters: PointCluster[],
    clickedIndex: number,
    selectedIndex: number | null,
): number {
    const cluster = clusters.find((candidate) => candidate.members.includes(clickedIndex));
    if (!cluster) return clickedIndex;

    // 못 찾으면 -1 이라 다음 자리가 0 이 된다 — 선택 없음과 다른 묶음 선택을 한 식으로 만든다.
    const position = cluster.members.indexOf(selectedIndex ?? -1);
    return cluster.members[(position + 1) % cluster.members.length];
}
```

```sh
npx vitest run tests/timko-point-clusters.test.ts
```

Expected: 17개(기존 8 + 신규 9) 전부 통과.

- [ ] **Step 3: 뮤테이션 100% 유지**

```sh
npx stryker run stryker.crap.config.json --mutate lib/timko-point-clusters.ts
```

Expected: `lib/timko-point-clusters.ts` **100.00%**, Survived 0, NoCoverage 0. 이 파일은
`mutate` 목록에 이미 있어 CI 도 재는 대상이니 100% 미만이면 회귀다. 살아남으면 죽이는
테스트를 추가하거나(우선) 등가임을 증명하고 disable 주석으로 제외한다. 테스트 기대값을
구현에 맞춰 바꾸는 것은 금지다.

- [ ] **Step 4: 전체 게이트**

```sh
npx tsc --noEmit
npx vitest run
npx next lint
```

Expected: tsc 출력 없음 / vitest 전체 통과(테스트 수 = 기존 1,243 + 9 = 1,252) / lint 0건.

- [ ] **Step 5: 커밋**

```sh
git add lib/timko-point-clusters.ts tests/timko-point-clusters.test.ts \
        docs/superpowers/plans/2026-09-08-timko-overlap-click-select.md
git commit
```

메시지: `feat: 겹친 점을 거듭 누르면 구성원을 차례로 고르는 규칙을 추가한다`
본문에 **왜**: 좌표가 같은 점은 나중에 그린 쪽이 클릭을 가로채 앞 항목에 닿을 수 없다는 것,
그래서 눌린 원이 아니라 묶음 안의 차례로 정한다는 것.

- [ ] **Step 6: 보고서를 둘째 커밋으로**

`docs/superpowers/reports/2026-09-08-timko-overlap-click-select/task-1.md`, 커밋 메시지
`docs: Task 1 결과 보고서`. VERIFIED BY 에 Step 1 의 RED 마지막 줄, Step 3 의 stryker 표
해당 파일 행, Step 4 세 명령의 마지막 줄을 원문으로 담는다.

---

### Task 2: WS-7 의 선택 기능을 잇고 순환을 붙인다

**Files:**
- 수정: `components/project/KanoSatisfactionGraph.tsx`

**Interfaces:** 없음. props `{ analysis, selectedRequirementId, onSelectRequirement }` 는
그대로 둔다 — 부모가 넘기면 그 값이 이기고, 안 넘기면(현재 유일한 소비처가 그렇다) 컴포넌트
내부 상태가 대신한다. `app/project/[id]/page.tsx` 는 **고치지 않는다**.

- [ ] **Step 1: 내부 선택 상태와 선택 인덱스**

(a) `:3` 을 다음으로 바꾼다(`Fragment` 는 Step 3 라벨에서 쓴다).

```tsx
import { Fragment, useMemo, useState } from 'react';
```

(b) `:5` import 에 `nextSelectedMember` 를 더한다.

```tsx
import { clusterLabel, clusterOverlappingPoints, nextSelectedMember } from '@/lib/timko-point-clusters';
```

(c) `:87` `labelClusters` 줄 **아래**에 추가한다.

```tsx
    // 유일한 소비처(app/project/[id]/page.tsx)가 선택 props 를 넘기지 않아 클릭이 아무
    // 일도 하지 않았다. 부모가 넘기면 그 값이 이기고, 아니면 이 상태가 대신한다 —
    // 표의 강조 스타일은 이미 만들어져 있고 연결만 없었다.
    const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null);
    const selectedId = selectedRequirementId ?? internalSelectedId;
    const selectedIndex = useMemo(
        () => analysis.findIndex((item) => item.requirementId === selectedId),
        [analysis, selectedId],
    );

    // points 는 analysis 를 그대로 map 한 것이라 두 배열의 인덱스가 같다. 눌린 점이 속한
    // 묶음의 다음 차례를 골라야 겹쳐 가려진 항목에도 닿는다.
    const selectPointAt = (clickedIndex: number) => {
        const nextIndex = nextSelectedMember(labelClusters, clickedIndex, selectedIndex);
        const nextId = analysis[nextIndex].requirementId;
        setInternalSelectedId(nextId);
        onSelectRequirement?.(nextId);
    };
```

- [ ] **Step 2: 클릭이 순환을 타게 한다**

`:156-160` 의 점 map 머리를 다음으로 바꾼다. `<g>` 안의 원 두 개와 `<title>` 은 그대로다.

```tsx
                        {points.map((p, idx) => (
                            <g
                                key={p.requirementId}
                                className="cursor-pointer"
                                onClick={() => selectPointAt(idx)}
                            >
```

- [ ] **Step 3: 선택된 번호를 라벨에서 앰버로 보여 준다**

`:198` 의 `{clusterLabel(cluster.members)}` 를 다음으로 바꾼다. `<text>` 의 나머지 속성
(좌표·테두리·`pointer-events-none`)은 손대지 않는다.

```tsx
                                {cluster.members.map((member, order) => (
                                    <Fragment key={member}>
                                        {order > 0 && <tspan fill="#fff">·</tspan>}
                                        {/* 겹친 자리는 점이 같은 픽셀이라 원에 표시를 해도
                                            어느 항목인지 알 수 없다. 번호 자체를 물들여
                                            표의 앰버 강조(amber-400)와 짝을 맞춘다. */}
                                        <tspan fill={member === selectedIndex ? '#fbbf24' : '#fff'}>{member + 1}</tspan>
                                    </Fragment>
                                ))}
```

`clusterLabel` 은 WS-6(`components/Kano2DChart.tsx`)이 계속 쓰므로 **지우지 마라**. 이
컴포넌트의 import 목록에서도 빼지 않는다 — 빼면 lint 가 미사용을 잡는다면 그때만 빼고
DEVIATIONS 에 적어라.

- [ ] **Step 4: 표가 내부 선택을 따르게 한다**

`:219` 한 줄을 바꾼다.

```tsx
                            const isSelected = item.requirementId === selectedId;
```

`:221` 의 강조 스타일과 나머지 표는 손대지 않는다.

- [ ] **Step 5: 전체 게이트**

```sh
npx tsc --noEmit
npx vitest run
npx next lint
```

Expected: tsc 출력 없음 / vitest 전체 통과(테스트 수 = Task 1 후와 같은 1,252) / lint 0건.
`react-hooks/exhaustive-deps` 경고가 나오면 **의존성 배열을 고치지 말고 중단·보고**하라 —
`selectPointAt` 은 useCallback 이 아니므로 경고 대상이 아니어야 한다.
컴포넌트 렌더링 테스트는 만들지 않는다. dev 서버도 띄우지 않는다.

- [ ] **Step 6: 커밋**

```sh
git add components/project/KanoSatisfactionGraph.tsx \
        docs/superpowers/plans/2026-09-08-timko-overlap-click-select.md
git commit
```

메시지: `fix: WS-7 그래프에서 겹친 항목도 클릭으로 차례차례 고를 수 있게 한다`
본문에 **왜**: 소비처가 선택 props 를 넘기지 않아 클릭과 표 강조가 만들어만 두고 끊겨
있었다는 것, 겹친 점은 위 점이 클릭을 가로채 앞 항목에 닿을 수 없었다는 것.

- [ ] **Step 7: 보고서를 둘째 커밋으로**

`docs/superpowers/reports/2026-09-08-timko-overlap-click-select/task-2.md`, 커밋 메시지
`docs: Task 2 결과 보고서`. RISKS 에 "클릭 순환·라벨 강조는 자동 테스트 없이 화면 검증으로
이월"을 적는다.

---

## 감리 체크리스트 (Task 승인 게이트)

1. **경계**: diff 가 `lib/timko-point-clusters.ts` 함수 1개 추가, 테스트 describe 1개 추가,
   `KanoSatisfactionGraph.tsx` 다섯 곳, 계획서·보고서뿐인가. `clusterOverlappingPoints`·
   `clusterLabel` 본문과 기존 테스트 8개가 그대로인가. `app/project/[id]/page.tsx` 와
   `components/Kano2DChart.tsx` 가 diff 에 없는가. 점의 좌표식·색 분기·반지름·`<title>` 이
   그대로인가.
2. **표본 대조**: (a) `position + 1` 과 `% cluster.members.length` 가 계획서와 같은가.
   (b) 테스트에 구성원 `[1, 4, 9]` 묶음을 선택 없이 누르는 시나리오가 있는가(없으면
   `?? -1` 뮤턴트가 등가로 살아남는다). (c) `selectedId` 가
   `selectedRequirementId ?? internalSelectedId` 인가(부모 우선). (d) 라벨 tspan 이
   `member === selectedIndex` 로만 색을 가르는가.
3. **회귀 역검증**: `(position + 1)` 을 `(position - 1)` 로 임시로 바꾸면 "다음 구성원"과
   "셋 순환" 테스트가 실패하는가. `?? -1` 을 `?? +1` 로 바꾸면 "셋 순환"이 실패하는가.
   되돌려도 통과하면 시나리오가 부족한 것이다.
4. **게이트 직접 재실행**: tsc 0 · vitest 1,252 통과 · lint 0 ·
   stryker `lib/timko-point-clusters.ts` **100%**(하락은 CI 도 잡는다).
5. **화면 검증(감리자·사용자, 실브라우저)**: WS-7 탭에서
   (a) 겹치지 않은 점을 누르면 아래 상세표의 해당 행이 앰버로 강조되고 차트의 그 번호가
   앰버가 되는가,
   (b) `4·7` 라벨을 누르면 먼저 **4**가 잡히고(표 4행 강조, 라벨의 4 만 앰버), 다시 누르면
   **7**로 넘어가고, 또 누르면 4 로 돌아오는가 — `11·15` 도 같은가,
   (c) 점의 위치·색·툴팁이 이전과 같은가,
   (d) 다른 탭에 다녀와도 화면이 깨지지 않는가(선택은 초기화돼도 된다).

## 계획 밖 (사람이 하는 일 / 사용자 결정)

- **실화면 검증** — dev 서버 기동은 실행 AI 에게 위임하지 않는다. 위 체크리스트 5 번.
- **WS-6 의 툴팁**: `components/Kano2DChart.tsx` 는 클릭 기능이 없고 `<title>` 툴팁만 있다.
  겹친 점의 뒤쪽 항목은 툴팁도 뜨지 않는데, 이번 요청(클릭 대상 선택)의 범위가 아니다.
  필요하면 "겹친 묶음의 툴팁에 구성원 이름을 모두 싣기"로 별도 계획을 잡는다.
- **선택 해제**: 같은 항목을 다시 눌러도 선택이 풀리지 않는다(단독 점은 계속 선택 상태).
  풀리게 하려면 별도 지시가 필요하다 — 겹친 묶음의 순환과 규칙이 충돌하기 때문이다.
- **표에서 차트로의 역방향**: 표 행을 눌러 차트 번호를 강조하는 것은 이번 범위 밖이다.
- **선택 상태의 지속**: 탭을 옮기면 컴포넌트가 다시 마운트돼 선택이 풀린다. 유지가 필요하면
  부모(`page.tsx`)가 상태를 들고 props 로 넘기면 된다 — props 계약은 그대로 열려 있다.
