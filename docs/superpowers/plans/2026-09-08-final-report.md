# 결과보고서(.docx) 생성 Implementation Plan

> Steps use checkbox (`- [ ]`) syntax for tracking.
> **상태: 초안 — Task 0(양식 수령·분석)이 끝나야 Task 1 이후를 확정한다.**

**Goal:** 프로젝트의 KS-QFD 작업 결과를 제공된 결과보고서 양식에 맞춰 문서로 내려받는다.
본문에는 프로젝트 **개요**가 들어가고, **몇몇 워크시트는 그림(이미지)으로 첨부**된다.

**요청 원문(2026-09-08):** "결과보고서 기능 추가가 필요하다. 계획을 수립하라. 결과보고서
양식을 제공되며 결과보고서 내 내용 중 일부는 개요와 몇몇 워크시트 내용이 첨부될
(그림파일로) 첨부될 것임."

---

## 현황 (감리자가 코드에서 직접 확인한 사실)

### 이미 있는 것 — 재사용 대상

| 무엇 | 어디 | 재사용 방법 |
|---|---|---|
| **Word(.docx) 출력 선례** | `lib/kano-survey-document.ts`(순수 모델) → `lib/kano-survey-docx.ts`(렌더러) → `app/api/projects/[id]/kano/survey-document/route.ts` | 같은 3층 구조를 그대로 따른다. `docx` ^9.5.0 의존성 이미 있음 |
| **개요 데이터** | `Project.name / description / detailedDescription / businessPlanFile`, `Program.name / organization / startsAt / endsAt` | `GET /api/projects/[id]/overview` 가 프로젝트·완성도를 이미 돌려준다 (`app/api/projects/[id]/overview/route.ts:113-122`) |
| **워크시트 전체 데이터** | `GET /api/projects/[id]/export` — 스펙·속성·요구사항·기술특성·QFD·Kano·벤치마크를 한 번에 | 본문 표(텍스트)가 필요해지면 이 응답을 쓴다. 단, 매출·기술체계도·개선포인트·목표스펙·로드맵·개발계획·자산·자금은 빠져 있다 (`export/route.ts:19-29`) |
| **워크시트 완성도 계산** | `lib/worksheet-completeness.ts` `calculateWorksheetCompleteness` | 개요의 "작성 현황" 요약에 쓸 수 있다 |
| **워크시트 16종** | `app/project/[id]/page.tsx:324-339` — WS-1~17 (WS-8 없음), 각각 클라이언트 컴포넌트 | 그림 캡처 대상 후보 |

### 그림 캡처 관점에서 본 워크시트 렌더 방식

- 차트는 **전부 인라인 SVG** — `components/Kano2DChart.tsx`, `components/project/KanoSatisfactionGraph.tsx`,
  `components/CategoryPieChart.tsx` (각 `<svg>` 1개). 캔버스·외부 차트 라이브러리 없음.
- 표는 HTML `<table>`. WS-9 QFD 는 가로 스크롤(`overflow-x-auto`)이라 화면 폭보다 넓다.
- **DOM→이미지 라이브러리가 없다.** `package.json` 에 html-to-image / html2canvas / dom-to-image /
  puppeteer / playwright / sharp 어느 것도 없다. 하나 들여야 한다.
- 워크시트는 탭 하나만 마운트된다(`activeTab`). 여러 장을 한 번에 캡처하려면 그 컴포넌트들을
  보고서 화면에서 **함께 마운트**해야 한다.

### 없는 것

- 결과보고서·최종보고서 관련 코드·계획·스펙이 전혀 없다 (`grep` 0건).
- **양식 파일이 아직 없다.** 사용자가 제공 예정. 형식(docx/hwpx/pdf) 미확정.

---

## 결정 대기 — Task 0 에서 사용자와 확정할 것

이 다섯 개가 정해지지 않으면 Task 1 이후 코드 좌표가 바뀐다. 계획서는 **1번을 .docx 로
가정**하고 썼다.

1. **양식 파일 형식** — `.docx` / `.hwpx` / `.pdf` 중 무엇인가?
   - `.docx` → 선례(Kano)와 같이 `docx` 로 양식을 재현한다. **권장 경로.**
   - `.hwpx` → 이 저장소의 Node/Next 런타임에는 HWPX 를 쓰는 라이브러리가 없다.
     `.docx` 로 만들고 사용자가 한글에서 여는 방식, 또는 PDF 출력으로 협의해야 한다.
   - `.pdf` → 시각 기준으로만 삼고 `.docx` 를 낸다.
2. **그림으로 넣을 워크시트** — 어느 것인가? (양식이 지정하면 그대로, 아니면 후보:
   WS-7 TIMKO/만족계수 그래프, WS-9 QFD, WS-4 적합도, WS-10 기능기술체계도)
3. **개요에 들어갈 항목** — 프로젝트명·설명·상세설명은 확실. 프로그램명·주관기관·기간·
   팀원·작성일·작성 현황(완성도)은 양식이 정한다.
4. **출력 형식** — `.docx` 내려받기만? PDF 도? (PDF 는 별도 변환 계층이 필요해 범위가 커진다)
5. **진입점** — 프로젝트 헤더 버튼(`팀원 초대` 옆) vs 워크시트 메뉴의 별도 탭 vs 개요 카드 안.

---

## Architecture

### 선택: 브라우저에서 캡처하고, 브라우저에서 문서를 조립한다

```
[보고서 화면]  /project/[id]/report
   │  1. 개요 + 선택 워크시트 데이터 fetch (기존 GET API 그대로)
   │  2. 선택 워크시트 컴포넌트를 인쇄 폭(고정 px)으로 마운트 → 사용자가 미리보기 확인
   │  3. 「생성」 → 각 워크시트 DOM 을 html-to-image 로 PNG 캡처
   │  4. buildFinalReportModel(개요, 그림들)  ← lib/final-report-document.ts (순수)
   │  5. renderFinalReportDocx(model)          ← lib/final-report-docx.ts (docx, 브라우저에서 실행)
   ▼
 .docx Blob → <a download>
```

**왜 서버가 아니라 브라우저에서 조립하는가.** 그림은 브라우저에만 있다(DOM 캡처). 서버에서
조립하려면 PNG 를 올려야 하는데, Vercel 서버리스 요청 본문 한도(약 4.5MB)에 워크시트 몇 장의
캡처가 걸릴 수 있다. `docx` 는 브라우저에서도 동작한다(`Packer.toBlob`). 텍스트 데이터는
이미 있는 GET API 로 받으므로 새 서버 라우트가 필요 없다. 서버에서 만들어야 할 이유(비밀
자산·서버 전용 폰트)가 Task 0 에서 나오면 그때 라우트를 더한다 — 모델·렌더러는 동형이라
어느 쪽에서 돌려도 같다.

**왜 미리보기 화면을 두는가.** 워크시트 컴포넌트는 각자 데이터를 fetch 한다. "다 불러왔다"는
신호를 16개 컴포넌트에 새로 심는 것은 침습적이다. 대신 사용자가 화면에서 전부 그려진 것을
보고 「생성」을 누르게 하면 그 신호가 필요 없고, 캡처 결과를 넣기 전에 눈으로 확인하는
단계가 자연스럽게 생긴다.

**왜 순수 모델을 따로 두는가.** 이 저장소에는 컴포넌트 테스트 인프라(jsdom·testing-library)가
없다. 문서의 절 구성·문구·표 내용을 정하는 로직을 순수 함수로 빼면 vitest + stryker 로 검증할
수 있고, 렌더러는 Kano 선례처럼 스모크 테스트(zip 헤더 `PK`)만 한다.

### 대안 (Task 0 결과에 따라 전환)

- **서버 조립**: `app/api/projects/[id]/final-report/route.ts` 가 DB 에서 텍스트를 읽고,
  클라이언트가 보낸 PNG 를 `ImageRun` 으로 넣는다. 본문 한도 위험을 감수해야 한다.
- **양식 파일 직접 채우기(템플레이팅)**: `docxtemplater` 류로 양식 .docx 의 자리표시자를 치환한다.
  이미지 모듈이 유료/커뮤니티라 의존성 부담이 있고, 선례가 `docx` 재현 방식이므로 기본 선택은
  아니다. 양식이 복잡한 서식(머리말·로고·다단)을 요구하면 재검토한다.

### 새 의존성

- `html-to-image` (MIT, SVG·foreignObject 처리가 html2canvas 보다 낫다). `npm install` 은
  npm 접근이 되는 환경(실행 AI 로컬 또는 CI)에서 한다 — 이 감리 세션은 레지스트리가 막혀 있다.

---

## Global Constraints

- CLAUDE.md 최우선 제약: 원격 실DB — `prisma migrate deploy`/`db push`/`studio`, DB 에 쓰는
  스크립트, **dev 서버 기동** 전부 금지. 이 기능은 **스키마 변경이 없다**(읽기만 한다).
  실화면 검증은 감리자·사용자가 한다.
- git `reset`/`checkout`/브랜치 이동/`push`/reflog 조작 전면 금지. 커밋만 허용.
- 들여쓰기 4칸. 주석은 한국어 "~다" 체이고 무엇이 아니라 **왜**를 적는다.
- 테스트는 `tests/` 평면 배치, Prisma 는 `vi.mock('../lib/prisma', ...)` 로 mock.
- 완료 기준: `npx tsc --noEmit` + `npx vitest run` + `npx next lint`
  + **신규 순수 모듈 stryker 100%** (`lib/final-report-document.ts`, `lib/report-image-fit.ts`).
- 키·비밀번호·이메일을 문서·로그에 남기지 않는다. 팀원 목록을 넣게 되면 **이름만**, 이메일 제외.
- 계획서 체크박스 `[x]` 갱신을 작업 커밋에 포함한다. 보고서는
  `docs/superpowers/reports/2026-09-08-final-report/task-<n>.md` 로 **별도의 둘째 커밋**.

---

## File Structure

| 파일 | 책임 | 변경 |
|---|---|---|
| `docs/superpowers/specs/2026-09-08-final-report-design.md` | 양식 분석 결과: 절 목록, 각 절의 데이터 출처, 그림 대상 | Create (Task 0) |
| `lib/final-report-document.ts` | 개요·완성도·그림 목록 → `FinalReportModel` (순수) | Create |
| `lib/report-image-fit.ts` | 캡처 px 크기 → 문서 폭에 맞춘 mm 크기 계산 (순수) | Create |
| `lib/final-report-docx.ts` | `FinalReportModel` → `.docx` Blob/Buffer (동형) | Create |
| `lib/worksheet-capture.ts` | DOM 노드 → PNG dataURL (브라우저 전용, html-to-image 감싸기) | Create |
| `app/project/[id]/report/page.tsx` | 미리보기 + 「결과보고서 생성」 | Create |
| `app/project/[id]/page.tsx` | 헤더에 진입 버튼 (Task 0 의 5번 결정에 따름) | Modify |
| `components/project/ProjectWorksheetMenu.tsx` | 메뉴 항목 (진입점을 메뉴로 정하면) | Modify(조건부) |
| `tests/final-report-document.test.ts` | 모델 조립 규칙 | Create |
| `tests/report-image-fit.test.ts` | 크기 계산 경계 | Create |
| `tests/final-report-docx.test.ts` | 스모크 — Blob 이 zip(`PK`)이고 그림 개수만큼 media 가 들어감 | Create |
| `stryker.crap.config.json` | 신규 순수 모듈 2개 등록 | Modify |
| `package.json` / `package-lock.json` | `html-to-image` | Modify |

---

### Task 0: 양식 수령·분석·설계 확정 (사람 + 감리자)

**Files:** `docs/superpowers/specs/2026-09-08-final-report-design.md` (Create)

- [ ] **Step 1: 양식 파일을 받는다** — 형식(docx/hwpx/pdf)을 확인하고 저장소에 커밋한다
  (`docs/assets/final-report-template.<ext>`). 양식에 개인정보·기관 로고가 있으면 로고만
  `public/` 에 두고 원본은 커밋하지 않는다.
- [ ] **Step 2: 절(section) 목록을 표로 뽑는다** — 각 절마다 `종류(텍스트|표|그림) / 데이터 출처
  (Project 필드·API·워크시트 id) / 비고`. 이것이 `FinalReportModel` 의 형태를 결정한다.
- [ ] **Step 3: 「결정 대기」 5개를 확정한다** — 사용자와 합의한 답을 spec 에 적는다.
- [ ] **Step 4: 그림 대상 워크시트의 캡처 폭을 정한다** — A4 세로 본문 폭 170mm 기준으로
  가로 1400px 캡처를 기본으로 하고, WS-9 처럼 넓은 표는 **가로 페이지(landscape) 절**로
  넣을지 결정한다.

**Task 0 완료 판정:** spec 문서에 절 표가 있고, 5개 결정이 전부 채워져 있다. 이 문서가 Task 1~4 의
정본이 된다 — 계획서의 아래 인터페이스는 spec 에 맞춰 수정한다.

---

### Task 1: 순수 모델 — `lib/final-report-document.ts` + `lib/report-image-fit.ts`

**Interfaces (초안 — Task 0 후 확정):**

```typescript
// lib/final-report-document.ts
export interface FinalReportOverviewInput {
    projectName: string;
    description: string | null;
    detailedDescription: string | null;
    programName: string;
    organization: string;
    programStartsAt: string;   // ISO
    programEndsAt: string;     // ISO
    generatedAt: string;       // ISO — 호출자가 넘긴다(Date.now 를 모델 안에서 쓰지 않는다)
}

export interface CapturedWorksheetImage {
    worksheetId: string;       // 'qfd' | 'kano-aggregation' | ...
    title: string;             // '[WS-9] QFD'
    pngDataUrl: string;
    widthPx: number;
    heightPx: number;
}

export type FinalReportBlock =
    | { kind: 'heading'; text: string; level: 1 | 2 }
    | { kind: 'paragraph'; text: string }
    | { kind: 'keyValueTable'; rows: Array<{ label: string; value: string }> }
    | { kind: 'image'; title: string; pngDataUrl: string; widthMm: number; heightMm: number; landscape: boolean };

export interface FinalReportModel {
    title: string;
    fileName: string;          // `결과보고서_<프로젝트명>.docx` — 파일명 금지 문자 치환
    blocks: FinalReportBlock[];
}

export function buildFinalReportModel(
    overview: FinalReportOverviewInput,
    images: CapturedWorksheetImage[],
): FinalReportModel;

export function finalReportFileName(projectName: string): string;
```

```typescript
// lib/report-image-fit.ts
// 캡처한 px 크기를 문서 본문 폭에 맞춘다. 비율을 지키고, 세로가 한 쪽을 넘으면 세로 기준으로 줄인다.
export const A4_PORTRAIT_BODY = { widthMm: 170, heightMm: 257 };   // 20mm 여백
export const A4_LANDSCAPE_BODY = { widthMm: 257, heightMm: 170 };

export function fitImageToBody(
    widthPx: number, heightPx: number,
    body: { widthMm: number; heightMm: number },
): { widthMm: number; heightMm: number };

// 가로/세로 비율이 이 값을 넘으면 가로 페이지에 넣는다. 양식이 정하면 그 값으로 바꾼다.
export function shouldUseLandscape(widthPx: number, heightPx: number, threshold?: number): boolean;
```

- [ ] **Step 1: 실패하는 테스트를 쓴다** — `tests/final-report-document.test.ts`,
  `tests/report-image-fit.test.ts`
  - 개요 값이 null 이면 빈 문자열이 아니라 `'-'` 로 표기 (양식이 빈칸을 싫어하면 Task 0 에서 바꾼다)
  - 파일명에 `/ \ : * ? " < > |` 가 있으면 `_` 로 치환 (Kano 의 `kanoSurveyFileName` 과 같은 규칙)
  - 그림이 0장이면 그림 절을 만들지 않는다
  - `fitImageToBody`: 폭 초과 → 폭 기준 축소, 세로 초과 → 세로 기준 축소, 둘 다 안 넘으면 원 크기(px→mm 96dpi), 0 또는 음수 입력은 예외
- [ ] **Step 2: 실패를 확인한다** — `npx vitest run tests/final-report-document.test.ts tests/report-image-fit.test.ts`
- [ ] **Step 3: 모델과 크기 계산을 구현한다**
- [ ] **Step 4: 통과 확인 후 stryker 등록·100% 확인**
  `stryker.crap.config.json` `mutate` 에 두 파일 추가 →
  `npx stryker run stryker.crap.config.json --mutate lib/final-report-document.ts` /
  `--mutate lib/report-image-fit.ts` → 각각 `100.00`. 등가 뮤턴트는 `// Stryker disable next-line <Mutator>: <이유>` 로 제외하고 총 뮤턴트 감소 수를 보고서에 적는다.
- [ ] **Step 5: 커밋** — `feat: 결과보고서 문서 모델과 그림 크기 계산(순수)`

---

### Task 2: 렌더러 — `lib/final-report-docx.ts`

**Interfaces:**

```typescript
// 브라우저(Blob)와 서버(Buffer) 어느 쪽에서도 돌아야 한다 — Task 0 결과로 조립 위치가 바뀔 수 있다.
export async function renderFinalReportDocx(model: FinalReportModel): Promise<Blob | Buffer>;
```

- [ ] **Step 1: 스모크 테스트** — `tests/final-report-docx.test.ts`
  결과 앞 2바이트가 `PK`, 그리고 zip 안 `word/media/` 항목 수가 그림 수와 같다
  (jszip 을 들이지 않고 `docx` 의 `Packer.toBuffer` 결과를 zip 시그니처만 세는 방식이면 충분하다 —
  개수 검증이 어렵다면 `PK` 만 확인하고 RISKS 에 적는다).
- [ ] **Step 2: 구현** — Kano 렌더러의 `PAGE`/`cell` 관용구를 따르되, `image` 블록은
  `ImageRun({ data, transformation: { width, height } })` 로 넣고 `landscape` 면 별도 section
  (`PageOrientation.LANDSCAPE`)으로 나눈다. 글꼴은 선례와 같이 `맑은 고딕`.
- [ ] **Step 3: 커밋** — `feat: 결과보고서 .docx 렌더러`

---

### Task 3: 캡처 — `lib/worksheet-capture.ts` + 의존성

- [ ] **Step 1: `html-to-image` 를 설치한다** (`npm install html-to-image`, lock 파일 커밋)
- [ ] **Step 2: 캡처 함수를 만든다**

```typescript
// 브라우저 전용. 워크시트 루트 노드를 PNG dataURL 로 만든다.
// 가로 스크롤 표(overflow-x:auto)는 스크롤 폭만큼 잠시 펼쳐서 잘리지 않게 한다.
export async function captureWorksheetNode(node: HTMLElement, options?: { pixelRatio?: number }):
    Promise<{ pngDataUrl: string; widthPx: number; heightPx: number }>;
```

  - 캡처 중 **라이트 테마 강제**: 어두운 배경 그대로 종이 문서에 들어가면 안 된다. 캡처 컨테이너에
    `.light` 스코프를 씌우는 방식이 되는지 확인한다(테마 클래스는 `<html>` 에 있어 `globals.css` 의
    `.light` 규칙이 `.light .xxx` 형태라 하위 스코프에서도 먹는다 — 확인 필요).
  - `pixelRatio` 기본 2. 파일 크기가 커지면 1.5 로 내린다.
- [ ] **Step 3: 커밋** — `feat: 워크시트 DOM 을 PNG 로 캡처하는 유틸`

컴포넌트 테스트 인프라가 없어 이 파일은 단위 테스트 대상이 아니다. 실화면 검증 항목으로 넘긴다.

---

### Task 4: 화면 — `app/project/[id]/report/page.tsx` + 진입점

- [ ] **Step 1: 보고서 페이지** — 개요를 `GET /overview` 로 받아 상단에 표시하고, spec 이 정한
  워크시트 컴포넌트들을 **고정 폭 컨테이너(예: 1400px)** 안에 세로로 마운트한다. 각 컨테이너에
  `data-worksheet-id` 를 붙여 캡처 대상을 찾는다.
- [ ] **Step 2: 「결과보고서 생성」 버튼** — 순서대로 캡처 → `buildFinalReportModel` →
  `renderFinalReportDocx` → `URL.createObjectURL` 로 내려받기. 진행 중에는 버튼을 잠그고
  "n/총 장 캡처 중" 을 표시한다. 실패하면 어느 워크시트에서 실패했는지 `HeaderToast` 로 알린다.
- [ ] **Step 3: 진입점** — Task 0 의 5번 결정에 따라 헤더 버튼 또는 메뉴 항목을 넣는다.
- [ ] **Step 4: 게이트** — `npx tsc --noEmit && npx vitest run && npx next lint`
- [ ] **Step 5: 커밋** — `feat: 결과보고서 미리보기·생성 화면`

---

## 감리 체크리스트 (Task 승인 게이트)

1. **Task 0 spec 이 먼저 있는가** — 양식 없이 Task 1 을 시작했다면 반려한다.
2. 모델이 `Date.now()` 를 직접 부르지 않는가 — 생성 시각은 입력으로 받는다(테스트 결정성).
3. `fitImageToBody` 가 비율을 지키는가 — 테스트에 가로·세로 두 방향 초과 케이스가 다 있는가.
4. 문서에 **이메일·토큰이 들어가지 않는가** — 팀원을 넣더라도 이름만.
5. 캡처가 **라이트 테마**로 되는가 — 어두운 배경 캡처는 반려.
6. 신규 순수 모듈 2개가 stryker `mutate` 에 있고 100% 인가. disable 주석은 이유가 있는가.
7. 감리자 직접 재실행: tsc 0 · vitest 전체 통과 · lint 0.
8. **실화면**: 프로젝트 하나에서 생성 → Word 로 열어 개요·그림이 양식 자리에 들어갔는가,
   WS-9 가 잘리지 않았는가, 파일명이 `결과보고서_<프로젝트명>.docx` 인가.

## 리스크

- **양식 형식이 hwpx 이면** 이 계획의 렌더러 선택이 바뀐다. Task 0 에서 가장 먼저 확인한다.
- **캡처 품질**: `html-to-image` 는 `foreignObject` 기반이라 브라우저 간 차이가 있다(특히 Safari 폰트).
  Chrome 기준으로 만들고, 다른 브라우저는 RISKS 로 남긴다.
- **넓은 표(WS-9)**: 1400px 캡처를 170mm 에 넣으면 글자가 작아진다. 가로 페이지로 넣거나
  그룹을 접은 상태로 캡처하는 선택지를 Task 0 에서 정한다.
- **다운로드 차단**: 일부 브라우저 정책이 `<a download>` 를 막을 수 있다 — Kano 설문지 내려받기가
  이미 같은 방식으로 동작하므로 이 앱 환경에서는 문제없다고 본다.
- **데이터 완성도**: 빈 워크시트를 캡처하면 빈 표가 들어간다. 완성도(`worksheetCompleteness`)가
  `EMPTY` 인 워크시트는 미리보기에서 경고를 띄우되 막지는 않는다(양식이 빈 절을 허용하는지는 Task 0).

## 계획 밖 (사람이 하는 일)

- **양식 제공** — 사용자. 이것이 없으면 Task 1 이후를 시작하지 않는다.
- **실화면 검증** — dev 서버 기동은 실행 AI 에게 위임하지 않는다. 감리자·사용자가 프리뷰
  배포에서 생성 → Word 로 열어 확인한다.
- **PDF 출력** — 이번 범위 밖. 필요하면 브라우저 인쇄(미리보기 화면에 `@media print`)를 별도
  계획으로 검토한다.
- **서버 조립 전환** — Task 0 에서 서버 전용 자산이 필요하다고 판명되면 `final-report/route.ts`
  Task 를 추가한다.
