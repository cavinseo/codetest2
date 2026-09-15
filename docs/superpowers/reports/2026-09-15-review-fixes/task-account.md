# 계정·초대 경계 결함 수정 결과.

## RESULT

- F01. `app/api/invites/route.ts:54`는 ADMIN만 원문 code를 조회하고 `:63` 및 `:152`에서 ADMIN 응답에만 code를 포함한다. PM은 메일 발송 결과와 초대 메타데이터를 받는다. 메일 전송 성공·실패 모두 코드 노출을 막으며 기존 관리자 코드 표시 계약은 유지했다.
- F02. `app/api/programs/[id]/mentees/route.ts:144`에서 사용자 잠금과 프로그램 잠금 후 최신 소속·역할·프로그램 관리권한을 확인한다. `:156`과 `:157`에서 User.programId와 usedById로 연결된 초대 programId를 한 트랜잭션에서 변경한다. accessExpiresAt 및 기존 소유 프로젝트는 변경하지 않는다.
- F03. `app/api/admin/users/route.ts:393`에서 삭제 대상 발급 코드를 실행 관리자에게 updateMany로 이전하고 예상 건수를 재검증한다. 코드 원문·기한·사용자·사용 시각은 변경하지 않는다. 멘티는 `:456`의 preview.transferredIssuedInviteCodes를 토큰에 포함하고, 비멘티는 `:548`부터 이전 건수가 있으면 삭제 확인을 요구한다. 성공 응답에는 두 경로 모두 transferredIssuedInviteCodes를 포함한다. 자기 발급 코드까지 보존하기 위해 멘티의 수신 코드 정리는 issuedById가 자신이 아닌 행만 삭제한 뒤 나머지 발급 책임을 이전한다.
- F08. `app/api/auth/logout/route.ts:22`에서 기존 verifySessionCookie로 서명·기한을 검증하고 `:25`에서 id와 발급 당시 sessionVersion이 일치하는 행에만 증가를 수행한다. 오래된 쿠키를 반복 제출해도 최신 세션은 무효화하지 않으며 브라우저 쿠키는 항상 만료시킨다.
- F09. `app/api/admin/users/route.ts:376`의 공용 삭제 준비 함수가 관리자 삭제 advisory 잠금 → actor/target/프로젝트 매니저의 정렬된 사용자 잠금 순서를 사용한다. 실행 관리자 계정의 현재 승인·역할·관리권한·접근 기한과 대상 계정 존재를 확인한 뒤 트랜잭션 안에서 마지막 관리자 수를 재검증한다. 교차 삭제에서 먼저 삭제된 관리자가 다른 관리자를 뒤늦게 삭제할 수 없다. 기존 isAdmin 관리자 수 정책과 프로젝트 이관·삭제 스냅샷 검증은 유지했다.

## FILES CHANGED

- app/api/invites/route.ts.
- app/api/programs/[id]/mentees/route.ts.
- app/api/admin/users/route.ts.
- app/api/auth/logout/route.ts.
- lib/account-deletion.ts.
- tests/api-invites.test.ts.
- tests/api-program-mentees.test.ts.
- tests/api-admin-user-delete.test.ts.
- tests/api-logout-session.test.ts.
- tests/account-deletion.test.ts.
- 이 결과 문서.

API 응답 변경과 필요한 삭제 확인 UI 문구는 주 작업자에게 구현 전에 전달했다. UI·공용 auth·스키마·통합 테스트를 이 담당자가 수정하지 않았다.

## VERIFIED BY

작업 폴더는 `C:/Users/user/.codex/visualizations/2026/09/11/01a090c1-626c-7273-9be7-aa5948697837/review-fixes`이다.

- F01/F08 RED. `npx vitest run tests/api-invites.test.ts tests/api-logout-session.test.ts --pool=threads`에서 5개 실패, 36개 통과였다. PM 응답 코드 노출 3건과 sessionVersion 조건 누락·오래된 쿠키 반복 무효화 2건을 확인했다. 수정 후 동일 명령은 41개 통과였다.
- F02 RED. `npx vitest run tests/api-program-mentees.test.ts --pool=threads`에서 3개 실패, 20개 통과였다. 초대 프로그램 변경 누락, 초대 변경 실패의 성공 응답, 동시 소속 변경 미검증을 확인했다. 수정 후 동일 명령은 23개 통과였다. 최초 실행에서 잔여 mockResolvedValueOnce로 다음 테스트까지 영향을 준 테스트 격리 문제는 resetAllMocks로 고친 뒤 RED 수치를 다시 확인했다.
- F03/F09 RED. `npx vitest run tests/api-admin-user-delete.test.ts tests/account-deletion.test.ts --pool=threads`에서 7개 실패, 37개 통과였다. 코드 책임 이전 안내·실행, 공통 관리자 잠금·잠금 뒤 수 재검사·실행 관리자 재검사 및 변경된 정확한 보존 범위·잠금 순서를 검증했다. 수정 후 동일 명령은 44개 통과였다.
- 최종 관련 범위. `npx vitest run tests/api-invites.test.ts tests/api-program-mentees.test.ts tests/api-admin-user-delete.test.ts tests/api-logout-session.test.ts tests/account-deletion.test.ts tests/api-admin-user-role.test.ts tests/auth.test.ts tests/invite-access.test.ts --pool=threads`는 이름 없는 발급자 삭제 검증을 포함하여 178개 통과, 8개 파일 통과, exit 0이었다.
- `npx tsc --noEmit`는 exit 0이었다.
- `npx eslint app/api/invites/route.ts 'app/api/programs/[id]/mentees/route.ts' app/api/admin/users/route.ts app/api/auth/logout/route.ts lib/account-deletion.ts tests/api-invites.test.ts tests/api-program-mentees.test.ts tests/api-admin-user-delete.test.ts tests/api-logout-session.test.ts tests/account-deletion.test.ts`는 exit 0이었다.
- `git diff --check`는 exit 0이었다. 기존 CRLF 변환 안내 외 오류가 없었다.

## DEVIATIONS

없다. lib/auth.ts는 기존 verifySessionCookie를 재사용하여 수정하지 않았다. 스키마·마이그레이션 없이 발급 책임만 이전한다. 마지막 관리자 수 기준은 기존 isAdmin 정책을 유지하고 실행 시점과 직렬화만 보강했다.

최종 자체 검토에서 모든 생산 코드 변경을 F01/F02/F03/F08/F09 계약과 대조했다. 이름이 없는 삭제 대상은 ID와 DB 역할·소속으로 검증하며 이름에 의존하지 않는다. name:null인 발급자도 초대 책임을 이전한 뒤 성공적으로 삭제하는 단위 검증을 추가했다. 이름 없는 프로젝트 매니저의 안내는 기존 describeMenteeDeletion의 역할명 대체 동작을 유지한다. F09 공통 잠금은 이 DELETE API의 모든 실제 삭제 트랜잭션에 적용하며, 삭제 외 작업은 기존 lockTransferUsers와 동일한 사용자 정렬 순서를 사용한다.

## RISKS

단위 mock은 실제 PostgreSQL 롤백·교착·FK 보존을 증명하지 않는다. 테스트 담당자가 F02의 반복 로그인 유지, F03의 멘티·비멘티 발급자 삭제, F09의 교차 관리자 삭제를 실제 격리 DB 통합 테스트로 준비하고 주 작업자가 실행한다. 이 담당자는 서버·운영 DB·원본 .env에 접근하지 않았고 커밋·푸시·배포를 수행하지 않았다.
