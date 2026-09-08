# Task 2 결과 보고서

## RESULT

제품 이미지 치수 입력과 비율 보존을 보완하고, `FinalReportModel`을 Word Blob으로 직렬화하는 렌더러를 구현했다. 구현·검증은 통과했지만 원격에 새 문서 커밋이 있어 푸시가 거절됐다. 따라서 원격 반영을 포함한 Task 2 전체 완료 조건은 아직 충족하지 않았다.

모든 블록 종류를 처리하고 `never`로 누락을 검사한다. 이미지 제목은 대체 텍스트로 보존하며, 모델에 없는 본문 문구를 추가하지 않는다. 가로 이미지는 각각 별도 A4 구역에 넣고 다음 본문부터 세로 구역으로 복귀한다. 표 폭은 100%, 글꼴은 맑은 고딕이다.

## FILES CHANGED

- `lib/final-report-document.ts` — 제품 이미지 폭·높이 입력과 비율 유지, null 치수의 기존 고정 크기 폴백.
- `lib/final-report-docx.ts` — 모든 블록의 Word 직렬화, 페이지 방향, 명시적 MIME 타입의 Blob 반환.
- `tests/final-report-document.test.ts` — 새 필수 입력 필드의 null 기본값 보완과 이미지 크기 테스트 6개 추가.
- `tests/final-report-docx.test.ts` — 정상·빈 모델·모든 종류·가로 혼합·연속 가로 이미지 테스트 5개 추가.
- `docs/superpowers/plans/2026-09-08-final-report.md` — Task 2의 세 체크박스만 완료 표시.
- 이 보고서는 별도 두 번째 커밋으로 저장한다.

## COMMIT

- 브랜치 `claude/notification-warning-position-p3vlxx`.
- Task 2 작업 커밋 `fad6cc9d6b454a872208e368bc0fdceae2b1ccc6`.
- 작업 제목 `feat: 결과보고서 .docx 렌더러`.
- 보고서 제목 `docs: Task 2 결과 보고서`.
- 앞선 Task 1 커밋 `f259f48`, `d5d8cbd`도 로컬 이력에 보존되어 있다.
- `git push -u origin claude/notification-warning-position-p3vlxx`는 종료 코드 1로 거절됐다. 원격에만 있는 `5a962a4`가 `docs/superpowers/prompts/2026-09-08-final-report/task-2.md` 한 파일을 추가했다. 네트워크 실패가 아닌 non-fast-forward 거절이므로 시간 간격 재시도는 하지 않았다. 원격 내용을 fetch로 확인했으며 병합·rebase·reset·브랜치 이동·강제 푸시·배포는 하지 않았다.

## VERIFIED BY

작업 전 `npx vitest run`은 **115개 파일·1,319개 테스트** 전체 통과였다. 실패하는 테스트부터 추가한 뒤 신규 비율 테스트 3개가 고정 크기 때문에 실패하고 렌더러 테스트는 모듈 부재로 실패하는 RED를 확인했다. 기존 테스트는 계속 통과했다.

최종 게이트 네 개의 종료 코드는 모두 0이다.

1. `npx tsc --noEmit`.

   출력 없이 성공했으므로 마지막 출력 줄은 없다.

2. `npx vitest run`.

   **116개 파일·1,330개 테스트** 전체 통과다. 마지막 비어 있지 않은 출력 줄은 다음과 같다.

   ```text
      Duration  8.08s (transform 26.00s, setup 0ms, import 46.96s, tests 7.60s, environment 33ms)
   ```

3. `npx next lint`.

   ```text
   ✔ No ESLint warnings or errors
   ```

4. `npx stryker run stryker.crap.config.json --mutate lib/final-report-document.ts`.

   점수 줄 원문은 다음과 같다. 열 순서는 total score, covered score, killed, timeout, survived, no coverage, errors다.

   ```text
    final-report-document.ts | 100.00 |  100.00 |      268 |         0 |          0 |        0 |        0 |
   ```

   총 268개를 모두 검출했다. Task 1의 260개보다 8개 증가했다. disable을 사용하지 않았고 제외로 감소한 수는 0개다. 마지막 출력은 아래 임시 디렉터리 정리 메시지였으며 종료 코드는 0이었다.

   ```text
   02:52:37 (28020) INFO TemporaryDirectory Failed to delete stryker temp directory E:\Dropbox\codetest2\.stryker-tmp\sandbox-Gs9T6g
   ```

렌더러 테스트 5개는 모두 실제 Blob과 MIME 타입, 앞 4바이트 `50 4b 03 04`를 검증한다. ZIP 내부에서는 텍스트 순서·XML 이스케이프·Heading1/2·표 헤더의 굵기/가운데 정렬·표 폭·그림 원본 바이트·EMU 크기·A4 여백·가로/세로 구역 순서를 검증했다. 빈 모델과 연속 가로 그림에는 불필요한 세로 구역을 만들지 않는다.

모델 테스트는 가로·세로·작은 사진과 두 치수 모두 null·폭만 null·높이만 null을 검증한다. 기존 테스트의 기대값·삭제·skip 변경은 없다. A 항목이 명시적으로 요구한 테스트 추가와 필수 입력 필드 보완만 기존 모델 테스트 파일에 반영했다.

렌더러는 mutate 배열에 추가하지 않았고, 의존성 설정과 잠금 파일을 변경하지 않았다. 작업 커밋 전 `git diff --cached --check`도 출력 없이 통과했다.

## DEVIATIONS

- 설치 버전은 `docx` **9.7.1**이다. `node_modules/docx/dist/index.d.ts`의 `IImageOptions`, `RegularImageOptions`, `IMediaTransformation`을 직접 읽었다. `type`이 필수이므로 추정 스니펫에 `type: 'png'`를 보완했다. `data`는 문자열·Uint8Array·ArrayBuffer 등을 받을 수 있다.
- `node_modules/docx/dist/index.mjs`의 `convertDataURIToBinary`, `standardizeData`, `createImageData`도 읽었다. 문자열에서 `;base64,` 접두부를 분리하고 `atob`로 Uint8Array를 만드는 구현이므로 dataURL을 그대로 전달한다. 자체 Buffer 변환이나 새 패키지는 필요 없다. Node에서 실제 이미지 바이트 보존을 검증했으며 브라우저도 같은 atob 경로를 사용한다.
- 타입의 width/height에는 단위 설명이 부족해 구현까지 확인했다. docx는 입력 크기에 9,525를 곱해 EMU로 변환하므로 mm를 `96 / 25.4`배 하여 전달한다. 25.4×50.8mm가 914,400×1,828,800EMU가 되는 것을 검사했다.
- docx의 `createPageSize`가 LANDSCAPE일 때 폭·높이를 자체 교환하므로 렌더러는 A4 세로 치수를 그대로 넘긴다. `convertMillimetersToTwip`은 반올림이 아닌 내림이며, 표의 퍼센트 폭은 `5000` 대신 `100%`로 직렬화한다. 신규 XML 테스트의 초기 예상치를 해당 설치 구현에 맞춰 보정했다.
- ZIP 내부 검사는 이미 설치된 docx의 전이 의존성 `jszip`을 테스트에서만 사용했다. 신규 패키지 설치나 package.json 변경은 없다.
- “기존 테스트 수정 금지” 일반 규칙보다 A 항목의 구체적인 테스트 추가 지시를 적용했다. 기존 테스트 입력 두 곳에 새 필수 필드를 null로 추가했으며 기존 검증 내용은 그대로 유지했다.
- 원격 문서 커밋으로 인해 푸시 완료 조건은 보류 상태다. 금지된 이력 통합을 임의로 실행하지 않고 사용자에게 승인 요청한다.

## RISKS

- Word/LibreOffice에서 실제 페이지를 열어 시각 검증하지 않았다. 긴 표의 실제 페이지 분할, 최대 본문 높이 이미지의 문단 배치 및 설치 글꼴 대체는 추가 확인이 필요하다.
- 브라우저 실제 실행과 다운로드·화면 캡처는 Task 3~4 범위로, 이번에는 검증하지 않았다. 렌더러에 Buffer나 Node 전용 API를 사용하지 않았지만 브라우저 실행을 했다고 주장하지 않는다.
- 픽셀 치수를 구할 수 없는 제품 이미지는 요청대로 120×80mm로 처리되므로 그 경우 원본 종횡비는 보장되지 않는다.
- DB·API 실연동, dev 서버 기동, 앱 전체 production build는 수행하지 않았다. 지정 게이트와 로컬 직렬화 검증만 실행했다.
- Stryker 임시 디렉터리 삭제 메시지는 남았으나 점수와 종료 코드는 정상이다.
- Task 1·2는 원격에 아직 반영되지 않았다. 원격 이력 통합 승인과 정상 푸시가 남았다.

## QUESTIONS

**Task 1에서 말한 “기존 main 작업”은 무엇인가.** 커밋되지 않은 변경을 뜻하지 않는다. Task 1 시작 시 main 작업 트리는 깨끗했고, main에는 `6fc81bb` (`feat: WS-6·7·9 주 저장 버튼 추가`) 커밋이 있었다. 변경 파일은 `KanoAggregationTable.tsx`, `KanoManager.tsx`, `QFDMatrix.tsx` 세 개다. 이 커밋을 가진 main 참조를 그대로 보존하고 결과보고서 브랜치로 이동했다는 뜻이다. 이번에도 main은 `6fc81bb`에 있으며 그 변경을 결과보고서 브랜치에 섞지 않았다.

**남은 승인 요청.** 원격의 문서 추가 커밋 `5a962a4` 위로 로컬 Task 1·2 커밋을 rebase하여 정상 푸시할 수 있는지 확인이 필요하다. 강제 푸시 없이 원격 문서와 로컬 구현을 모두 보존하는 방식이다. 승인 전에는 실행하지 않는다.
