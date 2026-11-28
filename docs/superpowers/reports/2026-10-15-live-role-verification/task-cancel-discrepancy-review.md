# 운영 확인창 취소 관찰의 정적 검토.

## RESULT

배포 소스 스냅샷에서 `window.confirm`이 실제로 `false`를 반환한 **그 클릭의 실행은 삭제 콜백과 DELETE에 도달하지 않는다**. 이후 사용자가 기존 취소 보고를 “확인을 눌렀다”로 정정했으므로, 처음의 qa-a 삭제 관찰을 운영 취소 결함으로 판정할 근거는 철회되었다. qa-c를 대상으로 하는 새로운 실제 취소 검증의 결과는 이 보고서 작성 시점에 미확인이다.

### 제공된 운영 사실과 정정.

다음은 루트가 전달한 관찰이며 이 검토자가 브라우저·HTTP·DB에서 독립 확인한 사실은 아니다.

- 새 테스트 프로젝트 `proj_993e1ebea9bc423d`에는 요구사항 2개와 이번 검증용 응답 qa-a/qa-b/qa-c만 있었다. 기존 접수 데이터는 없었다.
- qa-a 선택 후 자동화 클릭은 `Input.dispatchMouseEvent` CDP timeout을 보고했고, 당시 `getJsDialog` 관찰값은 `undefined`였다. 이후 사용자는 처음에는 취소했다고 보고했으며, DOM에서는 qa-a가 사라지고 선택이 0이었다.
- 사용자는 이후 **확인을 눌렀다고 정정했다**. 이전 취소 보고는 기록하되 최신 정정과 동등한 현재 사실로 사용하지 않는다.
- 중단 후 루트의 운영 새 탭 재조회에서는 qa-a와 qa-b가 없고 qa-c만 남았다. 초대 3개는 유지되며 a/b는 응답 대기, c는 완료였다. 이 상태는 선택 삭제의 응답 삭제·초대 완료 상태 초기화 동작과 부합하지만, 개별 클릭·DELETE 요청의 전체 시각과 연결 기록은 이 검토자에게 제공되지 않았다.
- 루트는 qa-c를 선택하고 사용자의 직접 취소를 별도 검증 중이다. 앞선 정정된 시도나 mock 테스트를 이번 취소 시도의 통과 증거로 사용하지 않는다.

### 확인된 소스 경로.

| 검사 항목 | 정적으로 확인한 근거와 결론 |
| --- | --- |
| false 취소의 흐름 | [스냅샷 Table 39행](/E:/Dropbox/codetest2/tmp/pending-release-source-snapshot/components/project/KanoRespondentTable.tsx:39)에서 `!window.confirm(...)`이면 즉시 반환한다. pending 설정, 오류 초기화, `onDelete`, 선택 초기화는 모두 그 다음이다. false 분기 자체는 이 상태들을 변경하지 않는다. |
| 선택 삭제 이벤트 | [Table 84행](/E:/Dropbox/codetest2/tmp/pending-release-source-snapshot/components/project/KanoRespondentTable.tsx:84)은 `type="button"`의 단일 `onClick`으로 `handleDelete(false)`를 호출한다. 전체 삭제도 같은 함수의 true 인수만 사용한다. 행·전체 선택 체크박스는 선택 상태만 바꾸며 DELETE나 삭제 콜백을 호출하지 않는다. |
| 중복 클릭 | Table 36행은 `busy` 및 동기 ref를 검사하고, 확인 후 40행에서 ref를 설정한다. [Manager 502행](/E:/Dropbox/codetest2/tmp/pending-release-source-snapshot/components/project/KanoManager.tsx:502)도 공유 pending ref를 검사·설정한다. false 취소 후 나중에 별도 클릭이 발생하면 다시 확인창을 띄울 수 있으나, 소스에는 취소를 자동 재시도하거나 확인 없이 재실행하는 일정 작업이 없다. |
| 실제 DELETE | [Manager 509행](/E:/Dropbox/codetest2/tmp/pending-release-source-snapshot/components/project/KanoManager.tsx:509)의 공통 콜백이 DELETE를 보낸다. 콜백 안에는 추가 확인창이 없지만, 읽은 호출자는 Table의 확인 성공 경로와 아래 리셋 확인 성공 경로뿐이다. Table과 분석 탭의 콜백 연결은 Manager 1316·1333행, AnalysisTab 172행에서 확인했다. |
| 다른 리셋 진입점 | [Manager 533행](/E:/Dropbox/codetest2/tmp/pending-release-source-snapshot/components/project/KanoManager.tsx:533)과 543행도 false이면 공통 삭제 콜백 전에 반환한다. 전체 응답 리셋은 본문 없는 DELETE, 초대 리셋은 `includeInvitations=true`를 추가한다. |
| 응답 목록 표시 | [Manager 237행](/E:/Dropbox/codetest2/tmp/pending-release-source-snapshot/components/project/KanoManager.tsx:237)은 서버 GET 결과로 목록을 교체한다. 선택 상태만으로 qa-a 행을 숨기는 필터나 취소 시 낙관적 행 삭제는 읽은 Table/Manager에 없다. Table의 성공 뒤 45행은 선택만 비운다. |
| 서버 범위 | [DELETE route 84행](/E:/Dropbox/codetest2/tmp/pending-release-source-snapshot/app/api/projects/[id]/kano/responses/route.ts:84)은 트랜잭션 안에서 리셋 helper를 호출한다. [helper 19행](/E:/Dropbox/codetest2/tmp/pending-release-source-snapshot/lib/kano-response-reset.ts:19)은 프로젝트와 전달된 식별값으로 응답을 삭제하고 35행에서 해당 초대의 완료 상태를 초기화한다. 서버는 브라우저 확인창 결과를 별도로 받지 않으므로, 요청이 실제 도착했는지가 운영 구분점이다. GET route에는 삭제 동작이 없다. |

읽은 스냅샷의 Table/Manager/AnalysisTab 및 관련 프로젝트 페이지에서 삭제 버튼에 추가 삭제 이벤트를 연결하거나 `window.confirm`을 다른 함수로 교체하는 코드는 발견하지 못했다. Table의 표시 helper와 토스트 hook에는 삭제 부작용이 없다. 스냅샷에 없는 직접 UI 의존성은 현재 작업 사본에서 관련 호출·confirm·이벤트 패턴만 대조했다. 이 대조는 운영 번들 또는 설치된 모든 패키지·브라우저 주입 스크립트의 동일성을 보증하지 않는다.

### 원인 후보와 반증 관찰.

| 후보 | 근거·현재 판정 | 구분에 필요한 관찰 |
| --- | --- | --- |
| 실제로 확인을 누른 이전 시도 | 사용자의 최신 정정으로 앞선 취소 전제가 철회되었다. 확인 성공 뒤 선택 삭제되는 소스 경로와 전달된 잔여 상태는 부합한다. 개별 a/b 요청의 전체 실행 기록을 확보했다는 뜻은 아니다. | 새 qa-c 시도를 독립 기록한다. 이전 시도를 취소 성공 또는 취소 결함의 증거로 재사용하지 않는다. |
| 동일 조작의 추가 클릭·다른 삭제 요청 | 제품 코드의 확인 후 pending ref는 중복 요청을 막는다. 취소 후 다른 클릭은 새 확인을 요구한다. 자동화 계층에서 별도 입력 또는 기존 요청이 발생했는지는 정적 소스로 알 수 없다. | 입력 한 번, 확인창 한 번, 해당 구간의 DELETE 수·URL·본문·initiator를 연결한다. `respondentEmails`와 본문 없는 리셋 요청을 구분한다. |
| 확인 함수 우회·다른 런타임 코드 | 읽은 소스에서는 false를 삭제 성공 경로로 바꾸는 코드나 confirm 교체를 찾지 못했다. 운영 반환값·로드된 번들·자동화의 대화상자 처리 기록은 직접 확인하지 않았다. 현재 확정 원인이 아니다. | 직접 취소가 실제 DELETE와 같은 시도에서 재현될 때만 확인창 처리 기록과 로드된 코드/번들 출처를 대조한다. |
| DOM 관찰만으로 삭제를 추정 | 초기 DOM만으로 DB 삭제 시점과 실행 주체를 확정할 수 없다. 루트의 새 탭 잔여 상태 재조회가 추가되었으나 원시 응답과 시각 기록은 이 검토자에게 없다. | 동일 프로젝트의 취소 직전·직후 새 서버 응답과 초대 완료 상태를 비교한다. |

CDP timeout은 조작 성공·실패나 확인 결과를 결정하는 근거로 사용할 수 없다. `getJsDialog === undefined`도 그 한 시점의 관찰이며, 앞서 대화상자가 없었거나 취소되었음을 증명하지 않는다. 사용자 정정 이후에도 이 두 관찰만으로 자동화 문제를 확정 원인으로 단정하지 않는다.

### 루트가 새 취소 시도에서 수집할 최소 관찰.

1. 시작 상태를 고정한다. 프로젝트 ID, 로그인 역할, qa-c 1행·선택 1명, 초대 a/b 대기·c 완료를 기록하고 이전 클릭 작업이 정리되었는지 확인한다.
2. 자동화 재클릭 없이 사용자가 선택 삭제를 한 번 직접 누른다. 실제 표준 확인창의 문구·대상 인원과 직접 누른 취소를 동일 시도의 시각으로 기록한다. confirm을 mock/교체하면 native 취소 증거가 되지 않는다.
3. 관찰 가능한 네트워크 기록에서 같은 구간의 해당 프로젝트 DELETE 유무를 확인한다. 요청이 있으면 URL·응답 상태·식별값 본문·initiator만 기록하고 인증 헤더 등 비밀값은 포함하지 않는다.
4. 취소 뒤 새 서버 조회로 qa-c와 문항 응답 및 초대 완료 상태의 유지 여부를 확인한다. UI의 선택·오류 상태도 함께 남긴다. HTTP 기록 수집이 불가능하면 그 공백을 명시하고 관찰한 상태 유지까지만 판정한다.

## VERIFIED BY

- 실행하지 않은 정적 확인이다. PowerShell `Get-Content`와 `rg`로 배포 스냅샷의 `KanoRespondentTable.tsx`, `KanoManager.tsx`, `KanoAnalysisTab.tsx`, 프로젝트 페이지, responses route, reset helper 및 기존 `kano-respondent-delete.test.ts`를 읽었다. 관련 UI/표시 의존성의 confirm 교체·삭제 요청·이벤트 패턴을 읽기 전용으로 검색했다.
- [기존 DOM 테스트 51행](/E:/Dropbox/codetest2/tmp/pending-release-source-snapshot/tests/kano-respondent-delete.test.ts:51)은 `window.confirm`을 spy/mock으로 대체한다. 105행의 취소 사례는 mock 반환값 false, DELETE 0회, 목록·선택 유지 및 확인 문구를 검사한다. 클릭 helper는 31행의 DOM `.click()`이며 `fetch`도 50행에서 mock한다. 실제 브라우저 표준 대화상자, CDP 입력·타임아웃, 사용자 선택, 운영 HTTP/DB는 검증하지 않는다.
- 같은 파일 148행의 중복 클릭 사례는 mock confirm true와 같은 tick의 DOM 클릭 두 번을 검사한다. native 확인창이 열린 상태의 조작 전달이나 취소 뒤 재입력을 검증하지 않는다.
- 신규 또는 기존 테스트를 실행하지 않았다. 브라우저·운영 HTTP·DB·계정·비밀파일·서버·배포·Git에는 접근하거나 변경하지 않았다. 증거 등급을 사용하되 실행·추가 위임을 요구하는 스킬 절차는 이번 읽기 전용 계약에 따라 수행하지 않았다.

## FILES CHANGED

- 이 보고서 한 파일만 신규 작성했다. `docs/superpowers/reports/2026-10-15-live-role-verification/task-cancel-discrepancy-review.md`.
- 제품 소스·설정·테스트·배포 스냅샷은 변경하지 않았다.

## RISKS

- 스냅샷의 false 분기 분석은 명확하지만 운영에서 그 함수가 어떤 값을 반환했는지 이 검토자는 관찰하지 않았다. 소스 결론을 실제 취소 통과 판정으로 확대하지 않는다.
- qa-a/qa-b의 삭제·초대 상태와 사용자 정정은 루트가 전달한 사실이다. 실행 주체·요청 시각·대화상자 시각을 연결한 원시 기록이 없으므로 전체 운영 원인을 독립 확정하지 않는다.
- 최신 qa-c 직접 취소 검증은 결과 대기 상태다. 취소 결함도 취소 통과도 이 보고서에서는 선언하지 않는다.
