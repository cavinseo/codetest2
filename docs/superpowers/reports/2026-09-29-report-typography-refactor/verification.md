# 결과보고서 단계별 서식 리팩토링 검증.

## 범위와 변경 내용.

- 직전에 적용한 단계별 글꼴·들여쓰기 코드 중 배치 계산, 미리보기, Word 출력의 3개 소스 파일을 정리했다.
- 문단 서식 선택과 줄별 소제목·글머리표 해석을 분리했다. Word 문단 생성과 텍스트 줄 생성을 분리했다.
- `mm`, `twip`, `paragraph`, `list`, `whitespace`, `last`, `gap`을 용도와 단위를 드러내는 이름으로 변경했다.
- 소제목·본문 서식과 장 제목 내부 여백을 공통 값으로 통합했다. 배치 계산·미리보기·Word가 같은 여백 값을 참조한다.
- 소비하는 코드가 없는 배치 결과의 `section` 필드를 제거했다. 문단 간격 계산에 필요한 내부 구분은 유지했다. 해당 변경 범위에 주석 처리된 실행 코드는 없었다.
- 원문, 저장 모델, 단계별 크기·들여쓰기, 표지, 페이지 분할, 교정 대상, 표·그림 폭과 다운로드 기능을 유지했다. DB 변경은 없다.

## 변경 전후 비교.

- 기준 커밋은 `447607670f7db19adbed96345317f675911e4a7c`이다. 소스 수정 전에 출력 결과를 저장했다.
- 기본·빈 데이터·분석과 이미지·비운 입력·25열 QFD·실제 프로젝트·계층형 실제 자료·긴 글머리 경계 등 8개 사례에서 문서 모델, 페이지 배치, 미리보기 DOM과 스타일, Word XML이 일치했다.
- 비교 시 제거한 내부 `section` 필드, JSON에 저장되지 않는 undefined 값, Word가 생성하는 임의 식별자만 정규화했다.
- 이전 실행과 새 브라우저 실행의 생성 모델 및 배치 측정값이 일치했다. 21쪽 PNG 캡처 파일은 모두 바이트 단위로 같았다.

## 실행 검증.

- `npm run lint`, `tsc --noEmit --incremental false`, `npm run build`, `git diff --check`를 통과했다.
- 최초 기본 병렬 테스트는 테스트 결과나 JavaScript 스택 없이 Windows 종료 코드 `-1073741819`로 종료됐다. 원인은 확정하지 않았다.
- `npm run test -- --maxWorkers=2`로 전체 테스트를 다시 실행하여 189개 파일, 2,839개 테스트가 모두 통과했다. 프로젝트 테스트 설정은 변경하지 않았다.
- 프로덕션 빌드를 로컬 Chrome에서 실행했다. AI PLC 관리 장비의 저장 조회본에 계층형 멘토 분석·상세 설명을 테스트 입력으로 사용했다.
- 21쪽, WS-2 41행, 고객요구사항 15개를 확인했다. 페이지 초과·가로 잘림·브라우저 오류는 0건이었다.
- 보고서 생성, 원문 전체 교정, 표 셀 교정, 초안 저장·재열기, 완료본 열람, 이미지 및 Word 다운로드가 통과했다.
- API는 테스트 응답으로 대체했다. 운영 데이터 쓰기는 0회다. Word는 파일 생성·다운로드·XML 동등성까지 확인했으며 Word 앱의 실제 인쇄 렌더링은 확인하지 않았다.
- 검증한 3개 소스 파일만 기존 작업 폴더와 동기화했다. 복사 전에 각 파일이 기준 커밋과 같은지 확인하여 다른 변경을 보존했다.
- 이번 작업은 리팩토링과 로컬 검증이며 푸시·배포는 수행하지 않았다.

## 로컬 검증 자료.

- `temp_files/report-typography-refactor-contract.cjs`, `report-typography-refactor-contract.log`, `report-typography-refactor-baseline/`.
- `temp_files/report-typography-refactor-lint.log`, `report-typography-refactor-typecheck.log`, `report-typography-refactor-test.log`, `report-typography-refactor-test-retry.log`, `report-typography-refactor-build.log`.
- `temp_files/verify-report-typography-refactor-browser.cjs`, `report-typography-refactor-browser.log`.
- `temp_files/report-typography-refactor-local/result.json`, `measurements.json`, `generated-model.json`, `page-01.png`부터 `page-21.png`, `hierarchy.png`, `verified-report.docx`.
