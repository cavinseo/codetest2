# RESULT

Task 2 완료. WS-6·WS-7 모두 점을 전부 그린 뒤 묶음 번호를 별도 라벨 층에 그리도록 계획서 스니펫을 적용했다. 단독 라벨은 흰 글자이며 묶음 라벨에만 #1e293b 테두리 3을 적용했다. 라벨은 pointer-events-none이다.

# FILES CHANGED

- components/Kano2DChart.tsx — import, 반지름 상수 8, labelClusters useMemo, 별도 라벨 층.
- components/project/KanoSatisfactionGraph.tsx — import, 모듈 반지름 상수 6, labelClusters useMemo, 별도 라벨 층.
- docs/superpowers/plans/2026-09-08-timko-overlap-labels.md — Task 2 체크박스.
- 이 보고서.

# COMMIT

작업 커밋 `7e4d1e0`. 보고서는 별도 `docs: Task 2 결과 보고서` 커밋이다. Task 1 작업·보고서 커밋은 `a7a00db`, `bf42539`다.

# VERIFIED BY

`npx tsc --noEmit` — 종료 코드 0, 출력 없음.

`npx vitest run` — 종료 코드 0. 기존 1,235개와 Task 1의 8개를 유지했다.

```text
 Test Files  108 passed (108)
      Tests  1243 passed (1243)
   Duration  4.42s (transform 6.55s, setup 0ms, import 20.73s, tests 5.62s, environment 14ms)
```

`npx next lint` — 종료 코드 0.

```text
✔ No ESLint warnings or errors
```

`git diff --check` — 공백 오류 없음. Git의 LF→CRLF 안내만 있었다.

`git diff -- components/Kano2DChart.tsx components/project/KanoSatisfactionGraph.tsx`로 계획서 스니펫과 diff를 대조했다. 두 파일의 좌표식·색 분기·title 내용은 유지했고 반지름은 값 8·6 그대로 상수화했다. WS-7의 클릭용 투명 원 r=12와 onClick은 유지했다. 상세표는 변경하지 않았다. 기존 테스트 수정 없음. 두 라벨 층은 points.map 뒤에 있으며 stroke와 strokeWidth를 members.length > 1일 때만 지정한다.

순수 모듈의 Stryker 결과는 Task 1 보고서에 기록했다. 해당 모듈은 Task 2에서 수정하지 않았다.

# DEVIATIONS

계획서의 코드 스니펫과 동일하게 적용했다. JSX 렌더링 테스트는 지시대로 만들거나 재시도하지 않았다. Vite 설정 안내 및 next lint 폐기 예정 안내는 기존 상태로 유지했다. 타입·테스트·ESLint 게이트는 모두 통과했다.

# RISKS

라벨 층은 자동 테스트 없이 화면 검증으로 이월한다. WS-6·WS-7에서 묶음 번호의 실제 가독성과 툴팁·클릭 동작은 감리자·사용자가 확인해야 한다. 완전히 겹친 점은 기존과 같이 나중 항목만 클릭되며, 큰 묶음의 긴 라벨이 이웃 점을 덮는 문제는 이번 범위 밖이다. DB·개발 서버 실행, 배포·push는 하지 않았다.

# QUESTIONS

없음. 계획서의 두 쌍 묶음 이후 단독 개수 표기 오류는 Task 1 보고서 DEVIATIONS에 기록했다.
