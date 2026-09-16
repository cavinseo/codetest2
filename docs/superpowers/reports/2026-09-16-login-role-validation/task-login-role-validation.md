# RESULT

비밀번호와 Google 로그인에서 사용자가 선택한 프로그램 매니저·멘토·멘티 역할을 DB 계정 역할과 비교하도록 수정했다. 역할이 다르거나 DB 역할이 올바르지 않으면 세션을 발급하지 않는다. 관리자 전용 로그인은 DB 역할이 `ADMIN`일 때 기존처럼 역할 입력 없이 동작하며, 멘티 초대코드 로그인은 기존 계약을 유지한다.

# FILES CHANGED

- `app/login/page.tsx`
- `app/api/auth/login/route.ts`
- `app/api/auth/google/login/route.ts`
- `app/api/auth/google/login/callback/route.ts`
- `lib/login-state.ts`
- `tests/login-page.test.ts`
- `tests/api-auth-login.test.ts`
- `tests/login-state.test.ts`
- `tests/api-google-login.test.ts`
- `tests/integration/password-settings.integration.test.ts`
- `docs/superpowers/specs/spec-login-role-validation.md`

# COMMIT

`7db7041ba431ffc4f91b5d605e387298269f4f71`.

# VERIFIED BY

- `npx vitest run tests/login-page.test.ts tests/api-auth-login.test.ts tests/login-state.test.ts tests/api-google-login.test.ts`.
  - `Test Files 4 passed (4)`, `Tests 79 passed (79)`.
- `npx vitest run tests/api-google-login.test.ts`.
  - `Test Files 1 passed (1)`, `Tests 29 passed (29)`.
- `npm test`.
  - `Test Files 165 passed (165)`, `Tests 2311 passed (2311)`.
- `npx tsc --noEmit --incremental false`.
  - 종료 코드 0.
- `npm run lint`.
  - 종료 코드 0.
- `npx stryker run stryker.crap.config.json --mutate lib/login-state.ts`.
  - `login-state.ts 100.00`, 55개 뮤턴트 모두 제거, 종료 코드 0.
- `npm run build`.
  - `Compiled successfully`, 정적 페이지 36개 생성, 종료 코드 0.

# DEVIATIONS

없다. 첫 운영 빌드는 Dropbox 경로의 `.next` 추적 파일을 여는 일시 오류로 종료됐고 동일 명령 재실행은 성공했다. 첫 Stryker 실행은 Windows 자식 프로세스 정리 권한 오류로 종료 코드 1을 냈지만 점수는 100%였으며, 권한을 높여 같은 명령을 재실행해 100%와 종료 코드 0을 확인했다.

# RISKS

원격 실DB와 실제 Google 계정을 사용하지 않았다. 역할 전달·검증·서명·세션 발급은 격리 테스트와 운영 빌드로 검증했다.

# QUESTIONS

없다.
