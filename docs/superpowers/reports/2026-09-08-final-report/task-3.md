# Task 3 결과 보고서

## RESULT

워크시트 DOM을 PNG로 캡처하는 브라우저 전용 유틸을 구현하고, 문서 본문의 첫 제목을 `표지`에서 `KS-QFD 결과보고서`로 수정했다. 지정된 검사와 작업 커밋 푸시를 완료했다. 화면·API·스키마는 변경하지 않았다.

## FILES CHANGED

- `lib/final-report-document.ts` — 첫 heading 문구 수정.
- `tests/final-report-document.test.ts` — A 항목에 따른 기대 제목 보완 및 첫 제목 테스트 추가.
- `lib/worksheet-capture.ts` — 라이트 캡처, 가로 스크롤 확장, 실제 픽셀 치수 반환, 오류 식별 및 DOM 복구.
- `tests/worksheet-capture.test.ts` — html-to-image 모의 테스트 6개.
- `package.json`, `package-lock.json` — html-to-image 1.11.13만 추가.
- `docs/superpowers/plans/2026-09-08-final-report.md` — Task 3 체크박스 3개 갱신.
- 이 보고서는 별도 두 번째 커밋으로 저장한다.

## COMMIT

- 브랜치 `claude/notification-warning-position-p3vlxx`.
- 작업 커밋 `d378800918ebe68abcaf406ff0ae0ef99102f8e1`.
- 보고서 커밋 제목 `docs: Task 3 결과 보고서`.
- 작업 시작 전에 fetch 후 지정 브랜치에서 `git merge --no-edit origin/claude/notification-warning-position-p3vlxx`를 실행했다. 원격 지시문 커밋 `b5861bb`까지 fast-forward로 반영했으며 rebase하지 않았다.
- `git push -u origin claude/notification-warning-position-p3vlxx`가 종료 코드 0으로 성공해 원격에 작업 커밋을 반영했다. main 병합·배포는 수행하지 않았다.

## VERIFIED BY

작업 전 `npx vitest run`은 **116개 파일·1,330개 테스트** 전체 통과였다. 신규 테스트 작성 후 캡처 모듈 부재와 기존 첫 제목 `표지` 때문에 실패하는 RED를 확인하고 구현 후 GREEN을 확인했다. A 항목이 허용한 첫 제목 기대값 외 기존 검증을 변경하거나 skip·삭제하지 않았다.

최종 게이트는 모두 종료 코드 0이다.

1. `npx tsc --noEmit`.

   출력 없이 성공했으므로 마지막 출력 줄은 없다.

2. `npx vitest run`.

   **117개 파일·1,337개 테스트** 전체 통과다. 마지막 비어 있지 않은 출력 줄은 다음과 같다.

   ```text
      Duration  4.92s (transform 8.17s, setup 0ms, import 23.96s, tests 5.88s, environment 14ms)
   ```

3. `npx next lint`.

   ```text
   ✔ No ESLint warnings or errors
   ```

4. `npx stryker run stryker.crap.config.json --mutate lib/final-report-document.ts`.

   점수 줄 원문은 다음과 같다. 총 268개, killed 268개, timeout·survived·no coverage·errors 모두 0개다. 기존 268개에서 수가 바뀌지 않았으며 disable이나 제외는 없다.

   ```text
    final-report-document.ts | 100.00 |  100.00 |      268 |         0 |          0 |        0 |        0 |
   ```

`git diff --cached --check`도 출력 없이 통과했다. 의존성 diff는 package.json 1줄 및 lock 7줄 추가뿐이다. 캡처 모듈은 mutate 목록에 추가하지 않았다. `CapturedWorksheetImage` 타입은 그대로다.

## DEVIATIONS

- 계획서의 함수 호출 형태 `captureWorksheetNode(node, options?)`를 유지했다. 반환 타입은 기존 이미지 타입의 `pngDataUrl`, `widthPx`, `heightPx` 세 필드만 Pick한다. worksheetId와 title은 Task 4 호출자가 붙인다. 오류 메시지는 계획서 Task 4가 지정한 루트의 `data-worksheet-id`로 워크시트를 식별한다. 해당 속성이 없으면 DOM id, 그것도 없으면 `unknown`을 표시하므로 호출자는 지정된 세 탭 id를 반드시 붙여야 한다.
- `app/globals.css`의 `.light .text-white`, `.light .input`, `.light .timko-chart text` 및 배경 규칙을 읽었다. 흰 배경 옵션만 쓰면 흰 글자가 남으므로 루트의 `.light` 클래스와 흰 캡처 배경을 함께 적용했다. 루트 자체는 하위 선택자의 대상이 아니어서 배경과 글자색을 inline important로 지정했다. 전역 테마나 CSS 파일은 바꾸지 않았다.
- 캡처 시 중첩된 Tailwind 가로 스크롤 컨테이너부터 폭을 펼친다. 루트와 해당 컨테이너의 기존 style 속성 및 루트 class 속성은 finally에서 복원한다. 성공·라이브러리 실패·PNG 직렬화 실패 경로를 모의 테스트로 검증했다.
- PNG 크기를 추산하지 않기 위해 `toPng` 대신 html-to-image의 `toCanvas`와 캔버스 `toDataURL('image/png')`를 사용했다. 설치된 구현은 pixelRatio와 큰 이미지 자동 축소를 반영하므로 최종 canvas.width/height를 그대로 반환한다. 기본 배율은 계획서대로 2다.
- 설치 명령은 `npm install html-to-image --ignore-scripts --no-audit --no-fund`로 실행했다. lifecycle 실행 없이 승인된 의존성만 추가했다. npm은 로컬 node_modules에서 14개 패키지 제거도 보고했지만, 추적되는 의존성·lock diff에는 무관한 삭제나 버전 변경이 없다. 설치 후 전체 테스트와 타입 검사를 통과했다.
- 계획서의 이전 설명에는 단위 테스트 대상이 아니라고 되어 있으나, 이번 프롬프트의 명시적 지시를 우선해 html-to-image를 mock한 테스트를 작성했다. 실제 DOM 렌더링을 시도하지 않았다.

## RISKS

- 실제 WS-4·7·9 브라우저 화면의 캡처 결과와 Word 배치를 시각 검증하지 않았다. 테스트는 모의 DOM 및 라이브러리 호출 인자·반환값·실패 처리만 검증한다.
- 외부 글꼴·이미지의 CORS, 브라우저별 캔버스 한계, 캡처 도중 React 상태 갱신, 실제 QFD 스크롤·고정 열 배치는 Task 4 화면에서 검증해야 한다.
- 국소 `.light`를 적용하므로 전역 `.dark` 하위 규칙과 혼합되는 일부 색상은 실화면 확인이 필요하다. 캡처 중에는 대상의 폭과 색이 일시적으로 바뀌므로 호출 화면은 캡처 영역을 전용 컨테이너로 두고 캡처 중 편집·중복 실행을 막아야 한다.
- 앱 전체 production build, dev 서버, DB/API 실연동은 실행하지 않았다.
- Stryker는 100%와 종료 코드 0을 반환했지만 임시 디렉터리 `sandbox-Z4mZGA` 삭제 실패 메시지가 남았다.

## QUESTIONS

현재 Task 3 완료를 막는 질문은 없다. Task 4는 루트에 `data-worksheet-id`를 지정하고 반환된 세 필드에 기존 worksheetId·title을 결합해야 한다.
