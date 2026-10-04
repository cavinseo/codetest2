# 결과보고서 및 가입·관리자 접근 수정 운영 배포.

## 결과.

2026-09-22 13:33:13 KST에 Vercel Production 배포 완료를 확인했다.

- 운영 주소. https://codetest2-rouge.vercel.app.
- 고정 배포 주소. https://codetest2-l899pmiky-cavinseos-projects.vercel.app.
- 배포 소스. `0e112f76e9ae4a178f66bbb0d1e3e58eeb5cea56`.
- GitHub Production deployment ID. `6583444222`.
- Vercel 배포. https://vercel.com/cavinseos-projects/codetest2/xid1otsHZ9rmXF1RKd19g6pLGKH4.

## 배포 범위.

기존 운영 소스 `ce4d2a7`에서 별도 작업폴더 `temp_files/release-report-auth-20260922`를 만들고, 요청한 변경 14개 파일을 반영했다.

- `9c3e153`. 결과보고서 캡처 오류 차단, 원본 재조회 시 캡처 컴포넌트 갱신, DOCX 요청 형식·용량·표 셀 수 검증.
- `0e112f7`. 멘토 초대 가입 및 역할 덮어쓰기 거절, 멘티 초대와 충돌하는 멘토 가입 안내, 관리자 인증 확인 중·실패 시 메뉴 노출 방지.

두 커밋을 `git push --atomic origin HEAD:refs/heads/codex/release-report-auth-20260922 HEAD:refs/heads/main`으로 반영했다. 최종 조회에서 원격 두 브랜치의 SHA가 배포 소스와 일치했다. 데이터베이스 스키마·환경변수·의존성 변경은 없다.

## 검증.

- 별도 배포본 `npm test`. `Test Files 177 passed (177)`, `Tests 2700 passed (2700)`.
- 별도 배포본 `npm run lint`, `npm run build`, `git diff --check`. 종료 코드 0.
- GitHub CI. https://github.com/cavinseo/codetest2/actions/runs/35687244072. `completed / success`. 설치·Prisma 생성·린트·타입 검사·테스트·빌드 모두 성공.
- Vercel 상태. `success / Deployment has completed`.
- `node temp_files/verify-report-auth-deployment.cjs`. 운영 HTML에서 관리자 초기 메뉴 비노출과 가입 안내를 확인했다. 관리자 통계·회원·프로젝트·이관 미리보기 및 본인 프로필의 쿠키 없는 요청은 모두 401이었다. 멘토 역할과 초대코드를 함께 보낸 가입 요청은 계정 생성 전 검증에서 400으로 거절됐다.
- 운영 브라우저. `/admin`에서 확인 중 화면 이후 관리자 로그인 폼이 표시됐다. `/signup`에서 멘토 선택 시 초대 입력과 초대 로그인 링크가 사라지고, 다시 멘티를 선택하면 이전에 입력한 코드가 빈 값으로 초기화됐다. 가입 폼은 제출하지 않았다.

## 검증 범위.

운영 관리자 계정 로그인 및 실제 프로젝트 결과보고서 생성은 수행하지 않았다. 결과보고서 동작은 배포본 테스트로 검증했다. 추가 CRAP / Mutation 실행 `35687244075`는 최종 확인 시 진행 중이었으며 필수 CI 성공과 구분한다.

이 문서는 배포 완료 후 원래 작업폴더에 남긴 검증 기록이며 배포 소스 커밋에는 포함되지 않는다.
