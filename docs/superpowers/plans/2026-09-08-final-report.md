# 결과보고서(.docx) 생성 Implementation Plan

> Steps use checkbox (`- [ ]`) syntax for tracking.
> **상태: Task 0 완료.** 양식 분석·전 절 매핑·핵심 결정 2건이 끝났다. 아래는 그 결과를
> 반영한 확정 아키텍처다. 정본은
> `docs/superpowers/specs/2026-09-08-final-report-design.md` — 이 계획서와 어긋나면
> spec 이 이긴다.

**Goal:** 프로젝트의 KS-QFD 작업 결과를 사용자가 제공한 16쪽 결과보고서 양식(Ⅰ~Ⅴ)에
맞춰 **`.docx`** 로 내려받는다. 대부분의 절은 기존 워크시트 DB 값을 그대로 표로 재현하고,
시각화가 복잡한 3곳(WS-4 적합도, WS-7 Kano 산점도, WS-9 QFD 매트릭스)만 화면을 캡처한
그림으로 넣는다. 앱에 저장할 자리가 없는 서술형 항목 5개만 보고서 화면에서 그때그때
입력받고 DB 에 저장하지 않는다.

**요청 원문(2026-09-08):** "결과보고서 기능 추가가 필요하다. 계획을 수립하라. 결과보고서
양식을 제공되며 결과보고서 내 내용 중 일부는 개요와 몇몇 워크시트 내용이 첨부될
(그림파일로) 첨부될 것임." → 양식 수령 후 매핑한 결과, "몇몇"에 해당하는 그림 대상은
**WS-4·WS-7·WS-9 세 곳**이고 나머지는 표 데이터로 재현한다(아래 표 참조).

---

## Task 0 결과 요약

전체 절별 매핑 표는 spec 문서에 있다. 여기서는 이번 계획에 직접 영향을 주는 결론만 옮긴다.

**확정된 것:**
1. 출력 형식 `.docx`. Kano 설문지 선례(순수 모델→렌더러→다운로드)의 3층 구조를 그대로 쓴다.
2. 그림 캡처 대상은 **WS-4(적합도), WS-7(Kano 2D 산점도), WS-9(QFD 매트릭스) 세 곳뿐**.
3. 서술형 항목(제품 이미지, 시장정의, 목표고객, 최종목표스펙 설명, 개선 제품명/설명)은
   **보고서 화면에서 즉석 입력, DB 미저장** — 이번 기능이 새
   마이그레이션을 요구하지 않는다(PR #32 의 마이그레이션 적용은 이 기능과 무관하게 여전히
   남아 있는 별개 작업이다).
4. "코치명"은 **기존** `GET /api/projects/[id]/mentors` 로 조회한다(`ProjectMember.role
   = 'COACH'`). 새 API 불필요. 단 이 라우트는 `canAssignMentor`(ADMIN·PROGRAM_MANAGER)
   에만 열려 있어 멘티가 자기 프로젝트 보고서를 만들 때는 403 이 난다 — **403 을 오류로
   다루지 않고 코치명을 빈칸으로 둔다**(마이그레이션·권한 변경 없이 가장 단순한 처리).
5. 자금 비교 꺾은선그래프(13쪽)는 이번 범위에서 뺀다 — `FundingPlan` 표만 넣는다.
6. **개선방향성 절(12쪽)은 WS-13 을 그대로 읽는다.** 초안에서는 "열 이름이 안 맞는다"고
   적었으나 `components/project/TechRoadmapTable.tsx` 를 직접 확인하니 WS-13 화면 제목이
   `[WS-13] KS-QFD를 활용한 제품/서비스의 개선 방향성`, 열이 `개선 방향(차별화) / 개선기능
   및 성능향상 / 구현가능성 / 목표 고객` 으로 이 절과 동일했다. Prisma 필드명
   (`category`/`techItem`/`currentLevel`/`targetLevel`)만 옛 로드맵 잔재다 — 필드명이 아니라
   화면이 부여한 의미로 매핑한다.

## 문서 구조 — 5개 절, 데이터 출처별로 나눈 블록

`FinalReportModel` 이 담아야 하는 전체 내용이다. spec 문서 매핑 표의 "유형" 열을 그대로
옮겼다 — **DB**(기존 값으로 표 재현) / **IMG**(화면 캡처) / **FREE**(보고서 화면 즉석 입력,
미저장).

| 절 | 하위 항목 | 유형 | 데이터 출처 |
|---|---|---|---|
| 표지 | 기업명·작성일 | DB | `Project.name`, 생성 시각(호출자가 넘긴다) |
| 표지 | 코치명 | DB(soft) | `GET /mentors` — 403/빈 배열이면 빈칸 |
| Ⅰ | 제품명·제품설명 | DB | `Project.name` / `description` |
| Ⅰ | 제품 이미지 / 시장정의 / 목표고객 | **FREE** | 보고서 화면 입력 |
| Ⅰ | 매출 현황·목표매출액 표 2개 | DB | `SalesEstimate`(WS-1) — 한 행에 amount(현황)·futureAmount(목표) 둘 다 있어 표를 둘로 쪼갠다 |
| Ⅱ | (AS-IS) 스펙표 | DB | `SpecFunction`(WS-2), level CORE→SUB→DETAIL 평면화 |
| Ⅱ | 제품속성서 | DB | `ProductAttribute`(WS-3) |
| Ⅱ | 속성 적합도 매트릭스 | **IMG** | WS-4 화면 캡처 |
| Ⅲ | 고객요구사항 도출표 | DB | `CustomerRequirement`(WS-5) |
| Ⅲ | Kano 집계표(만족/불만족계수·품질·가중치) | DB | Kano 분석 결과 — Task 1 에서 실제 응답 필드 확인 |
| Ⅲ | Kano 2D 산점도 | **IMG** | WS-7 화면 캡처 |
| Ⅲ | Competitive Assessment(가중치·자사·경쟁사·품질중요도·RANK 등) | DB | `qfd/analysis` 의 `requirements` 배열 |
| Ⅲ | 개선포인트점수 기반 고객니즈 우선순위 | DB | `ImprovementItem`(WS-11, type='need') |
| Ⅲ | Engineering Metrics: 기술요구사항 도출 | DB | `TechTreeEntry`(WS-10) |
| Ⅲ | 고객수요기반 기술스펙 관계도(◎○△ + 측정단위/자사/경쟁사/설계목표치) | **IMG** | WS-9 화면 캡처 |
| Ⅲ | 개선포인트기반 개선 기능/성능 List | DB | `ImprovementItem`(type='feature') |
| Ⅳ | 최종목표스펙 항목별 설명 | **FREE** | 보고서 화면 입력(스펙별 자유 서술) |
| Ⅳ | 최종 제품/서비스 제공 스펙 List | DB | `TargetSpec`(WS-12) |
| Ⅳ | 핵심자산·보완자산 도출표 | DB | `AssetItem`(WS-15) |
| Ⅳ | 개선 제품명·개선 제품설명 | **FREE** | 보고서 화면 입력 |
| Ⅳ | KS-QFD 개선 방향성 | DB | `TechRoadmap`(WS-13) — 화면 열 순서대로 category/techItem/currentLevel/targetLevel |
| Ⅴ | 자금소요계획표(3년) | DB | `FundingPlan`(WS-16) |
| Ⅴ | 자금조달계획표(3년) | DB | `FundingSource`(WS-17) |

**필요 GET 엔드포인트 정리 (`/export` 에 없는 것들):**
`sales`(WS-1, `{rows}`) · `tech-tree`(WS-10, **`{entries}`**) · `improvements`(WS-11, `{items}`) ·
`target-spec`(WS-12, `{rows}`) · `tech-roadmap`(WS-13, `{rows}`) · `assets`(WS-15, `{assets}`) ·
`funding`(WS-16+17 **한 라우트**, `{plans, sources}`) · `kano/analysis`(`{requirements}`) ·
`mentors`(코치명, `{mentors}`, soft-fail)
+ 기존 `overview`, `export`(스펙·속성·요구사항·기술특성·QFD·Kano), `qfd/analysis`.
전부 기존 라우트다 — **신규 서버 라우트 없음.**

---

## Architecture

### 브라우저에서 캡처하고, 브라우저에서 문서를 조립한다

```
[보고서 화면]  /project/[id]/report
   │  1. 위 표의 모든 GET 을 병렬 fetch (신규 라우트 없음, 코치명은 403 을 빈칸으로 처리)
   │  2. FREE 항목 5개(제품이미지·시장정의·목표고객·최종목표스펙설명·
   │     개선제품명/설명)를 화면 폼에서 입력받는다 — DB 저장 없음
   │  3. WS-4·WS-7·WS-9 세 컴포넌트를 인쇄 폭(고정 px) 컨테이너에 마운트 → 사용자가 확인
   │  4. 「생성」 → 그 3개 DOM 만 html-to-image 로 PNG 캡처
   │  5. buildFinalReportModel(모든 DB 데이터 + FREE 입력 + 캡처 그림)
   │       ↑ lib/final-report-document.ts (순수)
   │  6. renderFinalReportDocx(model)  ← lib/final-report-docx.ts (docx, 브라우저 실행)
   ▼
 .docx Blob → <a download>  파일명: 결과보고서_<프로젝트명>.docx
```

**왜 서버가 아니라 브라우저에서 조립하는가.** 그림은 브라우저에만 있다(DOM 캡처). 서버로
올리면 Vercel 요청 본문 한도(약 4.5MB)에 걸릴 수 있다. `docx` 는 브라우저에서도 동작한다
(`Packer.toBlob`). 텍스트 데이터는 전부 기존 GET API 로 받으므로 새 서버 라우트가 필요
없다.

**왜 캡처 대상을 3개로 좁혔는가.** Task 0 매핑 결과 나머지 14개 표 절은 이미 구조화된
DB 값이라 `docx` 표로 그대로 재현하는 편이 화면 캡처보다 더 선명하고 파일도 작다. 캡처는
관계 기호(◎○△)·병합 셀·산점도처럼 표로 재현하는 비용이 더 큰 3곳에만 쓴다.

**왜 FREE 항목을 DB 에 저장하지 않는가.** 5개 항목은 보고서 한 번 쓸 때의 서술문이라
재사용 빈도가 낮다. `Project` 에 필드를 추가하면 새 마이그레이션이 또 필요해지는데, 이
기능은 이미 있는 데이터만으로 완전히 동작하게 하는 편이 낫다(PR #32 마이그레이션 적용
여부와 무관해진다).

### 새 의존성

- `html-to-image` (MIT). `npm install` 은 npm 접근이 되는 환경(실행 AI 로컬 또는 CI)에서
  한다 — 이 감리 세션은 레지스트리가 막혀 있다.

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
- 키·비밀번호·이메일을 문서·로그에 남기지 않는다. 코치명은 **이름만**, 이메일 제외.
- 계획서 체크박스 `[x]` 갱신을 작업 커밋에 포함한다. 보고서는
  `docs/superpowers/reports/2026-09-08-final-report/task-<n>.md` 로 **별도의 둘째 커밋**.

---

## File Structure

| 파일 | 책임 | 변경 |
|---|---|---|
| `docs/superpowers/specs/2026-09-08-final-report-design.md` | 양식 분석·전 절 매핑(정본) | 완료 |
| `lib/final-report-document.ts` | 모든 절 데이터 + FREE 입력 + 그림 → `FinalReportModel` (순수) | Create |
| `lib/report-image-fit.ts` | 캡처 px 크기 → 문서 폭에 맞춘 mm 크기 계산 (순수) | Create |
| `lib/final-report-docx.ts` | `FinalReportModel` → `.docx` Blob (동형, 브라우저 실행) | Create |
| `lib/final-report-inputs.ts` | 워크시트 API 응답 → 모델 입력 매핑 (순수) | Create |
| `lib/worksheet-capture.ts` | DOM 노드 → PNG dataURL (브라우저 전용, html-to-image 감싸기) | Create |
| `app/project/[id]/report/page.tsx` | 데이터 로딩 + FREE 입력 폼 + WS-4/7/9 마운트 + 「생성」 | Create |
| `app/project/[id]/page.tsx` | 헤더에 "결과보고서" 진입 버튼 추가(팀원 초대 옆) | Modify |
| `tests/final-report-document.test.ts` | 모델 조립 규칙(절마다 표본) | Create |
| `tests/report-image-fit.test.ts` | 크기 계산 경계 | Create |
| `tests/final-report-docx.test.ts` | 스모크 — Blob 이 zip(`PK`) | Create |
| `stryker.crap.config.json` | 신규 순수 모듈 2개 등록 | Modify |
| `package.json` / `package-lock.json` | `html-to-image` | Modify |

**진입점 확정:** 헤더 버튼(`app/project/[id]/page.tsx` 의 "팀원 초대" 옆). 별도 워크시트
탭으로 만들면 `ProjectWorksheetMenu.tsx`/`tabs` 배열에 WS 번호를 끼워 넣어야 하는데,
결과보고서는 워크시트가 아니라 그 결과물이라 성격이 다르다.

---

### Task 1: 순수 모델 — `lib/final-report-document.ts` + `lib/report-image-fit.ts`

**Interfaces (spec 매핑 표를 그대로 타입화):**

```typescript
// lib/final-report-document.ts

export interface FinalReportFreeInput {
    productImageDataUrl: string | null;   // 업로드한 사진 (Ⅰ)
    marketDefinition: string;             // 시장정의 (Ⅰ)
    targetCustomer: string;               // 목표고객 (Ⅰ)
    finalSpecExplanation: string;         // 최종 목표 스펙 설명 (Ⅳ)
    improvedProductName: string;          // 개선 제품명 (Ⅳ)
    improvedProductDescription: string;   // 개선 제품설명 (Ⅳ)
}

export interface FinalReportOverviewInput {
    projectName: string;
    description: string | null;
    coachName: string | null;             // null = 조회 실패/미배정, 빈칸으로 찍는다
    generatedAt: string;                  // ISO — 호출자가 넘긴다(Date.now 를 모델 안에서 쓰지 않는다)
}

// Ⅰ~Ⅴ 의 DB 표 절 14개를 각자의 행 배열로 받는다. 필드명은 각 워크시트 API 응답 그대로
// 받고(변환은 이 파일 안에서), Task 0 표의 항목 순서를 따른다.
//
// ※ 아래 필드명은 감리자가 라우트·스키마를 직접 읽고 확정한 것이다(2026-09-08).
//   추정이 아니므로 실행 AI 는 재조사하지 말고 이대로 쓴다.
export interface FinalReportWorksheetData {
    // GET /sales → { rows }. 현재/목표 매출은 amount·futureAmount 가 아니라
    // period 로 갈린다('Y' = 기준연도, 'Y_PLUS_1' = 향후 1년). 표 두 개는 period 로 나눈다.
    salesEstimates: Array<{ period: string; customer: string | null; amount: number; futureAmount: number; competitor: string | null }>;
    // GET /export → specFunctions. level 은 'CORE' | 'SUB' | 'DETAIL', parentId 로 트리를 이룬다.
    specFunctions: Array<{ id: string; level: string; parentId: string | null; name: string; technology: string | null }>;
    // GET /export → productAttributes
    productAttributes: Array<{ productName: string | null; customerName: string | null; marketSegment: string | null; customerNeed: string | null; benefit: string | null; attribute: string | null; techCapability: string | null }>;
    // GET /export → customerRequirements
    requirements: Array<{ id: string; category: string; subcategory: string | null; requirement: string }>;
    // GET /kano/analysis → { requirements }. 행에 요구사항 '문구'가 없고 requirementId 만
    // 있다 — 위 requirements 와 id 로 조인해야 항목명이 나온다.
    // 양식 8쪽 열 대응: better=만족계수, worse=불만족계수, timkoCategory=품질, kanoWeight=가중치
    kanoAggregation: Array<{ requirementId: string; responseCount: number; better: number; worse: number; kanoWeight: number; autoKanoWeight: number; timkoCategory: string; quadrant: string }>;
    // GET /qfd/analysis → { requirements }. 타입 정본은 lib/qfd-worksheet.ts 의
    // QfdRequirementWorksheetRow. 자사/경쟁사는 self/competitor 가 아니라 selfScore/competitorScore 다.
    competitiveAssessment: Array<{ requirementId: string; requirement: string; weight: number; weightPercent: number; selfScore: number; competitorScore: number; planQuality: number; improvementRate: number; absoluteImportance: number; qualityImportancePercent: number; rank: number | null }>;
    // GET /improvements → { items }. ImprovementItem 은 같은 3개 컬럼을 type 에 따라
    // 다른 뜻으로 재사용한다 — 아래 두 배열은 호출자가 type 으로 갈라서 넘긴다.
    improvementNeeds: Array<{         // type='need'
        content: string | null;         // 고객니즈
        improvementRate: string | null; // 경쟁사대비 수준향상율
        devProportion: string | null;   // 개발향상비중
    }>;
    improvementFeatures: Array<{      // type='feature' — 같은 컬럼, 다른 뜻
        content: string | null;         // 개선포인트 우선순위(고객니즈)
        improvementRate: string | null; // 추가 기능
        devProportion: string | null;   // 성능향상
    }>;
    // GET /tech-tree → { entries } — 이 라우트만 배열 키가 rows 가 아니라 entries 다.
    techTree: Array<{ customerVoice: string | null; coreSpec: string | null; subSpec: string | null; techCharacteristic: string | null }>;
    // GET /target-spec → { rows, asIsRows, suggestions, ... } — 보고서는 rows 만 쓴다.
    targetSpecs: Array<{ category: string | null; subCategory: string | null; specItem: string | null; unit: string | null; targetValue: string | null; note: string | null }>;
    // GET /tech-roadmap → { rows }. Prisma 필드명이 옛 로드맵 잔재라 화면 열 의미를 못박는다.
    improvementDirections: Array<{
        category: string | null;      // 개선 방향(차별화)
        techItem: string | null;      // 개선기능 및 성능향상
        currentLevel: string | null;  // 구현가능성
        targetLevel: string | null;   // 목표 고객
    }>;
    // GET /assets → { assets }. category/content 의 뜻이 type 에 따라 다르다
    // (CORE: content=핵심자산 / COMPLEMENTARY: category=필요항목, content=해결방안).
    assets: Array<{ type: string; category: string | null; content: string | null }>;
    // GET /funding → { plans, sources } — 두 표가 한 라우트에서 함께 온다.
    fundingPlans: Array<{ category: string | null; item: string | null; year1: number; year2: number | null; year3: number | null }>;
    fundingSources: Array<{ category: string | null; year1: string | null; year2: string | null; year3: string | null }>;
}

export interface CapturedWorksheetImage {
    worksheetId: 'fitness' | 'kano-aggregation' | 'qfd';
    title: string;
    pngDataUrl: string;
    widthPx: number;
    heightPx: number;
}

export type FinalReportBlock =
    | { kind: 'heading'; text: string; level: 1 | 2 }
    | { kind: 'paragraph'; text: string }
    | { kind: 'keyValueTable'; rows: Array<{ label: string; value: string }> }
    | { kind: 'dataTable'; headers: string[]; rows: string[][] }
    | { kind: 'image'; title: string; pngDataUrl: string; widthMm: number; heightMm: number; landscape: boolean };

export interface FinalReportModel {
    title: string;
    fileName: string;   // `결과보고서_<프로젝트명>.docx` — 파일명 금지 문자 치환
    blocks: FinalReportBlock[];
}

export function buildFinalReportModel(
    overview: FinalReportOverviewInput,
    worksheets: FinalReportWorksheetData,
    freeInput: FinalReportFreeInput,
    images: CapturedWorksheetImage[],
): FinalReportModel;

export function finalReportFileName(projectName: string): string;
```

```typescript
// lib/report-image-fit.ts — Task 0 초안과 동일, 변경 없음
export const A4_PORTRAIT_BODY = { widthMm: 170, heightMm: 257 };
export const A4_LANDSCAPE_BODY = { widthMm: 257, heightMm: 170 };
export function fitImageToBody(widthPx: number, heightPx: number, body: { widthMm: number; heightMm: number }): { widthMm: number; heightMm: number };
export function shouldUseLandscape(widthPx: number, heightPx: number, threshold?: number): boolean;
```

- [x] **Step 1: 각 API 응답 필드를 확정한다** — **감리자가 완료했다(2026-09-08).** 위
  인터페이스의 필드명·주석이 그 결과다. 실행 AI 는 재조사하지 않는다. 확정 과정에서
  초안의 추정 4개가 틀린 것으로 드러났다: ① 매출 현재/목표는 `amount`/`futureAmount` 가
  아니라 `period`('Y'/'Y_PLUS_1') 로 갈린다 ② QFD 자사·경쟁사는 `selfScore`/`competitorScore`
  ③ `ImprovementItem` 에는 `customerNeed`/`addedFeature` 필드가 없고 `content`/
  `improvementRate`/`devProportion` 을 `type` 에 따라 다른 뜻으로 재사용한다 ④ 자금계획은
  `/funding-plan`+`/funding-source` 두 라우트가 아니라 `/funding` 하나가
  `{ plans, sources }` 를 함께 준다.
- [x] **Step 2: 실패하는 테스트를 쓴다** — `tests/final-report-document.test.ts`,
  `tests/report-image-fit.test.ts`
  - 14개 DB 절 각각 최소 1개 표본 행으로 `dataTable`/`keyValueTable` 블록이 나오는지
  - 행이 0개인 절은 빈 표 대신 "입력된 데이터가 없습니다" 문구만 넣는다(빈 표보다 명확)
  - `coachName`이 null 이면 "코치명" 값이 빈 문자열이 아니라 `'미배정'`
  - FREE 입력이 빈 문자열이면 문서에서 그 문단을 아예 만들지 않는다(빈 절 방지)
  - 파일명 금지 문자(`/ \ : * ? " < > |`) 치환 (Kano 의 `kanoSurveyFileName` 과 같은 규칙)
  - `fitImageToBody`: 폭 초과 → 폭 기준 축소, 세로 초과 → 세로 기준 축소, 둘 다 안 넘으면
    원 크기(px→mm 96dpi), 0 또는 음수 입력은 예외
- [x] **Step 3: 실패를 확인한다**
- [x] **Step 4: 모델과 크기 계산을 구현한다**
- [x] **Step 5: 통과 확인 후 stryker 등록·100% 확인**
  `stryker.crap.config.json` `mutate` 에 두 파일 추가 →
  `npx stryker run stryker.crap.config.json --mutate lib/final-report-document.ts` /
  `--mutate lib/report-image-fit.ts` → 각각 `100.00`. 등가 뮤턴트는
  `// Stryker disable next-line <Mutator>: <이유>` 로 제외하고 총 뮤턴트 감소 수를
  보고서에 적는다.
- [x] **Step 6: 커밋** — `feat: 결과보고서 문서 모델과 그림 크기 계산(순수)`

---

### Task 2: 렌더러 — `lib/final-report-docx.ts`

```typescript
export async function renderFinalReportDocx(model: FinalReportModel): Promise<Blob>;
```

- [x] **Step 1: 스모크 테스트** — `tests/final-report-docx.test.ts` — 결과 앞 2바이트가 `PK`.
- [x] **Step 2: 구현** — Kano 렌더러(`lib/kano-survey-docx.ts`)의 `PAGE`/`cell` 관용구를
  따른다. `dataTable` 블록은 `Table`+`TableRow`로, `image` 블록은
  `ImageRun({ data, transformation: { width, height } })` 로 넣고 `landscape` 면 별도
  section(`PageOrientation.LANDSCAPE`)으로 나눈다. 글꼴은 선례와 같이 `맑은 고딕`.
- [x] **Step 3: 커밋** — `feat: 결과보고서 .docx 렌더러`

---

### Task 3: 캡처 — `lib/worksheet-capture.ts` + 의존성

- [x] **Step 1: `html-to-image` 를 설치한다** (`npm install html-to-image`, lock 파일 커밋)
- [x] **Step 2: 캡처 함수를 만든다**

```typescript
// 브라우저 전용. 워크시트 루트 노드를 PNG dataURL 로 만든다.
export async function captureWorksheetNode(node: HTMLElement, options?: { pixelRatio?: number }):
    Promise<{ pngDataUrl: string; widthPx: number; heightPx: number }>;
```

  - 캡처 중 **라이트 테마 강제**: 캡처 컨테이너에 `.light` 클래스를 씌운다(테마 클래스는
    `<html>` 에 있고 `globals.css` 의 `.light .xxx` 규칙이 하위 스코프에서도 먹는지 Task 3
    에서 직접 확인).
  - WS-9 는 가로 스크롤(`overflow-x-auto`) 표라 캡처 전 컨테이너 폭을 스크롤 폭만큼
    일시적으로 넓혀 잘리지 않게 한다.
  - `pixelRatio` 기본 2.
- [x] **Step 3: 커밋** — `feat: 워크시트 DOM 을 PNG 로 캡처하는 유틸`

컴포넌트 테스트 인프라가 없어 이 파일은 단위 테스트 대상이 아니다. 실화면 검증 항목으로 넘긴다.

---

### Task 4: 화면 — `app/project/[id]/report/page.tsx` + 진입점

- [x] **Step 1: 데이터 로딩** — 「필요 GET 엔드포인트 정리」의 라우트를 병렬 fetch.
  `mentors` 는 403 이면 `coachName: null` 로 넘기고 다른 오류로 취급하지 않는다.
- [x] **Step 2: FREE 입력 폼** — 텍스트 5개(시장정의·목표고객·최종목표스펙설명·개선제품명·
  개선제품설명) + 제품 이미지 업로드(`<input type="file">` → dataURL, 서버 전송 없음).
- [x] **Step 3: WS-4/WS-7/WS-9 세 컴포넌트를 인쇄 폭 컨테이너에 마운트** — 각각
  `data-worksheet-id` 를 붙여 캡처 대상을 찾는다.
- [x] **Step 4: 「결과보고서 생성」 버튼** — 캡처(3장) → `buildFinalReportModel` →
  `renderFinalReportDocx` → `URL.createObjectURL` 로 내려받기. 진행 중 버튼 잠금 +
  "n/3 캡처 중" 표시. 실패하면 어느 워크시트에서 실패했는지 `HeaderToast` 로 알린다.
- [x] **Step 5: 진입점** — `app/project/[id]/page.tsx` 헤더에 버튼 추가.
- [ ] **Step 6: 게이트** — `npx tsc --noEmit && npx vitest run && npx next lint`
  **미실행.** 감리 세션에 node_modules 가 없고 npm 레지스트리가 403 이라 프로젝트
  설정으로 돌릴 수 없었다. 대신 전역 tsc 로 (1) 신규 파일 파싱, (2) 수정한
  `app/project/[id]/page.tsx` 의 변경 전후 오류 프로파일 동일, (3) 순수 lib 3개
  모듈의 `--strict` 타입 검사 0건을 확인했다. 사용자 환경에서 실행이 남아 있다.
- [x] **Step 7: 커밋** — `feat: 결과보고서 미리보기·생성 화면`

---

## 감리 체크리스트 (Task 승인 게이트)

1. Task 1 Step 1(API 응답 필드 확정)이 추정이 아니라 코드를 직접 읽고 맞춰졌는가.
2. 모델이 `Date.now()` 를 직접 부르지 않는가 — 생성 시각은 입력으로 받는다.
3. `fitImageToBody` 가 비율을 지키는가 — 가로·세로 두 방향 초과 케이스가 다 있는가.
4. 문서에 **이메일·토큰이 들어가지 않는가** — 코치명은 이름만.
5. `mentors` 403 이 오류 토스트로 새지 않고 코치명만 빈칸이 되는가.
6. 캡처가 **라이트 테마**로 되는가 — 어두운 배경 캡처는 반려.
7. 신규 순수 모듈 2개가 stryker `mutate` 에 있고 100% 인가. disable 주석은 이유가 있는가.
8. 감리자 직접 재실행: tsc 0 · vitest 전체 통과 · lint 0.
9. **실화면**: 프로젝트 하나에서 생성 → Word 로 열어 14개 DB 절이 모두 값을 담고
   있는가, WS-4/7/9 그림이 잘리지 않았는가, FREE 입력이 반영됐는가, 파일명이
   `결과보고서_<프로젝트명>.docx` 인가.

## 리스크

- **캡처 품질**: `html-to-image` 는 `foreignObject` 기반이라 브라우저 간 차이가 있다.
  Chrome 기준으로 만들고, 다른 브라우저는 RISKS 로 남긴다.
- **WS-9 넓은 표**: 캡처 폭을 넓혀도 170mm 본문에 넣으면 글자가 작아진다 — 가로 페이지로
  넣는다(Task 2). 그래도 작으면 그룹을 접은 상태로 캡처하는 안을 실화면 검증에서 판단한다.
- **다운로드 차단**: Kano 설문지 내려받기가 같은 방식으로 이미 동작하므로 이 앱 환경에서는
  문제없다고 본다.
- **빈 데이터**: 워크시트를 안 채운 프로젝트는 표가 비거나 "입력된 데이터가 없습니다"만
  나온다 — 계획대로다(위 리스크 아님, 의도한 동작).
- **`GET /funding` 은 읽기가 아니라 쓰기다**: 행이 하나도 없으면 기본 7행/6행을 실제로
  `createMany` 한다(`app/api/projects/[id]/funding/route.ts:40-49`). WS-16 을 한 번도
  안 연 프로젝트에서 보고서 화면을 열면 그 기본행이 DB 에 생긴다. WS-16 화면을 열었을
  때와 똑같은 결과라 데이터 손상은 아니므로 **그대로 둔다**(피하려면 라우트에 읽기전용
  플래그를 다는 수정이 필요한데, 그건 "신규/수정 서버 라우트 없음" 계약을 깬다).
  감리 실화면 검증 때 이 부수효과를 확인 항목에 넣는다.
- **`GET /mentors` 응답에 이메일이 들어 있다**(`user.email`). CLAUDE.md 의 "이메일을
  로그·응답 본문에 남기지 않는다" 규칙 때문에 보고서 모델은 `user.name` 만 받고 이메일은
  타입에서부터 제외한다 — 감리 1순위 표본이다.
- **FREE 입력 유실**: DB 에 저장하지 않으므로 생성 버튼을 누르기 전 새로고침하면 입력이
  날아간다. 이번 범위에서는 감수한다(3번 결정) — 필요해지면 로컬스토리지 임시 저장을
  별도로 추가할 수 있다.

## 계획 밖 (사람이 하는 일)

- **실화면 검증** — dev 서버 기동은 실행 AI 에게 위임하지 않는다. 감리자·사용자가 프리뷰
  배포에서 생성 → Word 로 열어 확인한다.
- **PDF 출력** — 이번 범위 밖.
- **자금 비교 그래프(13쪽)** — 이번 범위에서 뺐다(결정 5번). 필요해지면 별도 계획.
- **WS-9 자사·경쟁사 마이그레이션** — PR #32 의 `npx prisma migrate deploy` 는 이 기능과
  별개로 여전히 사용자가 실행해야 한다. 적용 전에는 그 칸이 빈 채로 보고서에 캡처된다.
