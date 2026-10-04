---
title: '코드 리뷰 P2·P3 항목 조치 및 결과보고서 Word 표 통합'
type: 'refactor'
created: '2026-10-04'
status: 'done'
baseline_commit: 'da3ddf4d627eb201436b2a566e31de88749ad1c3'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 코드 리뷰에서 발견된 P2·P3 위험과 유지보수 문제를 방치하면 설문 응답·워크시트 데이터가 유실되거나 잘못 연결될 수 있고, 결과보고서 Word 출력도 작성용 워크시트와 다르게 보일 수 있습니다.

**Approach:** 기존 사용자 변경사항을 보존하며 확인된 P2·P3 결함을 안전하게 수정하고, Word 결과보고서의 워크시트별 자료 표를 하나의 연속된 Word 표로 출력합니다. 관련 다운로드 중복과 고복잡도/모호한 이름은 요청 범위 안에서만 개선합니다.

## Boundaries & Constraints

**Always:** 검토에서 지목된 동작을 기준으로 현재 작업본을 재확인합니다. 데이터 삭제·프로젝트 간 참조·설문 완료 처리에는 경계 검사를 추가하고, 기존 문서 내용·표 형식·워크시트 데이터는 보존합니다. 사용자 미커밋 변경 및 무관한 파일은 되돌리지 않습니다.

**Ask First:** 다른 P2/P3 항목과 무관한 동작 변경 또는 데이터 마이그레이션이 필요해지는 경우.

**Never:** 무관한 리팩터링, 데이터 삭제 방식 변경, 배포, 커밋.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 속성 초기화 | WS-4 적합도 기록이 연결된 프로젝트 | 영향 확인 없이 기록을 지우지 않음 | 기존 확인 응답 계약 사용 |
| 설문 미완료 | 빈 답변 또는 일부 질문 답변 | 초대장을 완료 처리하지 않고 제출 거부 | 400 응답 |
| 타 프로젝트 속성 | 요청 프로젝트에 속하지 않는 attributeId | 저장 거부, 기존 데이터 유지 | 400 응답 |
| Word 표 | 페이지 분할이 필요한 워크시트 데이터 | 페이지마다 반복 헤더를 갖는 하나의 연속 Word 표 | 생성 오류는 기존 API 오류 처리 유지 |

</frozen-after-approval>

## Code Map

- `app/api/projects/[id]/attributes/route.ts` -- 속성 초기화와 WS-4 연쇄삭제 보호.
- `app/api/survey/[token]/submit/route.ts` -- 제출 필수 질문 및 초대장 완료 처리.
- `app/api/projects/[id]/attributes/fitness/route.ts` -- 적합도 대상 속성의 프로젝트 소속 검증.
- `app/api/projects/[id]/export/route.ts` -- JSON 백업의 개발계획 포함 여부.
- `app/api/projects/[id]/kano/invite/bulk/route.ts`, `lib/kano-invite-template.ts` -- 업로드 가드.
- `lib/final-report-docx.ts`, `lib/final-report-template-docx.ts`, `lib/final-report-layout.ts` -- Word 출력 및 페이지별 표 분할.
- `lib/kano-offline-form.ts`, `components/project/WorksheetExcelDownload.tsx`, `lib/file-download.ts` -- 다운로드 URL 수명.
- `app/project/[id]/report/page.tsx`, `components/project/KanoManager.tsx`, `app/project/[id]/page.tsx` -- 복잡도 및 이름 개선 후보.
- `lib/final-report-template.ts` -- 추가 시장 자료의 보고서 반영 선택 동작.

## Tasks & Acceptance

**Execution:**
- [x] API 경계 검증 및 JSON 백업 누락을 고치고 회귀 테스트를 추가합니다.
- [x] 업로드 크기·압축 검사를 적용하고 브라우저 다운로드 URL 해제를 안전하게 처리합니다.
- [x] 워크시트 표를 Word 문서에서 하나의 표로 유지하면서 페이지 분할과 반복 헤더를 보장합니다.
- [x] 추가 시장 자료의 결과보고서 반영 여부가 체크 상태에 따르도록 저장·렌더링 흐름을 확인합니다.
- [x] 중복 다운로드 처리를 공용화하고 복잡하거나 모호한 코드는 직접 관련 범위에서 정리합니다.
- [x] 관련 테스트와 lint/build 검사를 실행합니다.

**Acceptance Criteria:**
- Given 기존 WS-4 적합도나 프로젝트 자료가 있을 때, 초기화·저장·백업 작업이 확인 없이 연결 데이터를 잃거나 다른 프로젝트 자료와 연결하지 않습니다.
- Given 설문 질문이 미응답일 때, 제출을 완료 처리하지 않습니다.
- Given 크기 제한을 넘거나 위험한 엑셀 파일일 때, 파일 파싱 전에 거부합니다.
- Given 워크시트 표가 여러 페이지에 걸칠 때, Word에서 하나의 연속된 표 구조로 유지되고 표 머리글이 반복됩니다.
- Given 추가 시장 자료의 보고서 체크가 해제되었을 때, 결과보고서에 포함되지 않습니다.
- Given 대상 다운로드를 수행할 때, 브라우저가 파일을 받기 전에 Blob URL이 무효화되지 않습니다.
- Given 관련 단위 테스트 및 프로젝트 검사 실행 시, 모든 검사에 통과합니다.

## Spec Change Log

## Verification

**Commands:**
- `npx vitest run <관련 테스트>` -- 예상 결과: 변경된 동작 회귀 테스트 통과.
- `npm run lint` -- 결과: 통과.
- `npm test` -- 결과: 226개 파일, 3,092개 테스트 통과.
- `npm run build` -- 결과: 프로덕션 빌드 성공.

## Suggested Review Order

**연결 데이터 삭제 확인**

- 확인 영향 범위를 고정해 적합도 전체 교체와 초기화의 재확인을 보호합니다.
  [`route.ts:78`](../../../app/api/projects/[id]/attributes/route.ts#L78)

- UI가 확인한 영향 범위를 보내고 변경 시 다시 확인받습니다.
  [`ProductAttributesTable.tsx:353`](../../../components/project/ProductAttributesTable.tsx#L353)

- 프로젝트 경계 및 영향 변경 회귀 테스트를 확인합니다.
  [`api-project-attribute-guards.test.ts:44`](../../../tests/api-project-attribute-guards.test.ts#L44)

**제출·업로드 경계 검증**

- 설문 완료 처리 전에 응답 완결성을 검사합니다.
  [`route.ts:97`](../../../app/api/survey/[token]/submit/route.ts#L97)

- 업로드 크기와 압축 파일을 검사한 뒤 파싱합니다.
  [`route.ts:13`](../../../app/api/projects/[id]/kano/invite/bulk/route.ts#L13)

**결과보고서 및 UI 유지보수**

- 페이지 단위 표 조각을 하나의 연속된 Word 표로 결합합니다.
  [`final-report-template-docx.ts:105`](../../../lib/final-report-template-docx.ts#L105)

- 시장 자료의 선택 반영 필드를 저장하는 모델입니다.
  [`schema.prisma:109`](../../../prisma/schema.prisma#L109)

- 체크된 시장 자료만 보고서에 추가합니다.
  [`final-report-template.ts:79`](../../../lib/final-report-template.ts#L79)

- 보고서 미리보기 상태와 다운로드 흐름을 확인합니다.
  [`page.tsx:143`](../../../app/project/[id]/report/page.tsx#L143)

- 요약 카드 UI를 분리해 설문 관리자 복잡도를 낮춥니다.
  [`KanoManager.tsx:13`](../../../components/project/KanoManager.tsx#L13)

- 전체 속성 저장의 확인 계약도 유지되는지 확인합니다.
  [`api-worksheet-cascade.test.ts:158`](../../../tests/api-worksheet-cascade.test.ts#L158)
