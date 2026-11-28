# Kano 분석 워크시트 권한 운영 배포.

## RESULT

사용자의 배포 요청에 따라 Kano 분석 집계표와 TIMKO/만족계수 그래프의 멘토 열람 권한을 운영에 반영했다.

- 운영 주소는 https://codetest2-rouge.vercel.app 이다.
- 배포 ID는 `dpl_33HESQaC8BMyfDMZ6neDDb3nLzZE`다.
- 개별 배포 주소는 https://codetest2-bruzz2q9g-cavinseos-projects.vercel.app 이다.
- 최종 상태는 `READY`, 대상은 `production`이다.
- 담당 멘토와 멘토로 배정된 매니저는 열람·편집하고 관리자는 읽기만 하는 기능을 배포했다.

## FILES CHANGED

앱 코드를 추가 변경하지 않고 배포 기록만 추가했다. 구현과 검증은 같은 폴더의 `task-a.md`에 있다.

## COMMIT

- 배포 소스 `70f1ad299d6c0f3e30c7650c8a03d3c247c4365e`.
- 기능 구현 `65cc9e18d264dd5858663f7b4685233d5d9ff75d`.
- 이전 운영 소스 `388fdf452b90ff161c5e414ade5bc3652d397a73`가 배포 소스의 조상임을 확인했다.
- 기존 운영 배포 `dpl_GLK9A8jh9CUspmvVek975QTrZyYD`에서 새 배포로 연결됐다.

## VERIFIED BY

- 배포 소스 작업트리가 깨끗했고 타입·lint·빌드 및 release 3,250개 테스트, 통합 작업폴더 3,337개 테스트가 통과한 기록을 확인했다.
- 독립 읽기 검토에서 이전 운영 소스 이후 변경은 이번 기능·테스트·관련 문서이며 package/lockfile/Prisma 스키마·마이그레이션에 변경이 없음을 확인했다.
- `git archive`로 추적 파일만 묶었다. 805개 파일을 Git blob과 바이트 단위로 대조했고 개인 환경파일·로컬 DB 파일은 0개였다. `.env.example`만 허용했다.
- Windows archive의 줄바꿈 변환 때문에 최초 비교가 실패했다. CRLF/LF 차이뿐임을 확인하고 배포 폴더를 원본 Git blob 줄바꿈과 같게 정규화한 다음 805개 파일 일치를 확인했다.
- `vercel deploy --dry --json`은 Next.js, 업로드 803개 파일, 17,523,823바이트를 확인했다.
- `vercel deploy --prod --yes --json --no-wait --meta sourceCommit=70f1ad299d6c0f3e30c7650c8a03d3c247c4365e`로 배포했다.
- Vercel API에서 프로젝트 `prj_KahsoHiz93eBM42v2Sh82gY5PU8l` 및 `meta.sourceCommit` 일치를 확인했다.
- `vercel inspect <배포 주소> --wait --timeout 45s --json`의 최종 상태는 `READY / production`이며 운영 도메인이 aliases에 포함됐다.
- `vercel inspect https://codetest2-rouge.vercel.app --json`의 ID가 새 배포와 일치했고 `READY / production`이었다.
- 실제 운영 주소의 비로그인 읽기 확인 결과는 아래와 같다.

| 요청 | HTTP |
| --- | --- |
| `/login` | 200 |
| `/api/projects/kano-access-deployment-check/kano/analysis` | 401 |
| `/api/projects/kano-access-deployment-check/kano/analysis?view=summary` | 401 |
| `/api/projects/kano-access-deployment-check/export?format=xlsx&worksheet=kano-aggregation` | 401 |
| `/api/projects/kano-access-deployment-check/export?format=xlsx&worksheet=timko` | 401 |

## DEVIATIONS

없다. 기존 방식대로 검증한 커밋을 기존 Vercel 프로젝트에 직접 배포했다. 원격 Git push는 수행하지 않았다.

## RISKS

실계정으로 역할별 워크시트 조작·저장을 수행하지 않았다. 역할별 동작은 앞선 mock 회귀 테스트로 검증했고 배포 후에는 서비스 연결과 비로그인 차단을 확인했다. 실DB 쓰기·마이그레이션·개발 서버 실행은 하지 않았다.

## QUESTIONS

없다.
