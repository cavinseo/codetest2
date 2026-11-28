# 결과보고서 단계별 서식 운영 배포.

- 사용자가 승인한 샘플 서식을 적용하고 배포했다.
- 커밋은 `447607670f7db19adbed96345317f675911e4a7c`이며 GitHub main과 codex/report-typography-20260929에 동일하게 푸시했다.
- 운영 주소는 https://codetest2-rouge.vercel.app 이다.
- Production 배포 `6726736393`이 2026-09-29 13:32:59 KST에 success로 확인됐다.
- 고정 배포 주소는 https://codetest2-5caoy4ywx-cavinseos-projects.vercel.app 이다.
- GitHub CI https://github.com/cavinseo/codetest2/actions/runs/36522027668 에서 린트·타입 검사·전체 테스트·빌드가 통과했다. 별도 CRAP / Mutation 워크플로는 확인 시점에 실행 중이었다.
- 운영 도메인에서 테스트 API 응답으로 실제 보고서 UI를 검증했다. AI PLC 관리 장비 조회본과 계층형 분석·개요 테스트 문장을 사용했다.
- 21쪽, WS-2 세부기술 41행과 고객요구사항 15개가 표시됐다. 가로 잘림과 페이지 여백 초과 및 브라우저 오류는 0건이었다.
- 단계별 글자 크기와 들여쓰기, 원문 전체 교정, 초안 저장·재열기, 완료본 열람, 이미지 다운로드와 Word 다운로드가 통과했다.
- Word 다운로드 API는 테스트 과정에서 현재 코드의 렌더러로 대체했다. 실제 로그인 후 운영 API 저장이나 Word 앱 인쇄 검증을 수행한 것은 아니다.
- 운영 데이터 쓰기와 DB 마이그레이션은 없었다. 로컬 검증 서버는 종료했다.
- 증거는 temp_files/report-typography-production/result.json, measurements.json, hierarchy.png, verified-report.docx 및 temp_files/report-typography-ci-success.log에 보관했다.

이 파일은 배포 후 로컬 기록이며 추가 배포 커밋에는 포함하지 않았다.
