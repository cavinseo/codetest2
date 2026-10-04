# WS-5 요구사항 그룹핑 운영 배포.

## 결과.

2026-09-28 04:24:07 KST에 Vercel Production 배포가 완료되었다.

- 운영 주소는 https://codetest2-rouge.vercel.app 이다.
- 고정 배포 주소는 https://codetest2-bts5vwy65-cavinseos-projects.vercel.app 이다.
- 배포 커밋은 `a7058eb8b0151f8e398aa6a1dd8ebf755fdd78a4`이다.
- GitHub Production deployment ID는 `6696752283`이다.
- Vercel 배포는 https://vercel.com/cavinseos-projects/codetest2/FHD7nMGVEp35cr7AwHTiX18YnwfG 이다.
- 필수 CI https://github.com/cavinseo/codetest2/actions/runs/36344134670 은 완료 및 성공 상태이다.

## 배포 범위.

최신 운영 커밋 `7a1fa3f`에서 `codex/release-requirements-grouping-20260928` 브랜치를 만들고 다음 4개 파일만 반영했다.

- `components/project/RequirementsTable.tsx`.
- `lib/requirements-table-utils.ts`.
- `tests/requirements-table-utils.test.ts`.
- `tests/requirements-inline-edit-save.test.ts`.

요구사항 편집 확정·새 행 추가·저장 시 1차 그룹 안에서 2차 그룹을 모으고 행 순서를 다시 매긴다. 그룹의 첫 등장 순서와 그룹 내부의 항목 순서를 보존한다. 요구사항 ID를 유지하며 기존 저장 API에 정리한 order 값을 전달한다. 입력 중인 새 행도 상단 저장에 포함하고, 저장 실패 시 편집 내용을 보존한다. 저장 중에는 폼을 비활성화한다.

기존 저장 데이터는 조회만으로 변경하지 않는다. WS-5에서 저장하면 정리된 순서를 저장한다. 데이터베이스 스키마, 서버 API, 의존성, 환경변수 변경은 없다. 원래 작업폴더에 있던 다른 변경은 배포에 포함하지 않았다.

배포용 작업폴더는 `C:/Users/user/.codex/visualizations/2026/09/20/01a0bd11-14b8-7543-8c41-b152a9f9b146/release-report-light-20260927`를 재사용했다. 검증 후 `git push --atomic origin HEAD:refs/heads/codex/release-requirements-grouping-20260928 HEAD:refs/heads/main`을 실행했다. 최종 원격 조회에서 두 브랜치 모두 배포 커밋을 가리켰다.

## 검증.

- 배포본 전체 테스트 180개 파일, 2,775개 테스트가 통과했다.
- 배포본 린트, 프로덕션 빌드, Git diff 공백 검사가 통과했다. 빌드에는 접속하지 않는 더미 DB 주소를 사용했다.
- 필수 GitHub CI의 린트, 타입 검사, 테스트, 빌드가 모두 성공했다.
- `node temp_files/verify-requirements-grouping-deployment.cjs`로 운영에서 내려받은 WS-5 화면을 Chrome에서 실행했다.
- 이 브라우저 검증에서는 모든 API 요청을 가로채 임시 응답을 제공했다. 실제 운영 API 저장 요청은 0건이며, 브라우저 안에서만 저장 2건을 재현했다.
- 편집 중 상단 저장, 새 행 입력 중 상단 저장, 기존 ID 보존, 순서 값 재부여, 새로고침 후 그룹 순서 유지가 모두 통과했다. 브라우저 페이지 오류는 없었다.
- 화면 캡처는 `temp_files/requirements-grouping-production.png`, 검증 결과는 `temp_files/grouping-release-live-verification.log`에 있다.
- 추가 CRAP / Mutation 실행 https://github.com/cavinseo/codetest2/actions/runs/36344134684 은 최종 확인 시 진행 중이었다. 필수 CI 성공과 구분한다.

이 문서는 배포 후 원래 작업폴더에 남긴 기록이며 운영 배포 커밋에는 포함되지 않는다.
