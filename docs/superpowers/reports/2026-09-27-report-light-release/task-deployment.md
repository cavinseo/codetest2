# 결과보고서 양식과 밝은 모드 입력 수정 운영 배포.

## 결과.

2026-09-27 22:59:29 KST에 Vercel Production 배포가 완료되었다.

- 운영 주소는 https://codetest2-rouge.vercel.app 이다.
- 고정 배포 주소는 https://codetest2-oghzkzk1u-cavinseos-projects.vercel.app 이다.
- 배포 커밋은 `7be330c30aba499a31d35d8066f26a840b89329f`이다.
- GitHub Production deployment ID는 `6693126824`이다.
- Vercel 배포 주소는 https://vercel.com/cavinseos-projects/codetest2/BZLUHVeMC3q8owAWBd1NLKE46xJz 이다.

## 배포 범위.

기존 운영 커밋 `3e3a49e5a6e59b9b9f66a3e30a5e60d8a88b6238`에서 별도 작업폴더를 만들고 두 커밋을 반영했다.

1. `819b862`. 새 PDF의 보고서 제목·장 구성·표 순서와 WS-15·16·17을 묶은 `Ⅴ. 자산 및 자금계획`, 관련 테스트·양식 원본·검토 기록.
2. `7be330c`. 밝은 모드에서 WS-2의 네 입력칸 포커스 배경을 흰색으로 유지하고 기본 폼 컨트롤에 밝은 color-scheme을 지정한다.

총 6개 파일이다. 데이터베이스 스키마·환경변수·의존성 변경은 없다. 신규 제품/서비스 진단표는 작성 위치가 아직 미정이며 이번 배포에 구현되지 않았다.

작업폴더는 `C:/Users/user/.codex/visualizations/2026/09/20/01a0bd11-14b8-7543-8c41-b152a9f9b146/release-report-light-20260927`이다. 원래 작업폴더의 다른 미완료 변경은 반영하지 않았다.

검증 후 `git push --atomic origin HEAD:refs/heads/codex/release-report-light-20260927 HEAD:refs/heads/main`으로 반영했다. 최종 원격 조회에서 두 브랜치가 배포 커밋과 일치했다.

## 검증.

- 배포본 전체 테스트는 `Test Files 179 passed (179)`, `Tests 2731 passed (2731)`이었다.
- 배포본 `npm run lint`, `npm run build`, `git diff --check`가 통과했다.
- 최초 테스트는 새 작업폴더의 Prisma Client 미생성으로 실패했다. `npx prisma generate`로 생성 후 전체 테스트가 통과했다. DB 작업은 실행하지 않았다.
- 최초 빌드는 Google Fonts 다운로드의 네트워크 제한으로 실패했다. 네트워크 허용 후 같은 빌드를 완료했다. 빌드 환경은 로컬 더미 DB 주소를 사용했다.
- GitHub 필수 CI https://github.com/cavinseo/codetest2/actions/runs/36324226471 은 `completed / success`이다. 린트·타입 검사·테스트·빌드가 모두 성공했다.
- `node temp_files/verify-report-light-deployment.cjs`로 운영 HTML과 CSS 2개·스크립트 14개를 조회했다. 새 보고서 제목과 자산·자금계획 항목, 밝은 포커스 규칙을 확인했다.
- 운영 `/asset/report.pdf`의 SHA-256이 사용자 제공 원본과 일치했다.
- 인증 없는 보고서 API 조회는 401이었다.
- 운영에서 내려받은 CSS를 실제 WS-2 입력 클래스와 함께 Chrome에 적용했다. 네 입력칸의 밝은 모드 포커스 배경은 `rgb(255, 255, 255)`, 글자 대비는 모두 4.5:1 이상, 기본 컨트롤 color-scheme은 `light`였다. 야간 포커스 배경은 기존 `rgb(31, 41, 55)`를 유지했다.
- CSS 검증 화면은 `temp_files/light-inputs-production.png`이다. 실제 로그인 세션에서 운영 프로젝트를 수정하거나 보고서를 저장하지는 않았다.
- 추가 CRAP / Mutation 실행 https://github.com/cavinseo/codetest2/actions/runs/36324226439 은 최종 확인 시 진행 중이었다. 완료된 필수 CI와 구분한다.

이 문서는 배포 후 원래 작업폴더에 남긴 기록이며 운영 배포 커밋에는 포함되지 않는다.
