# 멘티 초대 일괄 발급과 이메일 발송 구현 결과.

## RESULT.

초대 관리에서 최대 100개 이메일을 입력해 이메일별 멘티 코드를 발급하고 개별 메일을 보낼 수 있다. 줄바꿈·쉼표·세미콜론·공백을 지원하며 대소문자 중복을 제외하고 잘못된 주소를 표시한다. 기존 초대 목록에서는 등록 이메일로 같은 코드를 개별 또는 선택 일괄 발송할 수 있다. 코드 발급 성공과 메일 발송 실패를 구분하며 일부 실패가 다음 주소의 처리를 막지 않는다.

## FILES CHANGED.

- `components/admin/InvitesTab.tsx`. 다중 이메일 입력, 처리 진행률·항목별 결과, 개별·선택 발송, 처리 중 입력·회수 잠금, 목록 조회 오류 안내를 추가했다.
- `lib/invite-batch.ts`. 이메일 정규화·중복 제외 및 순차 발급·발송과 부분 성공 처리를 추가했다. 화면을 떠나면 다음 요청을 시작하지 않는다.
- `app/api/invites/[id]/send/route.ts`. 관리자·담당 프로그램 매니저만 저장된 이메일로 기존 코드를 발송한다. 만료·회원 상태·코드 연결을 검사하고 DB를 변경하지 않는다.
- `lib/email.ts`. SMTP 설정 조회와 전송 준비 오류도 발송 실패로 반환한다.
- `tests/invite-batch.test.ts`. 입력 정리·한도·순차 처리·실패 격리·화면 이탈 검수 20개를 추가했다.
- `tests/api-invite-send.test.ts`. 권한·등록 수신자 고정·만료·회원 연결·DB 보존·메일 오류 검수 33개를 추가했다.
- `tests/email-send.test.ts`. SMTP 설정 조회 예외의 안전한 실패 반환 검수를 추가했다.
- `docs/superpowers/plans/2026-09-10-bulk-mentee-invites.md`. 계약과 단계별 검수 완료를 기록했다.

## COMMIT.

구현 커밋은 `72b56a3`이다. 원격 푸시와 운영 배포는 수행하지 않았다.

## VERIFIED BY.

- `npx tsc --noEmit`. 종료 코드 0.
- `npm run test`. `Test Files 130 passed (130)`, `Tests 1595 passed (1595)`.
- `npm run lint`. 종료 코드 0. `18 problems (0 errors, 18 warnings)`이며 경고는 기존 `.stryker-tmp` 복사본에만 있다.
- 변경한 소스·테스트 7개에 대한 `npx eslint`. 종료 코드 0, 경고 없음.
- `npm run build`. `Compiled successfully`, 정적 페이지 35개 생성, 종료 코드 0. 새 `/api/invites/[id]/send` 경로가 빌드에 포함됐다.
- `npx vitest run tests/email-send.test.ts tests/invite-batch.test.ts tests/api-invite-send.test.ts`. `Test Files 3 passed (3)`, `Tests 60 passed (60)`.
- 회귀 테스트 역검증. SMTP 설정 조회를 기존처럼 try 밖으로 옮기면 새 설정 조회 예외 테스트가 실패했다. 구현을 복원한 뒤 관련 테스트 60개가 통과했다.
- 격리된 로컬 PostgreSQL·production 서버·SMTP 수신기와 실제 인앱 브라우저로 검수했다. 대문자 주소, 중복, 잘못된 주소, 기존 회원을 섞어 유효 이메일 5개를 처리했다. 3개는 발급·발송 성공, 1개는 코드 발급 후 SMTP 거절, 1개는 기존 회원 중복으로 실패했다. SMTP 거절 이후 주소도 정상 처리했다.
- 실패한 주소의 개별 재발송은 SMTP 거절 시 오류, SMTP 정상화 후 성공으로 표시됐다. 신규 코드와 이용 중인 코드 2개를 선택한 일괄 재발송도 성공했다. 만료 코드는 선택·발송할 수 없었다. 입력·결과·테이블 화면을 스크린샷으로 확인했다.
- SMTP로 전달된 6개 메시지의 수신자와 코드가 DB의 등록 이메일·코드와 일치했다. 모든 메시지는 수신자 1명이며 신규 코드 4개는 모두 달랐다. 재발송 전후 초대 6개와 회원 3개의 전체 필드를 비교해 변화가 없음을 확인했다. 검증 출력은 `{"uniqueIssuedCodes":4,"deliveredMessages":6,"individualRecipients":true,"deliveredCodeMatchesStoredCode":true,"resendPreservedAllInviteAndUserFields":true}`였다.
- 독립 읽기 전용 검토에서 발견된 회수와 발송의 경합을 공통 처리 잠금으로 해결했고 후속 검토에서 발견사항 없음으로 확인됐다.

## DEVIATIONS.

새 일괄 발급 서버 API 대신 기존 단건 발급 API를 순차 호출한다. 기존 발급 권한·중복 차단·기한 정책을 재사용하며 주소별 결과를 즉시 표시한다. 네트워크 응답이 없으면 서버가 이미 발급했을 수 있으므로 자동 재시도하지 않는다.

## RISKS.

- 운영 발송에는 유효한 SMTP 설정이 필요하다. SMTP 접수 성공 이후 실제 받은편지함 도착 여부는 수신 메일 서비스에 따라 달라진다.
- 검수 메일은 로컬 수신기로만 보냈다. 운영 DB와 실제 수신자에게는 변경·발송을 수행하지 않았다.
- 처리 중 화면을 떠나면 진행 중 요청 이후의 이메일은 처리하지 않는다. 완료 여부는 초대 목록에서 확인한다.
- 운영 반영은 아직 하지 않았다.

## QUESTIONS.

없음.
