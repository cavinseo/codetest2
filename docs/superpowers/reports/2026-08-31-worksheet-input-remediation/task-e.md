# Task E 결과 보고서 — 탭 전환 경고

## RESULT

**Task D 가 남겨 둔 구멍을 막았다.** 이제 워크시트 탭을 옮길 때도 되묻는다.

| 이탈 경로 | Task D 이후 | Task E 이후 |
| --- | --- | --- |
| 브라우저 창 닫기 · 새로고침 | ✅ 경고 | ✅ 경고 |
| **워크시트 탭 전환** | ❌ 조용히 사라짐 | ✅ 경고 |
| 저장 직후 자동 이동(`onSaved`) | (해당 없음) | ✅ 되묻지 않음 |

### 왜 Task D 만으로는 부족했나

Task D 는 `beforeunload` 를 걸었다. 그건 **브라우저가 페이지를 떠날 때만** 작동한다.
그런데 이 앱의 워크시트 탭 전환은 페이지를 떠나는 것이 아니라 **한 페이지 안에서 화면만
갈아 끼우는 것**(`setActiveTab` → 언마운트)이라 브라우저 입장에서는 아무 일도 일어나지
않는다.

**결과적으로 Task D 는 드문 경로를 막고 흔한 경로를 남겨 두었다.** WS-1 부터 WS-17 까지
순서대로 채워 나가는 구조에서 사용자가 반복하는 행동은 "이 표 채우다가 다음 표로
넘어가기"이고, 창을 닫는 일은 그보다 드물다.

### 어떻게 막았나

탭을 쥔 쪽(`app/project/[id]/page.tsx`)이 "지금 열린 워크시트가 저장 안 된 상태인가"를
알아야 한다. 워크시트 12개에 props 를 뚫어 내리는 대신 컨텍스트로 받는다.

```
useUnsavedChanges (워크시트 12개)
      │  setDirty(useId(), dirty)          ← 이펙트
      │  정리 함수가 언마운트 시 false 로 지운다   ← 여기가 핵심
      ▼
UnsavedChangesProvider (page.tsx)
      │  dirtyWorksheets: Set<string>      ← ref
      ▼
navigateToTab(tabId)  →  비어 있지 않으면 window.confirm
```

### 설계 판단 셋

**1. dirty 목록을 state 가 아니라 ref 로 들었다.** 이 값은 **탭을 옮기려는 순간에만**
읽으면 된다. state 로 들면 타이핑 한 글자마다 프로젝트 화면 전체가 다시 그려진다.

**2. 정리 함수가 없으면 경고가 따라다닌다.** 탭을 옮기면 그 워크시트는 언마운트되는데,
dirty 로 남겨 두면 **다음 이동까지 경고가 붙어 다녀** 저장했는데도 되묻게 된다. 헛도는
경고는 한 번만 겪어도 그다음부터 읽히지 않는다 — Task B 가 고친 409 가드가 정확히 그
실패를 하고 있었다.

**3. Provider 가 없어도 동작한다.** 워크시트는 프로젝트 페이지 밖(테스트, 다른 화면)
에서도 쓰일 수 있다. 그때는 `useUnsavedChangesRegistry()` 가 `null` 을 주고 창 닫기
경고만 걸린다.

### 가로채지 않은 것

`onSaved` 콜백 2곳 — 스펙 저장 후 속성으로(`page.tsx:414`), 매출 저장 후 스펙으로
(`:418`) 자동 이동한다. **저장이 막 끝난 직후의 이동이라 되물으면 오탐이다.**
그대로 `setActiveTab` 을 쓴다.

## FILES CHANGED

- Add: `lib/unsaved-changes-context.tsx` (컨텍스트 + Provider + 훅)
- Modify: `lib/unsaved-changes.ts` (`applyDirtyReport`·`hasUnsavedWork`·`LEAVE_WORKSHEET_CONFIRM`)
- Modify: `lib/use-unsaved-changes.ts` (컨텍스트에 dirty 보고, `useId` 키)
- Modify: `app/project/[id]/page.tsx` (`navigateToTab`, Provider 로 감싸기, 이동 버튼 4곳)
- Modify: `tests/unsaved-changes.test.ts` (+7건)
- Add: `docs/superpowers/reports/.../통합테스트-수동실행.md` (D-A 결정에 따른 절차)

## COMMIT

- `2220cdd` — feat: 탭을 옮길 때도 저장하지 않은 변경을 경고한다 (Task E)

## VERIFIED BY

run 33461136285 / job 99711284515, 커밋 `2220cdd`.

```
$ npx tsc --noEmit
(출력 없음, exit 0)

$ npx vitest run --pool=threads
 Test Files  95 passed (95)
      Tests  1101 passed (1101)

$ npm run lint
> eslint .
(출력 없음, exit 0)

$ npm run build
✓ Compiled successfully
```

**이번에는 `npm run build` 를 게이트에 더했다.** Task E 는 화면 구조(컨텍스트 Provider)
를 건드리므로, 타입 검사만으로는 Next 의 서버·클라이언트 경계 문제가 드러나지 않는다.

기준선 대비: 1054 → **1101 tests** (+47), 93 → **95 files** (+2).

새 테스트 7건:

```
탭 전환 가로채기 — dirty 목록
  저장 안 된 워크시트가 없으면 이동을 막지 않는다
  워크시트가 dirty 를 보고하면 이동을 막는다
  같은 워크시트가 여러 번 보고해도 한 번만 센다       ← 타이핑마다 이펙트가 돈다
  저장하거나 언마운트되면 목록에서 빠지고 이동이 풀린다  ← 정리 함수
  없는 키를 지워도 문제없다
  워크시트가 둘 이상 dirty 면 하나만 저장해도 여전히 막는다
  확인 문구는 무엇이 사라지는지 먼저 말한다
```

## DEVIATIONS

**`window.confirm` 을 그대로 썼다.** 커스텀 모달이 더 보기 좋겠지만, 이 저장소는 이미
같은 상황에서 `window.confirm` 을 쓴다(`ProductAttributesTable.tsx:352`,
`RequirementsTable`). 관례를 따랐다.

**개요 화면의 이동 버튼 3곳도 함께 가로챘다.** 그 버튼들은 `activeTab === 'overview'`
일 때만 렌더되고 그때는 워크시트가 마운트돼 있지 않아 dirty 목록이 비어 있다 —
**실질적으로 no-op 이다.** 그래도 돌린 이유는, 나중에 개요에 입력 요소가 생겼을 때
여기만 빠져 있으면 조용히 새는 경로가 되기 때문이다.

## RISKS

**화면에서 확인하지 않았다.** 컨텍스트 배선과 정리 함수의 타이밍은 실제 마운트·언마운트
순서에 달려 있는데, 그것을 확인한 것은 타입 검사와 빌드뿐이다. **다음 두 가지를 실계정
으로 꼭 밟아 보기 바란다.**

1. WS-3 에서 한 글자 입력 → 다른 탭 클릭 → **확인창이 뜨는가**
2. 위에서 "취소" → 저장 → 다른 탭 클릭 → **이번엔 안 뜨는가** (정리 함수와 markClean 이
   제대로 도는지 보는 것이다. 여기서 경고가 또 뜨면 배선이 틀린 것이다)

**`useId()` 를 키로 쓴다.** React 가 마운트마다 안정적인 id 를 주므로 같은 워크시트가
다시 열려도 겹치지 않는다. 다만 Provider 밖에서 렌더될 때는 등록 자체가 일어나지 않아,
그 경우 탭 경고가 없다는 점은 설계대로다.

**뒤로 가기(브라우저 히스토리)는 여전히 못 막는다.** 이 앱의 탭은 URL 에 반영되지 않아
히스토리 항목이 생기지 않는다. 그래서 "뒤로 가기"는 프로젝트 화면 자체를 떠나는 것이고
`beforeunload` 가 잡는다 — 다만 Next 의 클라이언트 라우팅으로 다른 페이지에 갈 때는
`beforeunload` 가 걸리지 않는다. 프로젝트 화면 안의 `Link` 이동이 그렇다.
**이 경로는 아직 열려 있다.**

## QUESTIONS

**프로젝트 화면 안의 `Link` 이동은 아직 막지 않았다.** 헤더의 "프로젝트 목록"처럼
Next 라우터로 다른 페이지에 가는 링크는 `beforeunload` 도 `navigateToTab` 도 거치지
않는다. 막으려면 Next 의 라우터 이벤트를 가로채야 하는데 App Router 에서는 공식
API 가 없어 우회가 필요하다(`Link` 를 감싼 컴포넌트를 따로 두는 식).

빈도가 탭 전환보다 낮다고 보아 이번엔 뺐다. 필요하다고 판단되면 별건으로 요청하면 된다.
