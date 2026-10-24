# Task A — 뮤테이션 점수 100% 복구 (stryker.crap.config.json mutate 목록)

## RESULT

**완료.** PR #45 의 CI 에서 게이트 3종이 통과했고, 같은 커밋(`27a7906`)에 대한 전체 뮤테이션
실행(workflow_dispatch, run 40086632784)에서 `mutate` 목록 27개 파일 **전부 100%**
(1390 killed, 99 timeout, 0 survived, 0 no coverage)다. 대상 8개 파일 모두 100% 다.

작업 세션에서는 네트워크 정책(registry.npmjs.org·artifactory.infra.ant.dev 차단)으로
`npm ci` 를 할 수 없어 게이트를 로컬에서 돌리지 못했고, 검증은 전부 GitHub Actions 에서 했다.

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

모두 GitHub Actions, 헤드 커밋 `27a7906` 기준. 로그 원문의 마지막 줄을 옮긴다.

**게이트 — CI run 40085743432 (pull_request)**

- `npm run lint` — 단계 success
- `npx tsc --noEmit` — 단계 success
- `npm test` (`vitest run`) — ` Test Files  220 passed (220)` / `      Tests  3091 passed (3091)`
- `npm run build` — ` ✓ Compiled successfully in 25.6s`

**뮤테이션 — 변경 파일 부분 실행, CRAP / Mutation run 40085743487 (pull_request)**

crap.yml 은 소스가 바뀐 mutate 대상만 고르므로 lib 를 고친 4개만 돌았다.

```
All files                      | 100.00 |  100.00 |      360 |        10 |          0 |        0 |        0 |
 final-report-document.ts      | 100.00 |  100.00 |      145 |         1 |          0 |        0 |        0 |
 final-report-edit.ts          | 100.00 |  100.00 |      122 |         0 |          0 |        0 |        0 |
 invite-code.ts                | 100.00 |  100.00 |       63 |         9 |          0 |        0 |        0 |
 technical-benchmark-guards.ts | 100.00 |  100.00 |       30 |         0 |          0 |        0 |        0 |
```

**뮤테이션 — 전체 실행, CRAP / Mutation run 40086632784 (workflow_dispatch)**

테스트만 더한 4개 파일까지 재려고 전체를 돌렸다(64분). 열: score / covered / killed / timeout /
survived / no cov / errors.

```
All files                      | 100.00 |  100.00 |     1390 |        99 |          0 |        0 |        0 |
 final-report-document.ts      | 100.00 |  100.00 |      144 |         2 |          0 |        0 |        0 |
 final-report-edit.ts          | 100.00 |  100.00 |      122 |         0 |          0 |        0 |        0 |
 final-report-inputs.ts        | 100.00 |  100.00 |       78 |         0 |          0 |        0 |        0 |
 import-cascade-guard.ts       | 100.00 |  100.00 |       74 |         1 |          0 |        0 |        0 |
 invite-code.ts                | 100.00 |  100.00 |       63 |         9 |          0 |        0 |        0 |
 kano-offline-form.ts          | 100.00 |  100.00 |       34 |         0 |          0 |        0 |        0 |
 member-roles.ts               | 100.00 |  100.00 |      140 |         3 |          0 |        0 |        0 |
 technical-benchmark-guards.ts | 100.00 |  100.00 |       30 |         0 |          0 |        0 |        0 |
```

나머지 19개 파일도 전부 100.00 (보고서 끝줄: `| 전체 뮤테이션 점수 | 100.00% |`).

**분모 변화 확인.** 직전 전체 실행(run 40072394201)은 1462 killed + 51 survived = 1513,
이번은 1390 + 99 = 1489 로 24개 줄었다. 줄어든 곳은 소스를 걷어낸 파일뿐이다
(직전 점수·생존 수로 역산한 총계 → 이번 총계):
final-report-edit ≈141 → 122, technical-benchmark-guards ≈34 → 30, final-report-document ≈148 → 146,
invite-code ≈72 → 72. 지운 조건(표 종류 중복 검사·길이 검사·인덱스 반복문·typeof·trim)이
만들던 뮤턴트가 사라진 것이고, `Stryker disable` 은 하나도 없으므로 분모 축소로 만든 100% 가 아니다.
테스트만 더한 4개 파일은 총계가 그대로다(kano-offline-form 34, import-cascade-guard 75,
final-report-inputs 78, member-roles 143).

**참고 — 로컬 대체 검증(CI 이전).** 최소 vitest 대역으로 관련 테스트 8개 파일 통과, 손으로 넣은
뮤턴트 87개 전부 killed. CI 결과와 일치했다.

## DEVIATIONS

- 게이트·stryker 를 로컬이 아니라 CI 에서 실행했다(위 네트워크 사유). PR #45 는 검증용으로 연 것이다.
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

## QUESTIONS

- `member-roles.ts:89` 처리(RISKS 첫 항목)를 이대로 둘지, disable 로 바꿀지 감리 판정이 필요하다.
