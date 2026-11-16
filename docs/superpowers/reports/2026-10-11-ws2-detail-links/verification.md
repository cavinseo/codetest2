# WS-2 세세부기술의 후속 워크시트 포함 여부 검토.

## RESULT

현재 배포 커밋 `f96262b5426c8d4107dbec0119024d2d86ae6a3c`의 코드를 기준으로 확인했다. WS-2의 세세부기술을 후속 워크시트에서 사용할 수 있으나 모든 후속 표에 자동으로 포함·동기화되는 것은 아니다.

| 워크시트 | 확인한 동작 | 제한사항 |
| --- | --- | --- |
| WS-3 | WS-2의 세세부기술을 스펙 선택 후보로 제공하며 적용기술도 참조한다. | 작성자가 제품속성으로 선택해야 한다. |
| WS-10 | 세부스펙 선택 후보에 세세부기술과 그 적용기술을 포함한다. 선택 시 세부스펙·기술적 특성을 채운다. | 세세부 전용 열이 없고 세부스펙 칸에 저장한다. 원본 전체를 자동 배치하지 않으며 기존 행을 자동 갱신하지 않는다. |
| WS-9 | 저장된 WS-10의 세부스펙 이름을 기술특성으로 연결한다. | WS-10에서 선택·저장한 세세부 항목이 연결되는 방식이며 WS-2 전체를 직접 포함하지 않는다. |
| WS-12 | 저장된 목표스펙이 없을 때 WS-2의 세세부기술을 `세부기술 > 세세부기술` 경로와 적용기술로 초기 구성한다. | 저장된 목표스펙이 있으면 해당 저장본을 우선하므로 이후 WS-2에 추가한 세세부기술은 자동 병합되지 않는다. |

WS-10 저장 시 WS-12에 추가되는 행은 WS-2에 없는 신규 기능이다. WS-2에 존재하는 세세부 항목은 기존 원본으로 분류되어 이 추가 경로에서 제외된다. 따라서 기존 WS-12에 누락된 WS-2 세세부 항목을 WS-10 저장만으로 보완하지 않는다.

## EVIDENCE

- `lib/tech-tree-utils.ts`의 `buildTechTreeSpecOptions`가 DETAIL 후보 및 적용기술을 구성하고 `applyTechTreeSpecSelection`이 선택한 내용을 행에 반영한다.
- `components/project/TechTreeTable.tsx`는 기존 저장행을 우선하며 세세부 후보를 세부스펙 입력·선택 칸에 제공한다.
- `lib/worksheet-links.ts`의 `buildTargetSpecsFromAsIs`가 DETAIL 행의 부모 경로를 작성한다.
- `components/project/TargetSpecTable.tsx`는 저장된 `rows`가 있으면 `asIsRows` 대신 저장된 행을 표시한다.
- `lib/worksheet-links.ts`의 `buildTargetSpecAdditionsFromTechTree`는 WS-2에 이미 있는 항목을 추가 대상에서 제외한다.
- `lib/final-report-inputs.ts`는 WS-12의 저장된 `rows`를 보고서 데이터로 사용한다. 미저장 초기 후보 자체가 보고서에 자동으로 들어가지는 않는다.

## VERIFIED BY

배포 작업 폴더에서 기존 모킹 테스트를 실행했다.

`npx vitest run tests/tech-tree-utils.test.ts tests/worksheet-links.test.ts tests/tech-tree-target-ui.test.ts tests/api-tech-tree-target-sync.test.ts tests/api-worksheet-link-regressions.test.ts --reporter=dot`

결과는 `Test Files 5 passed (5)`, `Tests 41 passed (41)`이다. 기존 WS-10 화면 테스트에서 React의 목록 key 경고가 출력됐으나 테스트는 통과했다.

## RISKS

실제 프로젝트의 저장 데이터나 로그인 화면은 조회하지 않았다. 포함 여부와 자동 반영 조건은 배포본 코드와 기존 테스트를 기준으로 확인했다. 기능 코드는 변경하지 않았다.

## RECOMMENDATION

WS-12 저장본에 누락된 WS-2 세세부 항목을 추가하되 기존 목표값·작성 내용은 보존하는 병합 규칙이 필요하다. WS-10에서도 핵심·세부·세세부의 관계를 유지하려면 현재의 두 단계 문자열 저장 구조를 보완해야 한다.
