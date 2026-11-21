# 고객요구사항·Kano·후속 워크시트 순서 연동 운영 배포.

## RESULT.

사용자의 배포 요청에 따라 고객요구사항 순서 연동 변경을 운영 환경에 배포했다.

- 운영 주소는 https://codetest2-rouge.vercel.app 이다.
- 배포 ID는 `dpl_HhbZmzURgQrYGZegcLqScZ5zRtrE`이다.
- 개별 배포 주소는 https://codetest2-e3cya60g2-cavinseos-projects.vercel.app 이다.
- 최종 상태는 `READY`, 대상은 `production`이다.
- 운영 주소를 다시 조회하여 새 배포 ID에 연결된 것을 확인했다.

## FILES CHANGED.

배포를 위한 앱 코드 수정은 없으며 이 배포 기록만 추가했다. 기능과 테스트 근거는 같은 폴더의 `task-a.md`에 있다.

## COMMIT.

- 배포 소스는 `4921b7abca56a152d2f1daf6d0fa25c3e83c227f`이다.
- 기능 커밋은 `80991212198917c5d12461983d3b0c9520dd3773`이다.
- 브랜치는 `codex/requirement-order-sync-20261011`이다.
- 기존 운영 배포 `dpl_BSuTJvi4mSSuKXifPhmRvF4NTEMJ`에서 새 배포로 연결되었다.
- 검증한 커밋의 git archive로 추적 파일만 추출하고 기존 프로젝트 연결 정보를 적용하여 Vercel CLI로 배포했다.
- 원격 Git 브랜치는 변경하지 않았다.

## VERIFIED BY.

- 배포 전 소스 체크아웃은 깨끗했으며 해당 커밋의 타입·lint·빌드 및 3,111개 테스트가 통과한 상태임을 확인했다. 통합된 사용자 작업 폴더의 3,198개 테스트도 앞선 작업에서 통과했다.
- 배포 폴더의 796개 파일 중 개인 환경파일과 로컬 DB 파일은 0개였다. `.env.example`만 허용했다.
- 핵심 변경 소스 9개 파일의 Git blob 해시가 배포 커밋과 일치했다.
- `vercel deploy --dry --json`은 Next.js, 실제 업로드 793개 파일, 17,590,521바이트를 확인했다.
- `vercel deploy --prod --yes --json --no-wait --meta sourceCommit=<검증 커밋>`으로 운영 배포했다.
- Vercel API에서 배포의 `meta.sourceCommit`이 `4921b7abca56a152d2f1daf6d0fa25c3e83c227f`와 일치함을 확인했다.
- 배포 API의 최종 결과는 `READY / production / errorCode=null / errorMessage=null`이다.
- `vercel inspect https://codetest2-rouge.vercel.app --json`은 `dpl_HhbZmzURgQrYGZegcLqScZ5zRtrE / READY / production`을 반환했다.

운영 HTTP 확인 결과는 다음과 같다.

| 요청 | 결과 |
| --- | --- |
| GET /login | 200 |
| 비로그인 GET /api/admin/projects | 401 |
| 비로그인 GET /api/projects/order-release-check/requirements | 401 |
| 비로그인 GET /api/projects/order-release-check/kano/analysis | 401 |
| 비로그인 GET /api/projects/order-release-check/tech-roadmap | 401 |
| 비로그인 POST /api/projects/order-release-check/report/docx | 401 |

## DEVIATIONS.

없다. 기존 배포 방식과 동일하게 검증된 커밋을 직접 배포했다.

## RISKS.

- 실계정으로 편집·저장·다운로드를 재실행하지 않았다. 로그인 후 세부 동작의 근거는 기존 모의 API·컴포넌트·출력 테스트다.
- 기존 완료 보고서에 새 순서를 반영하려면 표를 갱신하거나 재생성해야 한다.
- 항목 ID 또는 유일한 질문 문구가 없는 과거 순번 전용 응답 파일은 잘못된 항목 연결을 방지하기 위해 업로드를 거부한다.
- 실DB 일괄 쓰기·마이그레이션·개발 서버 기동은 실행하지 않았다. 기존 연결 행의 저장 순서는 요구사항 저장 시 갱신된다.

## QUESTIONS.

없다.
