# WS-9 세부기능 표시와 빈 스펙 입력 개선 결과.

## RESULT

세부기능 열의 폭을 88px에서 240px로 늘렸다. 기본 선택창은 유지하면서 선택한 기능명을 여러 줄로 표시해 긴 이름이 잘리지 않도록 했다. 측정단위·자사·경쟁사·설계 목표치 입력칸은 포커스를 받으면 빈칸 안내 `-`를 숨기고 입력 영역에 테두리를 표시한다. 포커스가 해제되면 안내를 복구한다. 저장 데이터와 기존 저장 시점은 유지한다.

## FILES CHANGED

- `components/project/QFDMatrix.tsx`의 세부기능 헤더·열 너비·하단 스펙 입력칸을 수정했다.
- `tests/qfd-matrix-autosave.test.ts`에 긴 이름 표시와 네 종류 빈칸의 포커스·입력·저장 회귀 테스트 5개를 추가했다.

## COMMIT

기존 작업 폴더에서 동일한 QFD 파일에 다른 변경이 있어 이번 작업을 섞어서 커밋하지 않았다. 이번 요청에는 배포가 포함되지 않았다.

## VERIFIED BY

- 구현 전 재현 테스트에서 신규 테스트 5개가 실패하고 기존 43개가 통과했다.
- `npx vitest run tests/qfd-matrix-autosave.test.ts tests/qfd-workspace-visibility.test.ts tests/worksheet-capture.test.ts --reporter=dot`에서 `Test Files 3 passed (3)`, `Tests 57 passed (57)`을 확인했다.
- `npm test`에서 `Test Files 229 passed (229)`, `Tests 3136 passed (3136)`을 확인했다.
- `npm run lint`가 종료 코드 0으로 통과했다.
- `npx tsc --noEmit`이 종료 코드 0으로 통과했다.
- `git diff --check -- components/project/QFDMatrix.tsx tests/qfd-matrix-autosave.test.ts`가 통과했다.

## DEVIATIONS

첫 재현 테스트 실행은 테스트 도구의 임시 파일 이름 변경이 환경 권한 제한으로 실패했다. API를 모킹하고 로컬 더미 DB 주소를 설정한 상태로 제한 없는 실행 환경에서 다시 실행했다.

## RISKS

실제 로그인 화면에서 육안 검증은 하지 않았다. 긴 이름 표시·빈칸 편집·저장·읽기 전용 권한은 React DOM 테스트로 확인했다. 넓어진 표는 기존 가로 스크롤을 이용한다.

## QUESTIONS

없다.
