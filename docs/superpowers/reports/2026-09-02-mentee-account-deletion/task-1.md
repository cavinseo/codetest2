# Task 1 결과 보고서

## RESULT

`KanoSurveyInvitation.invitedBy` 와 `MigrationHistory.userId` 를 nullable + `onDelete: SetNull` 로 바꿨다. 두 컬럼이 `NOT NULL` + `Restrict` 라 설문을 한 번이라도 보냈거나 엑셀을 한 번이라도 가져온 멘티는 영구히 삭제할 수 없었고, 그 둘이 멘티의 본업이라 사실상 활동한 멘티 전부가 삭제 불가였다. 이제 계정을 파기하면 이력은 남고 주인만 비워진다. `KanoResponse.invitationId` 와 `Program.managerId` 의 `Restrict` 는 그대로 두었다.

## FILES CHANGED

- `prisma/schema.prisma` 의 `KanoSurveyInvitation`, `MigrationHistory` 두 모델을 고쳤다.
- `prisma/migrations/20260902000000_anonymize_deleted_user_history/migration.sql` 을 추가했다.
- `tests/db-migration-models.test.ts` 에 네 제약을 고정하는 회귀 테스트 4건을 추가했다.
- `app/api/projects/[id]/kano/form-responses/route.ts` 의 주석을 고쳤다. 이 변경이 낡게 만든 것이다.
- `docs/superpowers/plans/2026-09-02-mentee-account-deletion.md` 의 Task 1 Step 1~5 를 완료로 갱신했다.

## COMMIT

- 작업 커밋: `d8eb77a feat: 계정을 파기해도 설문·가져오기 이력은 남기도록 스키마를 바꾼다`.

## VERIFIED BY

원격 세션은 npm 레지스트리가 조직 정책에 막혀(`registry.npmjs.org` 403) 게이트를 실행할 수 없다. 아래 게이트는 **사용자가 이 브랜치를 받은 로컬 트리에서 실행**했고, 출력은 그 화면에서 옮긴 것이다.

- `npx prisma validate`
  - 출력 원문: `The schema at prisma\schema.prisma is valid 🚀`.
- `npx prisma generate`
  - 출력 마지막 줄 원문: `✔ Generated Prisma Client (v6.19.3) to .\node_modules\@prisma\client in 130ms`.
- `npx tsc --noEmit && npx vitest run && npx next lint`
  - vitest 결과 원문: ` Test Files  94 passed (94)` 및 `      Tests  1080 passed (1080)`.
  - 출력 마지막 줄 원문: `✔ No ESLint warnings or errors`.
  - `tsc` 는 `&&` 체인이라 뒤가 실행됐다는 사실이 통과를 뜻한다.
- `npx prisma migrate deploy` (사용자 실행)
  - 적용 완료 시각 `Thu Sep 03 2026 15:06:13 GMT+0900`, `applied_steps_count = 1`.
- `npm run check:history-fk` — `migrate status` 의 "up to date" 는 `_prisma_migrations` 기록만 보므로 실제 컬럼을 직접 읽었다.
  - 출력 원문: `[정상] kano_survey_invitations.invitedBy (설문 초대 발송자)` / `NULL 허용  : YES` / `삭제 규칙  : SET NULL`.
  - 출력 원문: `[정상] migration_histories.userId (엑셀 가져온 사람)` / `NULL 허용  : YES` / `삭제 규칙  : SET NULL`.
  - 출력 마지막 줄 원문: `결론: 적용됐다. 멘티 삭제 구현(Task 2)으로 넘어가도 된다.`
- 원격에서는 새 테스트의 단언 7개를 실제 `prisma/schema.prisma` 에 대해 node 로 직접 실행했다.
  - 출력 마지막 줄 원문: `7/7 통과`.

## DEVIATIONS

계획서 Step 4 의 원안은 스키마 전체 문자열에 정규식을 걸었다. 그러면 `ProjectMember.invitedBy` 가 이미 `String?` 이라 **`KanoSurveyInvitation` 이 `NOT NULL` 로 되돌아가도 테스트가 초록으로 남는다.** 모델 블록만 떼어 검사하도록 바꾸고, 지켜야 할 `Restrict` 두 개도 함께 고정했다. 계획서 스니펫을 실제 코드에 맞춰 갱신했다.

Step 4b 를 추가했다. `form-responses` 의 주석이 `invitedBy` 를 "필수 FK" 라고 설명하는데 이 Task 가 그 전제를 깬다. nullable 이 됐다고 새 초대에 `null` 을 넣으면 안 된다는 것도 못 박았다. 빈 값은 "계정이 파기된 사람"이라는 뜻이지 "발신자가 없다"는 뜻이 아니다.

검증 기록을 한 번 잘못 남겼다가 정정했다(`c4f8484`). 사용자가 보고한 첫 게이트 통과(테스트 1055건)를 이 Task 의 검증으로 적었는데, 그 트리에는 이 Task 의 커밋이 없었다. `migrate deploy` 가 마이그레이션을 10개만 찾은 것이 근거였고 이 Task 의 것을 더하면 11개다.

`npx prisma migrate deploy` 가 언제 적용됐는지도 한 번 오판했다. 터미널에 출력이 보이지 않아 실행되지 않았다고 판단했으나, 기록 시각(15:06:13)이 그 뒤 게이트 실행(15:06:28)보다 앞선다. 붙여넣은 명령이 실제로는 실행됐고 스크린샷이 출력 직전을 잡은 것이다.

## RISKS

원격 세션에서 게이트를 직접 돌릴 수 없어, 이 Task 의 검증은 사용자가 실행한 결과에 의존한다. 다음 Task 에서도 같은 제약이 이어진다.

되돌리기가 비대칭이다. 이 마이그레이션을 되돌리려면 `null` 인 행을 먼저 처리해야 한다. 지금은 `null` 행이 없지만 첫 멘티 삭제가 일어나면 생긴다.

## QUESTIONS

없다.
