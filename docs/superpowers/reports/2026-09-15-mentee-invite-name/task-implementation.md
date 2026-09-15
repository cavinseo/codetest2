# 멘티 초대 등록 이름 필수화 결과.

- [x] 최초 초대코드 로그인에서 name: null로 계정이 생성되는 원인 확인.
- [x] 이름 누락·공백 등록을 거절하는 재현 테스트 작성 후 수정.
- [x] 화면·서버·DB·타입·린트·빌드 검증.

## RESULT.

유효한 이메일과 초대코드를 확인한 뒤 최초 등록자는 이름 필수 입력 단계를 거친다. 이름이 없거나 공백뿐이면 계정 생성, 코드 사용 처리, 세션 발급이 모두 중단된다. 앞뒤 공백을 제거한 이름으로 등록한다. 일반 회원가입 경로도 공백 이름을 거절한다.

이미 이름이 등록된 멘티는 이메일과 코드로 재로그인하며 로그인 요청으로 기존 이름을 덮어쓰지 않는다. 예전에 이름 없이 등록된 멘티는 다음 본인 코드 로그인에서 이름을 보완한다. 기존 코드 사용 시각과 계정 이용 기한은 유지한다.

## FILES CHANGED.

- app/login/page.tsx.
- app/api/auth/invite-login/route.ts.
- app/api/auth/signup/route.ts.
- 관련 API·화면·PostgreSQL 통합 테스트 4개 파일.

## COMMIT.

`2af1c2f2615c241aeeca0eb85a27648ad128047c`.

## VERIFIED BY.

- 수정 전 재현 테스트. `Tests 7 failed | 33 passed (40)`.
- `npm run lint`. 종료 코드 0.
- `npm run test`. `Test Files 153 passed (153)`, `Tests 2069 passed (2069)`.
- `npx tsc --noEmit`. 종료 코드 0.
- `npm run build`. 종료 코드 0, 정적 페이지 36/36 생성 완료.
- 격리된 로컬 program_restore_qa의 `npm run test:integration`. `Test Files 7 passed (7)`, `Tests 59 passed (59)`.
- 실제 로그인 컴포넌트의 로컬 브라우저 검증. 첫 요청 뒤 이름 필수 입력란·자동 포커스 확인, 이름 입력 뒤 두 번째 요청에 name 포함 및 /onboarding 이동 확인.

## DEVIATIONS.

첫 빌드는 동시에 실행한 DB 통합 테스트가 Windows Prisma 엔진 DLL을 사용하여 EPERM으로 중단됐다. DB 테스트 종료 후 빌드를 순차 재실행하여 통과했다. 스키마 변경과 운영 데이터 일괄 수정은 필요하지 않다.

## RISKS.

실제 운영 초대코드를 소비하는 가입 검증은 수행하지 않았다. 계정 생성·코드 사용·기존 계정 이름 보완은 격리 PostgreSQL에서 검증했다.

## QUESTIONS.

없음.
