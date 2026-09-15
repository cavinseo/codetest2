# 멘토 배정·프로젝트 승인 단계별 검수 보고서

## RESULT

기능 코드와 마이그레이션 파일을 작성하고, 사전에 정한 0~5단계 검수 게이트를 순차 통과했다. 6단계의 전체 테스트·타입·앱 린트도 통과했다. 프로덕션 빌드와 실제 DB·계정 인수 검수는 완료되지 않았으므로 최종 인수와 배포는 보류한다.

| 검수 지표 | 확인 결과 | 판정 |
|---|---|---|
| 멘티의 다른 역할 전환 및 관리자로의 승격 금지. | 기존 서버 역할 전환 제한 16조합 재검증. 멘티·관리자의 변경 선택 UI 제거. | 코드·모의 검수 통과. |
| 프로그램 개설은 관리자만 허용. | PM·멘토·멘티의 POST 403. 관리자가 개설 시 유효한 담당 PM을 선택 가능. | 코드·모의 검수 통과. |
| 관리자·담당 PM만 멘티당 멘토 1명 배정. | 타 PM 및 멘티·멘토 요청 차단. 멘티 ID 기본키에 upsert. 프로젝트가 없어도 배정 가능. | 코드·모의 검수 통과. |
| 배정된 멘토의 프로젝트 열람과 본문 쓰기 차단. | 목록과 상세 인가가 멘티 배정을 참조. 과거 EDITOR도 저장 403, DB 쓰기 0회. 해제 후 다음 요청 차단. | 코드·모의 검수 통과. |
| 추가 개설마다 승인 1건 사용. | 첫 개설 허용, 다음 개설 승인 요구, 본인·동일 프로그램·미사용 승인 조건으로 소비. 권한 조작 및 사용 완료 승인 차단. | 코드·모의 검수 통과. 실제 동시 요청 미검증. |
| 코멘트는 워크시트별로 분리. | 프로젝트·워크시트 범위 강제. 배정된 멘토와 관리자만 작성, 본인 코멘트만 수정·삭제. | 코드·모의 검수 통과. |
| 전체 회귀 테스트와 타입·린트 오류 0. | 124파일·1,457테스트, tsc, Next 린트 통과. | 통과. |
| 빌드 및 실제 운영 인수. | 변경 전에도 재현된 docx 빌드 오류. 실DB 미적용, 실제 계정 UI 미검증. | 보류. |

## FILES CHANGED

- 권한과 생성 흐름. `lib/member-roles.ts`, `lib/authorization.ts`, `lib/mentor-assignment-route.ts`, `lib/project-creation-approval.ts`.
- API. `app/api/programs/route.ts`, `app/api/projects/route.ts`, `app/api/projects/[id]/mentors/route.ts`, `app/api/mentees/[id]/mentor/route.ts`, `app/api/project-requests/route.ts`, `app/api/projects/[id]/comments/route.ts`.
- 화면. `app/admin/page.tsx`, `app/dashboard/page.tsx`, `app/project/[id]/page.tsx`, `components/admin/MembersTab.tsx`, `components/admin/MentorAssign.tsx`, `components/admin/ProgramsTab.tsx`, `components/admin/ProgramMentors.tsx`, `components/ProjectRequestsPanel.tsx`, `components/project/WorksheetComments.tsx`.
- 저장 구조. `prisma/schema.prisma`, `prisma/migrations/20260910190000_mentee_mentor_approval/migration.sql`.
- 테스트. `tests/api-mentor-assign.test.ts`, `tests/api-programs.test.ts`, `tests/api-project-scope.test.ts`, `tests/authorization.test.ts`, `tests/member-roles.test.ts`, `tests/api-mentor-readonly.test.ts`, `tests/api-project-requests.test.ts`, `tests/api-worksheet-comments.test.ts`, `tests/mentee-mentor-access.test.ts`, `tests/project-creation-approval.test.ts`.
- 계획. `docs/superpowers/plans/2026-09-10-mentee-mentor-approval.md`.

## COMMIT

- 브랜치. `codex/mentee-mentor-approval`.
- 기능 커밋. `c6c9987b857bb5593019bce5690f425bd62d0bc7`.
- 기준 커밋. `bce39ce21937b4ad6fc404257729579da4ff1888`.
- 푸시·병합·배포는 수행하지 않았다.

## VERIFIED BY

단계별로 1단계 154테스트, 3단계 91테스트, 4단계 44테스트, 5단계 62테스트를 통과한 뒤 다음 단계로 진행했다. 마지막 통합 검수에서 실제 인가 함수를 사용하는 API 차단 테스트와 승인 요청 전달 테스트를 추가했다.

| 실행 명령 | 결과 원문 또는 종료 상태 |
|---|---|
| `npm run test` | `Test Files  124 passed (124)` / `Tests  1457 passed (1457)` / exit 0. |
| `npx tsc --noEmit` | 출력 없음, exit 0. |
| `npx next lint` | `✔ No ESLint warnings or errors` / exit 0. |
| `npm run lint` | `18 problems (0 errors, 18 warnings)` / exit 0. 이전 `.stryker-tmp` 사본만 경고 발생. |
| `npx next lint --file components/admin/MentorAssign.tsx` | 마지막 안내 문구 수정 후 `✔ No ESLint warnings or errors` / exit 0. |
| `npx prisma validate` | 스키마 유효성 검사 성공. |
| `npx prisma generate` | Prisma Client v6.19.3 생성 성공. |
| `npx stryker run stryker.crap.config.json --mutate lib/member-roles.ts` | `100.00`, killed 134, survived 0, no coverage 0, errors 0. |
| `git diff --check` | 오류 없음. |

프로덕션 빌드는 실DB URL 두 개를 연결 불가능한 `127.0.0.1:1` 주소로 대체하여 실행했다. 첫 시도는 Google Fonts 네트워크 EACCES로 실패했고, 네트워크 허용 후 다음 오류가 확인됐다.

```text
./node_modules/docx/dist/index.mjs
Module parse failed: 'super' keyword outside a method (15120:19)
Import trace for requested module:
./node_modules/docx/dist/index.mjs
./lib/final-report-docx.ts
./app/project/[id]/report/page.tsx
> Build failed because of webpack errors
```

기준 커밋을 별도 임시 폴더에 추출하고 같은 의존성을 연결한 사본에서 `next build`를 실행해 동일한 docx 오류가 재현됐다. 사본에서는 Windows junction의 교차 드라이브 경로 때문에 Next client 경로 오류도 추가로 발생했다. docx 관련 소스·패키지·Next 설정은 이번 작업에서 변경하지 않았다. 기준 사본의 전체 빌드가 통과했다는 의미는 아니다.

로그 위치는 `C:/Users/Public/Documents/ESTsoft/CreatorTemp/` 아래의 `mentoring-final-tests.log`, `mentoring-final-types.log`, `mentoring-final-lint.log`, `mentoring-stage1-mutation.log`, `mentoring-build.log`, `mentoring-build-network.log`, `mentoring-baseline-build.log`다.

## DEVIATIONS

- 프로그램 개설을 관리자 전용으로 바꾸면서, 개설 시 담당 PM을 지정하는 기능을 함께 연결했다. 지정하지 않으면 개설한 관리자가 담당한다.
- 기존 프로그램 단위 운영과 관리자·PM의 대리 프로젝트 개설 권한은 유지한다. 멘티 본인의 추가 개설 요청에 승인 제한을 적용한다.
- 기존 프로젝트별 COACH는 멘티 전체 프로젝트에서 후보가 단일할 때만 승계한다. 후보가 여러 명인 멘티는 자동 선택하지 않고 새 화면에서 재배정해야 한다. 기존 기록은 삭제하지 않는다.
- 순수 모듈 mutation은 변경 대상인 `member-roles.ts`만 재실행했다. 기존 역할 전환 함수는 정책에 이미 맞아 유지했다.

## RISKS

- **새 테이블 마이그레이션 적용 전에 이 코드를 운영 배포하면 프로젝트 조회와 신규 기능 API가 실패한다.** 테이블 생성·승계 검수와 앱 배포 순서를 함께 관리해야 한다.
- 실제 DB에는 쓰지 않았다. 저장소 `CLAUDE.md`의 원격 실DB 보호 지침에 따라 마이그레이션 배포와 개발 서버 기동을 하지 않았다.
- 신규 세 테이블에 RLS를 활성화하고 공개 Data API 정책은 만들지 않았다. 서버 Prisma 연결 계정의 실제 접근 권한은 DB 적용 후 확인해야 한다.
- 소유자 행 잠금, 승인 소비, 프로젝트 생성이 한 트랜잭션에 있는지는 모의 테스트로 확인했다. PostgreSQL의 실제 동시 실행·롤백 동작은 아직 검증하지 않았다.
- 화면은 타입·린트·코드 흐름으로 검토했으며, 실제 계정의 브라우저 조작 검증은 수행하지 않았다.

## QUESTIONS / 남은 인수 검수

현재 기능 정책에 대한 추가 질문은 없다. 최종 인수는 다음 순서로 진행한다.

1. 기존 docx 빌드 오류를 해결하고 프로덕션 빌드를 통과시킨다.
2. 승인된 DB 환경에서 마이그레이션 적용 전후 프로젝트·워크시트 수가 같은지 확인한다. 단일 후보 승계와 복수 후보 재배정 대상을 확인한다.
3. 관리자와 담당 PM은 배정 가능, 타 PM·멘티·멘토는 배정 불가인지 실제 계정으로 검수한다.
4. 멘토 배정·교체·해제 후 목록·상세 접근을 확인한다. 본문 저장은 403, 코멘트 저장은 정상인지 확인한다.
5. 첫 프로젝트 생성, 추가 신청, 승인·반려, 승인 1회 사용을 실제 화면에서 수행한다. 같은 멘티의 동시 첫 생성과 같은 승인으로 두 번 생성하는 요청에서 각각 프로젝트가 최대 1개만 생기는지 확인한다.
6. WS-2에 남긴 코멘트가 WS-10에 섞이지 않는지, 다른 작성자의 수정·삭제가 거절되는지 확인한다. 새로고침 후 저장 결과와 읽기 전용 화면을 재확인한다.

각 항목이 통과하기 전에는 다음 인수 단계로 진행하지 않는다.
