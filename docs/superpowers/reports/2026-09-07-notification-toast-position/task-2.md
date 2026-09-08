# Task 2 결과 보고서 — 헤더 안 알림 위치와 라이트 모드 대비

## RESULT

Task 1 병합 후 사용자가 지적한 두 가지를 고쳤다.

1. **위치** — 알림을 헤더 우측 버튼 묶음 안, "팀원 초대" 바로 왼편에 표시한다.
   `app/project/[id]/page.tsx` 헤더에 `#header-toast-slot` 자리를 두고 공용
   컴포넌트가 portal 로 거기에 그린다. 같은 flex 흐름이라 `gap-3`(12px)만큼
   자동으로 떨어지고 버튼을 가릴 수 없다. 자리는 `display:contents` 라 알림이
   없을 때 상자를 만들지 않는다 — 빈 div 를 두면 gap 이 늘 남아 버튼이 밀린다.
   슬롯이 없는 화면(독립 워크시트 페이지 등)에서는 기존처럼 우하단 fixed 로 뜬다.

2. **가독성** — 취향 문제가 아니라 CSS 결함이었다. `app/globals.css` 의 라이트
   모드 포괄 규칙 `.light [class*="text-emerald-"] { color:#047857 !important }`
   가 토스트의 `text-emerald-200` 을 어둡게 덮어쓰는데, 배경 `bg-emerald-900/90`
   은 그 규칙들의 대상 목록(surface·gray·white 계열)에 없어 어두운 채로 남는다.
   결과가 어두운 초록 바탕 + 어두운 초록 글자였고, 아이콘도 `currentColor` 라
   같이 묻혔다. 색을 유틸리티 클래스 대신 `.toast-success/error/info` 규칙에서
   두 테마 값으로 직접 지정해 포괄 규칙이 닿지 않게 했다.

곁들여, 13곳이 복제해 들고 있던 토스트 마크업을 공용 `HeaderToast` 로 합쳤다.
Task 1 에서 "범위 확대 방지"로 미뤘던 것이지만, 위치·색을 13곳에서 동일하게
바꿔야 하는 이번 요구를 중복 상태로 구현하면 portal 로직이 13벌 복제된다.

## FILES CHANGED

| 파일 | 변경 |
|---|---|
| `components/HeaderToast.tsx` | 신규 — 공용 토스트(포털 + fallback) |
| `app/globals.css` | `.toast-*` 색 규칙 6개 추가(두 테마) |
| `app/project/[id]/page.tsx` | 헤더에 `#header-toast-slot` 추가 |
| `components/project/{KanoManager,SpecTable,TechRoadmapTable,FitnessWrapper,DevPlanTable,TargetSpecTable,RequirementsTable,ProductAttributesTable,TechTreeTable,ImprovementsTable,SalesTable,QFDMatrix}.tsx` | 중복 토스트 마크업 → `<HeaderToast …>` (12개) |
| `app/project/[id]/attributes/fitness/page.tsx` | 같음 (13번째) |
| `docs/superpowers/plans/2026-09-07-notification-toast-position.md` | Task 2 절 추가 |

## COMMIT

`24bd6f7` — `fix: 저장 알림을 헤더 "팀원 초대" 왼편으로 옮기고 라이트 모드 대비를 고친다`

## VERIFIED BY

- **구문 검사(전 변경 파일 15개)**: 전역 `tsc`(6.0.2)로 의존성 해석 없이 파싱해
  구문 오류가 없음을 확인. `tsc --noEmit --noResolve --jsx preserve --target es2020
  --module esnext <변경 파일 15개>` → `TS1xxx` 진단 0건. **타입 검사가 아니다** —
  의존성이 없어 타입 단계는 돌릴 수 없다.
- **중복 잔존 대조**: `grep -rn "bottom-6 right-6\|right-6 bottom-6\|top-6 right-6\|
  right-6 top-6" components/ app/` → `HeaderToast.tsx` 의 fallback 한 줄만 남음.
  `<HeaderToast` 사용처 13곳, `import HeaderToast` 13곳으로 일치.
- **타입 호환 확인**: 호출부 13곳의 지역 `ToastType` 이 전부
  `'success' | 'error' | 'info'` 의 부분집합임을 정의 위치에서 확인(파일:라인 —
  `ProductAttributesTable.tsx:42`, `RequirementsTable.tsx:24`, `KanoManager.tsx:88`,
  `QFDMatrix.tsx:80`, `fitness/page.tsx:30`, 나머지는 `useState` 제네릭에 인라인).
- **화면 대조(정적 목업)**: 실앱을 띄울 수 없어(아래 RISKS), 헤더 마크업과 새 색
  규칙을 그대로 옮긴 정적 HTML 을 Chromium(Playwright)으로 렌더해 확인했다.
  다크·라이트 모두 글자가 또렷하고, 알림이 "팀원 초대" 왼편에 떨어져 놓인다.
  같은 화면에 예전 색 조합도 함께 렌더해 사용자가 겪은 "안 보이는 글자"가 그대로
  재현되는 것을 확인 — 원인 진단이 맞았음을 뒷받침한다.
  **목업은 실앱이 아니다.** Tailwind 빌드 결과·다른 전역 CSS 와의 상호작용은
  재현하지 못한다.
- **게이트(tsc/vitest/next lint): 미실행** — RISKS 참조.

## DEVIATIONS

- Task 1 계획서에서 "범위 밖"으로 뒀던 공용 Toast 컴포넌트 추출을 이번에 했다.
  이유는 RESULT 마지막 문단에 적었다(중복 유지 시 portal 로직 13벌 복제).
  같은 이유로 이번 변경은 Task 1 보다 diff 가 크다 — 위치 토큰 치환이 아니라
  렌더링 경로 교체다.
- `AssetsTable.tsx`/`KanoAggregationTable.tsx` 의 네이티브 `alert()` 는 이번에도
  건드리지 않았다(Task 1 과 같은 범위 밖 처리).

## RISKS

- **게이트 미실행**: 이 세션은 `node_modules` 가 없고 `npm install` 이
  `registry.npmjs.org` 에 직결·프록시 양쪽 다 403 으로 막혀 있다(Task 1 보고서에
  근거 기록). 따라서 `npx tsc --noEmit` / `npx vitest run` / `npx next lint` 를
  돌리지 못했다. Task 1 보다 diff 성격이 무거우므로(신규 컴포넌트 + import 13개 +
  JSX 교체) **CI 결과를 반드시 확인해야 한다.** 특히 타입 오류는 위에서 한 구문
  검사로는 잡히지 않는다.
- **실화면 미검증**: 목업으로만 확인했다. 실제 화면에서 확인해야 할 것 —
  (a) 헤더가 좁은 화면에서 알림이 버튼을 밀어내지 않는지(현재 `max-w-[420px]` +
  `truncate` 로 제한), (b) 슬롯이 없는 독립 워크시트 페이지에서 우하단 fallback 이
  뜨는지, (c) 라이트/다크 전환 시 색이 즉시 따라오는지.
- **한 번에 여러 알림**: 슬롯은 하나이고 탭 화면은 활성 탭만 렌더하므로 실사용상
  동시 표시는 없다고 봤다. 두 컴포넌트가 동시에 마운트된 채 각자 토스트를 띄우면
  같은 자리에 두 개가 나란히 놓인다 — 막지 않았다.

## QUESTIONS

- 알림이 뜨는 3초 동안 헤더 폭이 좁은 노트북에서 버튼이 눌리는 느낌이 나면,
  알림을 헤더 아래 별도 줄로 내리는 안도 있다. 실화면 확인 후 결정하면 된다.
