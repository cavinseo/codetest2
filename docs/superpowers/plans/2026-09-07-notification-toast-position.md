# 저장/에러 토스트가 헤더 버튼을 가리는 문제 Implementation Plan

> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 프로젝트 화면에서 저장 완료·실패 토스트("저장되었습니다" 등)가 화면 우상단에
고정 표시되는데, 그 자리가 헤더의 "팀원 초대"·"설정" 버튼과 겹쳐 토스트가 떠 있는 동안
버튼을 가린다(사용자 스크린샷으로 확인: Kano 워크시트에서 "Kano 설문 링크이
저장되었습니다!" 토스트가 헤더 버튼 위를 덮음).

**Architecture:** 원인은 컴포넌트 13곳이 각자 토스트 UI를 복제해 들고 있고
(공용 컴포넌트 없음), 전부 `fixed top-6 right-6 z-[100]` (또는 `right-6 top-6`)
로 동일하게 뷰포트 우상단에 고정한다는 것이다. 헤더(`app/project/[id]/page.tsx`)는
`z-10`인 반면 토스트는 `z-[100]`이라 항상 헤더 위에 그려진다.

공용 컴포넌트로 추출하는 안도 검토했으나 이번 작업 범위에서는 뺀다 — AGENTS.md
"단순성 우선"(요청받지 않은 추상화 금지) 원칙과 "좁고 안전한 변경" 원칙에 따라,
13곳 모두 같은 토큰 치환(`top-6` → `bottom-6`, 순서만 다른 곳은 `right-6 top-6`
→ `right-6 bottom-6`) 한 번으로 끝나는 기계적 수정이면 충분하다. 공용화는 후속
과제로 별도 제안한다(계획 밖 절 참조).

**왜 `bottom-6`인가 (헤더 높이에 안 얽매이는 안을 택한 이유):** 헤더 높이를 재서
`top-24` 같은 값으로 내리는 안도 있었지만, 헤더 구조가 화면마다 다르다
(`app/project/[id]/page.tsx`는 헤더+탭 내비 2단, `app/project/[id]/attributes/fitness/page.tsx`는
자체 레이아웃). 화면마다 다른 오프셋을 계산해 넣으면 유지보수 중 어긋나기 쉽다.
반면 우하단은 13곳 전부 헤더·탭 내비와 절대 겹치지 않는 빈 공간이라 화면별 조정 없이
안전하다. 토스트를 하단에 두는 것은 흔한 관례이기도 하다.

**Tech Stack:** 기존과 동일. 로직·의존성 변경 없음 — Tailwind 클래스 토큰만 바꾼다.

## Global Constraints

- CLAUDE.md 최우선 제약: 원격 실DB — `prisma migrate deploy`/`db push`/`studio`, DB 에
  쓰는 스크립트, **dev 서버 기동** 전부 금지. 이번 작업에는 DB 도 서버도 필요 없다
  (순수 클래스명 치환, API·데이터 흐름 변경 없음).
- git `reset`/`checkout`/브랜치 이동/`push`/reflog 조작 전면 금지. 커밋만 허용.
- 들여쓰기 4칸. 이번 작업은 새 주석·새 파일이 없으므로 해당 없음.
- 완료 기준: `npx tsc --noEmit` 통과 + `npx vitest run` 전체 통과 +
  `npx next lint` 통과. (신규 순수 모듈 없음 — stryker 대상 아님.)
- 계획서 체크박스 `[x]` 갱신을 작업 커밋에 포함한다.
- 보고서는 `docs/superpowers/reports/2026-09-07-notification-toast-position/task-1.md`
  로 작업 커밋과 **별도의 둘째 커밋**.

## 대상 13곳 (감리자가 직접 grep 으로 확인한 좌표)

| # | 파일 | 줄 | 현재 토큰 순서 |
|---|---|---|---|
| 1 | `components/project/KanoManager.tsx` | 604 | `top-6 right-6` |
| 2 | `components/project/SpecTable.tsx` | 762 | `top-6 right-6` |
| 3 | `components/project/TechRoadmapTable.tsx` | 136 | `top-6 right-6` |
| 4 | `components/project/FitnessWrapper.tsx` | 480 | `top-6 right-6` |
| 5 | `components/project/DevPlanTable.tsx` | 68 | `top-6 right-6` |
| 6 | `components/project/TargetSpecTable.tsx` | 142 | `top-6 right-6` |
| 7 | `components/project/RequirementsTable.tsx` | 347 | `top-6 right-6` |
| 8 | `components/project/ProductAttributesTable.tsx` | 594 | `top-6 right-6` |
| 9 | `components/project/TechTreeTable.tsx` | 317 | `right-6 top-6` |
| 10 | `components/project/ImprovementsTable.tsx` | 338 | `right-6 top-6` |
| 11 | `components/project/SalesTable.tsx` | 226 | `right-6 top-6` |
| 12 | `components/project/QFDMatrix.tsx` | 608 | `right-6 top-6` |
| 13 | `app/project/[id]/attributes/fitness/page.tsx` | 225 | `top-6 right-6` |

**범위 밖 (같은 화면군이지만 다른 결함):** `components/project/AssetsTable.tsx:71`
과 `components/project/KanoAggregationTable.tsx:87`은 토스트가 아니라 브라우저
네이티브 `alert()`/`window.alert()`를 쓴다. 위치 문제가 아니라 별개의 UX 불일치이므로
이번 계획에 넣지 않는다.

---

### Task 1: 토스트를 헤더와 겹치지 않는 우하단으로 옮긴다

**Files:** 위 표의 13개 파일.

**Interfaces:** 없음 — JSX `className` 문자열 안의 Tailwind 유틸리티 토큰만 바꾼다.
`toast` state·`showToast` 함수 시그니처는 그대로 둔다.

- [x] **Step 1: 13곳 전부 위치 토큰을 바꾼다**

각 파일에서 토스트 컨테이너의 `className`(또는 템플릿 리터럴) 안 위치 토큰만 바꾼다.
그 외 색상·테두리·애니메이션·타입 분기 로직은 손대지 않는다.

- `top-6 right-6` → `bottom-6 right-6` (1~8, 13번 파일)
- `right-6 top-6` → `right-6 bottom-6` (9~12번 파일)

예 (`components/project/KanoManager.tsx:604`):

```diff
-                <div className={`fixed top-6 right-6 z-[100] flex items-center gap-3 px-5 py-3 rounded-xl shadow-2xl border animate-fade-in transition-all ${toast.type === 'success' ? 'bg-emerald-900/90 border-emerald-500/40 text-emerald-200'
+                <div className={`fixed bottom-6 right-6 z-[100] flex items-center gap-3 px-5 py-3 rounded-xl shadow-2xl border animate-fade-in transition-all ${toast.type === 'success' ? 'bg-emerald-900/90 border-emerald-500/40 text-emerald-200'
```

- [x] **Step 2: 13곳 전부 바뀌었는지, 다른 `fixed top-6`/`fixed right-6 top-6` 잔존이
  없는지 확인한다**

```sh
grep -rn "top-6 right-6\|right-6 top-6" components/ app/
```

Expected: 결과 0건 (전부 `bottom-6`으로 바뀌어 더 이상 매치되지 않아야 한다).

```sh
grep -rln "bottom-6 right-6\|right-6 bottom-6" components/ app/ | wc -l
```

Expected: `13`.

- [ ] **Step 3: 전체 게이트를 돌린다 — 이 세션에서는 실행 불가, 미검증으로 이월**

```sh
npx tsc --noEmit
npx vitest run
npx next lint
```

Expected: tsc 출력 없음 / vitest 기존 테스트 수 그대로 전체 통과(이번 작업은 테스트를
추가·삭제하지 않는다 — 토스트 위치를 단언하는 기존 테스트가 없다) / lint 경고·오류 0건.

**미검증 사유:** 이 원격 세션은 `node_modules`가 없고 `npm install`이
`registry.npmjs.org`에서 프록시 경유·직결 양쪽 다 403으로 막혀 있다(정책 차단 —
README 지침대로 재시도하지 않았다). 전역 `tsc`(6.0.2)로 시도했지만 프로젝트
타입 의존성(`@types/react`, `next` 등)이 없어 이번 변경과 무관한 수백 건의
"Cannot find module" 오류만 나와 실제 게이트로 쓸 수 없었다. 이번 변경은 JSX
`className` 문자열의 Tailwind 토큰 치환 1개씩(13개 파일)뿐이라 타입·로직 위험은
낮지만, **병합 전 npm 접근이 되는 환경에서 위 3개 명령을 반드시 재실행해
확인해야 한다.**

- [x] **Step 4: 커밋한다**

계획서 체크박스 `[x]` 갱신을 포함한다.

```sh
git add components/project/KanoManager.tsx components/project/SpecTable.tsx \
        components/project/TechRoadmapTable.tsx components/project/FitnessWrapper.tsx \
        components/project/DevPlanTable.tsx components/project/TargetSpecTable.tsx \
        components/project/RequirementsTable.tsx components/project/ProductAttributesTable.tsx \
        components/project/TechTreeTable.tsx components/project/ImprovementsTable.tsx \
        components/project/SalesTable.tsx components/project/QFDMatrix.tsx \
        "app/project/[id]/attributes/fitness/page.tsx" \
        docs/superpowers/plans/2026-09-07-notification-toast-position.md
git commit
```

메시지: `fix: 저장 토스트가 헤더 버튼을 가리지 않게 우하단으로 옮긴다`
본문에 **왜**를 적는다 — 13개 컴포넌트가 토스트를 복제해 들고 있고 전부
`z-[100]`으로 헤더(`z-10`) 위에 고정돼 "팀원 초대"·"설정" 버튼을 가렸다는 것,
화면마다 헤더 구조가 달라 상단 오프셋 대신 항상 빈 공간인 우하단을 택했다는 것.
트레일러는 세션 지침의 attribution 을 따른다.

그다음 보고서를 `docs/superpowers/reports/2026-09-07-notification-toast-position/task-1.md`
로 쓰고 **둘째 커밋** (`docs: Task 1 결과 보고서`). 형식은 RESULT / FILES CHANGED /
COMMIT / VERIFIED BY / DEVIATIONS / RISKS / QUESTIONS.

---

## 감리 체크리스트 (Task 승인 게이트)

1. 13개 파일 전부 `bottom-6`으로 바뀌었는가 — `grep -rn "top-6 right-6\|right-6 top-6"
   components/ app/` 결과가 0건인가
2. 색상·테두리·애니메이션·`toast.type` 분기 로직 등 위치 토큰 외의 다른 부분이
   바뀌지 않았는가 (diff 각 hunk 가 딱 한 토큰 치환인가)
3. `AssetsTable.tsx`/`KanoAggregationTable.tsx`의 `alert()`를 건드리지 않았는가
   (범위 밖으로 명시했다)
4. 감리자 직접 재실행: tsc 0 · vitest 전체 통과(테스트 수 불변) · lint 0

## 계획 밖 (사람이 하는 일)

- **실화면 검증** — dev 서버 기동은 실행 AI 에게 위임하지 않는다. 감리자·사용자가
  수행한다. 검증 항목: Kano(또는 다른 워크시트)에서 저장 동작을 눌러 토스트가
  뜰 때 헤더의 "팀원 초대"·"설정"·다크모드 버튼이 가려지지 않는지, 우하단에서
  자연스럽게 사라지는지 확인.
- **공용 Toast 컴포넌트로의 리팩터링** — 13곳이 토스트를 복제해 들고 있는 근본 원인은
  이번 계획에서 고치지 않는다(범위 확대 방지). 다음에 토스트 스타일을 또 바꿔야 하면
  13곳을 또 손대야 한다는 위험이 남는다 — 별도 계획으로 제안 가능.
  → **Task 2 에서 실제로 그 일이 벌어져 공용화했다.**

---

### Task 2: 헤더 안 "팀원 초대" 왼편으로 옮기고 라이트 모드 대비를 고친다

**왜 다시 손대는가:** Task 1 병합 후 사용자가 두 가지를 지적했다.
(1) 우하단은 눈에 띄지 않는다, (2) 녹색 바탕에 글자가 보이지 않는다.
(2)는 취향 문제가 아니라 실제 CSS 결함이었다 — `app/globals.css` 의 라이트 모드
포괄 규칙 `.light [class*="text-emerald-"] { color:#047857 !important }` 가 토스트의
`text-emerald-200` 을 **어둡게** 덮어쓰는데, 배경 `bg-emerald-900/90` 은 그 규칙들의
대상 목록(surface·gray·white 계열)에 없어 **어두운 채로 남는다.** 결과가 어두운 초록
바탕 + 어두운 초록 글자다. 아이콘도 `currentColor` 라 같이 묻혔다.

**확정된 설계:**
- 위치는 헤더 우측 버튼 묶음 안, **"팀원 초대" 바로 왼편**. 픽셀 오프셋으로 맞추지
  않고 헤더 안에 자리(`#header-toast-slot`)를 두고 portal 로 그린다 — 같은 flex
  흐름에 놓이므로 `gap-3` 만큼 자동으로 떨어지고 버튼을 가릴 수 없다.
  자리는 `display:contents` 라 알림이 없을 때 상자를 만들지 않는다(빈 div 면 gap 이
  늘 남아 버튼이 밀린다).
- 자리가 없는 화면(독립 워크시트 페이지 등)에서는 기존처럼 우하단 fixed 로 떨어진다.
- 색은 유틸리티 클래스 대신 `globals.css` 의 `.toast-success/error/info` 로 두 테마
  값을 직접 못 박는다. 포괄 규칙이 글자만 덮어쓰는 사고를 구조적으로 막는다.
- 13곳의 중복 토스트 마크업은 공용 `components/HeaderToast.tsx` 로 대체한다.
  Task 1 에서 "범위 확대 방지"로 미뤘지만, 이번 요구(위치·색을 13곳에서 동일하게
  바꿔야 함)를 중복 상태로 구현하면 portal 로직이 13벌 복제된다.

- [x] **Step 1: 공용 컴포넌트와 색 규칙을 만든다** — `components/HeaderToast.tsx`,
  `app/globals.css` 의 `.toast-*` (대비 흰 글자 5.5:1 / 라이트 6.8:1 이상, WCAG AA)
- [x] **Step 2: 헤더에 자리를 만든다** — `app/project/[id]/page.tsx` 의 우측 버튼
  묶음 첫 자식으로 `#header-toast-slot`
- [x] **Step 3: 13곳의 토스트 마크업을 공용 컴포넌트 호출로 바꾼다**
- [x] **Step 4: 정적 목업을 브라우저로 렌더해 두 테마의 가독성과 위치를 확인한다**
  (실앱은 `npm install` 이 막힌 환경이라 띄울 수 없어, 헤더 마크업과 색 규칙을 그대로
  옮긴 목업을 Chromium 으로 찍어 대조했다 — 예전 상태의 재현까지 같은 화면에 넣어
  원인 진단이 맞는지 함께 확인)
- [ ] **Step 5: 게이트** — 이 세션에서는 Task 1 과 같은 이유로 실행 불가. CI 로 확인한다.

## Task 2 감리 체크리스트

1. 라이트 모드에서 토스트 글자색이 포괄 규칙에 덮이지 않는가 — 색이 유틸리티
   클래스가 아니라 `.toast-*` 규칙에서 오는가
2. 알림이 없을 때 헤더 버튼 위치가 그대로인가 (`display:contents` 확인)
3. 슬롯이 없는 화면에서도 토스트가 뜨는가 (fallback 경로)
4. 13곳 전부 공용 컴포넌트를 쓰고 중복 마크업이 남지 않았는가
