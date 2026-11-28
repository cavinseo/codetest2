# Kano 응답자별 삭제 기능 독립 검증 결과.

## RESULT.

멘토·멘티의 응답자별 선택 삭제 및 전체 삭제를 구현하고 주 작업자의 독립 검증을 완료했다. 삭제 전에 대상 인원, 복구 불가 및 응답 완료 상태 초기화를 확인한다. 취소하면 요청을 보내지 않는다. 응답자의 초대 내역은 유지하며 해당 프로젝트·해당 응답자의 모든 문항만 삭제한다.

멘티는 별도 응답자 보기 진입점으로 접근하며 TIMKO 상세 분석과 가중치 편집의 기존 권한은 유지한다. 이름으로 저장된 업로드 응답도 원래 식별 문자열 그대로 삭제할 수 있다. 삭제 중 선택·삭제 버튼과 현재 프로젝트 내부 탭 이동을 잠그며, 다른 프로젝트의 화면 이동은 계속 허용한다.

## FILES CHANGED.

제품 소스 5개와 관련 테스트 4개에 한정했다. 기존 작업이 있는 파일은 구현 전 사본 `tmp/kano-delete-baseline/**/*.baseline.txt`와 대조했다. 기능 변경만 포함한 diff는 `tmp/kano-respondent-deletion.diff`이다.

- `components/project/KanoRespondentTable.tsx`.
- `components/project/KanoManager.tsx`.
- `components/project/KanoAnalysisTab.tsx`.
- `app/api/projects/[id]/kano/responses/route.ts`.
- `lib/kano-response-reset.ts`.
- `tests/api-kano-response-delete.test.ts`.
- `tests/kano-respondent-delete.test.ts`.
- `tests/kano-response-reset.test.ts`.
- `tests/kano-analysis-visibility.test.ts`.

## VERIFIED BY.

주 작업자가 구현 보고서와 별도로 직접 확인했다.

- 변경 범위와 실제 authorization 호출, `projectId` 및 응답자 식별키 필터, 트랜잭션 안의 초대 상태 초기화를 소스에서 대조했다.
- 구현 전 응답 API·저장 함수로 잠시 되돌려 새 API/저장 테스트를 실행했을 때 `19 failed | 10 passed (29)`로 누락 기능이 재현됐다. 수정본은 finally에서 바이트 단위로 복원했다.
- 이름 응답자의 삭제 검증만 이전 이메일 스키마로 되돌렸을 때 `2 failed | 27 passed (29)`로 기존 업로드 이름 응답의 차단이 재현됐다. 수정본은 즉시 복원했다.
- 관련 검사 독립 실행에서 5개 파일 60개 검사가 통과했다. 후속 리뷰 보완 후 전체 게이트를 다시 실행했다.
- 최종 `npm run lint` 종료 코드 0이다. 기록은 `tmp/kano-delete-lint-verified.log`이다.
- 최종 `npm run test`에서 `Test Files 248 passed (248)`, `Tests 3431 passed (3431)`이며 종료 코드 0이다. 기록은 `tmp/kano-delete-test-verified.log`이다.
- 최종 `npm run build`에서 Next.js 최적화 빌드와 타입 검사가 통과했으며 종료 코드 0이다. 기록은 `tmp/kano-delete-build-verified.log`이다.
- 변경 파일의 `git diff --check`가 통과했다. CRLF 변환 안내 외 오류는 없다.

초기 독립 검사는 샌드박스의 Vite 임시 캐시 rename 제한 때문에 실제 테스트가 수집되지 않았다. 해당 실행은 테스트 실패 재현으로 인정하지 않았다. 권한이 승인된 실행 환경에서 mock 검사를 다시 실행해 위 결과를 확인했다. DB 쓰기나 마이그레이션은 수행하지 않았다.

## REVIEW.

대화 맥락 없이 diff를 받은 Blind hunter, Edge case hunter 및 스펙을 받은 Acceptance auditor의 독립 검토를 수행했다. 발견한 기존 이름 응답의 검증 불일치, 삭제 대기 중 탭 이동에 따른 오류·선택 유실, 초대 전체 리셋 후 재조회 실패의 오래된 초대 표시를 보완했다. 후속 검토에서 다른 프로젝트의 화면까지 잠기는 문제를 보완했다. 최종 각 발견사항의 해소를 확인했고 추가 실질 결함은 보고되지 않았다.

## BROWSER.

`tmp/preview-kano-deletion.cjs`로 실제 KanoManager 및 하위 컴포넌트를 빌드해 127.0.0.1에 바인딩한 메모리 데이터 화면에서 검증했다. 제품 API 대신 모의 API를 사용하며 실제 사용자나 DB 데이터는 포함하지 않는다.

- 멘티 모드에 응답자별 보기·행 선택·선택 삭제·전체 삭제가 표시되고 분석 결과 진입점은 표시되지 않았다.
- ‘홍길동’ 한 명을 선택하고 모의 확인 응답을 취소했을 때 3행과 선택이 유지됐다.
- 확인한 선택 삭제 후 ‘홍길동’만 사라지고 나머지 2행이 유지되며 선택 수가 0으로 갱신됐다.
- 멘토 모드에 분석 진입점이 표시됐고 전체 선택 및 전체 삭제 후 빈 응답 목록으로 갱신됐다.
- 모의 API 요청 기록은 정확히 2건이며 첫 payload는 `{respondentEmails:["홍길동"]}`, 두 번째 전체 삭제는 본문이 없는 요청이다. 기록은 `tmp/kano-delete-browser-memory-result.json`이다.
- 화면 증거는 `output/kano-respondent-delete-2026-10-14-preview.jpg`이다. 임시 viewport 설정을 복구했다.

인앱 브라우저 자동화가 표준 JavaScript 확인창을 처리하는 데 멈춰 초기 검증 탭을 닫았다. 이후 브라우저 검증에서 확인 함수의 문구를 기록하고 모의 확인·취소 값을 반환하는 검증용 shim을 사용했다. 제품 코드는 표준 `window.confirm`을 그대로 사용하며 native 확인 호출·취소·확인 동작은 실제 컴포넌트의 DOM 테스트에서 별도로 검증했다. 실제 운영 브라우저의 native 확인창 수동 조작은 수행하지 않았다.

## RISKS.

이 기록 작성 시점에는 운영에 미배포였다. 이후 2026-10-15 사용자의 명시적 배포 요청에 따라 워크시트 입력 수정과 함께 운영에 배포했다. 배포 ID는 `dpl_3pkxjBfcXkivx3bFV8e8uLDZPyRa`이며 자세한 근거는 `docs/superpowers/reports/2026-10-15-pending-worksheet-kano-release/task-deployment.md`에 기록했다. 실제 접수 응답을 삭제하지 않았고 이메일 발송, 스키마 변경, Git commit 및 push도 수행하지 않았다. 기존 사용자 변경을 보존했다.
