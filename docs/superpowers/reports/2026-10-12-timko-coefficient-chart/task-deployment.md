# Timko 만족·불만족 계수 그래프 운영 배포.

## RESULT

사용자의 배포 요청에 따라 WS-7 및 WS-6 분석 보기의 Timko 만족·불만족 좌우 막대그래프와 계산식 설명표를 운영에 반영했다.

- 운영 주소는 https://codetest2-rouge.vercel.app 이다.
- 배포 ID는 `dpl_HHRiCPVsYTErjMeFbsQB7mKkCdr5`다.
- 개별 배포 주소는 https://codetest2-msfuoop7m-cavinseos-projects.vercel.app 이다.
- 최종 상태는 `READY`, 대상은 `production`이다.
- 운영 도메인이 새 배포를 가리키는 것을 재확인했다.

## FILES CHANGED

앱 코드 추가 변경 없이 배포 기록만 작성했다. 기능 구현 및 테스트 결과는 같은 폴더의 task-a.md에 있다.

## COMMIT

- 배포 소스는 `8912af7d02e94642ae1e98db3c47beee18ba21ee`다.
- 기능 구현은 `534fe2bf51fab1f228f89333ff8241e7711c3322`다.
- 이전 운영 소스는 `70f1ad299d6c0f3e30c7650c8a03d3c247c4365e`다.
- 이전 운영 배포는 `dpl_33HESQaC8BMyfDMZ6neDDb3nLzZE`다.

## VERIFIED BY

- 소스 작업트리가 깨끗하고 기존 운영 커밋을 포함하는 것을 확인했다.
- 읽기 전용 검토에서 운영 이후 변경은 Timko 기능·연결·테스트·문서 9개 파일이며 권한/API/패키지/스키마/마이그레이션 변경이 없음을 확인했다.
- 구현 단계의 배포용 소스 3,265개, 주 작업 폴더 3,352개 테스트 및 타입·lint·빌드 성공 기록을 확인했다.
- Git blob에서 810개 추적 파일을 독립 배포 폴더로 추출하고 모든 파일의 바이트 일치를 확인했다. 개인 환경파일과 로컬 DB는 0개이며 .env.example만 포함했다.
- `vercel deploy --dry --json`에서 Next.js 및 업로드 대상 808개 파일을 확인했다.
- `vercel deploy --prod --yes --json --no-wait --meta sourceCommit=8912af7d02e94642ae1e98db3c47beee18ba21ee`로 운영 배포를 생성했다.
- Vercel API에서 projectId=`prj_KahsoHiz93eBM42v2Sh82gY5PU8l` 및 meta.sourceCommit 일치를 확인했다.
- `vercel inspect <배포 주소> --wait --timeout 45s --json`에서 최종 `READY / production` 및 운영 도메인 aliases를 확인했다.
- `vercel inspect https://codetest2-rouge.vercel.app --json`에서 새 배포 ID와 READY 상태를 확인했다.
- 운영 주소의 비로그인 읽기 확인 결과는 다음과 같다.

| 요청 | HTTP |
| --- | --- |
| /login | 200 |
| /project/deployment-check/kano/analysis | 200 |
| /api/projects/deployment-check/kano/analysis | 401 |
| /api/projects/deployment-check/kano/analysis?view=summary | 401 |

- 워크시트 페이지의 공개 JavaScript 번들 17개 중 `/_next/static/chunks/8623-628dddb4e811d8fc.js`에서 새 `data-timko-coefficients` 컴포넌트 표시를 확인했다. 실제 프로젝트 정보는 조회하지 않았다.

## DEVIATIONS

없다. 기존 운영 Vercel 프로젝트에 검증한 커밋을 직접 배포했다. 원격 Git push는 수행하지 않았다.

## RISKS

실계정의 역할별 화면 조작이나 PNG 다운로드는 실행하지 않았다. 앞선 자동 테스트로 동작·권한·캡처 범위를 확인했고 배포 후에는 운영 연결, 공개 번들 및 비로그인 API 차단을 확인했다. 실DB 쓰기·마이그레이션·개발 서버 실행은 없었다.

## QUESTIONS

없다.
