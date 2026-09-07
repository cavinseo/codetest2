# Task 1 결과 보고서 — 저장 토스트가 헤더 버튼을 가리는 문제

## RESULT

계획서(`docs/superpowers/plans/2026-09-07-notification-toast-position.md`) 대상
13개 파일 전부에서 토스트 컨테이너의 위치 토큰을 `top-6`(또는 `right-6 top-6`
어순)에서 `bottom-6`으로 바꿨다. `right-6 z-[100]`과 색상·애니메이션·
`toast.type` 분기 로직은 그대로 두고, 한 줄당 정확히 한 토큰만 치환했다.

`components/project/AssetsTable.tsx:71`, `components/project/KanoAggregationTable.tsx:87`의
`alert()`/`window.alert()`는 계획서에서 범위 밖으로 명시한 대로 건드리지 않았다.

## FILES CHANGED

| 파일 | 줄 |
|---|---|
| `components/project/KanoManager.tsx` | 604 |
| `components/project/SpecTable.tsx` | 762 |
| `components/project/TechRoadmapTable.tsx` | 136 |
| `components/project/FitnessWrapper.tsx` | 480 |
| `components/project/DevPlanTable.tsx` | 68 |
| `components/project/TargetSpecTable.tsx` | 142 |
| `components/project/RequirementsTable.tsx` | 347 |
| `components/project/ProductAttributesTable.tsx` | 594 |
| `components/project/TechTreeTable.tsx` | 317 |
| `components/project/ImprovementsTable.tsx` | 338 |
| `components/project/SalesTable.tsx` | 226 |
| `components/project/QFDMatrix.tsx` | 608 |
| `app/project/[id]/attributes/fitness/page.tsx` | 225 |
| `docs/superpowers/plans/2026-09-07-notification-toast-position.md` | 신규 |

## COMMIT

`054b83a` — `fix: 저장 토스트가 헤더 버튼을 가리지 않게 우하단으로 옮긴다`

## VERIFIED BY

- **기계적 치환 대조**: 커밋 전 `grep -rn "top-6 right-6\|right-6 top-6" components/
  app/` → 0건, `grep -rln "bottom-6 right-6\|right-6 bottom-6" components/ app/ | wc -l`
  → `13`으로 대상 13곳 전부·정확히 바뀌었음을 확인.
- **diff 표본 대조**: `git diff`로 14개 hunk 전부가 한 줄에 `top-6`↔`bottom-6`
  토큰 하나만 바뀌고 그 외 문자는 동일함을 직접 눈으로 확인
  (예: `KanoManager.tsx`, `TechTreeTable.tsx` — 서로 다른 토큰 어순 두 케이스 모두 확인).
- **게이트(tsc/vitest/next lint): 미실행.** 이유는 RISKS 참조. 대체로 grep 기반
  전수 대조와 diff 육안 검토만 수행했다 — 이는 게이트 재실행의 대체가 아니라
  최소한의 자기 검증이며, 감리자의 독립 게이트 실행을 대신하지 않는다.

## DEVIATIONS

- 계획서 Step 3(전체 게이트 실행)을 완료하지 못했다 — 아래 RISKS 참조. 계획서에도
  같은 내용을 미검증으로 명시해 뒀다.
- 공용 `Toast` 컴포넌트로의 리팩터링은 계획서에서 이미 범위 밖으로 뺐고 실행하지
  않았다(계획대로).

## RISKS

- **게이트 미실행 (가장 중요한 리스크)**: 이 세션에는 `node_modules`가 없고
  `npm install`이 `registry.npmjs.org`에 직결·에이전트 프록시 경유 양쪽 다 403으로
  막혀 있었다 (`curl --noproxy '*' https://registry.npmjs.org/zod` → 403,
  `curl -x http://127.0.0.1:44277 https://registry.npmjs.org/zod` → 403,
  `npm install --offline` → `ENOTCACHED`). 프록시 상태(`/__agentproxy/status`)의
  `recentRelayFailures`에도 별도 호스트(`cdn.sheetjs.com`) 차단 기록이 있어 이
  환경 자체가 외부 레지스트리 접근을 정책적으로 막고 있는 것으로 판단, 재시도하지
  않았다. 전역 `tsc`(6.0.2, `/opt/node22/bin/tsc`)로 대체 시도했으나 프로젝트
  타입 의존성(`@types/react`, `next` 등)이 전혀 없어 이번 변경과 무관한 수백 건의
  `Cannot find module` 오류만 나와 실제 게이트로 쓸 수 없었다(예:
  `app/admin/page.tsx(3,50): error TS2307: Cannot find module 'react'`).
  **`npx tsc --noEmit && npx vitest run && npx next lint`를 npm 접근이 되는
  환경에서 병합 전 반드시 재실행해야 한다.**
  - 다만 이번 변경은 JSX `className` 템플릿 리터럴 안 Tailwind 유틸리티 토큰
    하나씩(13곳)만 바꾼 것이라 타입 오류·테스트 실패로 이어질 표면이 거의 없다고
    본다(새 import·새 분기·시그니처 변경 없음). 그래도 게이트 자체를 대신할 근거는
    아니다.
- **실화면 미검증**: 계획서에 명시한 대로 dev 서버 기동·실화면 확인은 이 세션에서
  하지 않았다(CLAUDE.md 정책 + 어차피 `npm install`이 막혀 dev 서버 자체가 뜨지
  않는다). 사용자가 준 스크린샷(Kano 화면, "Kano 설문 링크이 저장되었습니다!"
  토스트가 "팀원 초대"/"설정" 버튼을 덮은 장면)이 이번 원인 진단의 근거였을 뿐,
  수정 후 우하단에서 실제로 안전하게 뜨는지는 브라우저로 재확인되지 않았다.
- **회귀 테스트 없음**: 토스트 위치를 단언하는 기존 테스트가 없었고 이번에도
  추가하지 않았다 — 저장소에 컴포넌트 렌더링 테스트 인프라(jsdom·
  `@testing-library`)가 없어(2026-08-30-onboarding-redirect-ux.md 계획서에도
  같은 제약이 기록돼 있다) className 문자열을 유의미하게 단언할 방법이 마땅치
  않았다. 화면 검증으로 대신 확인해야 한다.

## QUESTIONS

- 공용 `Toast` 컴포넌트 추출(13곳 중복 제거)을 별도 후속 작업으로 진행할지 —
  이번 계획서 "계획 밖" 절에 후보로만 남겨 뒀다.
