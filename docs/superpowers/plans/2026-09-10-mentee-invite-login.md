---
title: 멘티 초대코드 로그인과 프로그램 연동 만료
type: feature
created: 2026-09-10
status: in-progress
baseline_commit: e876014
context: [AGENTS.md]
---

<frozen-after-approval reason="사용자가 확정한 초대 정책">

## Intent

**Problem:** 초대코드는 현재 14일 안에 회원가입할 때만 쓰이며, 로그인에 비밀번호가 필요하다. 회원의 90일 기한과 프로그램 종료가 연동되지 않는다.

**Approach:** 멘티별 코드와 이메일로 최초 계정 생성 및 반복 로그인을 제공한다. 최초 로그인 후 90일과 프로그램 종료 중 빠른 시점을 적용하며 재로그인으로 연장하지 않는다.

## Boundaries & Constraints

**Always:** 관리자·담당 프로그램 매니저만 멘티 코드를 발급한다. 발급 대상 이메일과 최초 계정을 연결한다. 멘티의 역할은 고정한다. 프로그램 종료 후에는 기존 로그인 세션도 막는다.

**Ask First:** 기존 회원의 이용기간 연장 또는 계정·프로젝트 삭제가 필요하면 별도 확인한다. 운영 DB 검증 정보 보관은 앞선 승인 요청이 대기 중이다.

**Never:** 공통 코드, 멘토·매니저·관리자 코드 로그인, 이메일만으로 기존 타 계정 연결을 허용하지 않는다. 원본 운영 데이터를 테스트에 사용하지 않는다.

## I/O & Edge-Case Matrix

| 상태 | 결과 |
| --- | --- |
| 유효한 미사용 코드 + 발급 이메일 | 멘티 계정과 코드 연결을 원자적으로 생성, 첫 사용 시각과 만료 확정, 세션 발급. |
| 같은 코드 + 같은 계정 재로그인 | 같은 계정·같은 만료 시각 사용. |
| 다른 이메일·다른 역할·변경된 프로그램 배정 | 로그인 거절, 계정 변경 없음. |
| 90일 또는 프로그램 종료 시각 도달 | 코드 로그인 및 기존 세션 접근 거절. |
| 동일 이메일에 유효 코드 존재 | 중복 발급 거절. |
| 종료된 프로그램 | 발급 및 사용 거절, 목록에 만료 표시. |
| 최초 사용 동시 요청 | 계정 중복·코드 이중 연결 없음. |

</frozen-after-approval>

## Code Map

- `lib/invite-code.ts`, `lib/member-roles.ts` — 기존 일회성 가입 코드와 기간 계산.
- `app/api/invites/route.ts`, `components/admin/InvitesTab.tsx` — 코드 발급·관리.
- `app/api/auth/signup/route.ts`, `app/api/auth/login/route.ts`, `app/api/auth/google/login/callback/route.ts`, `lib/auth.ts` — 가입·로그인·매 요청 인가.
- `app/login/page.tsx` — 멘티 코드 로그인 선택.

## Tasks & Acceptance

- [ ] 만료 계산과 이메일·계정 연결 검증을 순수 함수 및 테스트로 정의한다.
- [ ] 발급 API·메일·관리 UI를 재사용 가능한 멘티 코드와 프로그램 만료 기준으로 바꾼다.
- [ ] 코드 로그인 API와 로그인 화면을 구현하고, 기존 가입 및 인증 경로의 만료 확인을 일치시킨다.
- [ ] API·실제 PostgreSQL 동시 요청·브라우저·전체 회귀를 검증한다.

**Acceptance Criteria:**

- Given 멘티 코드만 있을 때, when 이메일과 코드로 로그인하면, then 비밀번호 설정 없이 세션을 얻고 미완성 프로필은 기존 작성 화면으로 이동한다.
- Given 로그인된 멘티가 있을 때, when 프로그램이 종료되면, then 다음 보호 API 요청부터 거절된다.
- Given 비초대 관리자·매니저·멘토 계정일 때, when 기존 방식으로 로그인하면, then 기존 권한과 온보딩을 유지한다.

## Design Notes

기존 `usedAt`, `usedById`, `accessExpiresAt`, 프로그램 종료일로 최초 사용과 기한을 판정한다. 기존 사용된 코드는 과거 14일 값이 가입 기한이었으므로 회원 기한·최초 사용+90일·프로그램 종료로 실제 만료를 계산한다. 신규 미사용 코드는 프로그램 종료까지 최초 사용 가능하다. 기존 미사용 코드의 발급 기한은 유지한다. 개인정보·프로젝트 이력은 만료로 삭제하지 않는다. 실제 접근 판정은 매 요청 수행해 별도 예약 작업의 실행 지연에 의존하지 않는다.

## Verification

- 관련 Vitest 및 격리 PostgreSQL 통합 검사.
- `npx tsc --noEmit`, `npm test`, `npm run lint`, `npm run build`.
- 변경한 기존 뮤테이션 대상은 Stryker 재검수.

## Spec Change Log
