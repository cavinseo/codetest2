# 개요·배정 멘토 편집·비공개 분석 운영 배포 결과.

## RESULT

2026-09-11 사용자 요청에 따라 작업 브랜치 푸시, 운영 DB 마이그레이션, Vercel 운영 배포를 완료했다. 정식 주소는 [KS-QFD](https://codetest2-rouge.vercel.app)다.

- 개요의 제품(서비스)명·이미지·시장정의·목표 고객을 반영했다.
- 현재 배정받은 멘티의 프로젝트만 멘토가 편집할 수 있다.
- WS-2·3·4·12·13·15·16·17의 멘토 전용 분석과 결과보고서 연결을 반영했다. 멘티는 완료본만 열람하며 수정 중에는 기존 완료본을 유지한다.

## COMMIT

- 브랜치는 `codex/mentee-mentor-approval`이며 `46d2862..f38100c`의 다섯 커밋을 푸시했다.
- 운영 소스는 `f38100c5cfa9ff90e9709c9e8bc659fe381d9a2a`다. 푸시 직후 로컬과 원격 작업 브랜치의 동일 SHA를 확인했다.
- Preview 배포 ID는 `2F6xyah1bEoTtaYou4xn5ezkw9a4`이며 1분 18초 빌드 후 Ready를 확인했다.
- Preview 고정 주소는 https://codetest2-802o467l2-cavinseos-projects.vercel.app 이다.
- 같은 소스를 Promote to Production으로 승격했다. 운영 배포 ID는 `CWZwFzCqGZU3Zyqp4iheH5Uuw1nM`이다.
- 운영 빌드는 1분 3초이며 2026-09-11 11:43 KST에 Ready, Production 환경, 정식 도메인 연결을 확인했다.
- 운영 고정 주소는 https://codetest2-o6rqaot3t-cavinseos-projects.vercel.app 이다.
- main 병합이나 운영 브랜치 설정 변경은 하지 않았다. 이 결과 문서의 후속 커밋은 기능 소스가 아닌 배포 증거만 추가한다.

## DATABASE

- Supabase 프로젝트 `zusyveyqlmewauonesgm`의 실제 운영 스키마와 Prisma 마이그레이션 기록을 먼저 확인했다.
- `20260911102320_product_overview_fields` 한 건만 미적용임을 확인한 뒤 `prisma migrate deploy`로 적용했다. 적용 완료 마이그레이션은 총 17개다.
- projects의 `productName`, `productImageDataUrl`, `productImageWidthPx`, `productImageHeightPx`, `marketDefinition`, `targetCustomer` 여섯 필드가 모두 nullable로 추가되었음을 조회했다.
- 적용 전후 및 코드 배포 후 프로젝트 수는 11개, final_reports 수는 0개로 동일했다. 공개본 집계 해시는 `d41d8cd98f00b204e9800998ecf8427e`로 동일했다. 기존 회원·프로젝트 내용·배정·소유권을 수정하지 않았다.
- projects와 final_reports의 RLS 활성 상태를 확인했다. 보안 Advisor에는 기존 서버 Prisma 접근 구조의 INFO `rls_enabled_no_policy` 29건만 있었고 ERROR/WARN은 없었다. 이번 필드 추가로 정책을 넓히지 않았다. [Supabase 안내](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)를 참고한다.

## VERIFIED BY

- 사전 전체 검수는 [2단계 검수 보고서](task-2.md)에 보존했다. 전체 테스트 140개 파일/1,866개, 격리 DB 통합 테스트 19개, 타입 검사, lint, 최종 로컬 빌드가 통과했다. 이번 배포 중 기능 코드는 수정하지 않았다.
- 읽기 전용 독립 검토에서 nullable 필드 추가의 기존 코드 호환성과 분석 초안 보존·공개 권한을 확인했다. 운영 적용을 차단할 새 P1/P2 문제는 발견하지 않았다.
- Vercel에서 동일 소스의 Preview와 Production 빌드 성공을 각각 확인했다.
- 정식 로그인 주소는 HTTP 200, 비로그인 `report?worksheetId=spec` 조회는 HTTP 401이었다.
- 기존 사용자 탭을 건드리지 않고 별도 운영 검증 탭을 열었다. admin 계정의 대시보드에서 관리자 권한 표시를 확인했다.
- 개요 조회에서 네 항목을 확인하고, 수정 화면에서 제품명·시장정의·목표 고객 입력과 이미지 선택 버튼을 확인한 후 취소했다. 저장 요청은 보내지 않았다.
- WS-2가 정상 로딩되고 ‘기능분석 작성 도우미’가 유지되며 admin에게 멘토 분석 입력이 표시되지 않는 것을 확인했다.
- 결과보고서에 완료본 대기 안내가 표시되고 초안 저장·완료 버튼이 없는 것을 확인했다. 현재 운영 DB에는 완료 보고서가 없으므로 Word 버튼은 비활성이었다.
- 개요·WS-2·결과보고서 UI 확인 직후 검증 탭의 브라우저 오류 로그는 없었다.

## DEVIATIONS / RISKS / QUESTIONS

- 운영에서 멘토를 새로 배정하거나 사용자 자료·분석·보고서를 시험 저장하지 않았다. 배정 멘토의 실제 편집, 8개 분석 저장, 완료·재완료, 멘티의 공개본 보존 검수는 격리 DB와 로컬 브라우저 결과를 사용한다.
- 관리자 분석 API 응답의 추가 직접 확인을 위해 브라우저 주소를 열려 했으나 브라우저가 API 주소 이동을 `ERR_BLOCKED_BY_CLIENT`로 차단했다. 이를 서버 응답 검증 성공으로 집계하지 않았다. 운영 UI 비공개와 비로그인 HTTP 차단은 위와 같이 별도 확인했다.
- 미저장 입력의 브라우저 뒤로가기·링크 이탈 확인은 기존 자동화 검수 한계가 남아 있다. 상세 내용은 task-2.md에 기록했다. 저장 후 재조회와 메인 탭 이동 취소는 검증했다.
- 새 분석 저장 이후 이전 서버로 단순 롤백하면 구버전의 초안 전체 교체·엄격한 입력 스키마·넓은 초안 조회 권한이 문제를 일으킬 수 있다. 문제 발생 시 현재 분석 보존 및 비공개 처리를 유지한 전진 수정을 우선한다. DB의 nullable 필드 추가 자체는 기존 코드와 호환된다.
