# WS-11 고객니즈 우선순위 열 폭 조정 결과.

## RESULT

고객니즈 우선순위 표의 두 수치 열을 전체 표의 각각 16%로 배정하고, 번호·작업 열을 제외한 나머지 폭을 고객니즈에 배정했다. 고정 표 배치로 긴 고객니즈가 두 수치 열의 폭을 바꾸지 않으며, 700px 최소 폭과 기존 가로 스크롤로 좁은 화면의 입력 가독성을 유지한다.

## FILES CHANGED

- `components/project/ImprovementsTable.tsx`의 첫 번째 표만 변경했다.
- 실제 작업 폴더와 깨끗한 배포용 체크아웃에 동일한 변경을 반영했고 파일 SHA256이 일치했다.

## COMMIT

- 코드 커밋 `c99c93641c64a338c83851102b16405dc857716f`.

## VERIFIED BY

- `npx tsc --noEmit` — 종료 코드 0, 출력 없음.
- `npm run lint` — `eslint .`, 종료 코드 0.
- 더미 DB 환경의 `npm run test` — `Test Files 229 passed (229)`, `Tests 3111 passed (3111)`.
- 최종 CSS 비율 조정 후 `npm run test -- tests/improvements-feature-pairing.test.ts tests/worksheet-load-safety.test.ts` — `Test Files 2 passed (2)`, `Tests 49 passed (49)`.
- 최종 `npx eslint components/project/ImprovementsTable.tsx` — 종료 코드 0.
- `git diff --check` — 종료 코드 0.
- 서비스·DB와 분리된 임시 HTML에서 실제 colgroup과 대응 CSS를 Chrome headless로 측정했다. 표 폭 1900px에서 고객니즈 1191.34px, 두 수치 열 각각 303.83px다. 이전 균등 열 약 599.67px와 비교하여 각각 약 50.7%다.
- 표 폭 1200px에서 고객니즈 715.34px, 두 수치 열 각각 191.83px다. 화면 폭 360px에서는 표가 700px로 유지되고 두 수치 열이 각각 111.83px여서 가로 스크롤로 입력 영역을 확보한다.

## DEVIATIONS

- 표 열에서 퍼센트와 픽셀을 함께 사용하는 calc 식이 Chrome에서 무시되어, 실제로 작동하는 16% 폭으로 적용했다. 표 전체 크기에 따른 근사 절반이며, 데스크톱에서 약 4:1:1 배치다.
- 레이아웃 전용 변경으로 신규 테스트와 빌드는 추가하지 않았다. 전체 테스트 및 타입 검사는 최초 변경 후, 관련 테스트와 lint는 최종 CSS 변경 후 실행했다.

## RISKS

- 운영 화면을 직접 실행하지 않았다. CLAUDE.md의 실DB·개발 서버 금지에 따라 독립 HTML과 mock 테스트로 검증했다.
- 아직 원격 푸시나 배포는 하지 않았다.

## QUESTIONS

없음.
