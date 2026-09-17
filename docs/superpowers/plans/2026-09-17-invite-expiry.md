---
title: 초대 발행 시 이용 기한 지정과 목록에서 기한 연장
type: feature
created: 2026-09-17
status: done
baseline_commit: 4b302b0
context: [AGENTS.md]
---

<frozen-after-approval reason="사용자의 기능 요청과 기한 적용 범위 답변">

## Intent

**Problem:** 초대관리의 기한은 수정할 수 없고, 신규 발급 시 종료 날짜를 지정할 수 없다.

**Approach:** 신규 발급 시 이용 기한 날짜를 필수로 입력하고, 목록의 날짜를 누르면 연장할 수 있게 한다. 사용자가 선택한 정책에 따라 신규 날짜는 최초 가입과 이후 로그인 모두에 적용한다.

## Boundaries & Constraints

**Always:** 관리자 및 담당 프로그램 매니저만 변경한다. 한국 시간의 선택 날짜 23:59:59.999까지 허용하며 프로그램 종료 시각을 넘지 않는다. 기존 발급 코드의 조건과 데이터는 보존한다. 이미 사용된 코드는 연결된 멘티의 실제 이용 기한도 갱신한다.

**Ask First:** 프로그램 자체의 종료일 변경, 운영 DB 적용 및 배포는 이번 로컬 구현 범위 밖이다.

**Never:** 코드 재생성, 자동 메일 재발송, 계정·프로젝트 삭제, 권한 변경, 기존 코드 일괄 소급 변경을 하지 않는다.

## I/O & Edge-Case Matrix

| 상태 | 기대 동작 |
| --- | --- |
| 신규 발행의 날짜 누락·잘못된 날짜·과거 날짜 | 발행을 차단하고 입력 오류를 표시한다. |
| 프로그램 종료일 이후 날짜 | 저장하지 않고 종료일 제한을 안내한다. 종료일과 같은 날짜는 정확한 프로그램 종료 시각까지만 허용한다. |
| 유효한 날짜로 다중 발행 | 모든 대상의 개별 코드에 동일한 가입·로그인 기한을 저장한다. |
| 미사용 또는 만료 코드 연장 | 같은 코드를 유지하고 지정 기한까지 최초 가입과 로그인을 허용한다. |
| 이미 사용된 코드 연장 | 연결된 멘티의 이용 기한까지 같은 트랜잭션에서 갱신한다. |
| 현재보다 짧거나 같은 만료 시각 | 연장 요청을 거절한다. |
| 만료 코드와 같은 이메일의 유효 코드 또는 기존 별도 계정 | 재활성화를 거절하여 중복 연결을 방지한다. |
| 담당이 아닌 매니저·멘토·멘티·미로그인 | 변경을 거절하며 데이터가 바뀌지 않는다. |
| 저장 실패 또는 취소 | 원래 날짜를 유지한다. 실패 시 입력값과 오류를 보여준다. |

</frozen-after-approval>

## Code Map

- `components/admin/InvitesTab.tsx`, `lib/invite-batch.ts` — 필수 날짜 및 목록 편집, 다중 발행 요청.
- `app/api/invites/route.ts` — 발행 검증, 연장 트랜잭션, 목록 반환.
- `prisma/schema.prisma`, `prisma/migrations/20260917000000_invite_access_expiry/migration.sql` — 기존 행은 null로 보존하는 명시적 이용 종료일.
- `lib/invite-expiry.ts`, `lib/invite-access.ts` — 날짜 입력 검증·표시 및 기존/신규 기한 계산.
- `app/api/auth/signup/route.ts`, `app/api/auth/invite-login/route.ts` — 가입 시 저장된 명시적 기한 사용.
- `lib/invite-code.ts`, `app/api/invites/[id]/send/route.ts` — 실제 이용 기한을 메일에 안내.

## Tasks & Acceptance

**Execution:**
- [x] 날짜 검증과 종료일 저장, 연장 API 및 인증 회귀 테스트를 구현한다.
- [x] 필수 날짜 입력과 목록 날짜 클릭·저장·취소, 실패·처리 중 상태를 구현하고 DOM 테스트한다.
- [x] 기존 발급 데이터를 유지하는 nullable 스키마 변경을 준비한다.
- [x] 독립 검토와 관련·전체 테스트, 타입 검사, 린트 및 빌드를 수행한다.

**Acceptance Criteria:**
- Given 발급 날짜가 비어 있을 때, when 발급을 시도하면, then 화면과 서버 모두 저장을 거절한다.
- Given 날짜를 선택해 발급했을 때, when 해당 코드로 가입하고 반복 로그인하면, then 첫 로그인 시점과 무관하게 지정된 날짜까지만 이용할 수 있다.
- Given 목록의 기존 초대가 있을 때, when 날짜를 클릭하고 더 늦은 날짜를 저장하면, then 코드와 기존 기록은 유지되며 목록 및 실제 이용 기한이 바뀐다.
- Given 저장이 실패할 때, when 오류 응답을 받으면, then 원래 날짜를 유지하고 재시도 가능한 입력과 오류를 표시한다.

## Design Notes

`InviteCode.accessExpiresAt`을 nullable로 추가한다. null인 기존 코드는 가입 후 저장된 회원 기한 또는 기존 기간 규칙을 유지한다. 신규 발급은 `expiresAt`과 `accessExpiresAt`에 같은 날짜를 저장하고, 최초 가입 시 회원 기한으로 복사한다. 이미 사용한 계정은 기존 관리자 연장을 보존하기 위해 회원의 저장된 기한이 우선한다.

연장은 발행과 같은 이메일 잠금 및 최초 가입과 같은 초대 행 잠금을 사용한다. 미사용 코드를 다시 활성화할 때 중복 코드·기존 회원을 확인한다. 실 DB에 연결한 개발 서버와 DB 쓰기는 수행하지 않는다.

## Verification

- 기준 상태의 초대 관련 5개 파일, 126개 테스트 통과.
- 관련 Vitest, `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`.
- 변경한 기존 뮤테이션 대상 `lib/invite-code.ts` 재검수.
- 운영 DB 마이그레이션과 실제 로그인 검증은 배포 시 수행해야 한다.

## Spec Change Log

- 2026-09-17. 사용자가 발행 시 입력한 날짜를 가입 및 이후 로그인 모두에 적용하도록 확정했다.
- 2026-09-17. 독립 검토에 따라 두 가입 경로에도 이메일 잠금을 적용했다. 기존 관리자 회원 연장에도 조회한 기한 비교 조건을 추가해 동시 연장이 새 기한을 덮어쓰지 않게 했다.
- 2026-09-17. 전체 168개 파일·2,405개 테스트, 린트, 빌드, 타입 검사를 통과했다. 테스트의 ES2018 정규식 플래그를 ES2017과 호환되게 수정한 뒤 관련 166개 테스트 및 타입 검사를 다시 통과했다.
- 2026-09-17. 실제 컴포넌트와 CSS를 가상 API 응답에 연결한 정적 검증 페이지에서 기한 누락 차단·신규 발행·만료 코드 연장·취소·밝은 테마 레이아웃을 실제 브라우저로 확인했다. 운영 DB나 메일을 사용하지 않았다.
- 2026-09-17. 변이 검사 결과는 98.63%(69 killed, 3 timeout, 1 survived)이다. 생존 항목은 변경하지 않은 기존 normalizeInviteCode의 trim 제거이며 뒤의 정규식과 동등하다. Windows taskkill 접근 거부로 프로세스 정리 단계의 종료 코드는 1이다. 범위 밖 코드나 테스트 기준을 변경하지 않았다.

## Suggested Review Order

- 신규 발행 시 기한 입력과 날짜 클릭 편집을 확인한다.
  [InvitesTab.tsx:232](../../../components/admin/InvitesTab.tsx#L232)
- 권한·중복·프로그램 기한을 검증하고 계정까지 원자적으로 연장한다.
  [route.ts:181](../../../app/api/invites/route.ts#L181)
- 기존 초대는 보존하고 새 고정 이용 기한을 계산한다.
  [invite-access.ts:13](../../../lib/invite-access.ts#L13)
- 운영 배포 전에 nullable 열 추가 마이그레이션을 적용해야 한다.
  [migration.sql:1](../../../prisma/migrations/20260917000000_invite_access_expiry/migration.sql#L1)
- 날짜와 권한·경합 조건의 API 테스트를 확인한다.
  [api-invite-expiry.test.ts:1](../../../tests/api-invite-expiry.test.ts#L1)
