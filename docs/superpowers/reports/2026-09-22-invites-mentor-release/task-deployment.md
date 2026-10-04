# 초대코드 삭제 및 멘토 배정 개선 운영 배포.

## 결과.

2026-09-22 14:07:51 KST에 Vercel Production 배포 완료를 확인했다.

- 운영 주소. https://codetest2-rouge.vercel.app.
- 고정 배포 주소. https://codetest2-qcj1veenu-cavinseos-projects.vercel.app.
- 배포 커밋. `3e3a49e5a6e59b9b9f66a3e30a5e60d8a88b6238`.
- GitHub Production deployment ID. `6583825721`.
- Vercel 배포. https://vercel.com/cavinseos-projects/codetest2/ALbZVvF4z9ZsromMxd3Rs6xvUYUJ.

## 배포 범위.

직전 운영 커밋 `0e112f76e9ae4a178f66bbb0d1e3e58eeb5cea56`에서 별도 작업폴더를 만들고 두 커밋을 반영했다.

- 원본 `db3cd02` → 배포 `332064a`. 미사용이며 회원이 연결되지 않은 초대코드의 삭제 API·화면·테스트.
- 원본 `da3ddf4` → 배포 `3e3a49e`. 매니저 멘토 겸임 안내, 배정 요청 공통화, 함수 분리·이름 정리 및 자기 배정·해제 검증.

총 10개 파일을 변경했다. 데이터베이스 스키마·환경변수·의존성 변경은 없다. 기존 결과보고서 및 가입·관리자 인증 수정은 운영 기준에 포함되어 유지된다.

배포 작업폴더는 `C:/Users/user/.codex/visualizations/2026/09/20/01a0bd11-14b8-7543-8c41-b152a9f9b146/release-invites-mentor-20260922`이다. 원래 작업폴더의 미완료 변경과 다른 목적의 커밋은 포함하지 않았다.

검증 후 `git push --atomic origin HEAD:refs/heads/codex/release-invites-mentor-20260922 HEAD:refs/heads/main`으로 반영했다. 최종 원격 조회에서 두 브랜치와 배포 커밋의 일치를 확인했다.

## 검증.

- 배포본 `npm test`. `Test Files 179 passed (179)`, `Tests 2731 passed (2731)`.
- 배포본 `npm run lint`, `npm run build`, `git diff --check origin/main..HEAD`. 종료 코드 0.
- 로컬 Prisma 생성과 빌드는 접속하지 않는 로컬 더미 DB 주소로 실행했다.
- GitHub CI. https://github.com/cavinseo/codetest2/actions/runs/35689420466. `completed / success`. 린트·타입 검사·테스트·빌드 모두 성공했다.
- Vercel. `success / Deployment has completed`.
- 운영 점검 명령. `node temp_files/verify-invites-mentor-deployment.cjs`. 종료 코드 0.
- 운영 `/manage` HTML 및 연결된 스크립트 10개를 조회해 초대코드 삭제 화면과 매니저 멘토 겸임 안내 반영을 확인했다.
- 쿠키 없는 초대코드 삭제, 멘토 배정, 관리자 통계 및 본인 프로필 요청은 모두 401이었다.

## 검증 범위.

실제 회원·초대코드·멘토 배정 데이터는 변경하지 않았다. 로그인 후 삭제·배정·편집 흐름은 API 및 화면 회귀 테스트로 검증했다.

추가 CRAP / Mutation 실행 `35689420446`은 최종 확인 시 진행 중이었다. 완료된 필수 CI 결과와 구분한다.

이 문서는 배포 후 원래 작업폴더에 남긴 기록이며 운영 배포 커밋에 포함되지 않는다.
