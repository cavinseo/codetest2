---
title: 'Kano 미응답 초대 개별 삭제'
type: 'feature'
created: '2026-10-15'
status: 'done'
baseline_commit: '8912af7d02e94642ae1e98db3c47beee18ba21ee'
baseline_digest: '847c04c6a8ca36a63b5f5bb34f4de952136ef7e436d8d8d284dbd6060378dc07'
context: ['AGENTS.md', 'CLAUDE.md']
---

<frozen-after-approval reason="사용자의 기능 추가 지시와 미응답 초대만 삭제한다는 선택으로 확정한 범위">

## Intent

Kano 응답자 초대에서 잘못 보낸 기록을 개별 삭제할 수 있어야 한다. 사용자가 ‘응답 대기 중인 초대만 삭제하고, 접수 응답은 보호’를 선택했다. 초대 행에 삭제 버튼과 확인창을 제공하고 성공 후 목록을 갱신한다.

## Boundaries & Constraints

현재 프로젝트의 소유 멘티·배정 멘토 등 기존 쓰기 권한을 검사한다. 완료 표시 또는 실제 연결 응답이 있으면 삭제하지 않는다. 확인창에는 대상 이메일과 기존 링크 무효화를 알린다. 이미 보낸 메일의 회수 기능은 아니다. 기존 응답 삭제·전체 초대 리셋과 분석 권한을 유지한다. 스키마·인증 계약·패키지 변경, 원격 DB 스크립트, 개발 서버 기동은 금지한다. 다른 사용자 변경을 보존한다.

## I/O & Edge-Case Matrix

| 상황 | 입력 또는 상태 | 결과 |
| --- | --- | --- |
| 개별 삭제. | 현재 프로젝트의 미응답 초대 ID. | 해당 초대만 삭제하고 링크가 무효화된다. |
| 응답 보호. | 완료 표시 또는 연결 응답 있음. | 버튼 비활성, API 409, 응답 보존. |
| 잘못된 요청. | 빈 본문·잘못된 JSON·빈 ID·추가 필드. | 400, 전체 삭제로 해석하지 않는다. |
| 대상 없음. | 다른 프로젝트 ID·없는 ID·재삭제. | 404, 데이터 변경 없음. |
| 권한 없음. | 미로그인·조회 전용·미배정 멘토. | 기존 401/403, 데이터 변경 없음. |
| 상태 경쟁. | 조회 후 응답 제출 또는 FK 충돌. | 조건부 삭제·409로 응답을 보호한다. |
| 확인 취소. | 표준 확인창 취소. | 요청·목록 변경 없음. |
| 실패·전환. | API 오류·지연·프로젝트 변경. | 오류 시 목록 보존, 중복 요청 및 다른 프로젝트 덮어쓰기 방지. |

</frozen-after-approval>

## Code Map

- `app/api/projects/[id]/kano/invitations/route.ts`의 GET에 실제 응답 기반 삭제 가능 여부를 추가하고 DELETE를 구현한다.
- `components/project/KanoManager.tsx`의 초대 목록·조회·공통 삭제 잠금을 사용한다.
- `app/api/survey/[token]/submit/route.ts`는 초대를 먼저 선점하는 트랜잭션 계약이며 변경하지 않는다.
- `lib/authorization.ts`와 Prisma의 필수 초대 FK를 유지한다.

## Tasks & Acceptance

- [x] 초대 GET에 `_count.responses`와 초대별 `canDelete`를 추가한다. DELETE는 엄격한 `{ invitationId }`, 프로젝트 범위와 쓰기 권한, 삭제 시점의 `respondedAt: null` 및 `responses: none`을 검사한다. 0건 또는 P2003은 409다.
- [x] 초대 행에 대상 이메일을 포함하는 접근 가능한 삭제 버튼을 추가한다. 접수된 초대는 비활성 이유를 알린다. 공통 삭제 잠금·프로젝트 guard를 공유하고 성공한 대상만 먼저 제거한 뒤 재조회한다.
- [x] 초대 목록의 현재 프로젝트 조회 여부를 추적해 이전 프로젝트 행으로 삭제를 요청하지 못하게 한다.
- [x] API·UI 테스트를 먼저 실패시키고 구현 후 통과시킨다. 권한, 연결 응답, 경쟁, 취소, 실패, 중복 및 프로젝트 전환을 포함한다.
- [x] 주 작업자가 변경 범위와 회귀 테스트를 독립 검토하고 전체 lint·test·build를 실행한다.

Given 미응답 초대가 있으면, when 편집 권한자가 삭제를 확인하면, then 그 초대만 사라지고 다른 초대·응답은 보존된다. Given 연결 응답이 있으면, when 완료 표시가 없어도 삭제를 요청하면, then 삭제를 거절한다. Given 프로젝트가 바뀌면, when 이전 삭제 요청이 늦게 끝나면, then 새 프로젝트의 목록과 화면을 덮지 않는다.

## Spec Change Log

- 읽기 전용 검토에서 Forms 응답은 완료 표시 없이 연결될 수 있음을 확인했다. 실제 연결 응답 수를 GET·DELETE 보호 조건에 포함한다. UI 상태 문구 전면 수정은 범위 밖이다.

## Verification

Prisma·메일은 모의하며 실 DB에 쓰는 스크립트를 실행하지 않는다. 관련 Vitest, `npm run lint`, `npm run test`, `npm run build`를 실행한다. 수정 파일은 기존 mutation 대상 목록과 대조한다. 실제 화면 검증은 주 작업자가 담당하며 운영 시험이 필요하면 승인된 검증 프로젝트의 테스트 초대만 사용한다.

주 작업자가 격리된 운영 기준 소스에서 lint·전체 241파일/3,398검사·build를 통과시켰다. 제품 2파일을 이전 구현으로 되돌린 역검증에서 신규 검사는 46실패/1통과했으며 최종 소스를 동일 SHA로 복원했다. 원래 작업폴더는 기존 기능을 보존해 통합했고 관련 205검사 및 루트의 57검사를 통과했다. 모의 메모리 화면에서 취소 시 요청 없음, 확인 시 대기 초대 1개 삭제, 접수 응답 4개 보존을 확인했다. 운영 배포와 실제 확인창 검증의 범위는 결과 보고서에 별도로 기록한다.

## Suggested Review Order

**응답 보호와 권한.**

- 쓰기 권한과 프로젝트 범위를 먼저 검사해 잘못된 초대를 삭제하지 않는다.
  [route.ts:53](../../../app/api/projects/[id]/kano/invitations/route.ts#L53)
- 삭제 시점에도 미응답 조건을 검사해 동시 제출된 답변을 보호한다.
  [route.ts:80](../../../app/api/projects/[id]/kano/invitations/route.ts#L80)

**확인창과 화면 상태.**

- 대상 이메일과 링크 무효화를 확인하고 성공한 행만 제거한다.
  [KanoManager.tsx:504](../../../components/project/KanoManager.tsx#L504)
- 접수 응답이 있는 행은 삭제 버튼과 이유를 함께 표시한다.
  [KanoManager.tsx:1259](../../../components/project/KanoManager.tsx#L1259)

**회귀 검증.**

- 잘못된 요청, 권한, 응답 연결, 경쟁 조건을 검증한다.
  [api-kano-invitation-delete.test.ts:61](../../../tests/api-kano-invitation-delete.test.ts#L61)
- 취소·성공·실패·프로젝트 전환에서 목록과 요청을 검증한다.
  [kano-invitation-delete.test.ts:108](../../../tests/kano-invitation-delete.test.ts#L108)
