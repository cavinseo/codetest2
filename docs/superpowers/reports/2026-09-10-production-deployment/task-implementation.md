# 운영 배포 결과

## 배포 대상

통합 커밋은 `fef0ee5`다. 검증된 멘티 초대 코드 로그인, 프로그램별 프로젝트 필터, 멘토 배정·코멘트·프로젝트 추가 승인 및 선행 워크시트·결과보고서 변경을 포함한다. main에만 있던 WS-6·7·9 저장 버튼 변경도 충돌 없이 통합했다.

## 검증

- main 통합 후 `npm test`. 126개 파일, 1,499개 테스트 통과.
- `npx next lint`. 경고·오류 없음.
- `npm run build`. 타입 검사와 프로덕션 빌드 통과.
- 선행 격리 PostgreSQL 통합 테스트 17개와 브라우저 기능 검수는 각 기능 보고서에 기록되어 있다.

## 운영 DB

다음 4개 마이그레이션을 실제 운영 DB에 적용했다.

1. `20260908000000_add_technical_benchmark`.
2. `20260908120000_worksheet_manual_revenue`.
3. `20260910190000_mentee_mentor_approval`.
4. `20260910193000_secure_technical_benchmarks`.

`All migrations have been successfully applied.`를 확인했다. 후속 `npx prisma migrate status`는 15개 이력과 `Database schema is up to date!`를 반환했다.

이전 자동 승인 검토가 거절한 PC의 건수·해시 보관을 수행하지 않았다. 대신 단일 PostgreSQL 세션의 임시 테이블 안에 비교값을 유지하고, 표준 Prisma 배포 실행 전후를 DB 내부에서 비교했다. 원본 값과 해시는 클라이언트에 반환하거나 저장하지 않았으며 검증 후 임시 테이블을 삭제했다. 이 검증 방식은 운영 실행 전 격리 로컬 DB에서 실행하여 확인했다.

기존 테이블의 행 수와 내용이 보존됨을 확인했다. 이미 승인된 매출액 항목의 year2·year3 초기화만 내용 비교에서 제외하고 별도로 모두 NULL인지 검증했다. 새 테이블 4개의 RLS도 확인했다. 최종 결과는 `PASS: existing data preserved; authorized revenue reset complete; four tables secured.`다.

## Vercel

로컬 환경파일·검수 사본을 배포하지 않도록 `git archive`로 통합 커밋의 추적 파일만 추출했다. 기존 Vercel 프로젝트 연결 정보만 추가하고 530개 파일의 업로드 목록을 확인했다. 운영 환경변수는 기존 Vercel 설정을 사용했다.

- 프로젝트 `cavinseos-projects/codetest2`.
- 배포 ID `dpl_Bm8rsZEuyDb3V9GHM4Mu6oZobhhn`.
- 배포 URL `https://codetest2-781jie0w8-cavinseos-projects.vercel.app`.
- 운영 도메인 `https://codetest2-rouge.vercel.app`.

Vercel 운영 빌드는 성공했고 `readyState: READY`, `target: production`, 운영 도메인 연결 완료를 확인했다.

배포 후 `/login?mode=invite`는 HTTP 200, 인증 없는 `/api/admin/projects`는 HTTP 401을 반환했다.

실제 운영 브라우저에서 `login?mode=invite`를 다시 열어 이메일·초대 코드 두 입력란과 90일·프로그램 종료 안내를 확인했다. 존재하지 않는 검수용 이메일·코드로 요청하여 서버가 사용 불가 안내를 반환하는 것을 확인했다. 정상 회원 생성이나 데이터 수정은 수행하지 않았다.

운영 관리자 로그인 세션이 없어 인증 후 프로그램 필터 조작은 운영에서 재실행하지 않았다. 해당 기능의 로컬 브라우저 검수는 완료된 상태이며, 배포 소스에 필터 구현이 포함되어 있다.

## 원격 main

자동 승인 검토가 main과 작업 브랜치 동시 푸시를 거절했다. 이유는 배포 요청만으로 기본 브랜치 직접 푸시의 정확한 승인이 확인되지 않는다는 것이었다. 해당 작업은 실행되지 않았다. main 변경 없이 사용자가 요청한 Vercel 운영 배포를 진행했고, 통합 커밋의 main 직접 반영 승인은 별도로 요청했다.
