# Task A-2 결과 보고서 — 팀원 제외

## RESULT

프로젝트 소유자가 팀원을 제외할 수 있게 했다. 계획서의 결정 1 에서 사용자가 "소유자
(멘티) 권한으로 수행" 을 택했으므로, 초대와 같은 `roles: ['OWNER']` 게이트를 쓴다.
시스템 관리자와 편집자, 멘토는 이 경로로 제외할 수 없다.

착수 전 전수 확인한 사실은 이렇다. 팀원 한 명을 빼는 경로가 코드 어디에도 없었다.
`members` 라우트에 `POST` 와 `GET` 만 있었고, `projectMember` 삭제 호출은
`lib/project-transfer.ts:122` 한 곳뿐이며 그마저 소유권 이전 중 옛 소유자와 대상 멘티
행만 정리한다. 나머지는 회원 계정이나 프로젝트를 통째로 지울 때의 연쇄 삭제가 전부다.

## FILES CHANGED

- `app/api/projects/[id]/members/route.ts` — `removeSchema` 와 `DELETE` 핸들러 추가.
  기존 `POST`·`GET` 계약은 건드리지 않았다.
- `app/project/[id]/settings/page.tsx` — 휴지통 버튼에 확인창·처리 중 표시·목록 갱신을
  잇고, 실패 배너와 안내 문구를 더했다.
- `tests/api-project-members.test.ts` — 제외 관련 테스트 6 개 추가. 프리즈마 mock 에
  `deleteMany` 추가.
- `docs/manual/05-mentee.md` — 5.4 절에 "팀원 제외" 절 신설. "뺄 방법이 없다" 는
  기존 주의 문단을 대체했다.
- `docs/manual/13-appendix.md` — 부록 E 에서 휴지통 줄 삭제, 문서 이력 추가.
- `docs/superpowers/plans/2026-09-17-manual-ui-discrepancies.md` — A-2 체크박스 갱신,
  코드 스니펫을 실제 구현과 일치시킴.

## COMMIT

- 작업 커밋 `f5a2ffc`.

## VERIFIED BY

**게이트 3 종을 실행하지 못했다.** 이 컨테이너에서 npm 레지스트리 전체가 403 으로
막혀 의존성을 설치할 수 없다. 정상 완료로 집계하지 않는다.

- `npm ci --no-audit --no-fund`
  - `npm error 403 403 Forbidden - GET https://registry.npmjs.org/zod/-/zod-3.25.76.tgz`
  - 특정 패키지 문제가 아니다. 아래로 레지스트리 전체가 막힌 것을 확인했다.
- `curl -s -o /dev/null -w "%{http_code}" https://registry.npmjs.org/zod` → `403`
- `curl -s -o /dev/null -w "%{http_code}" https://registry.npmjs.org/zod/-/zod-3.25.76.tgz` → `403`
- `curl -s -o /dev/null -w "%{http_code}" https://registry.npmjs.org/vitest/-/vitest-3.2.4.tgz` → `403`

따라서 `npx tsc --noEmit`, `npx vitest run`, `npx next lint` 는 **실행하지 못했다.**

의존성 없이 실행 가능한 것만 돌렸다.

- `node scripts/check-text-encoding.mjs`
  - `한글 인코딩 검사 통과.`
  - 종료 코드 0.
- 전역 TypeScript 로 편집한 세 파일의 파싱 검사.
  `/opt/node22/bin/tsc --noEmit --noResolve --skipLibCheck --jsx preserve --target es2022 --module esnext app/api/projects/[id]/members/route.ts app/project/[id]/settings/page.tsx tests/api-project-members.test.ts`
  - 문법 오류(TS1xxx) `0` 건.
  - `--noResolve` 이므로 **타입 검사가 아니다.** 문법과 JSX 균형만 확인한 것이다.
- `git diff` 전체를 다시 읽어 적대적으로 검토했다. 확인한 것은 다음과 같다.
  - `loadMembers` 가 `handleRemoveMember` 보다 먼저 정의되어 스코프에 있다.
  - `response.json().catch(() => null)` 뒤 `data?.error` 로 널을 처리한다.
  - `member.email` 이 선택 속성이므로 `|| '이 팀원'` 로 받는다.
  - `removingUserId !== null` 로 처리 중 모든 제외 버튼을 잠근다.

**사용자가 의존성이 설치된 환경에서 아래를 직접 돌려야 한다.**

```sh
npx tsc --noEmit && npx vitest run && npx next lint
```

## DEVIATIONS

- **계획서의 서버 스니펫보다 단순하게 구현했다.** 계획서는 소유자 확인을 위해 프로젝트를
  다시 조회했지만, `requireProjectAccess` 가 프로젝트 부재를 이미 404 로 거르고
  (`lib/authorization.ts:125-127`) `roles: ['OWNER']` 통과가 곧 요청자 = 소유자를
  뜻하므로 두 번째 질의는 도달할 수 없는 방어 코드다. `AGENTS.md` 의 단순성 규칙에
  따라 뺐고 계획서 스니펫도 실제 구현으로 고쳤다.
- **제외 후 접근 차단 테스트를 새로 만들지 않았다.** 계획서 Step 에는 있었다. 제외 후
  상태는 "멤버 행이 없는 사용자" 와 정확히 같고, `tests/authorization.test.ts:140` 의
  `rejects a non-member` 가 이미 그 거부를 고정한다. 같은 것을 두 번 잠그지 않았다.
- **작성물 보존 테스트를 만들지 않았다.** `ProjectMember` 를 참조하는 하위 모델이
  스키마에 없어 구조적으로 지워질 것이 없다. 테스트로 잠글 동작 자체가 없다.

## RISKS

- **게이트를 돌리지 못한 것이 가장 큰 위험이다.** 타입 오류와 lint 위반이 남아 있을 수
  있다. 파싱 검사는 문법만 본다.
- **화면 DOM 테스트가 없다.** 확인창 취소 시 요청이 나가지 않는지, 처리 중 중복 클릭이
  막히는지를 화면 수준에서 고정하지 못했다. 검증할 수 없는 테스트를 추가하면 통과
  여부를 모른 채 빨간 테스트를 올리게 되므로 쓰지 않았다. 계획서 A-2 에 남은 일로
  체크박스를 열어 두었다.
- **실기동 검증을 하지 않았다.** `CLAUDE.md` 의 제약에 따라 dev 서버를 띄우지 않았고
  운영 DB 에도 접근하지 않았다. 실제 제외 동작은 감리자나 사용자의 실계정 확인으로
  이월한다.
- 제외는 되돌릴 수 없는 조작이 아니다. 같은 주소로 다시 초대하면 복구된다. 다만 그
  사람이 작성 중이던 화면은 즉시 막힌다.

## QUESTIONS

- 남은 결정 4 건(결정 2 부터 5)은 그대로 열려 있다. Task B 와 D 는 결정과 무관하게
  착수할 수 있다.
- 화면 DOM 테스트를 이번 범위에서 마저 할지, 게이트를 돌릴 수 있는 환경에서 별도로
  처리할지 정해 주면 좋겠다.
