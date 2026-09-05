# Task 1 결과 보고서

## RESULT

PASS. Google Forms 연동 라우트 세 개를 프로젝트 권한 확인 뒤 고정 503 응답으로 차단했고, 기존 활성 경로의 코드와 회귀 테스트를 보존했다.

## FILES CHANGED

- `lib/feature-flags.ts`를 신설해 승인된 기능 플래그와 비활성 안내문 두 export만 정의했다.
- `app/api/projects/[id]/kano/create-form/route.ts`에 권한 확인 뒤 503 가드를 추가했다.
- `app/api/projects/[id]/kano/form-responses/route.ts`에 권한 확인 뒤 503 가드를 추가했다.
- `app/api/projects/[id]/kano/form-script/route.ts`에 권한 확인 뒤 503 가드를 추가했다.
- `tests/feature-flags.test.ts`를 신설해 `false`와 안내문 전문을 고정했다.
- `tests/api-kano-google-forms-disabled.test.ts`를 신설해 세 라우트의 비활성·권한 거부 경로를 검증했다.
- `tests/api-form-responses-invitation.test.ts`에 활성 플래그 mock만 추가했다.
- `tests/api-error-exposure.test.ts`에 활성 플래그 mock만 추가했다.
- `stryker.crap.config.json`의 mutate 마지막에 `lib/feature-flags.ts`를 추가했다.
- `docs/superpowers/plans/2026-09-05-kano-response-upload-ux.md`의 Task 1 Step 1~4를 완료 처리했다.

## COMMIT

- 작업 커밋은 `683f66a feat: Google Forms 연동을 서버에서 비활성화한다`이다.

## VERIFIED BY

### RED → GREEN

- 가드 삽입 전 `npx vitest run tests/api-kano-google-forms-disabled.test.ts`에서 세 라우트의 비활성 경로가 모두 행동 수준 RED를 보였다. 핵심 실패 줄은 다음과 같다.

```text
AssertionError: expected 200 to be 503 // Object.is equality
```

- 가드 삽입과 계약 보정 뒤 관련 테스트 네 파일을 함께 실행했다.

```text
npx vitest run tests/api-kano-google-forms-disabled.test.ts tests/feature-flags.test.ts tests/api-form-responses-invitation.test.ts tests/api-error-exposure.test.ts
Test Files  4 passed (4)
Tests  12 passed (12)
Duration  530ms (transform 180ms, setup 0ms, import 420ms, tests 32ms, environment 0ms)
```

### 게이트

- `npx tsc --noEmit`은 출력 없이 exit code 0으로 통과했다.

```text
(stdout/stderr 출력 없음, exit code 0)
```

- `npx vitest run`의 마지막 결과는 다음과 같다.

```text
Test Files  100 passed (100)
Tests  1137 passed (1137)
Duration  3.79s (transform 7.24s, setup 0ms, import 19.76s, tests 4.94s, environment 10ms)
```

- `npx next lint`의 마지막 출력 줄은 다음과 같다.

```text
✔ No ESLint warnings or errors
```

### 뮤테이션

- `npx stryker run stryker.crap.config.json --mutate lib/feature-flags.ts`를 최종 설정에서 실행했고 exit code 0으로 끝났다. Boolean과 StringLiteral 뮤턴트 총 2개가 모두 사멸했다.

```text
All files         | 100.00 |  100.00 |        2 |         0 |          0 |        0 |        0 |
feature-flags.ts | 100.00 |  100.00 |        2 |         0 |          0 |        0 |        0 |
15:50:56 (37928) INFO MutationTestExecutor Done in 4 seconds.
15:50:57 (37928) INFO TemporaryDirectory Failed to delete stryker temp directory E:\Dropbox\codetest2\.stryker-tmp\sandbox-YnRF5c
```

- Stryker disable 주석은 추가하지 않았다. 제외 전·후 총 뮤턴트 수 감소는 0개다.

### 회귀 역검증

- `create-form` 라우트의 가드 블록만 임시로 제거하고 `npx vitest run tests/api-kano-google-forms-disabled.test.ts`를 실행했다.

```text
AssertionError: expected 200 to be 503 // Object.is equality
Test Files  1 failed (1)
Tests  1 failed | 5 passed (6)
```

- 가드를 원복하고 같은 명령을 재실행했다.

```text
Test Files  1 passed (1)
Tests  6 passed (6)
```

- 원복 뒤 라우트 세 개의 numstat은 모두 추가 5줄·삭제 0줄이었다. 가드 아래 기존 본문 삭제는 없다.

```text
5	0	app/api/projects/[id]/kano/create-form/route.ts
5	0	app/api/projects/[id]/kano/form-responses/route.ts
5	0	app/api/projects/[id]/kano/form-script/route.ts
```

### 기존 초대 회귀 테스트

- `tests/api-form-responses-invitation.test.ts`의 기존 `it` 세 개는 이름과 본문을 그대로 유지했고 전체·관련 테스트에서 통과했다.

```text
it('invitedBy 에 요청자의 userId 를 넣는다'
it("invitedBy 에 'system' 같은 가짜 ID 를 넣지 않는다"
it('초대가 이미 있으면 새로 만들지 않는다'
```

## DEVIATIONS

- 사전 검토에서 `tests/api-error-exposure.test.ts`도 기본 비활성 플래그 때문에 기존 500 계약 대신 503에서 끝나는 것을 발견했다. 사용자 승인 뒤 이 파일에 계획서가 지정한 것과 같은 활성 플래그 mock 한 블록만 추가했고 기존 테스트 본문과 단언은 바꾸지 않았다.
- 계획서 Interfaces에는 `googleFormsDisabledResponse()`가 남아 있지만, 이번 지시의 최신 확정 계약이 export를 정확히 두 개로 제한한다. 기존 계약 우선 규칙에 따라 helper를 만들지 않았다.
- 최초 Stryker 실행은 뮤턴트 2개를 모두 사멸해 100%를 냈지만 샌드박스가 자체 자식 프로세스 정리용 `taskkill`을 거부해 exit code 1이었다. 같은 명령을 샌드박스 밖에서 재실행해 exit code 0과 100%를 확인했다.
- 계획서가 예상한 전체 테스트 파일 수는 99개였으나 신규 테스트 파일 추가 후 실제 실행 결과는 100개 파일이었다. 테스트를 삭제하거나 제외하지 않고 실제 값을 기록했다.

## RISKS

- Vite는 CommonJS로 읽히는 `vitest.config.ts`의 ESM 문법이 향후 native config loader에서 지원되지 않을 수 있다고 경고했다. 현재 테스트 결과에는 영향이 없다.
- Browserslist의 `caniuse-lite` 데이터가 8개월 오래됐다는 경고가 있었다. 의존성 변경은 이번 범위가 아니므로 갱신하지 않았다.
- Stryker는 정상 종료 뒤 `.stryker-tmp` 샌드박스 디렉터리 삭제 실패를 경고했다. 해당 경로는 Git 무시 대상이고 mutation score에는 영향이 없다.
- 원격 실DB, dev 서버, 실제 Google API는 금지 계약에 따라 실행하지 않았다. 이번 Task의 mock 기반 서버 계약 밖 실동작은 검증하지 않았다.

## QUESTIONS

- 없다.
