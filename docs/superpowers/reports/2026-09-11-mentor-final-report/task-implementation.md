# 멘토 결과보고서 작성과 완료본 공개 구현 결과.

## RESULT.

- 프로젝트 소유 멘티에게 배정된 멘토만 결과보고서를 작성·저장·완료한다. 기존 배정 정책에 따라 멘토로 배정된 프로그램 매니저도 작성할 수 있다. 미배정 관리자·프로그램 매니저는 기존 프로젝트 조회 범위에서 초안을 읽기만 한다.
- 멘티와 일반 참여자에게 완료 전 초안 본문·사진·자유 입력을 반환하지 않는다. 완료 후 저장된 문서만 읽기 전용으로 열람하고 Word 파일로 내려받는다.
- 사용자가 선택한 정책을 구현했다. 새 초안을 저장해도 기존 완료본은 유지하며, 다시 완료할 때 새 문서로 교체한다. 완료 당시 이미지와 표도 별도 저장되어 이후 워크시트 변경과 분리된다.
- 버전 충돌은 409로 거절한다. 저장 트랜잭션에서 프로젝트·멘토 배정 행을 잠근 후 현재 배정을 재확인한다. 보고서 기능을 위해 멘토의 워크시트 수정 권한을 추가하지 않았다.
- 새로고침 후 초안이 복원된다. 미저장 상태에서 내부 링크로 이동하면 확인창을 표시하고, 취소하면 입력을 유지한다.

## FILES CHANGED.

- `prisma/schema.prisma`, `prisma/migrations/20260911000000_final_report_publication/migration.sql`에 프로젝트별 초안·완료본 저장 테이블과 RLS를 추가했다.
- `app/api/projects/[id]/report/route.ts`, `lib/final-report-payload.ts`에 보고서 전용 권한·저장·완료 API와 문서 입력 검증을 추가했다.
- `app/project/[id]/report/page.tsx`, `components/project/FinalReportPreview.tsx`에 멘토 작성, 저장, 완료, 현재 공개본 보기와 멘티 읽기 전용 화면을 구현했다.
- `lib/final-report-image.ts`, `lib/final-report-docx.ts`에서 이미지 저장 크기를 줄이고 JPEG의 Word 이미지 형식을 맞췄다.
- API·입력·이미지·미리보기·Word 단위 테스트 5개 파일과 실제 PostgreSQL 통합 테스트 1개 파일을 작성·확장했다.
- 정본 계획서 `docs/superpowers/plans/2026-09-11-mentor-final-report.md`의 검수 단계를 완료 처리했다.

## COMMIT.

- 계획 커밋은 `8920da4`이다.
- 구현 커밋은 `d55c0be`이다.
- 이 보고서는 구현 커밋과 별도로 커밋한다. 푸시·운영 마이그레이션·배포는 수행하지 않았다.

## VERIFIED BY.

### 전체 자동 검수.

`npm run test`의 최종 결과는 다음과 같다.

```text
Test Files  134 passed (134)
     Tests  1728 passed (1728)
  Duration  8.27s
```

`npx tsc --noEmit`은 출력 없이 종료 코드 0이었다.

`npm run lint`는 종료 코드 0이었다. 기존 `.stryker-tmp` 잔여 검수 파일에서만 다음 경고가 발생했다. 이번 변경 파일의 별도 ESLint 검사도 통과했다.

```text
✖ 18 problems (0 errors, 18 warnings)
```

`npm run build`는 최종 UI 이동 가드 반영 후 종료 코드 0이었다. Prisma Client 생성, Next.js 컴파일, 타입 검사 및 정적 페이지 35개 생성이 완료되었다.

```text
✓ Compiled successfully in 4.7s
✓ Generating static pages (35/35)
ƒ  (Dynamic)  server-rendered on demand
```

### 집중 검수와 회귀 역검증.

`npx vitest run tests/api-final-report.test.ts tests/final-report-payload.test.ts tests/final-report-docx.test.ts tests/final-report-image.test.ts tests/final-report-preview.test.ts --pool=threads`에서 5개 파일·138개 테스트가 통과했다.

- JPEG가 PNG로 기록되는 기존 구현에서 Word 미디어 확장자·실제 바이트 회귀 테스트가 실패하는 것을 확인한 후 수정해 통과했다.
- 빈 키·값 표와 잘못된 Base64 `A`, `AAA==`를 허용하던 검증에서 테스트 실패를 확인한 후 입력 검증을 수정해 통과했다.
- 입력 용량, 초안 비공개, 완료본 보존·교체, 오래된 버전, 배정 해제, 실패 시 보존, 이미지 최대 크기·비율·자원 해제 및 읽기 전용 문서 표시를 검증했다.
- `stryker.crap.config.json`의 기존 mutate 대상 파일을 수정하지 않아 해당 대상의 재실행 조건은 없었다.

### 실제 DB 통합 검수.

두 `POSTGRES_*` 환경변수는 `127.0.0.1:65439/unused_guard`로 지정하고, `INTEGRATION_DATABASE_URL`은 별도 로컬 `mentor_report_qa` DB로 지정했다. 운영 Supabase에는 연결하지 않았다.

`npx vitest run --config vitest.integration.config.ts tests/integration/final-report.integration.test.ts`에서 11개 테스트가 통과했다.

- 실제 서명 세션과 현재 멘토 배정에 따른 읽기·쓰기 권한을 확인했다.
- 일반 프로젝트 조회·내보내기에 초안 본문과 이미지가 노출되지 않음을 확인했다.
- 동시 첫 저장, 저장·완료 경합 및 배정 변경 경합을 실제 행 잠금으로 검증했다.
- 작성자 계정 삭제 시 보고서를 보존하고 프로젝트 삭제 시 함께 제거함을 확인했다.
- RLS 플래그뿐 아니라 `NOSUPERUSER NOBYPASSRLS` 비소유자에게 SQL 권한을 부여한 상태에서 SELECT 0행, UPDATE 0행, INSERT `42501` 오류를 확인했다. 임시 역할·권한·검수 행은 롤백하고 잔여 자료가 없음을 확인했다.

첫 경합 테스트에서는 트랜잭션 안의 PostgreSQL 통계 스냅샷 재사용 때문에 대기 감지가 지연되었다. 통계 조회를 독립 요청으로 옮긴 후 통과했다. 첫 빌드는 병렬 테스트의 Prisma DLL 점유로 실패했으며, 테스트 종료 후 순차 실행한 빌드는 두 차례 통과했다.

### 실제 브라우저 검수.

운영 자료와 분리된 로컬 PostgreSQL과 `http://127.0.0.1:4319`의 프로덕션 빌드 서버에서 검수했다.

| 검수 항목 | 결과 |
| --- | --- |
| 완료 전 멘티 진입 | 완료본 없음 안내, 편집 기능 없음, Word 버튼 비활성화. |
| 멘토 자유 입력 저장 후 새로고침 | 저장한 시장정의와 목표고객 복원. |
| 미리보기 생성과 완료 | 워크시트 3개 그림 생성, 확인창을 통한 완료본 A 공개. |
| 수정본 B 저장 후 멘티 진입 | A 표시, B 미노출, 편집 입력·저장 버튼 없음. |
| 다시 완료 후 멘티 진입 | B 표시, A 교체, 이후 저장한 미완료 교정은 미노출. |
| 멘티 Word 내려받기 | A와 B 각각 내려받기 버튼 동작 확인. |
| 미저장 상태에서 ‘워크시트로’·공통 메뉴 클릭 | 이동 확인창 표시, 취소 시 입력 유지. |
| ‘저장하지 않고 이동’ 및 저장 후 이동 | 확인한 경우 이동, 저장 후에는 확인창 없이 이동. |

검수 종료 후 생성한 사용자·프로그램·프로젝트를 제거하고 보고서 잔여 행 0개를 확인했다. 검수 브라우저 탭, Next.js 서버와 격리 PostgreSQL 서버를 종료했다.

## DEVIATIONS.

- 최종 검토에서 발견한 미저장 내부 이동 손실을 막는 확인창을 추가했다. 공통 워크시트 메뉴 파일은 수정하지 않았다.
- 자유 입력을 변경한 뒤 예전 미리보기를 완료하지 않도록 `previewNeedsRefresh` 상태를 저장한다. 교정 문서를 지우지 않고 미리보기 재생성을 안내한다.
- 저장 요청을 3,500,000바이트로 제한하고 초안·완료본 중 하나만 조회한다. 업로드·캡처 이미지는 브라우저에서 최적화한다.

## RISKS.

- 운영 반영 전에 `20260911000000_final_report_publication` 마이그레이션을 적용해야 한다. 현재 기능은 로컬 구현·검수·커밋 완료 상태이다.
- 기존 기능에서 서버에 저장하지 않았던 브라우저 메모리 속 보고서는 복구 대상이 아니다. 새 저장 기능으로 보관한 문서부터 지속 저장된다.
- 실제 브라우저 검수는 격리 검수 프로젝트로 수행했다. 운영 프로젝트의 큰 표·그림을 포함한 저장 용량 확인은 운영 반영 시 점검 대상이다.

## QUESTIONS.

남은 요구사항 질문은 없다. 수정 중 기존 완료본을 유지하는 정책은 사용자가 확정했다.
