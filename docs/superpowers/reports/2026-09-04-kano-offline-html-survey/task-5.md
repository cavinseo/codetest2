# Task 5 결과 보고서

## RESULT

계획서(`docs/superpowers/plans/2026-09-04-kano-offline-html-survey.md`) Task 5의 Step 1~3을 완료했다. 오프라인 HTML 또는 JSON 답변 파일을 최대 10개까지 받아 파일별 가드·파싱·질문 세트 대조·배치 중복·기존 외부 응답자 충돌을 순서대로 판정하고, 통과한 응답만 하나의 트랜잭션으로 등록하는 라우트를 추가했다.

질문 세트가 달라졌을 때 명시적 수락 전에는 409로 전체 쓰기를 막고, 수락한 경우 문항 해시가 일치하거나 문구 해시로 유일하게 재매칭된 답만 저장한다. 기존 초대 이메일은 프로젝트의 초대를 모두 읽은 뒤 자바스크립트에서 소문자로 비교해 DB 대소문자 우회를 막으며, 외부 경로의 기존 응답은 파일 인덱스별 덮어쓰기 승인이 있어야 저장한다. 응답과 정보 로그에는 이메일·submissionId·파일 내용이 들어가지 않는다.

## FILES CHANGED

- `app/api/projects/[id]/kano/offline-responses/route.ts` — 오프라인 답변 파일 검증, 질문 세트 대조, 충돌 판정과 원자 수입 라우트를 추가했다.
- `tests/api-kano-offline-responses.test.ts` — 정상·부분 실패·409·재매칭·배치 중복·기존 응답자·HTML 왕복·오류 은닉을 포함한 21개 계약 테스트를 추가했다.
- `docs/superpowers/plans/2026-09-04-kano-offline-html-survey.md` — Task 5 Step 1~3을 완료로 표시했다.
- `docs/superpowers/reports/2026-09-04-kano-offline-html-survey/task-5.md` — 이 결과 보고서를 추가했다.

## COMMIT

- Task 5 본체 커밋은 `eafc56d4f94741fae9eef0ab415bb1dc1f685b4d`(`feat: 오프라인 Kano 답변 수입 라우트를 추가한다`)다.
- 보고서 커밋은 이 파일과 계획서 체크박스를 포함한다. 자기 자신의 해시는 본문에 넣을 수 없어 커밋 후 `git log`로 확인한다.
- 기준 커밋은 `99291ee`이고 브랜치는 `claude/admin-account-password-recovery-o93xgy`다. push와 배포는 하지 않았다.

## VERIFIED BY

### RED

`npx vitest run tests/api-kano-offline-responses.test.ts`.

```text
 Test Files  1 failed (1)
      Tests  no tests
   Duration  542ms (transform 71ms, setup 0ms, import 0ms, tests 0ms, environment 0ms)
```

신규 라우트 모듈이 없어 import 단계에서 실패했다.

### GREEN

`npx vitest run tests/api-kano-offline-responses.test.ts`.

```text
 Test Files  1 passed (1)
      Tests  21 passed (21)
   Duration  486ms (transform 93ms, setup 0ms, import 163ms, tests 38ms, environment 0ms)
```

400·403·409 경로의 트랜잭션 미호출, 트랜잭션 밖 쓰기 없음, 대소문자가 다른 기존 초대 충돌, 실제 HTML 응답 섬과 빈 응답 섬을 포함한다.

### 타입 검사

`npx tsc --noEmit`.

```text
(출력 없음, exit 0)
```

### 전체 테스트

`npx vitest run`.

```text
 Test Files  103 passed (103)
      Tests  1297 passed (1297)
   Duration  3.98s (transform 7.68s, setup 0ms, import 20.75s, tests 5.11s, environment 11ms)
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

## DEVIATIONS

새 소스 파일 첫 줄에 역할을 설명하는 한국어 주석을 두라는 저장소 지침에 따라 계획서 코드 블록 위에 한 줄 주석을 추가했다.

계획서의 `importKanoResponses(tx, ...)` 직접 호출은 Prisma 트랜잭션 클라이언트의 제네릭 `createMany` 시그니처와 공용 수입 함수의 최소 인터페이스가 구조적으로 할당되지 않아 `npx tsc --noEmit`에서 실패했다. 변경 금지된 공용 모듈 대신 라우트 호출 지점에서 `tx as unknown as Parameters<typeof importKanoResponses>[0]`로 명시 변환했다. 실제 전달 객체나 실행 흐름은 바뀌지 않는다.

지시에 따라 Stryker는 실행하지 않았다.

## RISKS

원격 실DB와 dev 서버를 사용하지 않았으므로 실제 Prisma 트랜잭션·초대 upsert·대소문자 데이터가 결합된 동작은 검증하지 않았다.

실제 Next.js 런타임에서 multipart 요청을 수신하고 저장하는 실기동 검증은 수행하지 않았다.

배포와 Vercel 환경을 사용하지 않았으므로 약 4.5MB 본문 상한, `maxDuration = 60`, Prisma 트랜잭션 timeout이 서버리스 환경에서 의도대로 작동하는지는 검증하지 않았다.

## QUESTIONS

없음.
