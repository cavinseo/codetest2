# WS-5 그룹 병합과 천원 단위 변경 운영 배포

## RESULT

사용자 요청으로 검증된 WS-5 그룹 계층·셀 병합과 앞서 완료한 금액 단위 천원 통일을 Vercel 운영 환경에 배포했다.

- 운영 주소는 https://codetest2-rouge.vercel.app 이다.
- 최종 배포 ID는 dpl_BSuTJvi4mSSuKXifPhmRvF4NTEMJ이다.
- 배포 주소는 https://codetest2-8htojbvma-cavinseos-projects.vercel.app 이다.
- readyState는 READY이며 target은 production이다.
- 운영 주소를 inspect하여 최종 배포 ID와 일치함을 확인했다.

## FILES CHANGED

배포를 위해 앱 코드를 추가로 수정하지 않았다. 이 배포 기록을 추가했다. 소스 변경과 테스트 근거는 같은 폴더의 task-a.md 및 ../2026-10-11-money-thousand-won/task-a.md에 있다.

## COMMIT

배포 소스는 c49693ac2726fc4ecc49c66b155894d98cc2aaf2이다. 코드 커밋 9005a0109ead86300391a998b5ad1d93e35741f8 및 552b4a4ba116d342abd7773baaf314f273b29849를 포함한다. 브랜치는 codex/ws5-secondary-grouping-20261011이다.

최신 origin/main f96262b와 비교하여 두 작업의 커밋 네 개만 추가된 상태임을 확인했다. 배포는 검증한 커밋의 git archive로 추적 파일만 추출한 폴더에서 Vercel CLI로 수행했다. 원격 Git 브랜치는 변경하지 않았다.

## VERIFIED BY

- 배포 전 전체 검증은 task-a.md에 기록되어 있다. 현재 작업 폴더 3,160개 및 분리 체크아웃 3,075개 테스트, 타입·lint·운영 빌드가 통과했다.
- 배포 폴더 783개 파일 중 개인 환경파일 0개, 로컬 DB 파일 0개를 확인했다. .env.example만 허용했다. vercel deploy --dry --json에서 실제 업로드 대상 780개 파일을 확인했다.
- 핵심 소스 9개 파일의 git hash-object 결과가 배포 커밋의 blob과 일치했다. Git의 줄바꿈 정규화를 적용하여 비교했다.
- Vercel API에서 최종 배포의 meta.sourceCommit이 c49693ac2726fc4ecc49c66b155894d98cc2aaf2와 일치함을 확인했다.
- vercel inspect 최종 배포 및 운영 주소. READY / production / 동일한 최종 배포 ID.
- 운영 GET /login. HTTP 200.
- 인증 없는 운영 GET /api/admin/projects. HTTP 401.
- 인증 없는 운영 GET /api/projects/ws5-release-check/requirements. HTTP 401.
- 인증 없는 운영 POST /api/projects/ws5-release-check/report/docx. HTTP 401.

## DEVIATIONS

첫 배포의 설명용 sourceCommit 값에 오기가 있어 git rev-parse로 실제 커밋값을 읽고 동일한 소스를 다시 배포했다. 최종 운영 주소는 정확한 커밋값을 가진 두 번째 배포에 연결되어 있다. 앱 코드와 배포 파일에는 차이가 없다.

Word 다운로드 확인에서 GET을 시도했을 때 HTTP 405가 반환되었다. 현행 배포 소스가 POST 경로를 사용하는 것을 확인하고 실제 POST 경로의 HTTP 401을 검증했다. 이번 변경에서 Word API 계약을 바꾸지 않았다.

## RISKS

- 로그인한 실제 계정의 WS-5 편집·저장과 보고서 다운로드는 온라인에서 재실행하지 않았다. 해당 기능은 모킹된 React DOM·API 및 Word 출력 테스트로 검증했다.
- 기존 저장 보고서와 다운로드 파일에 새 그룹 순서와 금액 단위를 반영하려면 보고서 표를 갱신하거나 재생성해야 한다.
- 원격 DB 쓰기, 마이그레이션, dev 서버 기동을 실행하지 않았다.

## QUESTIONS

없다.
