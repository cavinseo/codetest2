# 프로그램 관리 복구와 이전 작업 통합 검증.

## RESULT.

- 기존 작업 브랜치의 프로그램 삭제 기능이 main에 없어 운영에서 사라졌음을 확인했다. 프로그램 내용 수정은 구현되지 않은 상태였다.
- 최신 main `351571d`에 기존 작업 `4482833`을 병합하여 배포 브랜치와 main 사이의 기능 누락을 해소했다.
- 관리자는 전체 프로그램, 프로그램 매니저는 담당 프로그램의 이름·주관기관·시작일·종료일을 수정한다. 수정 저장은 카드만 갱신하며 오류 시 입력을 보존한다.
- 관리자 삭제 버튼과 연결 건수 확인을 복구했다. 프로젝트·멘티·사용된 초대코드가 있으면 삭제를 거절하고, 확인 이후 건수가 달라져도 다시 확인하도록 한다.
- 이전 멘토 배정·추가 프로젝트 승인·멘토 개설 허용·멘토 분석·보고서 초안/완료본·초대 메일 재발송 기능을 통합했다.
- 최근 역할별 로그인, 초대코드 재사용, 관리자 기간 연장, 복수 이메일 발급, 코드 조회, 회원 이름 null 처리, WS-9 자동 저장과 프로젝트 소속 검사도 보존했다.

## COMMIT.

`b99144aee2f3a8c4885d77715927b91463cebc31`.

## VERIFIED BY.

- `npm ci --ignore-scripts --no-audit --no-fund` 이후 `npx prisma generate` 성공. 보고서 라이브러리는 복구 브랜치의 잠금 파일과 같은 docx 9.5.1이다.
- `npm run lint` 성공.
- `npx tsc --noEmit` 성공.
- `npm run test -- --reporter=dot` — `Test Files 151 passed (151)`, `Tests 2035 passed (2035)`.
- `npm run build` 성공. 운영 DB 연결 없이 가짜 로컬 연결 설정으로 정적 빌드했다.
- 격리 PostgreSQL `127.0.0.1:55439/program_restore_qa`에서 `npm run test:integration -- --reporter=dot` — `Test Files 6 passed (6)`, `Tests 49 passed (49)`.
- 실제 세션의 수정 권한, 네 필드 저장, 프로젝트·멘티 연결 보존, 삭제 시 FK/행 잠금 경합, 초대 최초 로그인·반복 로그인·동시 가입, 멘토 배정/승인 경합, 보고서 비공개 초안과 RLS를 확인했다.
- 실제 `ProgramsTab`을 사용하는 로컬 브라우저에서 수정·삭제 버튼, 기존 값 채움, 이름·기관 저장 후 카드 반영, 연결 자료가 있는 프로그램의 삭제 확인 비활성화, 밝은 테마 표시를 확인했다. 브라우저 오류 로그는 없었다. 운영 프로그램을 수정하거나 삭제하는 테스트는 하지 않았다.
- `npx stryker run stryker.crap.config.json --mutate lib/member-roles.ts,lib/final-report-document.ts` 실행. `member-roles.ts` 99.30% (142/143). 남은 `return true` 변이는 MENTOR를 앞에서 처리한 뒤 남는 유효 MemberRole 세 값에 대해 동등하다.
- 보고서의 부분 개요 데이터 회귀 테스트 보강 후 `npx stryker run stryker.crap.config.json --mutate lib/final-report-document.ts` — 100.00%, 342개 모두 검출.
- `git diff --cached --check` 성공. 병합 충돌 표시와 미해결 인덱스 없음.

## DATABASE.

- 대상 운영 Supabase 프로젝트 `zusyveyqlmewauonesgm`을 검증하고 기존 17개 마이그레이션의 체크섬을 대조했다. 연결 정보나 회원 데이터는 출력하지 않았다.
- 대기 변경이 `20260911114230_mentor_project_creation` 하나이며 SQL이 `users.mentorProjectCreationEnabled BOOLEAN NOT NULL DEFAULT false` 열 추가뿐임을 확인한 후 배포했다.
- 적용 후 마이그레이션 18개와 컬럼 기본값 false를 읽기 전용으로 재확인했다. 기존 프로그램·회원·초대코드 자료를 수정하지 않았다.
- 기존 로컬 검증 DB의 스키마 변경은 자동 승인 검토에서 차단되었다. 기존 DB 대신 새 임시 DB를 구성하여 검증을 완료했다.

## LIMITS.

- 운영 관리자 세션이 브라우저에 없어 운영 자료의 수정·삭제는 실행하지 않았다. 실제 CRUD는 격리 DB와 실제 세션 테스트로 확인했다.
- 이 보고서는 코드 푸시 전 검증 결과다. 운영 배포의 커밋·Ready 상태는 푸시 후 별도로 확인한다.
