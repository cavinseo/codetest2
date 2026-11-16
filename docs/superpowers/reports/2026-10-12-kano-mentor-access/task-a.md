# Kano 분석 워크시트 권한 적용 결과.

## RESULT

완료했다. Kano 분석 집계표 및 TIMKO/만족계수 그래프에 기존 멘토 분석 권한을 적용했다.

- 담당 멘토 및 멘토로 배정된 프로그램 매니저는 열람·편집한다.
- 관리자는 열람만 한다. 집계표의 가중치 저장과 분석 탭의 응답 초기화 조작을 제공하지 않는다.
- 멘티 및 미배정 매니저는 분석 메뉴가 표시되지 않고, 직접 분석 API·개별 분석 엑셀 요청은 403이다.
- 전체 엑셀에서는 권한이 없는 사용자에게 WS-7 집계표와 WS-8 TIMKO만 제외한다.
- WS-6 설문 작성·수집·응답 건수, 요구사항 편집·순서와 기존 응답·후속 워크시트 계산을 유지한다.
- WS-5 저장을 통한 가중치 변경도 같은 편집 권한을 적용한다. 권한이 없으면 기존 가중치 값을 보존하고 신규 행에는 DB 기본 null을 사용한다.
- 기존 작업폴더의 사용자 변경을 유지하여 통합했다. 배포·push는 수행하지 않았다.

## FILES CHANGED

- 공통 권한 함수 `lib/kano-analysis-access.ts`.
- API `app/api/projects/[id]/kano/analysis/route.ts`, `export/route.ts`, `requirements/route.ts`.
- 화면 `app/project/[id]/page.tsx`, `app/project/[id]/kano/analysis/page.tsx`.
- 컴포넌트 `KanoManager.tsx`, `ProjectWorksheetMenu.tsx`, `WorksheetPageExport.tsx`.
- 엑셀 작성 `lib/worksheet-excel.ts`.
- 신규 회귀 테스트 `kano-analysis-access.test.ts`, `api-kano-analysis-access.test.ts`, `kano-analysis-visibility.test.ts`, `api-requirements-kano-weight-access.test.ts`.
- 기존 전제 조정 `api-worksheet-excel.test.ts`, `api-requirements-order-sync.test.ts`, `kano-workspace-sync.test.ts`, `requirement-order-outputs.test.ts`, `integration/import-restore.integration.test.ts`.
- 계획서 `docs/superpowers/plans/2026-10-12-kano-mentor-access.md`.
- main 작업폴더는 기존 리팩토링 구조를 보존하여 `KanoAnalysisTab.tsx`에도 canEdit을 전달했다. 요구사항 저장은 기존 배치 저장 함수 앞에서 kanoWeight를 제외하는 방식으로 동일한 계약을 적용했다.

## COMMIT

- 계획서 `b359063`.
- 구현 `65cc9e18d264dd5858663f7b4685233d5d9ff75d`.
- 격리 브랜치 `codex/requirement-order-sync-20261011`.

## VERIFIED BY

검증은 더미 DB 접속 주소·더미 SESSION_SECRET·ALLOW_DEV_ADMIN=false 환경에서 수행했다. API 테스트는 Prisma mock을 사용했다.

| 검증 | release | E:/Dropbox/codetest2 통합본 |
| --- | --- | --- |
| `npx tsc --noEmit` | exit 0, 출력 없음. | exit 0, 출력 없음. |
| `npm run lint` | exit 0, `> eslint .` 뒤 오류 없음. | exit 0, `> eslint .` 뒤 오류 없음. |
| `npm run test` | `Test Files  233 passed (233)` / `Tests  3250 passed (3250)` | `Test Files  243 passed (243)` / `Tests  3337 passed (3337)` |
| `npm run build` | exit 0, `✓ Generating static pages (36/36)` 및 최종 `ƒ  (Dynamic)  server-rendered on demand` | exit 0, `✓ Generating static pages (36/36)` 및 최종 `ƒ  (Dynamic)  server-rendered on demand` |
| `git diff --check` | exit 0. | 기존 사용자 변경을 포함하므로 이번 patch 통합과 타입·전체 테스트·빌드로 검증했다. |

- 신규 권한/API 테스트 82개, UI 테스트 10개, 요구사항 가중치 보호 테스트 40개가 전체 실행에 포함되었다.
- ExcelJS로 실제 생성된 워크북의 허용·제외 시트, JSON 백업 유지, WS-6 저장 후 WS-7 새로고침, 보고서 캡처 상태, 후속 순서 연동을 확인했다.
- 독립 검토 에이전트가 release와 main의 API·화면 권한을 읽기 전용으로 검토했다. 가중치 우회 발견을 반영한 후 승인 범위의 추가 결함은 보고되지 않았다.
- 이번 수정은 기존 Stryker mutate 대상 파일을 변경하지 않았다. 새 모듈에 대한 별도 mutation 실행은 수행하지 않았다.

## DEVIATIONS

- 검토에서 POST requirements의 가중치 우회가 발견되어, 일반 요구사항 편집을 유지하며 해당 필드만 보호했다.
- 기존 테스트 단언은 유지하고 다음 권한 전제만 조정했다.
  - `전체 파일과 독립 페이지의 워크시트 별칭도 지원한다`는 담당 멘토 전제로 바꾸고 이름 앞에 `담당 멘토는`을 붙였다.
  - `명시적으로 null을 보낸 문항·가중치만 초기화하고 다른 항목과 연결 데이터는 보존한다`는 담당 멘토 전제로 바꾸고 이름 앞에 `담당 멘토가`를 붙였다.
  - `kano-workspace-sync.test.ts`의 6개 테스트는 EDITOR와 canRead/canEdit summary 응답을 제공한다. 응답 동기화·삭제·재진입·실패·느린 요청에 대한 기존 단언을 유지했다.
  - `requirement-order-outputs.test.ts`와 로컬 DB 전용 `integration/import-restore.integration.test.ts`의 인증 mock을 배정 멘토로 바꾸었다. 순서·복원 데이터 단언을 유지했다.
- 신규 테스트는 작성 중 구현이 반영되어 처음부터 통과했다. 실패 재현을 먼저 확인했다고 주장하지 않는다.
- 병렬 작성 중 새 테스트 파일의 중간 저장본을 전체 검사에서 읽어 구문 오류가 한 번 발생했다. 작성 완료본으로 전체 검사를 다시 실행하여 두 작업폴더 모두 통과했다.

## RISKS

- 실DB 기반 통합 테스트와 로그인된 브라우저 확인은 CLAUDE.md의 원격 실DB·개발 서버 금지 지침에 따라 수행하지 않았다. 검증은 mock 기반 실행·타입·lint·production 빌드이다.
- 이번 범위는 분석 워크시트의 표시·편집 권한이다. 기존 원자료 JSON 백업·복원, WS-6 수집, QFD 계산 및 멘토가 공개한 완료보고서의 열람 계약을 유지한다.
- 빌드의 기존 Browserslist 데이터 갱신 안내, release의 다중 lockfile 루트 안내와 Vite 설정 향후 변경 안내는 오류가 아니며 이번 범위에서 설정을 바꾸지 않았다.
- main에는 작업 시작 전부터 다수의 사용자 변경이 있어 격리 브랜치에 이번 변경만 커밋했다. main의 기존 변경을 초기화하거나 커밋하지 않았다.

## QUESTIONS

없다.
