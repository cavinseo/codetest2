# 초대 기한 지정·연장 구현 결과

## RESULT

신규 초대 발급 시 이용 기한 날짜를 필수로 입력한다. 이 날짜가 가입 및 이후 로그인에 공통 적용되며, 한국 시간 해당 날짜의 끝과 프로그램 종료 시각 중 빠른 시각에 만료된다.

목록의 기한 날짜를 누르면 날짜 입력 및 저장·취소 버튼이 나타난다. 미사용·만료·사용된 코드의 연장을 지원하고, 사용된 코드는 연결된 승인 멘티의 계정 기한도 같은 트랜잭션에서 갱신한다. 코드와 계정·프로젝트 이력은 보존한다.

신규 nullable 열의 기존 값은 null로 남아 기존 가입 후 기간 규칙과 관리자 개별 연장을 유지한다. 과거 날짜·프로그램 종료 초과·기간 단축·중복 코드 재활성화·잘못된 계정 연결·권한 밖 수정을 거절한다.

## FILES CHANGED

- 화면 및 요청. `components/admin/InvitesTab.tsx`, `lib/invite-batch.ts`.
- 발급·연장·메일. `app/api/invites/route.ts`, `app/api/invites/[id]/send/route.ts`, `lib/invite-code.ts`.
- 날짜 및 이용 기한 계산. `lib/invite-expiry.ts`, `lib/invite-access.ts`.
- 스키마. `prisma/schema.prisma`, `prisma/migrations/20260917000000_invite_access_expiry/migration.sql`.
- 가입·로그인·보호 API에서 명시 기한을 조회하고 보존하도록 인증 경로를 갱신했다. 기존 관리자 회원 연장에는 동시 변경 비교 조건을 추가했다.
- 관련 테스트 13개 파일 및 작업 계획서.

## COMMIT

- 구현 커밋. `6c6b858`.
- 로컬 커밋만 생성했으며 원격 push·DB 마이그레이션 적용·배포는 하지 않았다.

## VERIFIED BY

- 기준 상태. 초대 관련 5개 파일, 126개 테스트 통과.
- `npm test`.
  - `Test Files 168 passed (168)`.
  - `Tests 2405 passed (2405)`.
- `npm run lint`. 종료 코드 0.
- `npm run build`. 종료 코드 0. `Compiled successfully in 12.0s`, `Generating static pages (36/36)`.
- `npx tsc --noEmit`. 종료 코드 0.
  - 최초 검사에서 신규 테스트의 `/s` 정규식이 ES2017 대상과 맞지 않아 TS1501을 확인했다. `[\s\S]`로 수정 후 재검사했다.
- `npx vitest run tests/api-invite-expiry.test.ts tests/api-admin-user-role.test.ts tests/api-invite-login.test.ts tests/api-invite-send.test.ts`.
  - `Test Files 4 passed (4)`.
  - `Tests 166 passed (166)`.
- `git diff --check`. 통과.
- 실제 브라우저. 실제 InvitesTab과 CSS를 정적으로 묶고 가상 fetch 응답만 연결한 화면으로 검증했다. 필수 기한 누락 시 발급 버튼 차단, 날짜 입력 후 발급, 만료 코드 연장 후 대기 상태 및 재발송 버튼 복구, 사용된 코드 편집·취소를 확인했다. 밝은 테마에서 화면 배치도 확인했다. 검증 서버와 임시 파일은 정리했다.
- 독립 검토. 블라인드·경계 사례·수용 기준 세 검토에서 조치가 필요한 도입 결함이 없었다.
- `npx stryker run stryker.crap.config.json --mutate lib/invite-code.ts`.
  - 초기 2,405개 테스트 통과.
  - 변이 점수 98.63%. 69 killed, 3 timeout, 1 survived, 0 no coverage, 0 errors.
  - 생존 변이는 수정하지 않은 `normalizeInviteCode`의 `trim()` 제거다. 뒤의 정규식이 공백도 제거하여 동등하다. 관련 없는 기존 코드를 정리하거나 기준을 낮추지 않았다.
  - 프로세스 정리에서 `Error: Command failed: taskkill /pid 30632 /T /F` 및 `ERROR: Access denied`가 발생했다. 최종 정리에서도 같은 종류의 오류가 발생하여 명령 종료 코드는 1이다. 이를 정상 완료로 집계하지 않는다.

## DEVIATIONS

기존 코드 로그인·일반 초대 가입에도 이메일 잠금을 추가해 만료 코드의 연장과 최초 가입을 직렬화했다. 기존 관리자 회원 연장도 조회한 기한이 달라졌으면 409를 반환하게 해 초대관리의 연장 결과를 덮어쓰지 않게 했다.

## RISKS

운영 적용 전에 `20260917000000_invite_access_expiry` 마이그레이션이 필요하다. 열 추가 없이 새 애플리케이션을 배포하면 해당 조회가 실패한다. 마이그레이션은 열 추가만 수행하며 기존 행의 만료일은 변경하지 않는다.

실 DB 잠금·롤백 및 실제 로그인은 검증하지 않았다. 로컬 PostgreSQL은 확인되었으나 비밀번호 없는 연결이 `fe_sendauth: no password supplied`로 거절되어 DB 쓰기를 진행하지 않았다. 운영 DB에는 연결하지 않았다. 브라우저 검증은 실제 컴포넌트의 화면 동작이며 운영 백엔드 통합 검증을 의미하지 않는다.

## QUESTIONS

남은 구현 의사결정은 없다. 운영 DB 적용과 배포는 별도 요청 범위다.
