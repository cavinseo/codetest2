---
title: '작성 중 사업계획 파일 업로드'
type: 'feature'
created: '2026-07-31'
status: 'done'
baseline_commit: 'e2fa5563852f6f1884cecd8afc2a6f0e75c464a1'
context:
  - 'AGENTS.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 신규 생성 때와 달리 `IN_PROGRESS` 프로젝트의 개요 화면은 파일명·경로 문자열만 받으므로 실제 사업계획 파일을 추가하거나 교체할 수 없다. 저장된 Data URL도 그대로 노출된다.

**Approach:** 개요 수정 영역에 파일 선택 UI를 제공한다. 기존 `Project.businessPlanFile` 필드에 파일명과 Data URL을 함께 저장하고 raw Data URL도 호환한다.

## Boundaries & Constraints

**Always:** PDF, DOC, DOCX, TXT와 10MB 이하만 허용한다. 저장 전 기존 첨부를 유지하고 취소 시 선택 파일만 폐기하며, 명시적 동작으로만 삭제한다. 기존 쓰기 권한을 따르고 생성·수정 화면에 같은 규칙을 적용한다. 레거시 raw Data URL·문자열은 유지한다.

**Ask First:** 외부 오브젝트 스토리지 도입, Prisma 스키마 변경, 별도 다운로드 API 추가, 기존 첨부 데이터 일괄 마이그레이션이 필요해지면 구현을 멈추고 승인받는다.

**Never:** 완성도나 진행 상태를 바꾸지 않는다. 선택만으로 서버 값을 덮어쓰거나, 설명 저장·취소 중 첨부를 암묵적으로 지우지 않는다. 개요 UI를 전면 재설계하지 않는다.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 작성 중 업로드 | `IN_PROGRESS` 프로젝트에서 10MB 이하 허용 파일 선택 후 저장 | 파일명과 데이터가 저장되고 재조회 후 파일명과 열기 동작이 표시된다. | N/A |
| 교체·취소 | 기존 첨부에서 새 파일 선택 후 저장 또는 취소 | 저장 성공 때만 교체되고 취소 시 기존 첨부가 복구된다. | 실패 시 서버 값과 편집 상태를 유지한다. |
| 명시적 삭제 | 기존 첨부에서 삭제 후 저장 | 첨부만 비운다. | 실패 시 기존 값을 유지한다. |
| 유효하지 않은 파일 | 10MB 초과 또는 미허용 확장자·MIME | 선택 단계에서 거부하고 폼을 유지한다. | 한국어 오류를 표시한다. |
| 조작 요청 | 미허용 Data URL 또는 크기 초과 문자열 | 생성·수정 API가 `400`을 반환한다. | 저장하지 않는다. |
| 레거시 값 | raw Data URL 또는 일반 문자열 | 기본 파일명으로 열거나 기존 문자열을 표시한다. | 파싱 실패가 화면 오류로 번지지 않는다. |

</frozen-after-approval>

## Code Map

- `app/project/[id]/page.tsx` -- 개요 조회·수정과 파일 표시.
- `app/dashboard/page.tsx` -- 신규 생성의 FileReader 흐름.
- `app/api/projects/[id]/overview/route.ts` -- 개요 PATCH 저장.
- `app/api/projects/route.ts` -- 신규 생성과 목록 GET.
- `prisma/schema.prisma` -- 기존 `businessPlanFile String?`. 변경하지 않는다.
- `lib/business-plan-file.ts` -- 공유 직렬화·파싱·검증.
- `tests/business-plan-file.test.ts` -- 파일 규칙과 호환성 테스트.

## Tasks & Acceptance

**Execution:**
- [x] `lib/business-plan-file.ts` -- 허용 형식, 10MB 제한, 파일명 포함 직렬화, 레거시 파싱과 API 검증을 구현한다.
- [x] `app/project/[id]/page.tsx` -- 파일 선택·교체·삭제, 취소·실패 상태 보존, 파일명과 열기 링크를 구현한다.
- [x] `app/dashboard/page.tsx` -- 신규 생성도 공유 규칙으로 검증·직렬화한다.
- [x] 두 프로젝트 API route -- 첨부를 검증하고 목록 GET에서 파일 본문을 제외한다.
- [x] `tests/business-plan-file.test.ts` -- 정상, 형식, 크기 경계, 레거시·손상 값을 테스트한다.

**Acceptance Criteria:**
- Given 미완료 프로젝트, when 권한 있는 사용자가 유효 파일을 저장하면, then 상태와 무관하게 첨부되고 재조회 후 파일명과 열기 동작이 제공된다.
- Given 기존 첨부, when 설명만 저장하거나 새 선택을 취소하면, then 첨부는 바뀌지 않는다.
- Given 기존 첨부, when 삭제를 명시해 저장하면, then 첨부만 제거된다.
- Given 초과·미허용 파일, when UI 또는 API로 제출하면, then 저장되지 않고 오류가 반환된다.
- Given 첨부가 있는 목록, when 대시보드를 조회하면, then Base64 본문이 응답에 없다.

## Spec Change Log

## Design Notes

기존 `String?` 안에 버전, 파일명, MIME, Data URL을 담는다. 새 형식을 우선 파싱하고 raw Data URL·문자열로 폴백한다. 서버는 디코딩 크기를 검증하되 일반 문자열은 다른 개요 수정 때 손실되지 않게 허용한다.

## Verification

**Commands:**
- `npm run test -- tests/business-plan-file.test.ts` -- 공유 규칙과 경계값 테스트가 모두 통과한다.
- `npm run lint` -- 변경 파일을 포함한 ESLint 검사가 통과한다.
- `npm run build` -- Next.js 타입 검사와 프로덕션 빌드가 통과한다.

**Manual checks:**
- 작성 중 프로젝트의 선택, 저장, 새로고침, 열기, 교체, 취소, 삭제와 신규 생성을 확인한다.

**검증 결과:**
- `npm run lint` 통과.
- `npm run test` 통과. 27개 파일, 125개 테스트 성공.
- `tsc --noEmit --incremental false` 통과.
- `npm run build` 통과. 컴파일, 타입 검사, 정적 페이지 20개 생성, 최적화와 트레이스 수집을 완료했다.

## Suggested Review Order

**저장 형식과 검증**

- 버전 저장 형식과 브라우저 파일 읽기 규칙을 먼저 확인한다.
  [`business-plan-file.ts:112`](../lib/business-plan-file.ts#L112)

- 레거시 표시 호환성과 안전한 열기 조건을 확인한다.
  [`business-plan-file.ts:139`](../lib/business-plan-file.ts#L139)

- API 입력이 구조화 값과 허용 raw Data URL만 받는지 확인한다.
  [`business-plan-file.ts:197`](../lib/business-plan-file.ts#L197)

**작성 중 편집 흐름**

- 파일 선택과 비동기 취소가 기존 첨부를 보존하는지 확인한다.
  [`page.tsx:189`](../app/project/[id]/page.tsx#L189)

- dirty 첨부만 PATCH에 포함해 설명 저장 충돌을 막는다.
  [`page.tsx:234`](../app/project/[id]/page.tsx#L234)

- 검증된 데이터만 파일명과 열기 링크로 렌더링한다.
  [`page.tsx:549`](../app/project/[id]/page.tsx#L549)

**API와 목록 경계**

- 목록 쿼리에서 Base64 본문을 처음부터 제외한다.
  [`route.ts:37`](../app/api/projects/route.ts#L37)

- 생성 API가 첨부를 검증한 뒤에만 저장한다.
  [`route.ts:84`](../app/api/projects/route.ts#L84)

- PATCH 생략, 교체, 삭제의 세 상태를 구분한다.
  [`overview/route.ts:140`](../app/api/projects/[id]/overview/route.ts#L140)

**신규 생성과 테스트**

- 신규 생성도 같은 직렬화·검증 흐름을 사용한다.
  [`dashboard/page.tsx:57`](../app/dashboard/page.tsx#L57)

- 허용 형식, 경계값, 레거시, 손상 입력을 회귀 검증한다.
  [`business-plan-file.test.ts:20`](../tests/business-plan-file.test.ts#L20)
