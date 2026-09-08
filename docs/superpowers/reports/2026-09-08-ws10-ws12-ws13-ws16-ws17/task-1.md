# 워크시트 연계·자금 입력 개선 결과.

## RESULT.

WS-10·12·13·16·17의 승인된 코드 변경과 로컬 검증을 완료했다. 실제 서비스 배포와 운영 DB 초기화는 수행하지 않았다.

- WS-10은 선택한 핵심스펙의 세부·세세부기술을 계층으로 표시하고 선택한 기술특성을 반영한다. 동명 항목은 부모 경로로 구분하여 다른 행을 덮어쓰지 않는다.
- WS-12는 4열로 구성하고 최초 작성 시 WS-2 AS-IS를 채운다. WS-11 신규 기능을 원하는 핵심·세부항목 그룹에 추가하며 기존 숨김 필드도 저장 시 보존한다.
- WS-13은 WS-11 표시 규칙에 따른 고객니즈 순서를 반영한다. 동일하고 유일한 니즈의 작성 내용을 유지하며 불명확한 기존 행은 별도로 보존한다.
- WS-16은 1차년도만 WS-1과 연동하고 2·3차년도는 빈칸·0·수동 금액을 구분한다. 기존 매출 초기화용 1회 migration을 작성했다.
- WS-1·16·17 금액의 입력·합계·요약에 콤마와 소수 자릿수를 유지한다. 금액 중간 편집의 커서 위치도 보존한다.
- WS-17은 전체 가용 폭과 내용에 맞춘 출처 열 최소폭을 사용하며 좁은 화면에서 가로 스크롤을 제공한다.

## COMMIT.

구현 커밋은 `98673ab`이다. 원격 push는 하지 않았다.

## FILES CHANGED.

- 화면 및 공통 입력. `components/project/TechTreeTable.tsx`, `TargetSpecTable.tsx`, `TechRoadmapTable.tsx`, `FundingTable.tsx`, `SalesTable.tsx`, `components/ui/MoneyInput.tsx`.
- 연계·검증·금액 처리. `lib/tech-tree-utils.ts`, `worksheet-links.ts`, `bulk-save-schemas.ts`, `funding-ai-agent.ts`, `workbook-importer.ts`, `money.ts`.
- API. `app/api/projects/[id]/target-spec/route.ts`, `app/api/projects/[id]/funding/route.ts`.
- 저장 구조. `prisma/schema.prisma`, `prisma/migrations/20260908120000_worksheet_manual_revenue/migration.sql`.
- 회귀 테스트. `tests/tech-tree-utils.test.ts`, `worksheet-links.test.ts`, `bulk-save-schemas.test.ts`, `funding-ai-agent.test.ts`, `workbook-importer.test.ts`, `api-worksheet-link-regressions.test.ts`, `money.test.ts`.

## VERIFIED BY.

주 작업자가 하위 작업자의 결과와 별개로 아래 검증을 실행했다.

| 검증 | 결과 |
| --- | --- |
| `npm run test` | `Test Files 110 passed (110)`, `Tests 1265 passed (1265)`. |
| `npx tsc --noEmit` | 종료 코드 0. |
| `npm run lint` | 종료 코드 0. `0 errors, 4 warnings`. 기존 `.stryker-tmp` 파일의 미사용 eslint-disable 경고이다. |
| 최종 변경 파일 대상 ESLint | 종료 코드 0. |
| `npm run build` | 최종 변경본 종료 코드 0. 정적·동적 라우트 출력 완료. |
| `git diff --check` | 종료 코드 0. |
| 회귀 역검증 | 기존 WS-10 계층 누락·조상 기술 대입·WS-16 수동매출 덮어쓰기의 3개 시나리오가 수정 전 실패, 수정 후 통과. |
| 실제 SQL 검증 | 독립 PostgreSQL 16에 실제 migration 파일 실행. `migration validation passed`. |

SQL 검증은 기존 매출 2행의 두 연도만 NULL로 전환하고 1차년도·비용·다른 항목을 보존하는지 확인했다. 이후 수동 소수 금액과 0, 신규 매출의 NULL, 비용 기본값 0을 확인했다. 테스트 서버는 종료했다.

브라우저 검증은 실제 React 컴포넌트를 모의 API와 묶은 독립 화면에서 수행했다.

- WS-10의 핵심별 후보 제한, 계층 선택, 기술 자동 반영, 동명 선택 후 기존 기술A·새 기술B의 독립 저장과 재조회, 핵심 변경 안내를 확인했다.
- WS-12의 4열, 원본 내용, 선택한 세부항목 자손 뒤의 신규 기능 삽입 및 저장을 확인했다.
- WS-13의 고객니즈 순서, 기존 보안 기능·구현가능성·목표 고객 보존, 새 입력 저장과 재조회를 확인했다.
- WS-16에서 `123`의 앞에 `4`, `5`를 연속 입력하여 `45,123`을 확인했다. `1,234,567.89012`와 실제 `0`의 저장·재조회, 키보드 전체 삭제 후 빈칸 저장, AI 실행 후 빈칸 보존을 확인했다.
- WS-17을 1600px와 720px에서 확인했다. 긴 한글 조달처와 `123,456,789.12`가 표시되며 3차년도까지 가로 스크롤로 접근됨을 확인했다.

## DEVIATIONS.

- WS-13 원본 이름 변경·중복은 영구 식별자가 없어 추정 연결하지 않고 기존 행을 하단에 보존한다. 해당 상태를 화면에 안내한다.
- 최초 병렬 검증 중 Prisma DLL 잠금이 발생했다. 테스트 종료 후 재실행하여 생성에 성공했다. 기존 사용자 프로세스는 종료하지 않았다.
- 네트워크 제한으로 Google Fonts 다운로드 빌드가 실패했다. 허용된 네트워크 환경에서 재실행하여 최종 빌드까지 성공했다.
- 실제 운영 DB가 아닌 모의 API 및 독립 PostgreSQL에서 검증했다.

## RISKS.

운영 반영에는 준비된 migration과 애플리케이션 배포가 필요하다. 기존 2·3차년도 매출은 아직 실제 서비스에서 초기화되지 않았다.

적용 대상은 모든 프로젝트의 `category = '매출액' OR item = '매출액'` 행이다. 사용자에게서 기존값 초기화가 명시 승인되었으나, 운영 적용 전에 대상 행 수와 백업을 확인해야 한다. migration은 정상 이력 관리로 한 번만 실행한다. 직접 SQL 재실행은 새로 입력한 값도 비우므로 금지한다. 복구 시 백업의 행 ID를 기준으로 두 연도값만 복원한다.

## QUESTIONS.

구현을 위한 미해결 질문은 없다. 운영 적용은 별도 실행 단계로 남아 있다.
