# Task 3 결과 보고서

## RESULT

계획서(`docs/superpowers/plans/2026-09-04-kano-offline-html-survey.md`) Task 3의 Step 1~6을 완료했다. 먼저 직전 감리에서 확인된 업로드 가드 회귀 공백 4개를 기존 15개 테스트를 수정하지 않고 보강했다. 이어서 Word 설문의 파일명 정제 규칙을 공용 함수로 분리하고, 결정적 질문 해시·설문 모델·자급자족 HTML 렌더러·다운로드 라우트를 구현했다.

HTML은 외부 자원 없이 인라인 CSS와 JavaScript만 사용한다. 빈 응답 섬을 설문 데이터와 동작 스크립트보다 앞에 정확히 하나 두고, 저장할 때 선택 상태와 이메일을 HTML 속성으로 고정한 뒤 같은 파일 안에 응답 JSON을 기록한다. 라우트는 프로젝트 접근 권한을 확인하고 네 가지 보안·다운로드 헤더를 붙이며, 요구사항이 없으면 확정 문구로 400을 반환한다.

## FILES CHANGED

- `tests/upload-guard.test.ts` — 엑셀 오류 문구, 파일명 trim, 비 MiB 크기 문구, 끝 확장자 판정을 고정하는 회귀 테스트 4개를 추가했다.
- `lib/kano-survey-document.ts` — 기존 정규식·상한·긴 설명을 보존한 `sanitizeKanoFileNameStem`을 분리하고 Word 파일명이 이를 재사용하게 했다.
- `lib/kano-offline-survey.ts` — 해시 3종, 설문 모델, 파일명, JSON 이스케이프, 자급자족 HTML·CSS·JavaScript 렌더러를 추가했다.
- `app/api/projects/[id]/kano/offline-survey/route.ts` — 권한 확인, 요구사항 조회, HTML 첨부 응답, 400·404·500 처리를 구현했다.
- `tests/kano-offline-survey.test.ts` — 해시·모델·HTML 구조·자급자족·XSS·파일명 계약과 뮤테이션 경계를 검증한다.
- `tests/api-kano-offline-survey.test.ts` — 200 헤더와 본문, 정렬 조회, 요구사항 없음, 404, 403, 500 무누출을 검증한다.
- `stryker.crap.config.json` — `lib/kano-offline-survey.ts`를 뮤테이션 대상에 추가했다.
- `docs/superpowers/plans/2026-09-04-kano-offline-html-survey.md` — Task 3 Step 1~6을 완료로 표시했다.
- `docs/superpowers/reports/2026-09-04-kano-offline-html-survey/task-3.md` — 이 결과 보고서를 추가했다.

## COMMIT

- 회귀 테스트 커밋: `4b2acd94fbe5e7d0060b1189946ef5aef2990629`(`test: 업로드 가드의 회귀 넷을 보강한다`).
- Task 3 구현 커밋: `939fdfbf4dd629d1409cc50cb4634dec25f68009`(`feat: 오프라인 Kano HTML 설문을 생성한다`).
- 보고서 커밋: 이 파일과 계획서 체크박스를 포함한다. 자기 자신의 해시는 본문에 넣을 수 없어 커밋 후 `git log`로 확인한다.
- 기준 커밋은 `6f669d4`이고 브랜치는 `claude/admin-account-password-recovery-o93xgy`다. push와 배포는 하지 않았다.

## VERIFIED BY

### Task 2 회귀 보강

`npx vitest run tests/upload-guard.test.ts`.

```text
 Test Files  1 passed (1)
      Tests  19 passed (19)
   Duration  431ms
```

기존 15개 테스트의 삭제·수정 줄 수는 0개다. `npm run check:encoding`도 통과한 뒤 첫 번째 커밋을 만들었다.

### RED

`npx vitest run tests/kano-offline-survey.test.ts tests/api-kano-offline-survey.test.ts`.

```text
 Test Files  2 failed (2)
      Tests  no tests
   Duration  471ms (transform 62ms, setup 0ms, import 0ms, tests 0ms, environment 0ms)
```

두 스위트 모두 아직 없는 `lib/kano-offline-survey.ts`와 `app/api/projects/[id]/kano/offline-survey/route.ts`를 import하지 못해 실패했다.

### GREEN

`npx vitest run tests/kano-offline-survey.test.ts tests/api-kano-offline-survey.test.ts`.

```text
 Test Files  2 passed (2)
      Tests  25 passed (25)
   Duration  414ms (transform 122ms, setup 0ms, import 210ms, tests 28ms, environment 0ms)
```

### 기존 Word 설문 무회귀

`npx vitest run tests/kano-survey-document.test.ts tests/api-kano-survey-document.test.ts`.

```text
 Test Files  2 passed (2)
      Tests  22 passed (22)
   Duration  590ms (transform 90ms, setup 0ms, import 192ms, tests 52ms, environment 0ms)
```

기존 `tests/kano-survey-document.test.ts` 17개와 `tests/api-kano-survey-document.test.ts` 5개는 수정하지 않았다.

### 타입 검사

`npx tsc --noEmit`.

```text
(출력 없음, exit 0)
```

### 전체 테스트

`npx vitest run`.

```text
 Test Files  101 passed (101)
      Tests  1173 passed (1173)
   Duration  3.86s (transform 6.65s, setup 0ms, import 20.15s, tests 5.12s, environment 12ms)
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

### 뮤테이션 테스트

`npx stryker run stryker.crap.config.json --mutate lib/kano-offline-survey.ts`.

```text
All files               | 100.00 |  100.00 |       68 |         0 |          0 |        0 |        0 |
 kano-offline-survey.ts | 100.00 |  100.00 |       68 |         0 |          0 |        0 |        0 |
```

장식 CSS의 `StringLiteral` 한 건만 `// Stryker disable next-line StringLiteral: 장식 CSS 는 동작 계약이 아니다.`로 제외했다. 제외 전 계측은 총 69개였고 제외 후 68개이므로 분모는 정확히 1개 줄었다. 제외 전 생존 15개와 미실행 1개는 비교기·인코딩·마크업 경계 테스트를 보강해 CSS 이외의 disable 없이 모두 제거했다.

`npx stryker run stryker.crap.config.json --mutate lib/kano-survey-document.ts`.

```text
All files                | 100.00 |  100.00 |       54 |         0 |          0 |        0 |        0 |
 kano-survey-document.ts | 100.00 |  100.00 |       54 |         0 |          0 |        0 |        0 |
```

## DEVIATIONS

기능 계약과 계획서 코드 블록에서 벗어난 구현은 없다. 뮤테이션 100%를 위해 정렬 비교기의 세 반환값과 UTF-8 인자를 직접 고정하는 테스트만 추가했다.

`CSS`는 보라색 `#673ab7` 헤더, 5열 응답 격자, 긍정·부정 색점, 인쇄 시 제출 영역 숨김을 인라인으로 구현했다.
`SCRIPT`는 설문 섬을 즉시 읽되 응답 섬은 저장 클릭 때 읽고, 로드 때는 기존 답변 안내만 표시하게 했다.
저장 시 UUID를 만들거나 재사용하고 미답을 차단한 뒤 라디오·이메일 속성, 이스케이프한 응답 JSON, HTML 직렬화, 다운로드, 항상 보이는 폴백을 순서대로 처리한다.
상태 문구는 성공을 단정하지 않으며 복사는 Clipboard API 실패 시 `document.execCommand('copy')`로 폴백한다.

## RISKS

지침에 따라 브라우저 DOM 의 실제 저장·다운로드·다시 열기·재저장 동작은 실행하지 않았고 문자열·정규식 테스트만 수행했다. 이 통합 동작은 감리자가 Playwright로 검증한다.

원격 DB, dev 서버, 배포는 실행하지 않았다. Stryker 두 최종 실행은 exit 0이었지만 Windows에서 무시 대상 임시 sandbox 디렉터리 정리 경고를 출력했다.

## QUESTIONS

없음.
