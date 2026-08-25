# Task E 결과 보고

RESULT: DONE

FILES CHANGED:

- `app/api/projects/[id]/attributes/mentor/route.ts` — 프로젝트 `aiMode` 조회·파싱을 제거하고, 접근 세션 userId의 회원 연결로만 `rule` 또는 `personal`을 선택하게 했다.
- `app/api/projects/[id]/spec/generate/route.ts` — 회원 연결로 requested를 계산하고 `local` 연결에서만 서버 로컬 스위치와 브라우저 relay를 반영했다.
- `app/dashboard/page.tsx` — 새 프로젝트의 AI 모드 상태·라디오·생성 payload 필드를 제거했다.
- `app/project/[id]/settings/page.tsx` — 프로젝트별 AI 모드 탭·상태·조회·저장 UI를 제거했다.
- `app/settings/page.tsx` — Google·SMTP 탭은 유지하고 AI 탭에서 전역 엔진 상태·선택·안내를 제거해 `PersonalAiConnection`만 남겼다.
- `tests/api-ai-personal-mode.test.ts` — 연결 없음·rule·api·세션 userId·local relay의 5개 계약으로 라우트 테스트를 갱신했다.
- `docs/superpowers/plans/2026-08-25-member-ai-modes.md` — 허용된 관례에 따라 Task E 게이트 체크박스를 완료 처리했다.
- `docs/superpowers/reports/2026-08-25-member-ai-modes/task-e.md` — Task E 변경·검증·위험을 기록했다.

COMMIT: `e734db8` — `feat: AI 실행을 회원 연결 설정으로 일원화한다`.

VERIFIED BY:

1. RED — 라우트 구현 전 `npx vitest run tests/api-ai-personal-mode.test.ts` → exit code 1.

   ```text
    ❯ tests/api-ai-personal-mode.test.ts (5 tests | 4 failed) 18ms
        × mode:'rule' 연결은 기본 선택인 rule 을 요청한다 6ms
        × mode:'api' 연결은 personal 과 연결을 함께 전달한다 2ms
        × 본문 userId 대신 접근 세션의 userId 로만 연결을 읽는다 1ms
        × mode:'local' 연결이고 서버 로컬 실행이 꺼지면 spec 브라우저 relay 를 제안한다 2ms

   FAIL  tests/api-ai-personal-mode.test.ts > 회원 AI 연결 기반 라우팅 > mode:'api' 연결은 personal 과 연결을 함께 전달한다
   AssertionError: expected { requested: 'rule', …(1) } to match object { requested: 'personal', …(1) }

    Test Files  1 failed (1)
         Tests  4 failed | 1 passed (5)
      Duration  587ms (transform 74ms, setup 0ms, import 150ms, tests 18ms, environment 0ms)
   ```

2. GREEN — `npx vitest run tests/api-ai-personal-mode.test.ts` → exit code 0.

   ```text
    Test Files  1 passed (1)
         Tests  5 passed (5)
      Duration  540ms (transform 73ms, setup 0ms, import 136ms, tests 12ms, environment 0ms)
   ```

3. `npx vitest run` → exit code 0.

   ```text
    Test Files  88 passed (88)
         Tests  989 passed (989)
      Duration  3.81s (transform 5.62s, setup 0ms, import 17.38s, tests 4.84s, environment 10ms)
   ```

4. `npx tsc --noEmit` → exit code 0, 출력 없음.

   `npx next lint` → exit code 0.

   ```text
   ✔ No ESLint warnings or errors
   ```

5. `git log -2 --format="%s"` → 작업 커밋과 보고서 커밋 두 개를 확인한다.

   ```text
   docs: Task E 결과 보고서
   feat: AI 실행을 회원 연결 설정으로 일원화한다
   ```

   `git status --porcelain` → 출력 없음. `git push`는 실행하지 않았다.
6. 원격 DB 명령과 dev 서버 명령을 실행하지 않았다.

DEVIATIONS: 허용된 관례에 따라 계획서 체크박스 갱신을 포함했다. 그 외 범위 밖 수정은 없음.

RISKS: dev 서버 기동 금지에 따라 실브라우저의 탭·레이아웃 동작은 검증하지 않았다.

QUESTIONS: 없음.
