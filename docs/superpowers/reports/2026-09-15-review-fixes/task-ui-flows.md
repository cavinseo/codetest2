# UI·조회 결함 F04/F05/F06/F10/F11 수정 결과.

## 변경 근거와 범위.

- F04. `calculateQfdWorksheet`가 이름을 trim했을 때 비어 있는 세부기능을 계산·순위·총점에서 제외한다. 분석 API의 세부기능 수도 계산 결과와 맞춘다. JSON 복원 스키마는 공백 이름을 거절하며, 기존 기술특성이나 관계 행을 조회 중 삭제하지 않는다. 신규 입력 API의 기존 공백 차단은 유지한다.
- F05. 멘티의 담당 멘토는 `User.mentorAssignment.mentor`에서 읽고, 멘토의 소속 프로젝트는 자신의 `MentorAssignment`에 속한 멘티의 소유 프로젝트에서 읽는다. 과거 `ProjectMember.COACH`는 현재 소속 조회에 사용하지 않는다. 프로젝트 개설 전에도 현재 배정 멘토는 표시한다. 프로그램 매니저·관리자 조회 계약은 유지한다.
- F06. 개요 저장 payload에서 `productName`, `marketDefinition`, `targetCustomer`의 `?? ''` 변환을 제거했다. 손대지 않은 null은 그대로 전송하고 실제 입력 후 지운 빈 문자열은 그대로 전송하여 보고서의 기존 자유입력과 명시적 삭제를 구분한다.
- F10. Windows Chrome/Edge의 Navigation API에서 취소 가능한 동일 문서 traverse를 이동 전에 막고 기존 확인 대화상자를 연다. 취소하면 현재 URL·교정·이력을 유지하고, 나가기를 선택하면 원래 destination key로 `traverseTo`한다. 취소 불가능한 native popstate도 현재 key로 복귀한 뒤 확인하여 앞으로가기 이력을 삭제하지 않는다. 이동 실패 시 교정과 미저장 경고를 다시 유지한다.
- F11. PENDING 전체와 사용하지 않은 APPROVED 전체를 조회하고, 그 외 완료 이력만 최신 100건으로 제한한다. 원래 전체 정렬과 권한 조건을 유지한다. 두 조회 사이에 상태가 바뀌어 같은 신청이 양쪽에 잡히면 완료 상태 한 행으로 합친다.

## 실행 결과.

|검증|실제 결과|
|---|---|
|F04/F05/F11 재현 묶음|수정 전 42건 중 11 실패·31 통과, 수정 후 42건 통과.|
|F06 실제 React DOM 재현|수정 전 2건 중 1 실패·1 통과, 수정 후 개요 API·보고서 모델 포함 46건 통과.|
|F10 원본 코드 회귀 재실행|원본 페이지를 임시 적용한 동일 7건에서 5 실패·2 통과. 수정본 즉시 복구 후 7건 통과, 이동 실패 회귀를 추가하여 최종 8건 통과.|
|최종 담당 묶음|14파일 175테스트 통과.|
|TypeScript|`npx tsc --noEmit` 성공.|
|ESLint|`npm run lint` 성공.|

최종 담당 테스트 명령은 아래와 같다.

```powershell
npx vitest run tests/qfd-worksheet.test.ts tests/import-json-schema.test.ts tests/api-qfd-analysis.test.ts tests/api-import-json-guards.test.ts tests/api-qfd-technical-get-sync.test.ts tests/api-qfd-technical-delete.test.ts tests/qfd-matrix-autosave.test.ts tests/api-me-affiliation.test.ts tests/affiliation.test.ts tests/product-overview-page.test.ts tests/api-product-overview.test.ts tests/final-report-document.test.ts tests/final-report-navigation.test.ts tests/api-project-requests.test.ts
```

F04는 기존 공백 기술특성의 강한 관계가 정상 기능보다 높은 점수를 갖도록 재현했으며, 제외 뒤 정상 기능이 1위·총점 2가 되는 것과 입력 불변을 확인했다. 복원 거절은 트랜잭션 진입 전 400을 확인했다. F05는 과거 COACH와 현재 멘토가 다른 fixture 및 현재 배정 기반 프로그램 묶음을 검증했다. F11은 미결 105건, 미사용 승인 1건, 완료 110건을 넣어 총 206건과 완료 100건 제한을 확인했다.

F10의 DOM 테스트는 실제 React 페이지의 교정 입력과 대화상자를 사용하며 브라우저 Navigation API 자체는 EventTarget 기반 fixture로 대체했다. 뒤로·앞으로가기 양쪽에서 취소 가능한 traverse와 취소 불가능한 popstate를 각각 검증했고, native 경로의 `pushState` 호출은 0건이었다. 저장 후 경고 해제, 내부 링크, 이동 실패 시 교정 보존도 확인했다.

## 미검증 범위와 브라우저 제한.

- 실제 DB, 실제 Chrome/Edge 이력 이동, 전체 테스트·통합·빌드·배포는 주 작업자에게 인계했다. 운영 DB나 실회원으로 실행하지 않았다.
- Navigation API 미지원 브라우저의 최소 fallback은 popstate 후 현재 URL을 pushState로 복원하여 교정을 보존하고, 확인한 목적 URL로 replace한다. 이 fallback에서는 앞으로가기 스택 소실 또는 이력 중복이 가능하다. 현재 실제 대상인 Windows Chrome/Edge의 native 경로에는 이 fallback을 사용하지 않는다. 이 제한은 주 작업자에게 보고하고 승인받은 범위다.
- Chrome/Edge 실검증은 이전 페이지 → 보고서 → 다음 페이지의 이력을 만든 뒤 보고서로 돌아와 교정하고, back/forward 각각 취소 후 같은 교정과 URL 유지, 재시도 승인 후 정확한 목적지 및 이력 길이 불변을 확인해야 한다. 새로고침·문서 간 이동은 기존 beforeunload 방어를 유지한다.

Navigation API의 traverse 취소 조건과 destination key 재개 동작은 [WICG Navigation API 설명](https://github.com/WICG/navigation-api)에서 확인했다. 취소 가능한 traverse는 최상위 창의 동일 문서 이동이어야 하며 사용자 활성 조건이 추가된다. 그 조건을 충족하지 않는 native 이동은 popstate에서 현재 key로 복귀한다.

커밋·푸시·배포는 수행하지 않았다.
# 최종 통합 검수 추가 기록.

독립 리뷰에서 F10의 비동기 이벤트 순서 공백을 발견했다. `traverseTo().finished` 다음에 복원 `popstate`가 발생하면 원래 목적지가 현재 보고서로 덮어써지는 경우를 back/forward 회귀 2건으로 재현했다. 복원 대상의 popstate를 수신할 때만 복원 상태를 해제하도록 수정했다. 보고서 이력 테스트는 10건, 담당 묶음은 177건이다. 주 작업자가 새 운영 빌드의 실제 브라우저에서 양방향 취소 시 교정 보존 및 재시도 승인 후 원래 목적지 도착을 확인했다.
