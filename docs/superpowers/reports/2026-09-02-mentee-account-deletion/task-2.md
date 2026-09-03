# Task 2 결과 보고서

## RESULT

멘티 삭제에 사전 점검과 사유를 요구하도록 `DELETE /api/admin/users` 를 바꿨다. 확인 없이 부르면 지우지 않고 409 와 `preview` 를 돌려준다 — 어느 프로젝트가 누구에게 넘어가는지, 설문 초대와 가져오기 이력 몇 건의 주인이 비워지는지, 초대 코드 몇 건이 지워지는지다. 확정에는 사유 3종 중 하나가 필요하며 없으면 400 이다. 그 사람의 이메일로 발급된 초대 코드는 사용 여부와 무관하게 함께 지운다. `P2003` 문구를 원인별로 나눠 담당 프로그램 때문에 막힌 경우 담당자 이관을 안내한다.

## FILES CHANGED

- `lib/account-deletion.ts` 를 새로 만들었다. 사유 3종·라벨·판정과 사전 점검 문구 생성을 담는다.
- `tests/account-deletion.test.ts` 를 새로 만들었다. 13건이다.
- `app/api/admin/users/route.ts` 의 멘티 분기를 사전 점검·사유 검증·초대 코드 정리로 바꾸고, `P2003` 처리를 원인별로 나눴다.
- `tests/api-admin-user-delete.test.ts` 의 멘티 묶음을 9건으로 교체하고, `P2003` 테스트를 2건으로 나눴다. Prisma mock 에 `kanoSurveyInvitation`·`migrationHistory`·`inviteCode` 를 추가했다.
- `stryker.crap.config.json` 의 `mutate` 목록에 `lib/account-deletion.ts` 를 올렸다.
- `docs/superpowers/plans/2026-09-02-mentee-account-deletion.md` 의 Task 2 Step 1~6 을 완료로 갱신했다.

## COMMIT

- 작업 커밋: `ae50497 feat: 멘티 삭제에 사전 점검과 사유를 요구한다`.

## VERIFIED BY

원격 세션은 npm 레지스트리가 막혀 게이트를 실행할 수 없다. 아래는 **사용자가 로컬에서 실행**한 결과다.

- `npx tsc --noEmit && npx vitest run && npx next lint`
  - vitest 결과 원문: ` Test Files  95 passed (95)` 및 `      Tests  1099 passed (1099)`.
  - 출력 마지막 줄 원문: `✔ No ESLint warnings or errors`.
- `npx stryker run stryker.crap.config.json --mutate lib/account-deletion.ts`
  - 결과 원문: `account-deletion.ts | 100.00 | 100.00 | 33 | 0 | 0 | 0 | 0`(순서대로 total·covered·killed·timeout·survived·no cov·errors).
  - 출력 마지막 줄 원문: `INFO MutationTestExecutor Done in 6 seconds.`
- 원격에서는 Node 의 타입 스트리핑으로 `lib/account-deletion.ts` 를 실제 실행해 vitest 파일과 같은 단언 13건을 확인했다.
  - 명령 원문: `node --experimental-strip-types verify-account-deletion.mjs`.
  - 출력 마지막 줄 원문: `13/13 통과`.

## DEVIATIONS

계획서 Step 1 의 원안은 `project.managerName ?? '프로그램 매니저'` 였다. `null` 만 걸러 공백뿐인 이름을 놓치므로 `project.managerName?.trim() || '프로그램 매니저'` 로 바꿨다. `User.name` 이 nullable 이라 빈 이름이 들어오면 "소유자가  로 바뀝니다" 가 된다. 테스트를 한 건 더했고 계획서 스니펫도 갱신했다.

라우트에서 이력 건수를 세는 위치를 사전 점검 분기 안이 아니라 두 갈래 앞으로 옮겼다. 확정 갈래의 로그에도 같은 숫자가 필요한데, 갈래마다 따로 세면 두 값이 갈릴 수 있다.

## RISKS

라우트를 실제로 실행해 보지 못했다. 원격에서는 `next/server` 를 불러올 수 없고 dev 서버 기동은 금지다. 검증은 Prisma 를 mock 한 테스트까지이며, 실DB 에 대고 도는 것은 확인하지 않았다.

`prisma.inviteCode.deleteMany` 의 `mode: 'insensitive'` 는 PostgreSQL 전용이다. 다른 DB 로 옮기면 동작하지 않는다.

## QUESTIONS

없다.
