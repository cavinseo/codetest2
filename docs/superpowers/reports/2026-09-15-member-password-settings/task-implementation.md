# 회원 본인 비밀번호 설정·변경 구현 보고.

## RESULT

구현 담당의 소유 범위 작업을 완료했다. `/profile`에 회원정보 저장과 독립된 비밀번호 설정·변경 폼을 추가했다. 일반 회원은 현재 비밀번호로 확인하고, 유효한 초대 연결이 있는 멘티는 초대 코드 확인을 기본으로 선택하되 현재 비밀번호 확인으로 전환할 수 있다. 최초 설정 여부를 추정하지 않는다.

기존 `POST /api/admin/password` body 호환을 유지하며 `verificationMethod`와 `inviteCode`를 확장했다. 새 비밀번호 정책을 분리했고, 서명된 세션 버전·검증한 해시·승인 상태에 대한 조건부 갱신으로 동시 변경을 제한한다. 초대 방식의 조건에는 본인 연결·이메일·역할·프로그램·이용 기한 스냅샷도 포함한다. 성공한 요청만 자신이 갱신한 버전의 쿠키를 발급한다.

`GET /api/me/profile`에는 `canVerifyPasswordWithInviteCode` 불리언만 추가한다. 초대 코드 원문과 비밀번호 해시를 조회 응답에 포함하지 않으며, 비밀번호 변경 DB 예외 원문도 로그에 남기지 않는다. 초대 코드 로그인과 이용 기간 내 재설정 기능을 유지한다.

## FILES CHANGED

- `app/api/admin/password/route.ts`. 본인 확인 방식, 계정/IP 시도 제한, 세션 재확인, 조건부 갱신 및 안전한 오류 기록을 구현했다.
- `app/api/me/profile/route.ts`. 유효한 본인 초대코드 확인 가능 여부만 응답한다.
- `lib/password-policy.ts`. 새 비밀번호 검증을 분리하고 기존 변경 오류 순서를 보존했다.
- `components/member/PasswordChangeForm.tsx`. 확인 방식 선택, 독립 저장, 중복 제출 방지, 접근성 레이블·결과 안내 및 성공 시 비밀 입력 초기화를 구현했다.
- `app/profile/page.tsx`. 프로필 응답의 확인 가능 여부를 전달하고 회원정보 수정 아래에 폼을 배치했다.
- `tests/api-password-settings.test.ts`. 소유권·만료·세션·경합·혼합 입력·시도 제한·오류 비밀값 비노출을 검증했다.
- `tests/password-change-form.test.ts`, `tests/profile-password-settings.test.ts`. 확인 방식, 오류·성공, 중복 제출 및 회원정보/비밀번호 간 입력 보존을 DOM으로 검증했다.
- `tests/api-admin-password.test.ts`, `tests/api-onboarding-gate.test.ts`. 조건부 갱신으로 변경된 DB 모의 객체를 보정하고 기존 본인 변경·온보딩 검증을 유지했다.
- `tests/api-me-profile.test.ts`, `tests/password-policy.test.ts`. boolean 응답과 정책 분리 회귀를 추가했다.

## COMMIT

구현 및 소유 테스트 커밋은 `3f75112878994d3930c3ebfd8804dc03d4ff5b60`이며 제목은 `feat: add self-service member password settings`이다. 이 보고서는 별도 문서 커밋으로 기록한다. 다른 담당자의 통합 테스트 커밋 `d0575b2` 이후 소유 파일 12개만 스테이징했다.

## VERIFIED BY

모든 구현 담당 테스트 실행에 아래 환경변수를 명시했으며 DB는 모의 객체로 처리했다.

```text
POSTGRES_PRISMA_URL=postgresql://unused@127.0.0.1:1/unused
POSTGRES_URL_NON_POOLING=postgresql://unused@127.0.0.1:1/unused
SESSION_SECRET=test-only-long-enough-session-secret
```

RED는 제품 코드를 변경하기 전에 실행했다.

```text
npx vitest run --pool=threads tests/api-password-settings.test.ts tests/password-change-form.test.ts tests/password-policy.test.ts tests/api-me-profile.test.ts
Test Files  4 failed (4)
Tests       32 failed | 39 passed (71)
```

초대 확인 미지원, 세션/CAS 미보호, profile boolean 미구현, 새 비밀번호 정책 함수 미구현으로 실패했다. 폼 테스트는 신규 컴포넌트가 아직 없어 import 단계에서 실패했다. 별도 주 작업자가 보존한 API RED 로그는 `temp_files/password-api-root-red.log`이다.

구현 후 대상 GREEN 결과는 다음과 같다.

```text
npx vitest run --pool=threads tests/api-password-settings.test.ts tests/password-change-form.test.ts tests/password-policy.test.ts tests/api-me-profile.test.ts tests/api-admin-password.test.ts
Test Files  5 passed (5)
Tests       82 passed (82)
```

전체 테스트 첫 실행에서 기존 온보딩 픽스처에 `updateMany` 모의 객체가 없어 1건이 500으로 실패했다. API의 인증 게이트나 테스트 기대 결과를 바꾸지 않고 해당 모의 객체와 성공 반환값만 보정했다. 프로필 화면의 독립 저장 DOM 2건을 포함한 최종 결과는 다음과 같다.

```text
npx vitest run --pool=threads
Test Files  164 passed (164)
Tests       2275 passed (2275)
npx tsc --noEmit
exit 0
npm run lint
exit 0
npm run check:encoding
한글 인코딩 검사 통과.
git diff --check
exit 0
```

Vite 설정의 차기 기본 로더 관련 기존 경고만 출력되었다. 구현 담당의 타입·lint 검사에는 생성 임시 파일에 의한 실패가 없었다.

## DEVIATIONS

기존 온보딩 회귀 테스트가 `update`만 모의 처리하므로 소유 범위의 평면 테스트 `tests/api-onboarding-gate.test.ts`를 추가 보정했다. 기존 호출·현재 비밀번호 확인·미완료 온보딩 통과 기대 결과는 유지했다.

작업 계획의 실제 DB·브라우저·프로덕션 빌드 검증은 주 작업자와 별도 통합 테스트 담당자가 맡는다. 구현 담당은 명시된 역할 분담에 따라 이를 실행하지 않았다. 원본 `.env`를 읽거나 복사하지 않았고, 스키마·로그인 경로·타인 계정 비밀번호 변경 기능을 수정하지 않았다.

## RISKS

기존 시도 제한 저장소는 프로세스 메모리이므로 다중 인스턴스 전체를 아우르는 제한은 아니다. 이번 변경은 기존 `LOGIN_RATE_LIMIT`과 계정/IP 키를 재사용한다.

이 보고서의 결과는 모의 객체·DOM·정적 검사에 관한 것이다. 실제 데이터 보존·동시 요청·브라우저 결과는 주 작업자의 독립 검증 결과와 합쳐 최종 판정해야 한다. 구현 담당은 실DB 쓰기·개발서버·브라우저·프로세스 중지·푸시·배포를 실행하지 않았다.

## QUESTIONS

없음.
