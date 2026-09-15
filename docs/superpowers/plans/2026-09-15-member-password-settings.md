---
title: '사용자 정보에서 회원 비밀번호 설정과 변경'
type: feature
created: '2026-09-15'
status: done
baseline_commit: bd96476cb8e73dfff6162a18d12ab1f6ff140e49
context: ['AGENTS.md']
---

<frozen-after-approval reason="사용자가 요청한 비밀번호 변경 기능">

## Intent

**Problem:** 사용자 정보 페이지에 비밀번호 변경이 없다. 초대코드로 가입한 멘티는 알 수 없는 임의 비밀번호로 생성되어 현재 비밀번호를 요구하는 API를 사용할 수 없다.

**Approach:** 본인 사용자 정보 페이지에 비밀번호 변경 폼을 추가한다. 일반 회원은 현재 비밀번호, 초대가 연결된 멘티는 현재 비밀번호 또는 본인의 유효한 초대코드로 재확인한다. 초대코드는 이용 가능한 동안 비밀번호 재설정 수단이며 최초 설정 여부를 추정하지 않는다.

## Boundaries & Constraints

**Always:** 본인 계정만 수정한다. 기존 비밀번호 변경 API·온보딩·관리자 본인 변경과 초대코드 로그인을 유지한다. 최소 8자와 확인값 일치를 검증하고 저장 후 다른 세션을 무효화하면서 현재 세션은 갱신한다. 입력값을 로그·응답에 노출하지 않는다.

**Ask First:** 관리자에 의한 다른 회원 비밀번호 재설정, 기존 초대 로그인 폐지, 데이터 모델 변경이 필요하면 범위를 확인한다.

**Never:** 운영 데이터로 쓰기 검증하지 않는다. 원본 .env를 복사하지 않는다. Codex 앱과 내장 브라우저 탭을 자동으로 종료하지 않는다.

## I/O & Edge-Case Matrix

| 상황 | 입력·상태 | 결과 | 실패 처리 |
| --- | --- | --- | --- |
| 일반 변경. | 현재 비번과 새 비번·확인 일치. | 본인 해시 변경·현재 쿠키 갱신. | 현재 비번 불일치는 400. |
| 초대 가입 멘티. | 연결된 유효 코드와 새 비번·확인. | 새 비번 로그인과 기존 코드 로그인 가능. | 틀린·타인·미사용·기간 만료 코드는 거절. |
| 잘못된 입력. | 짧은 비번·확인 불일치·확인수단 없음. | 변경 없음. | 명확한 입력 오류. |
| 접근·경합. | 미인증·폐기 세션·동시 변경. | 인증된 본인·검증한 버전만 변경. | 실패 시 쿠키 발급 없음. |

</frozen-after-approval>

## Code Map

- `app/profile/page.tsx`. 사용자 정보 수정과 별도의 비밀번호 폼을 조합한다.
- `components/member/PasswordChangeForm.tsx`. 확인수단과 새 비밀번호 입력·검증·결과를 표시한다.
- `app/api/me/profile/route.ts`. 본인 초대코드 확인수단 사용 가능 여부만 제공한다.
- `app/api/admin/password/route.ts`. 기존 본인 변경 엔드포인트를 확장한다.
- `lib/password-policy.ts`. 기존 변경 검증과 새 비밀번호 검증을 공유한다.
- `lib/invite-access.ts`, `lib/auth.ts`, `lib/rate-limit.ts`. 기존 만료·세션·시도 제한 계약을 재사용한다.

## Tasks & Acceptance

**Execution:**
- [x] 기존 API·화면을 대상으로 실패 회귀 테스트를 먼저 작성한다.
- [x] 비밀번호 정책·API·프로필 응답을 구현하고 코드 소유·만료·세션 경합을 검증한다.
- [x] 사용자 정보 페이지에 독립된 비밀번호 변경 폼을 추가하고 저장 중 중복 제출·성공·오류 상태를 검증한다.
- [x] 실제 로컬 DB에서 본인 설정 후 비밀번호/초대코드 로그인과 세션 갱신을 확인하고 브라우저에서 폼·확인 방식·필수 입력 오류를 검수한다.
- [x] 전체 테스트·타입·lint·빌드와 독립 코드 리뷰를 완료해 배포할 변경을 확정한다. 후속 푸시·운영 배포 결과는 별도 배포 확인서에 기록한다.

**Acceptance Criteria:**
- Given 로그인한 회원, when 사용자 정보를 열면, then 프로필 편집 내용과 독립된 비밀번호 폼을 사용할 수 있다.
- Given 초대 로그인으로 가입한 멘티, when 유효한 본인 코드로 새 비번을 저장하면, then 기존 사용자·초대·프로젝트 연결을 보존하며 두 로그인 수단이 작동한다.
- Given 비밀번호 변경 완료, when 다른 기기의 이전 쿠키로 접근하면, then 거절하고 현재 사용자는 로그인 상태를 유지한다.

## Spec Change Log

- 2026-09-16. 프로그램 종료일 변경과 현재 비밀번호 저장의 경합을 실제 관리자 PATCH로 재현했다. 두 확인 방식 모두 계정·초대·프로그램 이용 기한 스냅샷이 유지될 때만 갱신하도록 보완했다. 스키마나 프로그램 수정 API는 변경하지 않았다.
- 2026-09-16. 브라우저 검수는 화면과 필수 입력 오류까지 수행했다. 새 인증정보 입력을 사용자에게 맡기도록 하는 브라우저 도구 정책에 따라 비밀번호 저장·재로그인·쿠키 검증은 격리 PostgreSQL의 실제 API와 DOM 테스트에서 수행했다. 운영 회원 데이터로 쓰기 검증하지 않았다.

## Design Notes

`usedInviteCode`는 비밀번호 가입에도 연결될 수 있어 비번 설정 여부로 사용하지 않는다. 프로필 응답은 확인수단 사용 가능 여부만 반환한다. 검증한 해시·서명된 세션 버전을 조건으로 갱신하여 동시 변경이 서로 덮어쓰지 못하게 한다.

## Verification

- `npm test`. 기존·신규 단위/DOM 회귀 전체 통과.
- `npx tsc --noEmit`, `npm run lint`, `npm run build`. 오류 없음.
- `npm run test:integration -- --no-file-parallelism`. 명시한 격리 로컬 DB에서 로그인·쿠키·자료 보존 확인.
- 실제 브라우저. 멘티·멘토의 본인 비밀번호 폼, 확인 방식 전환, 필수 입력 오류, 작성 중 회원정보 보존 확인. 성공 결과와 입력 초기화는 DOM 테스트로 검증했다. 탭 자동 닫기 금지.

2026-09-16 주 작업자 최종 검증은 단위/DOM 164개 파일 2,278개 테스트, 통합 11개 파일 101개 테스트, lint·타입·운영 빌드 모두 통과했다. 상세 근거는 [최종 검증 보고서](../reports/2026-09-15-member-password-settings/final-verification.md)에 기록했다.

## Suggested Review Order

1. [비밀번호 API](../../../app/api/admin/password/route.ts). 본인 확인, 이용 기한, 조건부 갱신과 세션 재발급을 확인한다.
2. [프로필 응답](../../../app/api/me/profile/route.ts)과 [새 비밀번호 정책](../../../lib/password-policy.ts). 비밀값 비노출과 기존 정책 호환을 확인한다.
3. [비밀번호 폼](../../../components/member/PasswordChangeForm.tsx)과 [사용자 정보 페이지](../../../app/profile/page.tsx). 독립 저장과 확인 수단 안내를 확인한다.
4. [실DB 통합 테스트](../../../tests/integration/password-settings.integration.test.ts)와 [검증 보고서](../reports/2026-09-15-member-password-settings/final-verification.md). 자료 보존·로그인·경합의 실제 결과를 확인한다.
