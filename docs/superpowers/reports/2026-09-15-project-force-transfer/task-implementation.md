# 관리자 프로젝트 강제 이관 구현 결과.

## RESULT.

관리자 화면의 프로젝트 카드에 `멘티 변경`을 추가했다. 승인되고 이용 기간이 유효하며 프로그램에 소속된 멘티를 선택하고, 소유자·프로그램·멘토 변경 영향을 확인한 뒤 명시적으로 동의하면 이관한다.

프로젝트 ID와 하위 데이터는 보존하고 대상 멘티의 프로그램으로 프로젝트만 옮긴다. 원본 담당 멘토가 유효하면 대상 멘티에게 동일하게 배정하며, 대상의 기존 다른 프로젝트에도 적용되는 영향을 표시한다. 원본 멘토가 없으면 대상의 기존 배정을 유지한다. 원본 멘티의 다른 프로젝트와 멘토 배정은 보존한다.

미리보기 이후 정보 변경, 동시 이관, 회원 삭제, 멘토 배정 변경을 실제 DB에서 검증했다. 충돌 시 409로 중단하고 트랜잭션 전체를 롤백한다. 해당 프로젝트의 원래 소유자와 새 소유자에 해당하는 중복 팀원 행만 제거한다.

## FILES CHANGED.

- `app/api/admin/projects/[id]/transfer/route.ts`, `lib/project-transfer.ts`, `lib/project-transfer-types.ts`. 관리자 인가, 후보 조회, 영향 미리보기, 상태 토큰, 사용자·프로그램·프로젝트·배정 잠금과 이관 실행을 구현했다.
- `components/admin/ProjectTransfer.tsx`, `app/admin/page.tsx`. 후보 선택, 영향 확인, 최종 동의, 오류 후 재확인, 완료 후 목록·통계 갱신과 키보드 닫기를 구현했다.
- `app/api/admin/users/route.ts`, `lib/account-deletion.ts`, `lib/mentor-assignment-route.ts`. 이관과 삭제·배정 변경의 잠금 규칙을 맞추고 삭제 미리보기 재검증을 추가했다.
- `tests/project-transfer.test.ts`, `tests/api-project-transfer.test.ts`, `tests/project-transfer-ui.test.ts`, `tests/integration/project-transfer.integration.test.ts`. 신규 기능과 경합·데이터 보존·UI 테스트를 추가했다.
- `tests/api-admin-user-delete.test.ts`, `tests/api-mentor-assign.test.ts`. 기존 경로의 잠금·재검증 회귀 테스트를 보완했다.
- `docs/superpowers/plans/2026-09-15-project-force-transfer.md`. 구현·검증 진행 상태를 갱신했다.

## COMMIT.

- 브랜치. `codex/project-force-transfer`.
- 구현 커밋. `f8b939c8fb8eaf97f1d90eb932d865c3a0889ebf`.
- 커밋 제목. `feat: 관리자 프로젝트 소유권 강제 이관 추가`.
- 이 보고서는 구현 커밋 뒤 별도 문서 커밋으로 저장한다.

## VERIFIED BY.

주 작업자가 모든 게이트를 직접 실행했다. npm이 설치되지 않은 초기 환경에서는 공식 npm 패키지와 저장소 잠금 파일을 사용해 의존성을 설치하고, 임시 실행기로 환경변수를 주입했다. 실행기와 로그는 Git에서 제외되는 `temp_files/`에 두었고 저장소 설정이나 잠금 파일은 변경하지 않았다.

### 전체 단위 테스트.

실행 명령은 `node temp_files/run-transfer-qa.cjs test`이며 내부에서 `npm test -- --reporter=dot`를 실행했다. 종료 코드는 0이다.

```text
 Test Files  157 passed (157)
      Tests  2138 passed (2138)
```

### 실제 PostgreSQL 통합 테스트.

실행 명령은 `node temp_files/run-transfer-qa.cjs integration`이며 내부에서 `npm run test:integration -- --reporter=dot`를 실행했다. 종료 코드는 0이다.

```text
 Test Files  9 passed (9)
      Tests  79 passed (79)
```

localhost 전용 PostgreSQL 16.14의 새 `program_restore_qa` DB에 저장소 마이그레이션 19개를 적용했다. 두 운영 연결 환경변수 `POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING`을 모두 로컬 주소로 덮어썼다. 통합 테스트에서는 이 두 주소를 사용하지 않는 로컬 DB로 지정하고 `INTEGRATION_DATABASE_URL`만 검수 DB를 가리키게 했다.

새 이관 통합 테스트 17개는 실제 세션 인가, 소유권 변경 후 접근, 워크시트·보고서·의견·승인 등 관련 데이터 보존, 멤버 정리 범위, 중복 이관, 삭제와 배정 변경의 경합, 중간 실패 전체 롤백을 검증한다. 경쟁 트랜잭션은 배리어와 실제 DB 잠금 대기로 동기화했다.

### 회귀 테스트의 검출력.

삭제 영향 확인 이후 다른 경로에서 프로젝트 프로그램이 바뀌면 기존 코드가 확인 전 정보를 기준으로 이관할 수 있는 결함을 발견했다. 삭제 갱신 조건에 프로그램 ID를 추가했다.

`node temp_files/verify-transfer-regression.cjs`로 해당 조건만 일시적으로 제거하고 통합 테스트를 실행했다. 기대한 409 대신 200이 반환되어 테스트가 실패했다. 실행기는 원본 파일을 `finally`에서 복구하고 바이트 단위 일치를 확인했다.

```text
 Test Files  1 failed (1)
      Tests  1 failed | 16 skipped (17)
Regression failed without the guard; original source restored byte-for-byte.
```

수정이 있는 상태의 전체 통합 테스트는 위 79개 통과 결과와 같다. 기존 테스트를 제거하거나 단언을 약화하지 않았다.

### 변이 테스트.

`node temp_files/run-account-mutation.cjs`로 기존 Stryker 설정을 기반으로 `lib/account-deletion.ts`를 검증했다. 대상 테스트는 기존 `tests/account-deletion.test.ts`이다. 최초 실행은 모든 변이를 검출한 뒤 Windows 샌드박스의 자식 프로세스 종료 제한으로 종료 코드 1을 반환했다. 같은 검증을 필요한 프로세스 권한으로 다시 실행해 종료 코드 0을 확인했다.

```text
All files            | 100.00 |  100.00 |       33 |         0 |          0 |        0 |        0 |
 account-deletion.ts | 100.00 |  100.00 |       33 |         0 |          0 |        0 |        0 |
```

변이 제외 주석이나 테스트 완화 없이 33개를 모두 검출했다.

### 린트·타입·인코딩·빌드.

- `node temp_files/run-transfer-qa.cjs lint`. 내부 명령은 `npm run lint -- --ignore-pattern .stryker-tmp/** --ignore-pattern temp_files/**`이다. 생성된 검수 파일만 제외했고 종료 코드 0이다.
- `node node_modules/typescript/bin/tsc --noEmit`. 최종 코드에서 출력 없이 종료 코드 0이다.
- `node scripts/check-text-encoding.mjs`. 마지막 출력은 `한글 인코딩 검사 통과.`이며 종료 코드 0이다.
- `node temp_files/run-transfer-qa.cjs build`. 내부 명령은 `npm run build`이다. Prisma 생성과 Next.js 15.5.23 프로덕션 빌드가 종료 코드 0으로 완료됐다. 마지막 화면 수정도 포함했다.
- `git diff --check`. 공백 오류 없이 통과했다.

```text
 ✓ Compiled successfully in 14.6s
 ✓ Generating static pages (36/36)
○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```

### 브라우저·DB 교차 확인.

주 작업자가 로컬 프로덕션 서버 `127.0.0.1:4321`에 가상 관리자 계정으로 로그인했다. 다른 프로그램의 멘티 선택, 프로그램 변경, 다른 담당 멘토로의 교체, 대상의 다른 프로젝트 1개 안내, 확인 전 실행 비활성화, 최종 동의·이관 성공·소유자 목록 갱신을 확인했다.

이관 후 `node temp_files/verify-transfer-ui-state.cjs`로 실제 DB를 조회하여 같은 프로젝트 ID, 대상 소유자·프로그램, 원본·대상 멘토, 하위 기능, 대상의 기존 프로젝트 보존을 단언했다.

```text
Browser transfer DB assertions passed: owner, program, source/target mentors, child data, existing target project.
```

최종 빌드를 다시 열어 좁은 화면에서 닫기 버튼 표시를 확인했다. Escape 후 열린 대화상자가 0개이고 초점이 원래 `멘티 변경` 버튼으로 돌아오는 것도 확인했다. 단위 UI 테스트는 중복 제출, 오래된 응답 무시, 409 후 재확인과 닫기 동작을 추가로 검증한다.

## DEVIATIONS.

없는 멘토 배정 행이 잠금 대기 중 생기는 경합을 반영하여, 실행 트랜잭션은 사용자 잠금 뒤 최신 상태를 읽는 `ReadCommitted`를 사용했다. 미리보기는 `RepeatableRead`이다. 소유권·멘토 변경과 삭제가 같은 사용자 잠금 순서를 공유한다.

원격 실데이터에 접근하지 않도록 격리 DB와 로컬 프로덕션 서버를 직접 준비했다. 검증 후 브라우저 탭을 닫았고 4321·55439 포트에 검증 서버가 남아 있지 않음을 확인했다. 일회용 DB 파일과 로그는 무시되는 임시 경로에 남는다.

## RISKS.

최종 검토 범위에서 미해결 P0·P1·P2는 발견하지 못했다. 기존 비관여 경로와의 잠금 충돌은 트랜잭션 롤백과 409로 처리하므로 관리자가 영향을 다시 확인해야 할 수 있다.

원격 푸시와 운영 배포는 수행하지 않았다. 운영 사이트에서 기능 사용 가능 여부는 배포 후 확인해야 한다. DB 스키마 변경이나 신규 마이그레이션은 없다.

## QUESTIONS.

로컬 구현·검증을 마무리하는 데 필요한 추가 질문은 없다.
