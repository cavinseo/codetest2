# WS-9 화면 개선 배포본 검증 결과.

## RESULT

세부기능 열을 88px에서 240px로 넓히고 선택한 기능명을 줄바꿈해 표시했다. 측정단위·자사·경쟁사·설계 목표치의 빈칸은 포커스를 받으면 안내 표시가 사라지고 입력 영역 테두리가 표시된다. 저장 데이터와 기존 저장 시점은 유지한다. 사용자의 배포 지시에 따라 최신 main을 기준으로 이번 변경만 배포용 브랜치에 반영했다.

## FILES CHANGED

- `components/project/QFDMatrix.tsx`의 기술특성 열·헤더·스펙 입력칸을 수정했다.
- `tests/qfd-matrix-autosave.test.ts`에 긴 이름 표시와 네 종류 빈칸의 입력·저장 테스트를 추가했다.

## COMMIT

- 기준 커밋은 `315ea9142eed5d97b047258036dba1883891a7be`이다.
- 작업 커밋은 `307b6a83af655e40008d956d847ca8ecccc72185`이다.
- 배포 브랜치는 `codex/qfd-readable-inputs-20261011`이다.

## VERIFIED BY

- `npm test`가 `Test Files 219 passed (219)`, `Tests 3051 passed (3051)`으로 통과했다.
- `npm run lint`가 종료 코드 0으로 통과했다.
- `npm run build`가 종료 코드 0으로 통과했다.
- 빌드 후 `npx tsc --noEmit`이 종료 코드 0으로 통과했다.
- `git diff --check`가 통과했다.

## DEVIATIONS

기존 작업 폴더에는 동일 파일의 다른 변경이 있어 별도 배포 작업 폴더에 이번 요청의 변경만 옮겼다. 기존 폴더와 배포용 폴더의 전체 테스트 수는 이 차이 때문에 다르다. 빌드와 테스트에는 로컬 더미 DB 주소를 사용했다.

## RISKS

실제 로그인 후 프로젝트 화면의 육안 검증은 수행하지 않았다. 화면 입력·저장 및 기존 동작은 모킹된 React DOM 테스트로 확인했다. 넓어진 표는 기존 가로 스크롤을 사용한다.

## QUESTIONS

없다.
