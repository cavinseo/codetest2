---
title: 'Kano 응답자별 선택·전체 삭제'
type: 'feature'
created: '2026-10-14'
status: 'done'
baseline_commit: 'a6fe4260845f54ea73f7aace36971f3d1ea6048b'
context: []
---

<frozen-after-approval reason="사용자의 응답자별 삭제 기능 추가 지시로 확정한 범위">

## Intent

‘응답자별 보기’에서 멘토와 멘티 모두 선택한 응답자 일부 또는 전체의 설문 응답을 삭제할 수 있어야 한다. 현재는 조회 표만 있고 멘티에게는 해당 화면의 진입점도 숨겨져 있다. 각 응답자 행에 선택 체크박스를 두고 선택 삭제 및 전체 삭제를 제공하며, 실제 삭제 요청 직전에 확인창으로 대상 수와 복구 불가를 안내한다.

## Boundaries & Constraints

항상 현재 프로젝트 편집 권한을 서버에서 검사한다. 배정 멘토 및 소유 멘티에게 허용하고 조회 전용 사용자나 미배정 멘토에게 쓰기를 허용하지 않는다. 멘티에게 응답자 조회·삭제만 열고 기존 TIMKO 및 가중치 편집 권한은 유지한다. 기존 사용자 변경을 보존하고 현재 프로젝트의 응답만 삭제한다. 삭제 단위는 화면에서 이메일로 묶인 응답자 한 명의 모든 문항이다. 삭제된 응답자의 초대 내역은 유지하며 응답 완료 상태를 초기화하는 기존 응답 리셋 계약을 따른다. 운영 데이터 삭제나 실제 응답 제출로 시험하지 않는다. 배포·커밋·push·스키마 변경은 이번 구현 범위에 포함하지 않는다.

| 상황 | 입력 또는 상태 | 기대 결과 |
|---|---|---|
| 일부 삭제 | 현재 목록의 선택한 응답자 이메일 배열 | 해당 프로젝트의 선택 응답만 삭제하고 해당 초대의 완료 상태만 초기화한다. |
| 전체 삭제 | 전체 삭제 버튼 확인 또는 기존 본문 없는 DELETE | 현재 프로젝트 응답을 모두 삭제하고 기존 초대 내역은 유지한다. |
| 확인 취소 | 일부·전체 삭제 확인창 취소 | DELETE 요청과 화면 데이터 변경이 없다. |
| 빈 선택·잘못된 본문 | 빈 이메일 배열, 잘못된 JSON 또는 모호한 payload | HTTP 400이며 DB 작업이 없다. 빈 선택 버튼은 비활성이다. |
| 권한 없음 | 미로그인, 조회 전용, 미배정 멘토 | 기존 401/403을 전달하고 DB 작업이 없다. |
| 삭제 실패·대기 | API 오류 또는 지연 | 오류 표시 및 응답 목록 보존, 대기 중 중복 삭제와 선택 조작 차단한다. |
| 삭제 성공 | 일부 또는 전체 삭제 완료 | 목록·응답 수·현재 열람 가능한 분석과 초대 상태를 다시 읽는다. |

</frozen-after-approval>

## Code Map

- `components/project/KanoManager.tsx`가 데이터 로드·프로젝트 전환·응답 리셋과 화면 진입점을 담당한다.
- `components/project/KanoAnalysisTab.tsx`에서 현재 응답자 표와 멘토 분석을 함께 표시한다.
- `components/project/KanoRespondentTable.tsx`가 이메일별 응답 행을 렌더링한다.
- `app/api/projects/[id]/kano/responses/route.ts`에서 프로젝트 응답 조회 및 전체 리셋 DELETE를 제공한다.
- `lib/kano-response-reset.ts`가 트랜잭션 클라이언트로 응답 삭제와 초대 상태 갱신을 수행한다.
- `lib/authorization.ts`는 실제 배정 멘토를 EDITOR로, 소유 멘티를 OWNER로 판정한다.
- `tests/kano-analysis-visibility.test.ts`의 기존 멘티 분석 비노출 단언 중 응답자 진입점 부분만 새 계약에 맞춘다.

## Tasks & Acceptance

- [x] `lib/kano-response-reset.ts` 및 응답 API에 선택 이메일 필터와 엄격한 본문 검증, 조회의 삭제 가능 여부를 추가한다. 기존 본문 없는 전체 리셋 및 초대까지 리셋하는 호출은 유지한다.
- [x] `KanoRespondentTable.tsx`에 행 선택·전체 선택·선택 삭제·전체 삭제를 추가하고 읽기 전용·빈 목록·처리 중 상태를 처리한다.
- [x] `KanoManager.tsx` 및 `KanoAnalysisTab.tsx`에 분석 권한과 독립적인 응답자 관리 진입점 및 삭제 callback을 연결한다. 삭제 완료 후 관련 데이터를 재조회한다.
- [x] API·저장 계층·컴포넌트 테스트로 위 입력 행렬, 멘토·멘티 권한, 다른 프로젝트 보존, 중복 요청 방지와 실패 후 재시도를 검증한다.
- [x] 관련 테스트 및 전체 lint·test·build를 주 작업자가 직접 실행하고 변경 범위를 독립 검토한다.

Given 소유 멘티 또는 배정 멘토가 프로젝트에 접근하면, when ‘응답자별 보기’를 열면, then 선택 및 전체 삭제 기능을 사용할 수 있다. Given 멘티의 분석 권한이 없으면, when 응답자 목록을 열어 삭제하면, then TIMKO 상세 조회나 가중치 편집 권한이 추가되지 않는다. Given 서로 다른 프로젝트에 같은 이메일 응답이 있으면, when 현재 프로젝트에서 삭제하면, then 다른 프로젝트 데이터는 삭제 조건에서 제외된다.

## Spec Change Log

- 초기 읽기 전용 검토에서 프로젝트 A의 지연 조회나 삭제 완료가 프로젝트 B의 목록을 덮을 수 있음을 확인했다. 응답 목록·삭제 권한·선택을 projectId에 묶고 조회 세대 및 삭제 완료 시 현재 프로젝트를 검사한다. 동일 이메일이 두 프로젝트에 존재하는 지연 A→B 테스트를 포함한다. 기존 멘토 분석 권한과 편집 중인 질문 보존은 유지한다.
- 독립 리뷰에서 기존 업로드가 응답자 이름을 respondentEmail 필드에 저장하는 계약을 확인했다. 삭제 시 이메일 형식 대신 비어 있지 않은 원래 식별 문자열을 검증하며 이름·대문자 키·프로젝트 범위를 함께 테스트한다. 삭제 대기 중 동일 프로젝트 내부 탭 이동을 잠가 실패 안내와 선택을 보존한다. 기존 초대 전체 리셋 성공 직후 초대 목록을 비우는 처리도 유지하여 재조회 실패에 삭제된 초대가 남지 않도록 한다.
- 탭 이동 잠금은 현재 프로젝트에서 진행 중인 삭제에만 적용한다. A 삭제 대기 중 B로 전환한 사용자는 B의 화면을 계속 이동할 수 있으며, 실제 삭제 조작은 공통 잠금으로 직렬화한다. 멘토·멘티 각각에서 B의 이동과 A 완료 후 B 데이터 보존을 검사한다.

## Verification

새 테스트를 먼저 실패시켜 누락 기능을 확인하고 구현 후 통과시킨다. Prisma와 메일은 mock하고 서버나 원격 DB 쓰기는 실행하지 않는다. 주 작업자는 관련 테스트, `npm run lint`, `npm run test`, `npm run build`를 직접 확인한다. 구현 파일이 mutation 대상 목록에 없으므로 기존 mutation 계약에 영향이 없다.


## Suggested Review Order

- 선택과 전체 삭제가 확인창 및 처리 중 잠금을 거치는 진입점이다.
  [KanoRespondentTable.tsx:35](../../../components/project/KanoRespondentTable.tsx#L35)

- 현재 프로젝트의 삭제 요청과 성공 후 관련 데이터 재조회를 연결한다.
  [KanoManager.tsx:468](../../../components/project/KanoManager.tsx#L468)

- 실제 프로젝트 권한 및 선택 삭제의 엄격한 본문 경계를 확인한다.
  [route.ts:58](../../../app/api/projects/[id]/kano/responses/route.ts#L58)

- 응답과 초대 상태에 현재 프로젝트 및 선택 식별키 필터를 적용한다.
  [kano-response-reset.ts:14](../../../lib/kano-response-reset.ts#L14)

- 이름 및 대문자 응답자를 포함한 삭제 범위 회귀 검사를 확인한다.
  [api-kano-response-delete.test.ts:87](../../../tests/api-kano-response-delete.test.ts#L87)

- 확인·취소·실패·탭 잠금과 지연 프로젝트 전환을 검증한다.
  [kano-respondent-delete.test.ts:183](../../../tests/kano-respondent-delete.test.ts#L183)
