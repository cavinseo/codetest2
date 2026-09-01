# Task D 결과 보고서 — 미저장 이탈 경고

## RESULT

**저장하지 않고 창을 닫으면 브라우저가 되묻는다.** 저장 버튼 계열 12개 워크시트에서만.

| 항목 | 이전 | 이후 |
| --- | --- | --- |
| `beforeunload` | 저장소 전체 **0건** | 훅 1개, 워크시트 12개에 적용 |
| dirty 판정 | (없음) | 저장 시점 스냅샷과 직렬화 비교 |
| 즉시 저장 워크시트(WS-7·WS-9) | (해당 없음) | **적용하지 않음** — 걸면 오탐 |
| 탭 전환 | 경고 없음 | **여전히 경고 없음** (막을 수 없다, 아래 참조) |

### 대상을 12개로 좁힌 이유

모든 워크시트가 저장 버튼 방식은 아니다. 코드로 확인했다.

| 워크시트 | 저장 시점 | 적용 |
| --- | --- | --- |
| Sales · DevPlan · TechRoadmap · TechTree · TargetSpec | 저장 버튼 | ✅ |
| Assets · Improvements · Funding | 저장 버튼 | ✅ |
| Requirements · Spec · ProductAttributes · Fitness | 저장 버튼 | ✅ |
| WS-7 Kano 가중치 | `onBlur` 즉시 저장 (`KanoAggregationTable.tsx:157`) | ❌ |
| WS-9 QFD 관계 셀 | 클릭 즉시 POST (`QFDMatrix.tsx:276`) | ❌ |

즉시 저장 워크시트에 걸면 **저장이 이미 끝난 상태에서도 경고가 뜬다.** 헛도는 경고는
한 번만 겪어도 그다음부터 읽히지 않는다 — Task B 가 고친 409 가드가 정확히 그 실패를
하고 있었다.

### dirty 판정을 스냅샷 비교로 한 이유

`onChange` 마다 플래그를 세우는 흔한 방식은 **고쳤다가 되돌린 경우**에도 dirty 로 남는다.
저장할 것이 없는데 이탈을 막는 것도 같은 종류의 헛도는 경고다.

```ts
export function isDirty(snapshot: string | null, value: unknown): boolean {
    if (snapshot === null) return false;   // 아직 로드 전 — 로딩 중 이탈까지 막지 않는다
    return snapshotOf(value) !== snapshot;
}
```

### `markClean` 이 값을 인자로 받는 이유

같은 시점에 `setRows` 도 부르는데 state 는 **아직 갱신 전**이다. 훅이 스스로 현재 값을
읽으면 **한 박자 늦은 값**을 기준선으로 굳혀, 저장 직후인데도 dirty 로 남는다.

받은 값을 그대로 돌려주므로 감싸 쓸 수 있고, **굳히는 값과 화면에 넣는 값이 반드시
같아진다.**

```ts
setRows(markClean(nextRowsFromServer));
```

### 표 밖의 입력도 함께 본다

네 컴포넌트는 표 하나가 아니라 여러 상태를 함께 저장한다. 그 조합을 한 값으로 넘겼다.

```
ProductAttributesTable  { rows, productName, techCapability }
ImprovementsTable       { rows, features }
FundingTable            { plans, sources }
FitnessWrapper          { markets, matrix, managerComment }
```

## FILES CHANGED

- Add: `lib/unsaved-changes.ts` (`snapshotOf`·`isDirty` — 순수 판정)
- Add: `lib/use-unsaved-changes.ts` (`useUnsavedChanges` — `beforeunload` 등록)
- Add: `tests/unsaved-changes.test.ts` (10건)
- Modify: 워크시트 컴포넌트 12개
  (`SalesTable` · `DevPlanTable` · `TechRoadmapTable` · `TechTreeTable` · `TargetSpecTable` ·
  `AssetsTable` · `ImprovementsTable` · `FundingTable` · `RequirementsTable` · `SpecTable` ·
  `ProductAttributesTable` · `FitnessWrapper`)

## COMMIT

- `ee0a1df` — feat: 저장하지 않고 나가면 경고한다 (저장 버튼 계열 12개)

## VERIFIED BY

run 33459965570 / job 99707871680, 커밋 `9a9ae9b`(이 보고서 직전 커밋 — 코드는
`ee0a1df` 와 같고 워크플로의 요약 재출력만 더해졌다).

```
$ npx tsc --noEmit
(출력 없음, exit 0)

$ npx vitest run --pool=threads
 Test Files  95 passed (95)
      Tests  1094 passed (1094)

$ npm run lint
> eslint .
(출력 없음, exit 0)

$ npx prisma validate
The schema at prisma/schema.prisma is valid 🚀

$ npx stryker run stryker.crap.config.json --mutate lib/import-cascade-guard.ts
killed=71 survived=0 other=0
```

**타입 검사 통과가 이 Task 의 1순위 증거다.** 12개 컴포넌트에 손을 댔고 각각 상태 모양이
달라, `markClean` 에 잘못된 값을 넘기면 여기서 잡힌다.

기준선 대비: 1054 → **1094 tests** (+40), 93 → **95 files** (+2). Task A·B·C 가 +30/+1,
Task D 가 +10/+1.

새 테스트 10건:

```
isDirty
  저장 시점과 같으면 깨끗하다
  한 셀만 달라도 dirty 다
  고쳤다가 되돌리면 다시 깨끗하다          ← onChange 플래그 방식이 놓치는 경우
  행 순서만 바뀌어도 dirty 다
  행이 늘거나 줄어도 dirty 다
  아직 로드 전(snapshot 이 null)이면 dirty 가 아니다
  빈 표끼리는 깨끗하다
  빈 표에서 행을 추가하면 dirty 다
snapshotOf
  같은 값이면 같은 문자열이다
  표 밖의 입력값도 함께 담을 수 있다
```

### 적용 대상 확인

```
$ grep -l useUnsavedChanges components/project/*.tsx | wc -l
12
$ grep -l useUnsavedChanges components/project/KanoAggregationTable.tsx components/project/QFDMatrix.tsx
(없음)
```

## DEVIATIONS

**계획서의 "13개"는 실제로 12개였다.** 검토서 §1-3 표의 "저장 버튼 계열"을 컴포넌트
단위로 세어 확인했다. 나머지는 읽기 전용(`KanoRespondentTable`·`KanoSatisfactionGraph`),
네비게이션(`ProjectWorksheetMenu`), 즉시 저장(WS-7·WS-9), WS-3 안의 위저드
(`AttributeMentorWizard` — 부모인 `ProductAttributesTable` 이 이미 덮는다)다.
계획서와 검토서를 12개로 정정했다.

**훅 API 를 `useUnsavedChanges(isDirty: boolean)` 이 아니라 `useUnsavedChanges(value)` 로
만들었다.** 계획서 D-1 은 불리언을 받는 형태였는데, 그러면 각 컴포넌트가 스냅샷 state
와 비교 로직을 따로 들고 있어야 해서 12곳에 같은 코드가 복제된다. 값을 받고
`markClean` 을 돌려주는 형태가 호출부를 한 줄로 줄인다.

**`dirty` 를 렌더 중에 계산한다.** 기준선이 `useRef` 라 `markClean` 은 리렌더를 일으키지
않지만, 늘 `setState` 와 함께 불리므로 그 리렌더에서 다시 계산된다. state 로 들고
`useEffect` 로 갱신하면 매 렌더마다 이펙트가 도는 편이 오히려 낭비다.

## RISKS

**화면에서 확인하지 않았다.** `beforeunload` 는 브라우저 동작이라 vitest 로는 "리스너가
붙었는가"조차 이 구성에서는 단언하지 않았다. 순수 판정(`isDirty`)만 테스트했다.
**12개 워크시트에서 실제로 확인창이 뜨는지는 실기동 확인이 남는다**(계획서 D-C).

**매 렌더마다 `JSON.stringify` 를 돈다.** 워크시트 크기(수십~수백 행)에서는 문제가
없다고 봤지만, 타이핑마다 직렬화가 일어나는 것은 사실이다. 수천 행짜리 표가 생기면
재검토가 필요하다.

**탭 전환은 막지 못한다.** 워크시트 사이 이동은 `setActiveTab` 에 의한 언마운트이지
라우터 이동이 아니라 `beforeunload` 도 Next 라우터 가로채기도 걸리지 않는다.
**실사용에서 가장 흔한 이탈 경로가 이쪽일 가능성이 있다.** 1차 범위에서 뺐고, 막으려면
탭 컨테이너가 dirty 상태를 알아야 한다.

**`TargetSpecTable` 은 서버 제안(`data.suggestions`)도 기준선으로 굳힌다.** 저장된 행이
없을 때 화면에 올라오는 값인데, 사용자가 손대지 않았으므로 dirty 로 보지 않았다.
사용자가 아무것도 안 한 화면에서 경고가 뜨는 것보다는 낫다고 판단했지만, 제안을 그대로
쓰려던 사용자는 경고 없이 잃는다.

## QUESTIONS

**탭 전환 가로채기를 별도 Task 로 잡을지 판단을 요청한다.** 이 훅이 막는 것은 "브라우저
창을 닫거나 새로고침"뿐이다. 워크시트 17개를 순서대로 채우는 사용 패턴에서 실제로 자주
밟는 경로는 **다음 워크시트로 넘어가는 탭 전환**일 수 있는데, 그쪽은 여전히 조용히
사라진다. 탭 컨테이너에 dirty 상태를 올리는 작업이라 화면 구조를 건드린다.
