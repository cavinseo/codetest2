# 관리자 프로그램 삭제 구현 결과.

## RESULT.

관리자 프로그램 관리 카드에 삭제 버튼과 앱 내부 확인창을 추가했다. 프로젝트·소속 회원 또는 사용된 초대코드가 남은 프로그램은 서버에서 삭제를 거절한다. 삭제 가능한 프로그램의 미사용 초대코드와 추가 프로젝트 신청 이력은 확인창에 건수를 명시하고 프로그램과 함께 삭제한다. 프로젝트와 회원의 자동 이동·삭제는 수행하지 않는다.

## FILES CHANGED.

- `app/api/programs/[id]/route.ts`. 관리자 전용 GET 미리보기와 DELETE. 명시 확인과 초대·신청 건수 검증, 프로그램 행 잠금, Serializable 트랜잭션, 연결 상태 재검사, 오류 응답을 추가했다.
- `components/admin/ProgramsTab.tsx`. 관리자 전용 삭제 버튼, 확인·취소·오류·처리 상태와 신청 목록 갱신을 추가했다. 다른 프로그램의 열린 배정 패널과 후보 목록을 보존한다.
- `app/admin/page.tsx`. 관리자 권한을 전달하고 삭제된 프로그램을 프로젝트 필터에서 제거한다.
- `tests/api-program-delete.test.ts`. 권한·확인·연결 차단·경합·오류 단위 검수 41개를 추가했다.
- `tests/integration/program-deletion.integration.test.ts`. 별도 로컬 PostgreSQL 전용 검수 9개를 추가했다.
- `docs/superpowers/plans/2026-09-10-admin-program-deletion.md`. 사용자 승인 계약과 단계별 검수 기준을 기록했다.

## COMMIT.

구현 커밋은 `8631c9a`이다. 원격 푸시와 운영 배포는 수행하지 않았다.

## VERIFIED BY.

- `npx tsc --noEmit`. 종료 코드 0.
- `npm run test`. `Test Files 128 passed (128)`, `Tests 1541 passed (1541)`.
- `npm run lint`. 종료 코드 0. `18 problems (0 errors, 18 warnings)`이며 경고는 기존 `.stryker-tmp` 복사본에만 있다.
- 변경한 소스·테스트 5개에 대한 `npx eslint`. 종료 코드 0, 경고 없음.
- `npm run build`. `Compiled successfully`, 정적 페이지 35개 생성, 종료 코드 0. `/api/programs/[id]` 빌드를 확인했다.
- `npx vitest run --config vitest.integration.config.ts tests/integration/program-deletion.integration.test.ts`. `Test Files 1 passed (1)`, `Tests 9 passed (9)`. 별도 로컬 PostgreSQL에서 실제 세션 인증, 대상 외 자료 보존, 사용 초대코드 보존, 연쇄 삭제 범위, 미리보기 이후 건수 변경, 회원 배정의 실제 잠금 대기 및 FK 거절을 확인했다.
- 보존 조건 역검증. 프로젝트·회원 차단 조건만 임시 제거하면 관련 테스트 2개가 200/409 불일치로 실패했다. 원본을 복원한 뒤 해당 보존 테스트 3개가 통과했다.
- 로컬 production 서버와 실제 인앱 브라우저. 관리자 로그인, 삭제 버튼 및 확인창 표시, 연결 프로젝트·멘티 차단, 사용 초대코드 차단, 취소 후 대상 보존, 확인창 이후 초대 추가 시 409 및 갱신 건수 표시, 재확인 후 삭제 성공을 확인했다. 삭제한 신청 이력 및 프로젝트 필터 갱신과 다른 프로그램의 열린 후보 목록 보존을 확인했다. 프로그램 매니저로 로그인해 삭제 버튼이 없는 것도 확인했다.

## DEVIATIONS.

독립 검토를 반영해 사용일 또는 연결 회원이 남은 초대코드는 삭제하지 않는다. 멘티의 프로그램 이동 후에도 원래 초대코드가 로그인·기한 판정에 관여하기 때문이다. 미분류 프로그램은 런타임 필수 기본값이 아니므로 다른 프로그램과 같은 보존 조건을 적용한다.

## RISKS.

- 사용된 초대코드가 남은 프로그램은 프로젝트·멘티를 옮겨도 삭제할 수 없다. 로그인과 이용 기한을 보존하기 위한 제한이다.
- 검수는 운영 DB와 분리된 로컬 DB에서 수행했다. 운영 데이터는 삭제하거나 변경하지 않았다.
- 운영 반영은 아직 하지 않았다.

## QUESTIONS.

없음.
