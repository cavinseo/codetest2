# 워크시트 금액 단위 천원 통일

## RESULT

매출·자금소요·자금조달의 입력, 합계, 그래프, 엑셀과 새 결과보고서를 천원으로 환산했다. 기존 100백만원은 100,000천원으로 표시한다. 새 입력은 천원이며 저장할 때 기존 백만원 단위로 역환산한다. 기존 데이터와 API·JSON 백업 계약을 유지하며 원격 DB 변경은 수행하지 않았다.

## FILES CHANGED

- lib/money.ts. 공통 환산과 천원 표시를 추가했다. 소수·음수·지수 표기의 환산을 검증했다.
- components/project/SalesTable.tsx, FundingTable.tsx. 기존 값은 천원으로 표시하고 새 입력을 역환산한다. 빈칸과 0을 구분한다.
- components/project/FundingPlanChart.tsx. 축·점 라벨·차액·분기점 금액을 천원으로 맞춘다. 증가율과 분기 연도는 보존한다.
- lib/worksheet-excel-writers.ts. 숫자 셀과 합계 수식의 캐시를 천원으로 변환한다.
- lib/workbook-importer.ts. 명시된 금액 단위를 읽고 저장 단위로 변환한다. 앱 내보내기 양식의 좌측 여백, 독립 매출 기간, 합계행, 병합 분류와 조달 빈칸을 처리해 재업로드 시 실제 금액을 보존한다.
- lib/final-report-template.ts, final-report-worksheet-tables.ts, final-report-table-refresh.ts. 새 보고서와 표 갱신의 숫자·단위 설명을 맞춘다.
- tests/money-unit.test.ts, monetary-worksheet-roundtrip.test.ts, sales-thousand-won.test.ts. 환산·입력 저장 재조회·엑셀 왕복 테스트를 추가했다.
- 기존 자금 그래프·조달 세부행·엑셀·보고서 테스트의 금액 단언을 천원 기준으로 변경했다. 엑셀 출력 해시를 새 금액과 단위에 맞춰 갱신했고 금액·수식·빈칸은 별도 구체적 단언으로 검증했다.

## COMMIT

코드 커밋은 552b4a4ba116d342abd7773baaf314f273b29849다. 브랜치는 codex/money-thousand-won-20261011이다. f96262b 기준 기존 분리 체크아웃에 이번 변경만 커밋했다. E:/Dropbox/codetest2의 기존 다른 수정은 유지했다. push와 배포는 실행하지 않았다.

## VERIFIED BY

실DB 대신 더미 환경변수와 Prisma mock을 사용했다. dev 서버와 원격 DB 쓰기는 실행하지 않았다.

- 재현 테스트. 구현 전 tests/money-unit.test.ts의 8개 테스트가 환산 함수 부재로 실패했다.
- 현재 작업 폴더 npm test. `Test Files 232 passed (232)` / `Tests 3154 passed (3154)`.
- 현재 작업 폴더 npx tsc --noEmit. 종료 코드 0.
- 현재 작업 폴더 npm run lint. 종료 코드 0.
- 현재 작업 폴더 npm run build. 종료 코드 0.
- 분리 체크아웃 npm test. `Test Files 222 passed (222)` / `Tests 3069 passed (3069)`.
- 분리 체크아웃 npm run lint. 종료 코드 0.
- 분리 체크아웃 npm run build. `Compiled successfully in 8.0s`, 정적 페이지 36개 생성, 종료 코드 0. 타입·lint 검사를 포함한다.
- git diff --check. 종료 코드 0.
- 수정 파일은 기존 Stryker mutate 목록 대상이 아니다.

## DEVIATIONS

초기 분리 과정에서 작업 폴더와 배포 기준 사이에 기존 개요의 추가 시장 자료 표시 조건 차이가 드러났다. 해당 조건은 배포 기준을 유지해 이번 커밋에 포함하지 않았다. 그 뒤 전체 테스트와 빌드를 다시 통과했다.

## RISKS

- 완료 보고서와 이미 내려받은 PDF·Word·그림은 저장 당시의 문서다. 새 단위 반영에는 표 갱신 또는 재생성이 필요하다. 이미지에 박힌 숫자는 표 갱신만으로 바뀌지 않아 새 그림 캡처도 필요하다.
- 과거 앱 엑셀은 백만원 숫자에 원 단위를 붙인 오류가 있었다. 이를 식별할 수 있는 옛 앱 양식은 추측 환산을 막기 위해 업로드 오류로 반환한다. 원래 백만원 숫자라면 단위 표기를 백만원으로 고치거나 새 천원 양식을 사용한다.
- 단위 없는 기존 엑셀은 호환성을 위해 백만원으로 해석한다. 새 외부 엑셀은 단위: 천원을 명시해야 한다.
- 멘토 분석·개요 등 자유 서술과 외부 첨부자료의 금액 문장은 일괄 치환하지 않는다. 단위가 사용자 정의인 일반 기술 측정값도 정형 매출·자금 필드와 구별된다.
- 온라인 실계정 저장 확인과 배포는 수행하지 않았다.

## QUESTIONS

없다. 기존 금액의 실제 가치를 유지하고 신규 입력은 천원으로 받는 사용자의 답변을 적용했다.
