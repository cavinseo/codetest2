# WS-3 제공혜택 및 개요 이미지·글머리 운영 배포.

## 배포 결과.

- 사용자 요청에 따라 GitHub main과 codex/overview-auto-bullets-20260929 브랜치에 푸시했다.
- 최종 커밋은 `edb18d83773df9e5dadbea3d007537f17887e662`이며 두 원격 브랜치의 HEAD가 일치한다.
- 배포용 체크아웃은 깨끗하며 원본 작업 폴더의 다른 변경은 포함하지 않았다.
- 운영 주소는 https://codetest2-rouge.vercel.app 이다.
- GitHub Production 배포 `6717505014`가 2026-09-29 03:28:51 KST에 success로 기록됐다.
- 고정 배포 주소는 https://codetest2-fi3voe5ps-cavinseos-projects.vercel.app 이다.

## 포함된 변경.

- `effae1e`는 서로 다른 고객니즈의 제공혜택을 병합하지 않도록 수정한다. 새 고객니즈를 추가·편집해도 기존 혜택을 보존한다.
- `d0f251f`는 개요에서 관련이미지 최대 3개를 업로드·삭제·저장하고 결과보고서에 포함한다. 기존 단일 이미지도 보존한다.
- `24360e8`은 상세 제품개요에 글머리 도구와 Enter 자동 이어쓰기를 추가한다.
- `edb18d8`은 이미지 API 테스트에서 배열을 개별 인수로 펼치던 입력을 객체로 감싸 실제 목록 전체가 검증되도록 수정한다. 초기 CI의 TS2345를 로컬에서 재현한 뒤 수정했으며 제품 코드는 변경하지 않았다.

## DB 반영.

- 앱의 실제 DB 연결을 확인하고 Prisma migration deploy로 `20260928180835_overview_related_images`를 적용했다.
- 2026-09-29 03:22:04 KST에 완료됐다. 앱 배포 전에 적용했다.
- projects.relatedImages는 nullable JSONB 열이다. 기존 필드는 삭제하거나 덮어쓰지 않았다.
- 변경 전후 프로젝트 14개, 기존 단일 이미지 보유 프로젝트 1개가 유지됐다. projects의 RLS도 활성화 상태를 유지했다.
- 연결된 Supabase 도구의 프로젝트가 앱 DB와 달라 해당 도구로 변경하지 않았다.
- 증거는 `temp_files/overview-images-migration-result.json`과 `overview-images-migration-deploy.log`에 보관했다.

## 검증 결과.

- 최종 GitHub CI https://github.com/cavinseo/codetest2/actions/runs/36465349700 에서 린트, 전체 타입 검사, 188개 파일의 2,832개 테스트, 프로덕션 빌드가 모두 통과했다.
- 테스트 입력 수정 후 로컬 전체 타입 검사, 이미지 API 테스트 22개, 관련 린트와 diff 공백 검사가 통과했다.
- 운영 도메인의 실제 배포 화면을 Chrome으로 열어 아래 세 흐름을 확인했다.
  - WS-3 새 고객니즈 추가, 기존 제공혜택 표시, 같은 니즈의 셀 병합 유지, 새 혜택 수정·비우기, 저장·새로고침을 검증했다.
  - 기존 이미지 유지, 실제 PNG 2개 추가와 최적화, 3개 제한, 저장·새로고침, 개별 삭제·재추가, 전체 삭제를 검증했다.
  - 글머리 도구, Enter 이어쓰기, 빈 항목 종료, 여러 줄 기호 변경·제거, 수동 대시, Shift+Enter, 저장·새로고침과 취소를 검증했다.
- 위 브라우저 검증의 API는 테스트 응답으로 대체했다. 운영 프로젝트 저장은 0회이며 세 실행 모두 브라우저 오류가 없었다. 실제 로그인 후 운영 DB 저장까지 수행한 검증은 아니다.
- 실제 공개 HTTP 확인에서 홈과 개요 화면은 200, 비로그인 개요 GET·PATCH와 WS-3 GET은 401이었다.
- 별도 CRAP / Mutation 워크플로는 확인 시점에 실행 중이었다. 완료된 일반 CI와 구분한다.

## 검증 자료.

- `temp_files/overview-deployment-ci-success.log`.
- `temp_files/overview-deploy-first-ci-failure.log`.
- `temp_files/overview-deploy-typecheck.log`.
- `temp_files/ws3-benefit-production/result.json` 및 `benefits-visible.png`.
- `temp_files/overview-images-production/result.json` 및 `three-images.png`.
- `temp_files/overview-bullets-production/result.json` 및 `bullet-editor.png`.
- `temp_files/overview-deployment-public-result.json`.

이 문서는 배포 완료 후 로컬 검증 기록이며 추가 배포를 유발하는 커밋에는 포함하지 않았다.
