# Task 5 결과 보고서

## RESULT

PASS. 프로젝트별 자체 완결형 Kano 오프라인 HTML 설문지를 내려받는 GET 라우트와, 여러 실브라우저 저장본을 순차 검증해 성공분만 한 번에 저장하는 POST 라우트를 구현했다. 묶음 내 같은 응답자는 앞 파일만 유지하며, 결과·응답과 라우트가 추가하는 로그 인수에는 이메일을 넣지 않는다.

## FILES CHANGED

- `app/api/projects/[id]/kano/offline-form/route.ts`를 신설해 권한·프로젝트·요구사항 확인 후 UTF-8 HTML 첨부 응답을 반환한다.
- `app/api/projects/[id]/kano/upload-offline/route.ts`를 신설해 100장 한도, 파일별 가드·파서, 중복 응답자 차단과 성공분 단일 저장을 구현한다.
- `tests/api-kano-offline-form.test.ts`를 신설해 성공 헤더·DOCTYPE·projectId, 404, 400과 권한 거부를 검증한다.
- `tests/api-kano-upload-offline.test.ts`를 신설해 실브라우저 픽스처, 부분 성공, 중복, 전부 실패, 파일 수 경계, 확장자, 파일명, 권한과 로그 비노출을 검증한다.
- `docs/superpowers/plans/2026-09-05-kano-response-upload-ux.md`의 Task 5 Step 1~3을 완료 처리했다.

## COMMIT

- 작업 커밋은 `43db76e feat: Kano 오프라인 설문 배포와 업로드를 지원한다`이다.
- 보고서 커밋은 이 문서만 추가하는 두 번째 커밋 `docs: Task 5 결과 보고서`이며, 최종 해시는 커밋 완료 후 채팅에 함께 보고한다. Git 커밋은 자신의 최종 해시를 본문에 선기록할 수 없다.

## VERIFIED BY

### 기준 동기화

- 작업 전에 `git pull`로 감리 커밋 `8692557`까지 fast-forward했다.

```text
From https://github.com/cavinseo/codetest2
   bac204b..8692557  claude/ws-6-response-upload-ui-gcng04 -> origin/claude/ws-6-response-upload-ui-gcng04
Updating bac204b..8692557
Fast-forward
```

### RED → GREEN

- 신규 라우트 구현 전에 두 테스트 파일을 실행해 라우트 부재 RED를 확인했다.

```text
Cannot find module '../app/api/projects/[id]/kano/offline-form/route'
Cannot find module '../app/api/projects/[id]/kano/upload-offline/route'
Test Files  2 failed (2)
Tests  no tests
```

- 최종 신규 라우트 테스트 실행 결과다.

```text
npx vitest run tests/api-kano-offline-form.test.ts tests/api-kano-upload-offline.test.ts
Test Files  2 passed (2)
Tests  15 passed (15)
Duration  606ms (transform 143ms, setup 0ms, import 300ms, tests 54ms, environment 0ms)
```

- GET 4건과 지정된 POST (a)~(h) 8건을 모두 포함한다. 감사 보강으로 저장 실패 로그 인수 비노출, 정확히 100장 허용, 빈 파일명 대체와 100자 절단의 3건을 추가했다.
- POST (a)·(b)·(c)는 `persistKanoUploadAnswers`가 정확히 한 번 호출됨을 각각 단언한다. (a)는 README 표와 일치하는 답변 3개와 응답자 2명을 단언하고, `JSON.stringify(body)`에 `@`가 없음을 확인한다.

### 회귀 역검증

- POST 라우트의 중복 이메일 검사 블록만 임시 제거하고 (c)를 실행하자 재저장본의 답변까지 포함된 4개가 저장 함수로 전달되어 실패했다.

```text
AssertionError: expected "vi.fn()" to be called with arguments: [ ObjectContaining{…} ]
+       {
+         "negativeAnswer": 5,
+         "positiveAnswer": 2,
+         "requirementIndex": 1,
+         "respondentEmail": "tester@example.com",
+       },
Test Files  1 failed (1)
Tests  1 failed | 7 skipped (8)
```

- 검사 블록을 원복한 최종 커밋에서 같은 테스트가 통과했다.

```text
Test Files  1 passed (1)
Tests  1 passed | 10 skipped (11)
Duration  311ms (transform 82ms, setup 0ms, import 154ms, tests 12ms, environment 0ms)
```

- 원복 후 작업 커밋의 diff 통계다. 임시 역변경은 남아 있지 않다.

```text
app/api/projects/[id]/kano/offline-form/route.ts   |  61 ++++
app/api/projects/[id]/kano/upload-offline/route.ts | 144 +++++++++
docs/superpowers/plans/2026-09-05-kano-response-upload-ux.md | 6 +-
tests/api-kano-offline-form.test.ts                | 107 +++++++
tests/api-kano-upload-offline.test.ts              | 341 +++++++++++++++++++++
5 files changed, 656 insertions(+), 3 deletions(-)
```

### 신설 실행물

- 실제 `buildKanoOfflineFormHtml`을 호출해 검증용 파일을 생성했다.

```text
C:\Users\user\AppData\Local\Temp\codetest2-task5\offline-form-sample.html
Length  8318
<!DOCTYPE html>
```

### 게이트

- `npx tsc --noEmit`은 출력 없이 exit code 0으로 통과했다.

```text
(stdout/stderr 출력 없음, exit code 0)
```

- `npx vitest run`의 마지막 결과는 다음과 같다.

```text
Test Files  105 passed (105)
Tests  1206 passed (1206)
Duration  4.21s (transform 6.70s, setup 0ms, import 22.21s, tests 5.29s, environment 13ms)
```

- `npx next lint`의 마지막 출력 줄은 다음과 같다.

```text
✔ No ESLint warnings or errors
```

- `git diff --check`는 내용 출력 없이 exit code 0으로 통과했다.

### 독립 검토

- Blind Hunter는 문항 변경 충돌, replace 부분 성공, 전체 용량 등 후속 정책 위험을 제시했으나 확정 계약 변경이 필요한 항목이라 이번 구현에는 반영하지 않았다.
- Edge Case Hunter가 제시한 경계 중 정확히 100장 허용과 파일명 대체·절단은 테스트 공백으로 확인해 보강했다.
- Acceptance Auditor는 GET·POST 계약, 순차 처리, 앞 파일 유지, 저장 1회, 이메일 비노출, 변경 범위와 역검증·게이트를 대조해 최종 PASS로 판정했다.

## DEVIATIONS

- 기능 계약의 변경은 없다. 사용자 지정 12개 테스트 외에 독립 감사에서 확인한 회귀 공백 3개를 테스트로 추가했다.
- GET의 catch 로그와 500 문구도 “명시된 차이 외에는 동일” 계약에 따라 기존 `survey-document` 본을 그대로 유지했다.
- 확정 계약은 POST catch에서 원본 `error`를 `log.error` 두 번째 인자로 넘기도록 요구한다. 이 호출 형태를 그대로 따랐고, 라우트가 파일명·응답자 이메일을 별도 인수나 meta에 추가하지 않는지를 테스트했다.

## RISKS

- 기존 `lib/logger.ts`는 전달받은 `Error.message`를 직렬화한다. 하위 저장 계층이 이메일을 포함한 오류 메시지를 만들면 로그에 노출될 가능성이 있으나, raw `Error` 전달은 이번 확정 계약이므로 변경하지 않았다.
- 배포 후 요구사항 순서·문구가 바뀐 오래된 오프라인 설문의 충돌 처리는 후속 Task 7 범위다.
- `replace` 묶음에 실패 파일이 있어도 계약대로 성공 파일만으로 교체한다. 관리자는 응답의 파일별 결과를 확인해야 한다.
- Vitest는 `vitest.config.ts`의 향후 native config loader 호환 경고를 냈고, `next lint`는 Next.js 16에서 제거 예정이라는 경고를 냈다. 현재 게이트에는 영향이 없다.
- 원격 실DB, DB 쓰기, 개발 서버와 실제 네트워크 라우트는 실행하지 않았다. 실브라우저 저장본은 Chromium 141에서 생성된 고정 픽스처를 사용했다.

## QUESTIONS

- 없다.
