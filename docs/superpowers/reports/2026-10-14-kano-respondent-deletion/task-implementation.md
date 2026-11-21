# RESULT

Kano 응답자별 보기에서 소유 멘티와 배정 멘토가 선택한 응답자의 모든 문항 또는 현재 프로젝트의 전체 응답을 삭제할 수 있도록 구현했다. 선택·전체 삭제 전 대상 명수, 복구 불가, 응답 완료 상태 초기화와 초대 내역 유지를 확인창으로 안내한다. 취소하면 요청을 보내지 않는다.

서버는 실제 프로젝트 쓰기 권한을 검사하며 선택 이메일과 현재 projectId를 응답 삭제 및 초대 완료 상태 초기화 조건에 함께 사용한다. 이메일의 대소문자나 공백을 임의로 정규화하지 않는다. 빈 목록·잘못된 JSON·공백 본문·모호한 필드는 400으로 거부하며 선택 삭제와 includeInvitations=true 조합도 거부한다. 정확히 본문이 없는 DELETE 및 기존 초대까지 리셋하는 호출은 유지한다.

응답자 조회·삭제 권한은 TIMKO 상세 분석·가중치 편집 권한과 독립적이다. 응답 GET이 반환하는 canDelete를 화면에서 사용한다. 처리 중 선택·버튼을 잠그고 응답/초대 리셋과 공통 동기 pending ref를 사용한다. 실패하면 목록과 선택을 유지하고 같은 대상으로 재시도한다. 성공하면 응답 목록·초대·요약과 허용된 상세 분석을 재조회한다.

목록과 삭제 권한을 projectId에 묶고 Table을 프로젝트별 key로 마운트한다. loadData 요청 세대와 현재 프로젝트 검사를 추가해 이전 프로젝트의 늦은 조회를 무시한다. 삭제 대기 중 프로젝트를 바꾸면 이전 프로젝트 완료가 새 프로젝트 목록을 지우거나 이전 프로젝트를 재조회하지 않는다. 삭제 성공 후 목록 재조회가 실패하면 오래된 목록의 삭제 기능을 닫는다.

# FILES CHANGED

- `lib/kano-response-reset.ts`에 선택 이메일별 응답 삭제 및 초대 완료 상태 초기화 필터를 추가했다.
- `app/api/projects/[id]/kano/responses/route.ts`에 엄격한 선택 DELETE 본문 검증과 GET 삭제 권한을 추가했다.
- `components/project/KanoRespondentTable.tsx`에 선택·전체 삭제, 확인창, 실패 표시와 처리 중 잠금을 추가했다.
- `components/project/KanoManager.tsx`에 독립 응답자 진입점, 공통 삭제 callback 및 프로젝트/요청 세대 보호를 추가했다.
- `components/project/KanoAnalysisTab.tsx`에 실제 응답 삭제 권한과 삭제 callback을 연결했다.
- `tests/kano-response-reset.test.ts`에 선택 리셋 범위 검사를 추가했다.
- `tests/kano-analysis-visibility.test.ts`에서 멘티의 응답자 진입점만 새 계약에 맞추고 상세 분석 비노출 검사를 유지했다.
- `tests/api-kano-response-delete.test.ts`를 추가했다. 실제 authorization을 사용하고 requireAuth 및 Prisma만 모의 처리하여 권한·입력·프로젝트 범위를 검증한다.
- `tests/kano-respondent-delete.test.ts`를 추가했다. 실제 Manager/Table에 모의 fetch/confirm을 사용하여 취소·payload·실패·중복·재조회·지연 프로젝트 전환을 검증한다.

이 보고서 외에는 위 9개 허용 파일만 변경했다. 기존 dirty 변경과 직전 초청 링크·온라인 설문 구현은 보존했다.

# VERIFIED BY

RED 단계에서 구현 전 신규 API/UI 검사와 저장 계층 검사를 실행했다.

```text
npm run test -- tests/api-kano-response-delete.test.ts tests/kano-response-reset.test.ts tests/kano-respondent-delete.test.ts
Test Files 3 failed (3)
Tests 31 failed | 11 passed (42)
exit code 1
```

선택 요청이 전체 응답 삭제로 처리되어 deletedResponses/resetInvitations가 각각 2/1 대신 4/2였으며, 잘못된 본문이 400 대신 200을 반환했다. canDelete 및 응답자 삭제 진입점 누락도 재현했다. 테스트 데이터의 빈 배열 매개변수는 Vitest each가 펼치지 않도록 단일 매개변수 행으로 감쌌다.

GREEN 단계에서 신규 검사 및 관련 응답 표시·워크스페이스·오프라인·분석/가중치 권한 검사를 실행했다.

```text
npm run test -- tests/api-kano-response-delete.test.ts tests/kano-response-reset.test.ts tests/kano-respondent-delete.test.ts tests/kano-analysis-visibility.test.ts tests/kano-workspace-sync.test.ts tests/kano-offline-preview.test.ts tests/kano-response-display.test.ts tests/api-kano-analysis-access.test.ts tests/api-requirements-kano-weight-access.test.ts tests/kano-analysis-access.test.ts
Test Files 10 passed (10)
Tests 189 passed (189)
exit code 0
```

허용 9개 변경 파일의 `npx eslint`와 `git diff --check` 모두 종료코드 0이었다. npm pretest의 한글 인코딩 검사도 통과했다.

# RISKS

검사는 전부 모의 DB/네트워크를 사용했다. 실제 DB 접속·쓰기, 서버 실행, 설문 제출, 이메일 발송, 스키마 변경, 커밋·push·배포는 수행하지 않았다. 브라우저 화면 검증과 전체 lint/test/build 및 TypeScript 통합 확인은 주 작업자가 독립 수행한다.

# 리뷰 보완 RESULT

독립 리뷰의 P2 세 건을 보완했다. 선택 삭제의 키는 이메일 형식이 아니라 기존 GET이 제공하는 raw 응답자 식별값으로 검증한다. 비어 있지 않은 문자열이면 이름·대문자 주소도 허용하며 빈 문자열·비문자열·빈 배열·모호한 JSON은 계속 400으로 거부한다. trim/lowercase는 적용하지 않는다.

같은 프로젝트의 삭제 대기 중 Manager의 관리/분석/응답자 탭과 관리 화면 응답 결과 진입 버튼, 분석 화면의 TIMKO/응답자 토글을 잠근다. Table이 중간에 unmount되지 않아 삭제 실패 후 선택과 오류가 보존된다. 외부 projectId 전환과 기존 오래된 요청 완료 무시 계약은 유지한다. 초대까지 전체 리셋이 성공했을 때에만 재조회 전에 기존 `setInvitations([])` 처리를 복구했다.

# 리뷰 보완 FILES CHANGED

- `app/api/projects/[id]/kano/responses/route.ts`의 키 검증을 `z.string().min(1)`로 변경했다.
- `components/project/KanoManager.tsx`의 대기 중 탭/진입 버튼 잠금과 초대 리셋 성공 후 목록 초기화를 추가했다.
- `components/project/KanoAnalysisTab.tsx`의 대기 중 보기 토글 잠금을 추가했다.
- `tests/api-kano-response-delete.test.ts`에 이름·한글 로컬 부분의 대문자 주소·ASCII 대문자 주소의 정확한 raw 키 삭제와 다른 응답자/프로젝트 보존 검사를 추가했다. 기존 잘못된 이메일 사례는 새 계약에 맞는 빈 식별값 사례로 바꿨다.
- `tests/kano-respondent-delete.test.ts`에서 대기 중 탭 이동 차단·500 오류/선택 보존, legacy 응답/초대 리셋의 같은 tick 공통 잠금과 초대 리셋 성공/GET 실패를 검증했다.

# 리뷰 보완 VERIFIED BY

보완 전 재현 검사 실행 결과는 다음과 같다.

```text
npm run test -- tests/api-kano-response-delete.test.ts tests/kano-respondent-delete.test.ts
Test Files 2 failed (2)
Tests 7 failed | 41 passed (48)
exit code 1
```

이름 및 한글 로컬 부분 주소의 선택 삭제가 200 대신 400을 반환했다. Manager 탭과 관리 화면 응답 결과 진입 버튼이 대기 중에도 활성화되어 있었으며, 초대 리셋 성공 뒤 GET 실패 시 이전 초대 주소가 남았다.

보완 후 위 GREEN 단계와 동일한 관련 10개 파일 검사 명령을 실행했다.

```text
Test Files 10 passed (10)
Tests 196 passed (196)
exit code 0
```

허용 9개 파일 범위 ESLint와 한글 인코딩 검사도 통과했다. 기본 실행 환경에서 검사와 lint가 성공하여 권한 승격은 사용하지 않았다. 2026-10-14 리뷰 보완 검사 완료 후 주 작업자에게 source freeze를 다시 통보했다.

# 리뷰 보완 RISKS

실제 DB·서버·메일·배포·커밋·push·브랜치 변경은 수행하지 않았다. 보완 이후의 전체 lint/test/build와 실제 브라우저 검증은 주 작업자가 독립 확인한다.

# 프로젝트 이동 잠금 보완 RESULT

A 프로젝트의 삭제 대기 중 B로 전환하면 B 화면의 탭까지 잠기는 문제를 보완했다. 요청 시작 시 deletionProject ref에 대상 프로젝트를 기록하고 종료 시 해제한다. 현재 projectId와 일치하는 동안만 Manager의 화면 이동 4개 버튼과 Analysis의 보기 토글 2개를 잠근다. B의 삭제 버튼·체크박스·legacy 리셋은 기존 전역 pending 잠금을 유지하여 동시에 두 삭제를 시작할 수 없다. A 완료가 B 데이터를 변경하거나 A를 다시 조회하지 않는 기존 완료 보호도 유지한다.

# 프로젝트 이동 잠금 보완 FILES CHANGED

- `components/project/KanoManager.tsx`에 삭제 요청 프로젝트 ref와 현재 프로젝트 이동 잠금 판정을 추가했다.
- `components/project/KanoAnalysisTab.tsx`에 현재 프로젝트 이동 잠금 boolean 하나를 전달하여 보기 토글에만 적용했다. 기존 전역 isResettingResponses는 삭제 controls와 표 잠금에 유지했다.
- `tests/kano-respondent-delete.test.ts`에 소유 멘티·배정 멘토 각각의 A 삭제 대기 → B 관리/응답자 화면 이동과 멘토 분석 토글, B 삭제 차단, A 완료 후 B 데이터 보존 및 B의 후속 삭제 검사를 추가했다.

# 프로젝트 이동 잠금 보완 VERIFIED BY

보완 전 새 회귀 검사는 B의 설문 관리 버튼이 활성화되어야 하는 위치에서 실패했다.

```text
npm run test -- tests/kano-respondent-delete.test.ts
Test Files 1 failed (1)
Tests 2 failed | 19 passed (21)
exit code 1
```

보완 후 기존 GREEN 단계와 동일한 관련 10개 파일 명령을 실행했다.

```text
Test Files 10 passed (10)
Tests 198 passed (198)
exit code 0
```

허용 9개 파일 범위 ESLint와 한글 인코딩 검사도 통과했다. 검사 완료 후 주 작업자에게 다시 source freeze를 통보했다.

# 프로젝트 이동 잠금 보완 RISKS

검사에는 모의 DB·fetch만 사용했다. 실제 DB·서버·메일·배포·커밋·push·브랜치 변경 및 추가 에이전트 생성은 수행하지 않았다. 최신 수정본의 전체 통합 검증은 주 작업자가 독립 수행한다.
