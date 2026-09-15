# 프로젝트 관리 프로그램 선택 필터 결과

## RESULT

관리자 프로젝트 관리 탭의 검색창 옆에 프로그램 선택 옵션을 추가했다. 기본값은 전체 프로그램이다. 선택한 프로그램 ID와 기존 프로젝트명·소유자 검색을 함께 적용하며, 표시 건수도 같은 결과를 사용한다. 프로젝트가 없는 프로그램도 선택할 수 있고 0건 안내를 표시한다.

## 검수 지표와 단계

1. 검토. 기존 목록에는 프로그램 식별자가 없음을 확인했다. 프로그램 이름이 중복되어도 ID로 구분하고, 기존 조회 권한과 검색을 유지하기로 했다.
2. 구현. 목록 API에 프로그램 ID와 전체 프로그램 선택 목록을 추가했다. 읽기 전용 조회 변경이며 DB 스키마 변경과 데이터 쓰기는 없다.
3. 검수. API 응답의 프로그램 ID·빈 프로그램 포함·관리자 권한을 테스트했다. 프로그램 선택과 검색의 AND 조건, 전체 선택 복귀, 동일 결과의 건수 표시, 빈 결과 문구는 코드 흐름으로 확인했다. 실제 브라우저 조작은 수행하지 않았다.

## FILES CHANGED

- `app/admin/page.tsx`.
- `app/api/admin/projects/route.ts`.
- `tests/api-admin-project-delete.test.ts`.

## COMMIT

`3bf0e929eb65540b7c68926986fb9a59189a4128`.

## VERIFIED BY

- 재현 단계. 신규 테스트에서 `expected undefined to be 'program_1'` 실패 확인.
- `npx vitest run tests/api-admin-project-delete.test.ts`. `Test Files  1 passed (1)` / `Tests  12 passed (12)`.
- `npx tsc --noEmit`. 출력 없음, exit 0.
- `npx next lint --file app/admin/page.tsx --file app/api/admin/projects/route.ts --file tests/api-admin-project-delete.test.ts`. `✔ No ESLint warnings or errors`.
- `git diff --check`. 오류 없음.

## DEVIATIONS / RISKS / QUESTIONS

정책 변경이나 추가 질문은 없다. 실제 화면 검증과 배포는 수행하지 않았다. 이전 작업에서 확인한 기존 docx 프로덕션 빌드 오류는 이번 변경 범위에서 수정하지 않았으며, 전체 빌드를 재실행하지 않았다. 푸시·실DB 변경도 수행하지 않았다.
