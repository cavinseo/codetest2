# Task A — 뮤테이션 점수 100% 복구 (stryker.crap.config.json mutate 목록)

## RESULT

**부분 완료 — 감리 판정 전 게이트 실행 필요.** 코드·테스트 변경은 끝났지만, 이 세션의
네트워크 정책이 npm 레지스트리(registry.npmjs.org)와 사내 미러(artifactory.infra.ant.dev)를
모두 막아 `npm ci` 가 실패했다. 그래서 **tsc·vitest·next lint·stryker 를 한 번도 실행하지
못했다.** 아래 VERIFIED BY 는 대체 검증이며, 게이트 출력이 아니다.

생존 뮤턴트 51개(run 40072394201 의 clear-text 로그에서 전부 복원)를 다음처럼 처리했다.

| 파일 | 생존 | 처리 |
|---|---:|---|
| `lib/final-report-document.ts` | 23 | 18개는 테스트, 5개(128행 1 + 126행 4)는 반복문 재구성 후 새 뮤턴트까지 테스트 |
| `lib/import-cascade-guard.ts` | 8 | 테스트 |
| `lib/final-report-edit.ts` | 10 | 1개(51행 `<0`)는 테스트, 9개는 군더더기 조건 제거 후 새 뮤턴트까지 테스트 |
| `lib/kano-offline-form.ts` | 5 | 테스트(미리보기 양식) |
| `lib/final-report-inputs.ts` | 2 | 테스트 |
| `lib/technical-benchmark-guards.ts` | 1 | 등가 → `typeof` 검사 제거 |
| `lib/invite-code.ts` | 1 | 등가 → 중복 `trim()` 제거 |
| `lib/member-roles.ts` | 1 | 테스트(목록에 없는 역할 거절) — RISKS 참고 |

`// Stryker disable` 주석은 하나도 더하지 않았다. 분모 축소가 없다.

## FILES CHANGED

- `lib/final-report-document.ts` — WS-4 절 순회를 `for` + `break` 로 바꿔 누락 안내 판정을 절 끝 판정보다 앞에 둠
- `lib/final-report-edit.ts` — 표 종류 검사를 한곳으로 모음, 머리글 묶음 반복의 길이 검사 제거, `countEditedBlocks` 를 `Array.from` + `filter` 로
- `lib/technical-benchmark-guards.ts` — `MISSING_TABLE_CODES: readonly unknown[]`, `typeof code` 검사 제거
- `lib/invite-code.ts` — `normalizeInviteCode` 의 `trim()` 제거
- `tests/worksheet-image-replacement.test.ts` — "그림 자리 찾기 경계" 15건
- `tests/final-report-edit.test.ts` — 첫 열 머리글, 머리글 묶음 끝 칸, 묶음 자리 없음 4건
- `tests/import-cascade-guard.test.ts` — 모든 집계의 projectId 조건, 복구 불가 안내 부착 조건
- `tests/kano-offline-form.test.ts` — 미리보기/편집용 양식의 빈 자리
- `tests/final-report-inputs.test.ts` — `technicalBenchmarks`·`qfdTechnicals` 출처 키
- `tests/member-roles.test.ts` — 목록에 없는 역할

## COMMIT

`c7b87f6` test: 뮤테이션 점수 100% 미달 8개 파일의 생존 뮤턴트를 없앤다

## VERIFIED BY

**실행하지 못한 게이트 (감리자가 실행해야 함):**

```sh
npx tsc --noEmit && npx vitest run && npx next lint
npx stryker run stryker.crap.config.json --mutate lib/final-report-document.ts,lib/kano-offline-form.ts,lib/import-cascade-guard.ts,lib/final-report-edit.ts,lib/technical-benchmark-guards.ts,lib/final-report-inputs.ts,lib/invite-code.ts,lib/member-roles.ts
```

`npm ci` 마지막 줄: `npm error Exit handler never called!` (로그: `getaddrinfo ENOTFOUND registry.npmjs.org`,
미러는 `403` / `connect_rejected`). 점수는 **미측정**이다.

**대체 검증 (게이트 대용이 아님):**

1. 타입: 전역 TypeScript 6.0.2 로 바꾼 lib 8개를 strict 검사. 의존성 부재로 나는 오류 26건이
   변경 전후 같다(새 오류 0).
2. 테스트: Node 22 + 전역 TypeScript 트랜스파일 + 최소 vitest 대역(describe/it/expect/vi.fn)으로
   직접 관련된 8개 파일 실행 — 전부 통과.
   `worksheet-image-replacement 19/19, final-report-edit 30/30, import-cascade-guard 15/15,
   final-report-inputs 36/36, member-roles 83/83, technical-benchmark-guards 9/9,
   invite-code 26/26, kano-offline-form 24/24`.
   변경 모듈을 import 하는 나머지 25개 파일 중 22개는 docx 등 패키지 부재로 실행 불가,
   3개(final-report-document·kano-offline-response·member-create-payload)는 대역 한계로 일부
   실패하나 **변경 전과 실패 목록이 같다**.
3. 뮤턴트 수동 재생: 원래 생존 51개 중 코드가 남아 있는 것 전부와, 재구성한 줄에서 stryker 가
   만들 뮤턴트(ConditionalExpression·EqualityOperator·LogicalOperator·StringLiteral·
   ObjectLiteral·UpdateOperator·MethodExpression·BlockStatement·ArrowFunction)를 손으로 넣어
   87개 재생 → **87개 모두 테스트 실패(killed)**. 재생 목록은 stryker 의 실제 생성 목록과
   같다는 보장이 없으므로 stryker 실행으로 확인해야 한다.

## DEVIATIONS

- 게이트 3종과 stryker 를 실행하지 못했다(위 사유). 완료 기준 미충족.
- 계획서 없이 진행했다 — 기능이 아니라 기존 모듈의 테스트 보강이라 위임 프롬프트가 곧 정본이다.
- 등가 뮤턴트 9개는 disable 대신 소스를 바꿨다. 각 변경은 런타임 동작이 같다(이유는 커밋 본문과
  각 위치의 주석).

## RISKS

- `member-roles.ts:89` (`→ true`)는 오늘의 네 역할로는 등가다. `lib/auth.ts` 가
  `parseMemberRole` 로 역할을 좁히므로 실제 입력으로는 목록 밖 역할이 오지 않는다. 테스트는
  `'AUDITOR' as MemberRole` 로 "역할이 늘어도 생성 권한이 자동으로 붙지 않는다"는 닫힌 기본값을
  고정한다. 감리 기준상 "테스트를 비틀어 맞춘" 것으로 본다면 대안은
  `// Stryker disable next-line ConditionalExpression: <이유>` 인데, 그러면 같은 줄의
  ConditionalExpression 5개(이미 죽던 4개 포함)가 분모에서 빠진다.
- `final-report-document.ts` 의 반복문 재구성은 순서만 바꿨다. 절 안에서 누락 안내 문단보다
  앞에 제목/쪽 나눔이 오면 예전처럼 거기서 멈춘다. 같은 글의 **제목**이 오는 경우만 판정 순서가
  달라지지만, 제목은 문단이 아니므로 결과는 같다(테스트로 고정).
- 대역 러너의 `toEqual` 은 vitest 와 세부 동작이 다를 수 있다.

## QUESTIONS

- 이 환경에서 Allowed domains 에 `registry.npmjs.org` 를 더해 주면 게이트와 stryker 를 직접 돌려
  이 보고서를 갱신하겠다. 아니면 main 대상 PR 을 열어 CI(ci.yml + crap.yml 의 변경 파일 부분
  실행)로 확인해도 된다 — PR 생성은 지시가 있을 때만 한다.
