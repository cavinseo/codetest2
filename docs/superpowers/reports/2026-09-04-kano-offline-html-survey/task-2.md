# Task 2 결과 보고서

## RESULT

계획서(`docs/superpowers/plans/2026-09-04-kano-offline-html-survey.md`) Task 2의 Step 1~3을 완료했다. `lib/upload-guard.ts`에 규칙 기반 `UploadFileRule`, `checkUploadedFile`, `guardUploadedFile`을 추가하고, 기존 `checkUploadedExcel`과 `guardUploadedExcel`은 시그니처와 기본값을 유지한 래퍼로 남겼다. 크기 표시는 MiB 배수면 MB, 그 외에는 내림한 KB로 만든다.

기존 엑셀 테스트의 줄을 삭제하거나 바꾸지 않고 새 import와 `checkUploadedFile` 테스트 7개만 추가했다. RED에서 새 함수 7개 케이스가 모두 함수 부재로 실패하고 기존 8개는 통과하는 것을 확인한 뒤, GREEN에서 15개가 전부 통과했다. 전체 테스트 99파일 1,144개와 타입 검사, lint, 인코딩 검사를 통과했다. 기존 엑셀 오류 문구 네 개도 런타임 출력으로 글자 단위 일치를 확인했다.

## FILES CHANGED

- `lib/upload-guard.ts` — 파일 종류별 확장자·크기·라벨을 받는 일반 검사와 guard를 추가하고 엑셀 검사를 래퍼로 바꿨다.
- `tests/upload-guard.test.ts` — 기존 줄을 유지한 채 HTML·HTM·JSON 허용, 확장자 거부, 400KB 경계, 라벨, guard 결과를 검증하는 7개 테스트를 추가했다.
- `docs/superpowers/plans/2026-09-04-kano-offline-html-survey.md` — Task 2 Step 1~3을 완료로 표시했다.
- `docs/superpowers/reports/2026-09-04-kano-offline-html-survey/task-2.md` — 이 결과 보고서를 추가했다.

## COMMIT

- 작업 커밋: `e5682e3d611493c1d9580577aaa2596bf1900cd8` (`feat: 파일 업로드 검사를 일반화한다`).
- 보고서 커밋: 이 파일과 계획서 체크박스를 포함한다. 자기 자신의 해시는 본문에 넣을 수 없어 커밋 후 `git log`로 확인한다.
- 기준 커밋: `661d64a`. 브랜치: `claude/admin-account-password-recovery-o93xgy`. push와 배포는 하지 않았다.

## VERIFIED BY

### RED

`npx vitest run tests/upload-guard.test.ts`.

```text
TypeError: checkUploadedFile is not a function
TypeError: guardUploadedFile is not a function
 Test Files  1 failed (1)
      Tests  7 failed | 8 passed (15)
   Duration  475ms (transform 24ms, setup 0ms, import 37ms, tests 19ms, environment 0ms)
```

### GREEN

`npx vitest run tests/upload-guard.test.ts`.

```text
 Test Files  1 passed (1)
      Tests  15 passed (15)
   Duration  314ms (transform 24ms, setup 0ms, import 36ms, tests 16ms, environment 0ms)
```

### 타입 검사

`npx tsc --noEmit`.

```text
(출력 없음, exit 0)
```

### 전체 테스트

`npx vitest run`.

```text
 Test Files  99 passed (99)
      Tests  1144 passed (1144)
   Duration  3.85s (transform 6.61s, setup 0ms, import 18.71s, tests 5.08s, environment 11ms)
```

### lint

`npx next lint`.

```text
✔ No ESLint warnings or errors
```

### 인코딩

`npm run check:encoding`.

```text
> kano-qfd-webapp@0.1.0 check:encoding
> node scripts/check-text-encoding.mjs

한글 인코딩 검사 통과.
```

### 기존 테스트와 계획서 대조

```text
RemovedTestLines      : 0
TestFileCount         : 99
NewCheckUploadedFileCases : 7
PlanBlockFound        : True
PlanBlockPresentExactly : True
```

`node --experimental-strip-types --input-type=module`로 기존 네 오류와 새 크기 문구를 출력했다.

```text
"excelMissing": "업로드할 엑셀 파일이 필요합니다."
"excelEmpty": "빈 파일입니다. 내용이 있는 엑셀 파일을 올려 주세요."
"excelLarge": "파일 크기는 10MB를 초과할 수 없습니다."
"excelExtension": ".xlsx 또는 .xls 파일만 업로드할 수 있습니다."
"answerLarge": "파일 크기는 400KB를 초과할 수 없습니다."
```

## DEVIATIONS

없음.

## RISKS

Task 2는 브라우저의 `File` 객체를 사용하는 순수 검사와 단위 테스트까지만 검증했다. 실제 오프라인 답변 업로드 라우트에서의 연결은 Task 5에서 확인한다. 지침에 따라 원격 DB와 dev 서버는 실행하지 않았다.

## QUESTIONS

없음.
