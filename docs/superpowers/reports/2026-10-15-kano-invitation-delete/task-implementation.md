# Kano 미응답 초대 개별 삭제 구현 결과.

## RESULT

미응답 초대의 개별 삭제를 구현했다. 소유 멘티·배정 멘토·관리자 등 기존 프로젝트 쓰기 권한을 사용한다. 완료 표시가 있거나 실제 연결 응답이 있으면 초대 삭제를 거절한다. 확인창은 대상 이메일, 초대 기록 삭제 및 설문 링크 무효화를 알린다. 기존 응답 삭제·전체 초대 리셋 계약은 유지한다.

실제 기능 RED를 확인한 뒤 구현했다. 신규 API 31개 및 UI 16개, 기존 관련 회귀를 포함한 9개 파일의 205개 검사가 통과했다. 전체 lint/test/build 및 실제 화면 검증은 주 작업자가 독립 수행한다.

## FILES CHANGED

격리 작업폴더는 `C:/Users/user/.codex/worktrees/kano-invitation-delete/codetest2`다. 이번 변경은 다음 2개 제품 소스와 3개 테스트다.

- `app/api/projects/[id]/kano/invitations/route.ts` 8·22·40·53·72·80줄. 엄격한 단일 ID 입력, GET 연결 응답 수와 `canDelete`, 쓰기 권한 검사, 프로젝트 범위의 조건부 삭제 및 응답 경쟁/FK 충돌의 409 처리를 추가했다.
- `components/project/KanoManager.tsx` 39·116·140·170·214·537·1341줄. 초대 조회의 프로젝트 및 성공 여부를 추적하고 행 삭제 버튼·확인창·공통 삭제 잠금·삭제 성공 행 제거·현재 프로젝트 재조회를 추가했다. 프로젝트가 바뀐 후 이전 조회/삭제 완료가 새 목록을 덮지 않는다.
- `tests/api-kano-invitation-delete.test.ts` 신규. 실제 `requireProjectAccess`를 모의 Auth/Prisma와 함께 사용해 권한·입력·프로젝트 범위·접수 응답·경쟁·토큰 비노출을 검사한다. 완료 표시만 있는 초대와 완료 표시 없이 실제 응답이 있는 초대를 별도로 검사한다.
- `tests/kano-invitation-delete.test.ts` 신규. 역할별 사용, 완료/실제 응답/알 수 없는 삭제 권한 보호, 취소 0요청, 정확한 ID, 실패/재시도, 같은 tick 중복, 기존 리셋과의 교차 잠금, 재조회 실패 및 A→B 전환을 관찰 동작으로 검사한다.
- `tests/api-readonly-role-guards.test.ts` 75줄. GET의 새 Prisma 계약에 맞춰 기존 초대 fixture에 `_count: { responses: 0 }` 한 줄을 추가했다. 기존 단언·검사 수·권한 기준을 변경하지 않았다.

제품 diff 기준은 `E:/Dropbox/codetest2/tmp/invitation-delete-before/`다. 원본 release 및 원래 작업폴더의 미완료 사용자 변경은 수정하지 않았다. 스키마·패키지·인증·다른 제품 소스·원격 데이터·개발 서버·커밋·push·배포 변경은 없다.

## VERIFIED BY

모든 명령의 workdir은 격리 작업폴더다. Prisma 및 Auth는 테스트에서 전부 모의한다.

1. 최초 검사 실행은 기능 RED를 수집하기 전에 Windows sandbox TEMP에서 Vite 임시 파일 `rename`의 EPERM으로 실패했다. 원문 출력은 `E:/Dropbox/codetest2/tmp/invitation-delete-vitest-eprem.log`에 보존했다. 출력에 추가 스택 프레임은 없었다. 명령별 `TEMP`와 `TMP`만 작업용 `E:/Dropbox/codetest2/tmp/invitation-delete-vitest-temp`로 설정하니 수집이 정상화됐다. 자동 리뷰 에스컬레이션은 사용하지 않았다.

2. 제품 소스 수정 전 기능 RED 명령은 `npm exec -- vitest run tests/api-kano-invitation-delete.test.ts tests/kano-invitation-delete.test.ts`다. 당시 신규 45개를 수집했고 DELETE export, GET `canDelete`, UI 삭제 버튼이 없어서 실패했다. 출력 마지막 줄은 다음과 같다.

```text
 Test Files  2 failed (2)
      Tests  44 failed | 1 passed (45)
   Start at  03:02:31
   Duration  2.03s (transform 460ms, setup 0ms, import 1.75s, tests 309ms, environment 750ms)
```

대표 실패 원문은 `TypeError: route.DELETE is not a function`, `expected [ undefined, undefined, undefined ] to deeply equal [ true, false, false ]`, `pending@example.test: expected null not to be null`이었다. 이후 주 작업자가 요구한 재조회 실패의 미응답 행 및 B GET 실패 검사, 알 수 없는 `canDelete` 검사로 UI 검사를 보완했다.

3. 구현 후 첫 관련 실행에서 194개 중 2개가 실패했다. 원인은 공용 HeaderToast의 실제 `role="status"`를 신규 테스트가 `alert`로 조회한 점과 `other-pending@example.test`를 전체 문자열로 검사해 `pending@example.test`가 남았다고 오판한 점이었다. 실제 알림 role 및 정확한 행의 aria-label을 검사하도록 수정했다. 기능 검사·실패 보호를 완화하지 않았다.

4. `npm exec -- vitest run tests/api-readonly-role-guards.test.ts`의 기존 writer fixture에 `_count`가 없어서 `Cannot read properties of undefined (reading 'responses')`로 3개가 실패했다. 테스트 fixture의 `_count` 한 줄만 보완했다.

5. 최종 GREEN 명령은 다음과 같다.

```powershell
$env:TEMP = 'E:/Dropbox/codetest2/tmp/invitation-delete-vitest-temp'
$env:TMP = 'E:/Dropbox/codetest2/tmp/invitation-delete-vitest-temp'
npm exec -- vitest run tests/api-kano-invitation-delete.test.ts tests/kano-invitation-delete.test.ts tests/kano-respondent-delete.test.ts tests/api-kano-response-delete.test.ts tests/api-kano-analysis-access.test.ts tests/kano-analysis-access.test.ts tests/kano-analysis-visibility.test.ts tests/api-kano-invite-links.test.ts tests/api-readonly-role-guards.test.ts
```

출력 마지막 줄은 다음과 같다.

```text
 Test Files  9 passed (9)
      Tests  205 passed (205)
   Start at  03:06:35
   Duration  4.34s (transform 2.81s, setup 0ms, import 6.04s, tests 1.87s, environment 4.26s)
```

6. `git diff --check` 및 `git diff --numstat`는 sandbox의 격리 폴더에서 `fatal: this operation must be run in a work tree`로 실행되지 않았다. 제품 2개 파일을 기준 복사본과 `git --no-pager diff --no-index -- <기준 파일> <수정 파일>`로 직접 대조해 요청 범위의 추가만 확인했다. no-index의 exit 1은 차이가 존재한다는 결과였다. 주 작업자가 정상 Git 환경에서 diff를 독립 검증한다.

7. 신규 API는 `kanoSurveyInvitation.findFirst`/`deleteMany`만 사용하며, 신규 UI handler는 `/kano/invitations` DELETE만 호출한다. 접수 응답 삭제 또는 초대 완료 상태 reset 호출을 추가하지 않았다. 삭제 조건은 고유 ID·현재 프로젝트·`respondedAt: null`·`responses: { none: {} }`을 모두 포함한다.

## DEVIATIONS

새 GET 계약에 필요한 기존 테스트 fixture 1줄을 수정했다. 기본 TEMP의 EPERM으로 명령의 임시 폴더만 바꿨다. 주 작업자의 요청에 따라 전체 게이트와 실제 화면 검증은 구현 담당이 실행하지 않았다. 두 제품 소스는 기존 mutation 대상 목록에 없고 새 순수 lib를 추가하지 않아 Stryker는 실행하지 않았다.

## RISKS

검사는 모의 DB 기반이며 실제 원격 DB·설문 제출 경쟁·운영 브라우저의 표준 확인창을 실행하지 않았다. 실제 FK와 조건부 SQL의 실행은 운영 검증 단계에서 주 작업자가 확인할 수 있다. 이미 보낸 이메일은 회수되지 않으며 초대 삭제는 링크 자격증명을 제거한다.

## QUESTIONS

없다. 구현 범위와 데이터 보호 계약은 모두 적용했다.
