# 업로드 선택창 통일 운영 배포.

## 결과.

2026-09-28 01:27:14 KST에 Vercel Production 배포가 완료되었다.

- 운영 주소는 https://codetest2-rouge.vercel.app 이다.
- 고정 배포 주소는 https://codetest2-ak780mjge-cavinseos-projects.vercel.app 이다.
- 커밋은 `7a1fa3f5d518ee04a0486673865aeb39133ce322`이다.
- GitHub Production deployment ID는 `6694759390`이다.
- Vercel 배포는 https://vercel.com/cavinseos-projects/codetest2/FdcUj77cSYGb2ebMNVbRF2JjdrD7 이다.
- 필수 CI https://github.com/cavinseo/codetest2/actions/runs/36333158796 은 완료 및 성공 상태이다.

## 배포 범위.

운영 기준 `7be330c`에서 `codex/release-upload-choice-20260928` 브랜치를 만들어 12개 파일을 반영했다. 기존 배포용 작업폴더 `C:/Users/user/.codex/visualizations/2026/09/20/01a0bd11-14b8-7543-8c41-b152a9f9b146/release-report-light-20260927`를 재사용했다.

- WS-2, WS-3, WS-5, Kano 엑셀·HTML, 전체·선택 워크북의 추가·교체·취소 선택을 공통 인라인 안내로 통일했다.
- 업로드 중 선택 버튼을 비활성화하고 워크북 파일·시트 변경을 막았다.
- 연관 데이터 삭제 확인과 Kano 응답자별 교체 선택을 유지했다.
- 배포 준비 중 운영 Kano 서버에는 명시적인 응답자별 교체 플래그가 없고 추가 업로드도 해당 응답자의 기존 답변을 삭제하는 차이를 발견했다. 두 업로드 API와 공통 저장 함수에 필요한 최소 변경만 반영했다. 추가 중 중복 응답자는 409로 알려 기존 응답을 보존하고, 명시적으로 선택하면 해당 응답자의 답변만 교체한다. 기존 초대 upsert 저장 방식은 유지했다.
- 원래 작업폴더의 Google Forms 연결, 파일 검사 강화, 일괄 저장 리팩토링 등 다른 미완료 변경은 포함하지 않았다. 원래 작업폴더의 기존 변경은 그대로 남아 있다.
- 데이터베이스 스키마, 의존성, 운영 환경변수 변경은 없다.

검증 후 `git push --atomic origin HEAD:refs/heads/codex/release-upload-choice-20260928 HEAD:refs/heads/main`을 실행했다. 최종 원격 조회에서 두 브랜치 모두 배포 커밋과 일치했고 배포용 작업폴더는 깨끗했다.

## 검증.

- 배포본 전체 테스트 180개 파일, 2,765개 테스트가 통과했다.
- 배포본 린트, 프로덕션 빌드, Git diff 공백 검사가 통과했다. 빌드에는 접속하지 않는 더미 DB 주소를 사용했다.
- 최초 API 테스트 추가 때 정적 import가 Vitest mock 초기화보다 먼저 실행되어 한 테스트 파일이 실패했다. 기존 패턴대로 동적 import로 바꾼 뒤 전체 테스트가 통과했다.
- 필수 GitHub CI의 린트, 타입 검사, 테스트, 빌드가 모두 성공했다.
- 운영 다섯 페이지의 HTML·스크립트와 CSS 2개를 읽어 공통 선택창 문구, 숫자 입력 팝업 제거, Kano 응답자별 교체 전달 플래그가 반영됐음을 확인했다.
- 실제 공통 컴포넌트와 운영 CSS를 Chrome에서 렌더링해 밝은·어두운 모드, 390px·1280px 너비에서 가로 넘침이 없고 주요 버튼 글자색이 흰색임을 확인했다. 결과 이미지는 `temp_files/upload-choice-{light,dark}-{390,1280}.png`이다.
- 운영 프로젝트에 로그인해 실제 파일을 업로드하거나 데이터를 변경하는 테스트는 수행하지 않았다. 저장 동작은 Prisma mock을 이용한 API 테스트로 검증했다.
- 추가 CRAP / Mutation 실행 https://github.com/cavinseo/codetest2/actions/runs/36333158798 은 최종 확인 시 진행 중이었다. 필수 CI 성공과 구분한다.

이 문서는 배포 후 원래 작업폴더에 남긴 기록이며 운영 배포 커밋에는 포함되지 않는다.
