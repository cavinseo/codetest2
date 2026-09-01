# Task C 결과 보고서 — 스펙 선택기 행병합 버그

## RESULT

**세부기능 칸이 통째로 사라지고 오른쪽 열이 밀리던 문제를 없앴다.**

| 항목 | 이전 | 이후 |
| --- | --- | --- |
| 숨김 판정 | `arr[index][key] === arr[index-1][key]` (core 비교 **없음**) | 계수 판정과 같은 기준 |
| 계수 판정 | `... && (key === 'core' \|\| arr[i].core === arr[index].core)` | 그대로 |
| core 다르고 sub 같은 인접 행 | 아래 행의 `<td>` 가 렌더되지 않음 | 두 행 모두 그려짐 |
| 위치 | `ProductAttributesTable.tsx` 안 클로저 (테스트 불가) | `lib/product-attributes-utils.ts` (테스트 7건) |

### 무엇이 어긋났나

세는 쪽과 숨기는 쪽의 기준이 달랐다.

```ts
if (index > 0 && arr[index][key] === arr[index - 1][key]) return 0;   // core 비교 없음
...
if (arr[i][key] === arr[index][key] && (key === 'core' || arr[i].core === arr[index].core)) count++;
//                                      ↑ 여기에는 있다
```

core 가 다른데 sub 이름이 같은 인접 두 행에서

- 위 행의 `count` 는 core 경계에서 멈춰 **1**
- 아래 행은 **0** 을 받아 `<td>` 가 렌더되지 않는다

**그 칸을 아무도 그리지 않는다.** 결과적으로 세부기능 열이 비고 오른쪽이 한 칸씩 밀린다.

### 재현 빈도가 생각보다 높다

`buildSpecPickerRows` 는 하위가 없는 core 에 `sub: ''` 를 넣는다. 그런 core 가 둘
연달아 있으면 `'' === ''` 이라 **바로 이 버그를 밟는다.** "설치"·"관리" 같은 이름이
겹치는 경우보다 이쪽이 훨씬 흔하다. 회귀 테스트에 두 경우를 모두 넣었다.

### 같은 파일에 이미 옳은 형태가 있었다

`getSegmentScopedSpan`(`lib/product-attributes-utils.ts:194-217`)은 숨김 쪽과 계수 쪽에
같은 조건을 쓴다. 그 형태를 따랐다.

## FILES CHANGED

- Modify: `lib/product-attributes-utils.ts` (`getSpecPickerSpan`·`SpecPickerGroupRowLike` 추가)
- Modify: `components/project/ProductAttributesTable.tsx` (`getRowSpan` 이 새 함수를 부르게)
- Modify: `tests/product-attributes-utils.test.ts` (+7건)

## COMMIT

- `85339a0` — fix: 워크시트 저장 결함 셋 (Task A·B·C)

## VERIFIED BY

run 33459364656 / job 99706076947, 커밋 `85339a0`.

```
$ npx tsc --noEmit
(출력 없음, exit 0)

$ npx vitest run --pool=threads
 Test Files  94 passed (94)
      Tests  1084 passed (1084)

$ npm run lint
> eslint .
(출력 없음, exit 0)
```

새 테스트 7건:

```
getSpecPickerSpan
  core 가 다르면 sub 이름이 같아도 두 행 모두 칸을 그린다      ← 회귀 본체
  세부기능이 없어 sub 가 빈 문자열인 인접 행도 마찬가지다      ← 가장 흔한 경로
  같은 core 안에서 연속된 같은 sub 는 첫 행이 개수를 갖고 나머지는 숨는다
  key 가 'core' 면 core 만 본다
  떨어져 있는 같은 값은 병합하지 않는다
  빈 배열과 범위 밖 index 는 1 이다
  단일 행은 1 이다
```

### CRAP 게이트 (계획서 C-4)

**게이트를 건드리지 않는다.** 계획서는 `buildSpecPickerRows`(CRAP 29.5, `--fail-over=30`
까지 여유 0.5)에 분기를 더할 것을 걱정했는데, 실제로는 **그 함수를 손대지 않고 별도
함수를 추가**했다. 새 함수는 테스트 7건으로 완전히 덮이므로 CRAP 은 복잡도와 같은
수준(한 자리)에 머문다.

다만 이번 게이트 실행에는 CRAP 측정이 들어 있지 않다(`crap.yml` 은 main PR 전용).
**main 으로 PR 을 열 때 실측된다.**

## DEVIATIONS

**`getRowSpan` 을 지우지 않고 얇은 위임으로 남겼다.** 계획서 C-2 는 `lib/` 로 "옮기라"고
했는데, 호출부가 두 곳(`coreSpan`·`subSpan`)이고 시그니처가 `(arr, key, index)` 로 같아
이름을 그대로 둔 채 한 줄 위임으로 두는 편이 diff 가 작다. 컴포넌트 쪽 로직은 사라졌다.

## RISKS

**화면에서 확인하지 않았다.** rowSpan 은 브라우저 렌더링 결과라 순수 함수 단언만으로는
"열이 실제로 맞게 그려지는가"를 보증하지 못한다. 함수가 돌려주는 수는 맞지만, 그 수를
`<td rowSpan>` 에 넣었을 때의 시각적 결과는 실기동 확인이 남는다(계획서 D-C).

**병합 자체의 설계 문제는 그대로다.** 검토서 §3 WS-3-2 가 지적한 "연속된 동일 문자열로만
병합" 규칙은 손대지 않았다 — 오타 한 글자로 병합이 조용히 깨지고, 행 순서를 바꾸면
깨지며, AI 프롬프트에까지 그 제약이 새어 나간다. 이번엔 **두 판정의 기준을 맞추는 것**
까지가 범위였다. 이월 항목 7번이다.

## QUESTIONS

없다.
