# 결과보고서 샘플 양식 및 리팩토링 운영 배포.

## 배포 결과.

2026-09-29 02:49:11 KST에 Vercel Production 배포가 완료되었다.

- 운영 주소는 https://codetest2-rouge.vercel.app 이다.
- 고정 배포 주소는 https://codetest2-b6tn93fwx-cavinseos-projects.vercel.app 이다.
- 배포 커밋은 `9ec9d49f9e6b8d24ec0e4626588e54b9f5981bfd`이다.
- GitHub Production deployment ID는 `6716713119`이다.
- Vercel 배포는 https://vercel.com/cavinseos-projects/codetest2/HHJDK56i7q3QCDVpjDx1o2m1i6rJ 이며 성공 상태이다.
- 필수 CI https://github.com/cavinseo/codetest2/actions/runs/36460657765 의 린트, 타입 검사, 테스트, 빌드가 모두 성공했다.

## 배포 범위와 절차.

기존 운영 커밋 `a7058eb` 이후 검증된 다음 변경을 배포했다.

- `7634b83`에서 워크시트 실제 결과의 보고서 반영과 그림 다운로드를 추가했다.
- `8333be6`에서 WS-3 열 폭을 조정했다.
- `e4fc142`에서 WS-3 가치사슬 및 가치 시스템 AI 멘토링을 추가했다.
- `cba511b`에서 승인된 샘플의 결과보고서와 A4 미리보기 및 Word 양식을 적용했다.
- `9ec9d49`에서 기능을 유지하며 보고서 구성과 렌더링 코드를 정리했다.

기존 배포 작업폴더 `C:/Users/user/.codex/visualizations/2026/09/20/01a0bd11-14b8-7543-8c41-b152a9f9b146/release-report-light-20260927`의 깨끗한 작업 트리를 사용했다. 원격 main이 `a7058eb8b0151f8e398aa6a1dd8ebf755fdd78a4`임을 확인한 후 `git push --atomic origin HEAD:refs/heads/codex/report-sample-layout-20260929 HEAD:refs/heads/main`을 실행했다. 최종 원격 조회에서 두 브랜치 모두 배포 커밋을 가리켰다.

데이터베이스 스키마, 의존성, 환경변수 변경은 없다. 원래 작업폴더의 다른 미커밋 변경은 배포에 포함하지 않았다.

## 검증 결과.

- 같은 배포 커밋의 로컬 린트, 전체 테스트 186개 파일·2,796개 테스트, 프로덕션 빌드가 통과했다. 상세 기록은 같은 폴더의 `verification.md`에 있다.
- 운영 첫 화면, 보고서 화면 및 관련 JavaScript 자산 16개가 정상 응답했다. 샘플 양식의 제목, 자산·자금계획 장, WS-15, 출력일 안내와 A4 페이지 구성 코드가 운영 자산에 포함됨을 확인했다.
- 운영 `/asset/report.pdf`의 SHA-256이 로컬 원본과 일치했다.
- 로그인 없는 보고서 조회와 Word 생성 요청은 각각 HTTP 401로 차단됐다.
- `node temp_files/verify-report-sample-production.cjs`로 운영에서 내려받은 화면을 Chrome에서 실행했다. 실제 사례 조회본을 임시 API 응답으로 공급하고 모든 API 요청을 가로채 운영 데이터 변경을 막았다.
- AI PLC 관리 장비 사례의 20쪽, 기업명 KNF, 담당 멘토 서진원, 한국 기준 출력일 2026.09.29, WS-2 세부기술 41행 및 고객요구사항 15개를 확인했다. 생성된 문서 모델은 리팩토링 전 기준과 동일했다.
- 교정·저장·새로고침·완료본 열람·그림 다운로드·Word 다운로드가 통과했다. 페이지 넘침, 누락 API 응답 및 브라우저 오류는 없었다. 표지 가운데 정렬과 표의 반복 머리글을 화면 캡처로도 확인했다.
- 실제 운영 저장 요청은 0건이다. 저장 3회·공개 1회는 임시 응답에서만 검증했다. 이 브라우저 검증의 Word 파일은 같은 소스의 로컬 렌더러로 응답했으며, 운영 서버에서 인증된 사용자의 Word 생성 자체를 검증한 것은 아니다. Word 앱의 실제 인쇄 렌더링은 확인하지 않았다.
- 운영 자산 검증 결과는 `temp_files/report-sample-production-assets.json`에 있다. 브라우저 결과와 20쪽 캡처는 `temp_files/report-sample-production-verification/`에 있다.
- 별도 CRAP / Mutation https://github.com/cavinseo/codetest2/actions/runs/36460657589 은 최종 확인 시 진행 중이다. 필수 CI 성공과 구분한다.

## 기존 보고서 사용 안내.

기존 저장 보고서는 유지된다. 결과보고서 화면에서 `미리보기 다시 만들기`를 실행하면 새 샘플 양식으로 생성된다.

이 문서는 배포 후 원래 작업폴더에 남긴 기록이며 운영 배포 커밋에는 포함되지 않는다.
