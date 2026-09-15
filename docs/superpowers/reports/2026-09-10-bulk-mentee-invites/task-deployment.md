# 프로그램 삭제와 멘티 일괄 초대 운영 배포 결과.

## RESULT.

사용자의 푸시·배포 요청에 따라 작업 브랜치를 푸시하고 운영 배포를 완료했다. 관리자 프로그램 삭제와 멘티 초대 코드 일괄 발급·등록 이메일 재발송을 포함한다.

## COMMIT.

- 작업 브랜치 `codex/mentee-mentor-approval`을 `4b1523e`에서 `ca8cb2993ffcdb85156ab0fd4ec7443ec5861115`로 정상 푸시했다.
- 운영 소스 커밋은 `ca8cb29`다. 이 배포 보고서는 별도 후속 문서 커밋이다.
- 원격 main은 변경하지 않았다.

## VERIFIED BY.

- 원격 브랜치 조회에서 `ca8cb2993ffcdb85156ab0fd4ec7443ec5861115 refs/heads/codex/mentee-mentor-approval`을 확인했다.
- Vercel Git 연동 프리뷰 `FsLHTio1rcA5BiFp5mHy7pZqrdSM`의 소스가 `ca8cb29`이며 Ready임을 확인했다.
- Vercel 웹 콘솔의 Promote to Production으로 동일 커밋을 운영 환경 설정으로 새로 빌드했다. 운영 배포 `Gx4PJfUoXGgiBjT1HKHiYjfNkPJT`의 Ready, Production, 운영 도메인 연결을 확인했다. 빌드 소요 시간은 1분 15초였다.
- 운영 도메인은 `https://codetest2-rouge.vercel.app`이며 배포 고유 주소는 `https://codetest2-oyrw8are3-cavinseos-projects.vercel.app`이다.
- 운영 브라우저의 관리자 세션에서 초대 관리 화면을 새로 열어 다중 이메일 입력과 최대 100명 안내를 확인했다. 유효 주소 2개·대소문자 중복 1개·잘못된 주소 1개를 입력해 발급 대상 2명, 중복 제외 및 오류 안내를 확인한 뒤 입력을 비웠다.
- 프로그램 관리에서 삭제 버튼과 실제 미리보기 API 동작을 확인했다. 시험프로그램의 프로젝트 11개·멘티 1명에 대해 이동 안내와 삭제 확인 비활성화를 확인했다. 미분류 프로그램은 연결 자료 0개와 동반 삭제 이력 0건 안내를 확인했다. 두 확인창 모두 취소했다.
- 배포 후 `/login?mode=invite`는 HTTP 200, 인증 없는 `/api/invites` GET과 `/api/invites/deployment-check-nonexistent/send` POST는 HTTP 401을 반환했다.
- 배포 전 코드 검수 결과인 전체 테스트 1,595개와 타입·lint·빌드 통과, 관련 테스트 60개 및 로컬 브라우저·SMTP 검증은 `task-implementation.md`에 기록돼 있다. 배포 과정에서 소스는 변경하지 않았다.

## DEVIATIONS.

기존 Vercel CLI 인증 정보를 사용할 수 없어 CLI 배포를 중단했다. 로그인된 Vercel 웹 콘솔에서 Git 연동으로 빌드된 정확한 커밋을 선택해 운영 환경으로 승격했다. 준비한 로컬 배포 사본은 업로드하지 않았다.

## RISKS.

- 이번 변경은 DB 스키마나 의존성을 변경하지 않아 추가 마이그레이션을 실행하지 않았다.
- 운영 검수 중 프로그램 삭제, 초대 발급, 메일 발송을 실행하지 않았다. 실제 코드 발급과 메일 내용·수신자 일치는 선행 격리 로컬 DB·SMTP 검수에서 확인했다.

## QUESTIONS.

없음.
