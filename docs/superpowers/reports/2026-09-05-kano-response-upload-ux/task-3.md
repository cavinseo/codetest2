# Task 3 결과 보고서

## RESULT

PASS. 저장된 오프라인 Kano HTML의 계약 JSON만 읽는 순수 파서와 2MB 단일 파일 업로드 가드를 구현했다. 업로드된 스크립트는 실행하지 않으며, 프로젝트·버전·답변 범위를 검증한 값만 `ParsedKanoUploadAnswer`로 반환한다.

## FILES CHANGED

- `lib/kano-offline-response.ts`를 신설해 ID 기반 JSON 블록 추출, 계약 검증, 답변 필터링과 이메일 fallback을 구현했다.
- `tests/kano-offline-response.test.ts`를 신설해 오류 문구, 검증 순서, 속성 경계, 생성기 왕복과 `</script>` projectId를 검증했다.
- `lib/upload-guard.ts`에 `MAX_OFFLINE_HTML_BYTES`, `MAX_OFFLINE_HTML_FILES`, `guardUploadedOfflineHtml`을 추가했다.
- `tests/upload-guard.test.ts`의 기존 8개 `it`를 보존하고 HTML 가드 테스트 7개를 뒤에 추가했다.
- `stryker.crap.config.json`에서 기존 순서를 유지하며 `lib/kano-offline-response.ts`를 mutate 대상에 추가했다.
- `docs/superpowers/plans/2026-09-05-kano-response-upload-ux.md`의 Task 3 Step 1~4를 완료 처리했다.

## COMMIT

- 작업 커밋은 `1802840 feat: 오프라인 Kano 응답을 안전하게 파싱한다`이다.
- 보고서 커밋은 이 문서를 추가하는 두 번째 커밋이며, 최종 해시는 커밋 완료 후 채팅에 함께 보고한다. Git 커밋은 자신의 최종 해시를 본문에 선기록할 수 없다.

## VERIFIED BY

### 기준 동기화

- 구현 전에 `git pull`로 감리 커밋 `8d0d578`까지 fast-forward했다.

```text
From https://github.com/cavinseo/codetest2
   8c81a37..8d0d578  claude/ws-6-response-upload-ui-gcng04 -> origin/claude/ws-6-response-upload-ui-gcng04
Updating 8c81a37..8d0d578
Fast-forward
```

### RED → GREEN

- 파서 구현 전 `npx vitest run tests/kano-offline-response.test.ts`가 모듈 부재로 RED를 보였다.

```text
FAIL  tests/kano-offline-response.test.ts
Error: Cannot find module '../lib/kano-offline-response'
Test Files  1 failed (1)
Tests  no tests
```

- 최종 파서와 가드 관련 테스트를 실행했다.

```text
npx vitest run tests/kano-offline-response.test.ts tests/upload-guard.test.ts
Test Files  2 passed (2)
Tests  39 passed (39)
```

### 게이트

- `npx tsc --noEmit`은 출력 없이 exit code 0으로 통과했다.

```text
(stdout/stderr 출력 없음, exit code 0)
```

- `npx vitest run`의 마지막 결과는 다음과 같다.

```text
Test Files  102 passed (102)
Tests  1185 passed (1185)
Duration  4.29s (transform 6.71s, setup 0ms, import 22.32s, tests 5.12s, environment 11ms)
```

- `npx next lint`의 마지막 출력 줄은 다음과 같다.

```text
✔ No ESLint warnings or errors
```

- `git diff --check`는 내용 출력 없이 exit code 0으로 통과했다.

### 뮤테이션

- `npx stryker run stryker.crap.config.json --mutate lib/kano-offline-response.ts`를 샌드박스 밖에서 최종 실행했고 exit code 0으로 끝났다. 총 134개 뮤턴트가 모두 사멸했다.

```text
All files                  | 100.00 |  100.00 |      134 |         0 |          0 |        0 |        0 |
kano-offline-response.ts | 100.00 |  100.00 |      134 |         0 |          0 |        0 |        0 |
20:14:04 (17608) INFO MutationTestExecutor Done in 11 seconds.
```

- Stryker disable 주석은 추가하지 않았다. 제외 전·후 총 뮤턴트 수 감소는 0개다.

### 회귀 역검증

- 파서의 `if (payload.projectId !== options.projectId)` 검사 한 줄만 임시로 `if (false)`로 바꾸고 전용 테스트를 실행했다.

```text
npx vitest run tests/kano-offline-response.test.ts -t "프로젝트 불일치를 답변 검증보다 먼저 거부한다"
AssertionError: expected { ok: false, error: '응답이 하나도 없습니다.' } to deeply equal { Object (ok, error) }
-   "error": "다른 프로젝트의 응답지입니다.",
+   "error": "응답이 하나도 없습니다.",
Test Files  1 failed (1)
Tests  1 failed | 22 skipped (23)
```

- 검사 한 줄을 원복한 뒤 같은 테스트가 통과했다.

```text
Test Files  1 passed (1)
Tests  1 passed | 22 skipped (23)
```

- 원복된 최종 작업 diff 통계는 다음과 같다.

```text
docs/superpowers/plans/2026-09-05-kano-response-upload-ux.md |   8 +-
lib/kano-offline-response.ts                                |  93 ++++++++
lib/upload-guard.ts                                         |  40 ++++
stryker.crap.config.json                                    |   1 +
tests/kano-offline-response.test.ts                         | 243 +++++++++++++++++++++
tests/upload-guard.test.ts                                  |  71 ++++++
6 files changed, 452 insertions(+), 4 deletions(-)
```

### 왕복과 기존 테스트 보존

- `tests/kano-offline-response.test.ts`는 `buildKanoOfflineFormHtml`의 실제 결과에서 JSON 블록을 치환한 뒤 정확한 업로드 응답 배열을 단언한다.
- projectId에 `</script><script>alert(1)</script>`가 포함된 생성기 HTML도 안전 직렬화된 원문 ID로 왕복한다.
- 기준 커밋 대비 `tests/upload-guard.test.ts`의 기존 8개 `it` 본문은 변경되지 않았다. import 추가와 파일 끝 신규 `describe`만 존재한다.

### 독립 검토

- Blind Hunter, Edge Case Hunter, Acceptance Auditor가 기준 커밋 이후 변경을 독립 검토했다.
- 다른 속성값 안의 가짜 ID를 실제 ID 속성으로 오인할 수 있다는 발견을 수정하고, decoy와 대문자 ID 값을 거부하는 회귀 테스트를 추가했다.
- 빈 파일·대형 파일과 잘못된 확장자가 겹쳐도 승인된 판정 순서가 유지되도록 복합 실패 테스트를 추가했다.
- 검토 보강으로 정규식 뮤턴트가 116개에서 134개로 늘었고, 정상 속성 경계 테스트를 보강해 134개 전부 사멸시켰다.

## DEVIATIONS

- 위임 문구는 파서의 “오류 문구 6종”이라고 표현하지만 계획서와 상세 목록이 정의한 파서 오류는 형식·JSON 손상·버전·프로젝트·빈 응답의 5종이며, HTML 가드 오류는 별도 4종이다. 충돌 시 기존 계획서 계약을 따른다는 지시에 따라 상세 목록의 총 9개 문구를 정확히 구현했고 임의의 여섯 번째 파서 오류를 만들지 않았다.
- 최초 Stryker 위임 실행은 116/116, 100%를 계산했지만 샌드박스의 `taskkill` 권한 오류로 exit code 1이었다. 직접 샌드박스 밖에서 재실행했고 최종 보강 상태의 134/134, 100%와 exit code 0을 확인했다.
- 계획서 기준은 101개 파일·1,154개 테스트였지만 최종 실제 실행은 102개 파일·1,185개 테스트였다. 기존 테스트를 삭제·skip하지 않고 실제 값을 기록했다.

## RISKS

- `MAX_OFFLINE_HTML_FILES = 100`은 이번 Task에서 계약 상수만 제공한다. 실제 여러 파일 개수 제한은 Task 5 업로드 라우트가 적용해야 한다.
- 가드는 파일의 크기와 확장자만 확인한다. `.html` 내용의 계약 검증은 파일을 읽은 뒤 파서가 담당하며, 이 연결은 Task 5에서 이루어진다.
- `File instanceof File`은 현재 Node 24와 같은 realm에서 통과했다. 다른 realm 또는 구형 Node의 File polyfill은 별도 검증하지 않았다.
- Vite는 CommonJS로 읽히는 `vitest.config.ts`의 ESM 문법에 대한 향후 호환 경고를 냈다. 현재 테스트에는 영향이 없다.
- Browserslist의 `caniuse-lite` 데이터가 8개월 오래됐다는 경고가 있었다. 신규 의존성 금지와 좁은 변경 원칙에 따라 갱신하지 않았다.
- Stryker는 정상 종료 뒤 `.stryker-tmp` 샌드박스 디렉터리 삭제 실패를 경고했다. 해당 경로는 Git 무시 대상이고 점수에는 영향이 없다.
- 원격 실DB, DB 쓰기, dev 서버, API 라우트와 실제 브라우저는 금지 계약에 따라 실행하지 않았다.

## QUESTIONS

- 없다.
