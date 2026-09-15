# WS-9 그룹 관리 복원 결과.

- [x] 기존 표시·저장 흐름과 빈 항목 원인 검토.
- [x] 그룹 저장, 그룹별 세부기능 추가·삭제 및 핵심기능 표시 구현.
- [x] 단위·통합·브라우저·타입·린트·빌드 검증.
- [x] 운영 스키마 적용 및 기존 데이터 보존 검증.

## RESULT.

고정 15칸과 3칸 단위 임시 그룹 대신 저장된 그룹의 실제 세부기능만 표시한다. 그룹은 첫 세부기능과 함께 추가하며 마지막 세부기능을 삭제하면 사라진다. 그룹에 속한 세부기능과 WS-10 세부스펙을 연결하여 핵심기능 이름을 중복 없이 표시한다. WS-10에 연결되지 않은 수동 입력은 '핵심기능 미연결'로 표시한다.

WS-10 자동 채움은 최초 구성 한 번으로 제한한다. 기존 구성과 삭제 의도를 보존하며 이후의 추가는 그룹 버튼에서 선택한다. 빈 이름과 중복 추가를 거절하고 그룹 삭제 직전에 확인한 세부기능 ID와 현재 구성을 비교하여 동시 추가 자료의 삭제를 막는다. 기존 9·3·1 관계 강도 자동 저장 방식은 유지한다.

## FILES CHANGED.

- QFDMatrix, qfd-technical-groups 및 qfd-technical-sync.
- 기술특성 CRUD API 및 Prisma 스키마·그룹 마이그레이션.
- JSON/워크북 가져오기와 JSON 검증 스키마.
- 화면·API·백업·그룹 함수 테스트 및 실제 PostgreSQL 통합 테스트.

## COMMIT.

구현 커밋 `e482d3a20949b0cf967b4ce311b32061620c402b`.

## VERIFIED BY.

- `npm run lint`. 종료 코드 0.
- `npm run test`. `Test Files 153 passed (153)`, `Tests 2052 passed (2052)`.
- `npx tsc --noEmit`. 종료 코드 0.
- `npm run build`. 종료 코드 0, 정적 페이지 36/36 생성 완료.
- `npm run test:integration`. 격리된 로컬 program_restore_qa에서 `Test Files 7 passed (7)`, `Tests 57 passed (57)`.
- `npx prisma migrate diff --from-url <격리 DB> --to-schema-datamodel prisma/schema.prisma --exit-code`. `No difference detected.`.
- `npx stryker run temp_files/ws9-stryker.config.json`. 기존 설정과 동일한 게이트에서 변경 파일 lib/import-json-schema.ts만 검사. `100.00`, `13 killed`, `0 survived`.
- 실제 QFDMatrix 컴포넌트를 사용하는 격리 브라우저 fixture에서 4개의 실제 열과 2개 그룹, 중복 없는 핵심기능 제목, 그룹 2에 세부기능 추가 후 5개 열을 확인했다.
- 운영 Supabase 프로젝트 및 이전 마이그레이션 18개의 체크섬을 확인한 뒤 그룹 마이그레이션 한 건을 적용했다. `All migrations have been successfully applied.`.
- 운영 전후 세부기능 46개, 관계 강도 85개, 상관관계 6개, 기술 벤치마크 0개의 행수와 기존 필드 해시가 모두 일치했다.

## DEVIATIONS.

기존 그룹 표시 순서를 유지하기 위해 이전 ID 순서와 3열 묶음을 마이그레이션에서 저장했다. 테이블 삭제·데이터 삭제 없이 그룹 번호와 순서, 초기화 여부 컬럼만 추가했다. Supabase CLI 대신 저장소의 기존 Prisma 마이그레이션 경로를 사용했다.

뮤테이션 첫 실행에서 기존 스키마 초기화 오류를 테스트 러너가 실패로 세지 않는 공백을 발견했다. 모듈을 테스트 안에서 동적으로 읽는 검증을 추가하여 해당 뮤턴트를 제거했다. 첫 실행의 Windows 테스트 프로세스 정리 권한 오류는 권한이 있는 재실행에서 해소했다.

## RISKS.

운영에서 실제 사용자 데이터를 추가·삭제하는 검증은 수행하지 않았다. 쓰기 흐름과 실제 세션 인가·FK 정리·동시성은 격리 PostgreSQL에서 검증했다. WS-10 세부스펙과 이름이 연결되지 않는 수동 세부기능에는 자동 핵심기능명이 없다.

## QUESTIONS.

없음.
