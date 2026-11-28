# WS-11 고객니즈 우선순위 표 폭 운영 배포.

## RESULT

사용자의 배포 요청에 따라 WS-11 고객니즈 우선순위 표의 폭 조정을 운영에 반영했다.

- 운영 주소는 https://codetest2-rouge.vercel.app 이다.
- 배포 ID는 `dpl_GLK9A8jh9CUspmvVek975QTrZyYD`다.
- 개별 배포 주소는 https://codetest2-nczax8y9d-cavinseos-projects.vercel.app 이다.
- 최종 상태는 `READY`, 대상은 `production`이다.

## FILES CHANGED

배포 기록만 추가했다. 앱 코드 변경과 검증은 같은 폴더의 `task-a.md`에 기록했다.

## COMMIT

- 배포 소스는 `388fdf452b90ff161c5e414ade5bc3652d397a73`다.
- 코드 커밋은 `c99c93641c64a338c83851102b16405dc857716f`다.
- 깨끗한 배포 체크아웃의 git archive를 별도 폴더로 추출하여 기존 Vercel 프로젝트에 배포했다.
- 원격 Git 브랜치는 변경하지 않았다.

## VERIFIED BY

- 이전 운영 배포 `dpl_HhbZmzURgQrYGZegcLqScZ5zRtrE`를 조회한 후 그 소스를 포함하는 후속 커밋을 배포했다.
- 배포 폴더 798개 파일에서 개인 환경파일·로컬 DB 파일은 0개였다. `.env.example`만 허용했다.
- 수정한 컴포넌트의 배포 파일 Git blob 해시 `ff700944b3b533cf68e5f001d616679b81e7f661`이 소스 커밋과 일치했다.
- `vercel deploy --prod --yes --json --no-wait --meta sourceCommit=388fdf452b90ff161c5e414ade5bc3652d397a73`로 배포했다.
- Vercel API의 `meta.sourceCommit`이 검증 커밋과 일치했다.
- `vercel inspect <배포 주소> --wait --timeout 5m --json` 결과는 `READY / production / errorCode=null / errorMessage=null`이었다. 운영 배포 빌드가 성공했다.
- `vercel inspect https://codetest2-rouge.vercel.app --json` 결과는 새 배포 ID와 `READY / production`으로 일치했다.
- 운영 `GET /login`은 200이었다.
- 비로그인 `GET /api/admin/projects`는 401이었다.
- 비로그인 `GET /api/projects/ws11-deployment-check/improvements`는 401이었다.

## DEVIATIONS

없음. 기존 방식대로 검증한 커밋을 직접 배포했다.

## RISKS

실계정으로 WS-11 편집·저장을 수행하지 않았다. 해당 동작은 앞선 mock 기반 회귀 테스트로 검증했으며, 배포 후에는 접속과 인증 차단 응답을 확인했다. 실DB 쓰기·마이그레이션·개발 서버 기동은 하지 않았다.

## QUESTIONS

없음.
