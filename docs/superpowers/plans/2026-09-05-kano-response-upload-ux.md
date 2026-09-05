# WS-6 응답 수집 경로 재배치 Implementation Plan

> **For agentic workers:** 이 계획서가 각 Task 의 정본이다. Step 은 체크박스(`- [ ]`)로 추적하고, 완료 시 `- [x]` 로 갱신해 코드와 함께 커밋한다.

**Goal:** WS-6 「Kano 설문 관리」 화면에 흩어져 있는 응답 수집 경로를 사용자가 고를 수 있게 재배치한다. 세 가지다.

1. **Google Forms 연동은 아직 개발 중**이므로 화면과 서버 양쪽에서 비활성화한다(개발 완료 후 플래그 한 줄로 되살린다).
2. **「응답 파일로 업로드」**(여러 명의 답변을 파일 하나에 모아 한 번에 등록)와 **「오프라인 응답파일 업로드」**(각자 작성한 HTML 응답지를 낱장으로 등록)를 화면에서 구분해 보여 주고, 오프라인 쪽에는 **여러 장을 한 번에 올리는 기능**을 만든다.
3. Google Forms 카드에 있던 **「양식 확인」(미리보기)** 과 **「오프라인 HTML 받기」** 를 오프라인 업로드 쪽에 둔다.

**Architecture:** 「설문지 Word 출력」(`2026-09-03-kano-survey-docx.md`)이 쓴 2층 구조를 그대로 잇는다. **모델**(`lib/kano-survey-document.ts`)이 문구·질문 쌍의 정본이고, 그 위에 **렌더러**(`lib/kano-offline-form.ts` — 자체 완결형 HTML)와 **파서**(`lib/kano-offline-response.ts` — 저장된 HTML → 응답)를 얹는다. 둘 다 순수 모듈이라 실DB 없이 테스트하고 뮤테이션으로 고정한다. 응답을 DB 에 쓰는 트랜잭션은 이미 `upload-excel` 라우트 안에 있는데 오프라인 라우트도 같은 것이 필요하므로 `lib/kano-response-store.ts` 로 뽑는다 — **뽑기 전에 기존 라우트의 특성화 테스트를 먼저 만든다**(현재 이 라우트에는 테스트가 없다).

**Tech Stack:** Next.js 15 App Router, Prisma 6, vitest (Prisma 전부 mock), Stryker. **신규 의존성 없음** — 오프라인 HTML 은 문자열로 만들고, 파싱은 임베드된 JSON 블록만 정규식으로 꺼내므로 HTML 파서가 필요 없다.

**Spec:** 이 문서의 "설계 요약" 절이 스펙을 겸한다.

## Global Constraints

- **원격 DB 절대 금지**: `.env` 의 `POSTGRES_PRISMA_URL` 은 실데이터가 있는 원격 Supabase 다. `prisma migrate deploy`/`db push`/`studio`, DB 에 쓰는 스크립트, **dev 서버 기동** 전부 금지. 이 계획은 스키마를 바꾸지 않는다(신규 테이블·컬럼 없음).
- **키·비밀번호·이메일을 로그와 응답 본문에 남기지 않는다**(`lib/logger.ts` 규칙). 오프라인 업로드 결과는 **응답자 이메일이 아니라 파일명**으로 보고한다 — 이 규칙을 피해 가려는 설계이니 바꾸지 마라.
- 들여쓰기 4칸, 주석은 한국어 "~다" 체이며 무엇이 아니라 **왜**를 적는다.
- 새 소스 파일 첫 줄에 파일 역할을 설명하는 한국어 한 줄 주석을 둔다(`'use client'` 가 있으면 그 아래).
- 테스트는 `tests/` 평면 배치, Prisma 는 `vi.mock('../lib/prisma', ...)` 로 전부 mock.
- 커밋 메시지는 한국어, 본문에 "왜"를 적는다. 트레일러 `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- 각 Task 완료 기준: `npx tsc --noEmit` 통과 + `npx vitest run` 전체 통과 + `npx next lint` 통과.
- **뮤테이션**: 신규 순수 모듈(`lib/feature-flags.ts`, `lib/kano-offline-form.ts`, `lib/kano-offline-response.ts`)은 `stryker.crap.config.json` 의 `mutate` 목록에 올리고 100% 를 기준으로 삼는다. **이미 목록에 있는 `lib/kano-survey-document.ts` 를 고치는 Task 2 는 그 파일에 stryker 를 재실행해 점수를 보고서에 담는다** — 게이트 3종은 뮤테이션 회귀를 잡지 못한다. 등가 뮤턴트는 이유를 적은 `// Stryker disable next-line <Mutator>: <이유>` 로만 제외하고, disable 후 총 뮤턴트 수가 몇 개 줄었는지 세어 보고한다.
- **브랜치**: `claude/ws-6-response-upload-ui-gcng04`. 분기 기준 `8f53e5f`. push 는 사용자 지시가 있을 때만.

## 배경 — 감리자가 직접 확인한 사실 (재조사하지 마라)

`components/project/KanoManager.tsx` (1386줄) 한 파일에 WS-6 화면 전체가 있다.

| 좌표 | 내용 |
| --- | --- |
| `KanoManager.tsx:663-812` | **Google Forms 연동** 카드. 3단계 그리드(1 미리보기 → `setShowPreview(true)` 「양식 확인」 / 2 설문지 생성 / 3 응답 가져오기) + 「Apps Script 파일 받기」 링크 + 생성된 폼 URL 표시 |
| `KanoManager.tsx:815-865` | **응답 파일로 업로드** 카드. `excelUploadFormat` 셀렉트(`template`/`googleForms`) + 「양식 받기」 + 파일 1개 input + 「업로드」 |
| `KanoManager.tsx:868-986` | **설문 질문 구성** 카드. 「설문지 Word 내려받기」·「질문 저장」. **이번 작업에서 건드리지 않는다** |
| `KanoManager.tsx:1194-1201` | `showPreview && <KanoSurveyPreview projectName requirements onClose />` |
| `KanoManager.tsx:286-341` | `handleCreateGoogleForm` / `handleImportResponses` |
| `KanoManager.tsx:346-387` | `handleUploadExcelResponses` — `window.prompt` 로 1/2 를 물어 `writePolicy` 를 정한다 |

- **「오프라인 응답파일 업로드」와 「오프라인 HTML 받기」는 저장소에 존재하지 않는다.** `grep -rn "오프라인"` 전체 히트는 `lib/google-auth.ts:19` 의 `access_type: 'offline'` 하나뿐이다. 즉 요구 2·3 은 재배치가 아니라 **신규 개발**이다.
- Google Forms 라우트는 셋이다: `app/api/projects/[id]/kano/create-form/route.ts`(POST), `.../form-responses/route.ts`(POST), `.../form-script/route.ts`(GET).
- `app/api/projects/[id]/kano/upload-excel/route.ts` 는 **테스트가 없다**(`grep -rln "upload-excel" tests/` 히트 0). 이 라우트의 DB 쓰기 블록은 `prisma.$transaction` 안에서 ① `writePolicy==='replace'` 면 응답·초대 전삭제, 아니면 해당 이메일의 응답만 삭제 ② 이메일마다 `kanoSurveyInvitation.upsert` ③ `kanoResponse.createMany` 를 한다.
- `lib/upload-guard.ts` 의 `guardUploadedExcel` 는 크기(10MB)·확장자(.xlsx/.xls)를 본다. `tests/upload-guard.test.ts` 가 있다.
- `lib/html-escape.ts` 의 `escapeHtml` 이 이미 있다. 오프라인 HTML 의 모든 사용자 문자열은 이것을 통과해야 한다.
- `next.config.js` 의 CSP 는 Next 가 내려주는 응답에만 붙는다. 오프라인 HTML 은 첨부로 내려받아 `file://` 로 열리므로 인라인 스크립트가 동작한다.
- **원격 세션에서는 `npm ci` 가 403 으로 실패한다**(`registry.npmjs.org`, `cdn.sheetjs.com` 차단). 게이트는 `node_modules` 가 있는 로컬에서 실행한다.

## 설계 요약 (모든 Task 의 공통 문맥)

### 화면 재배치 — 「응답 수집」 카드 하나 + 방식 탭 3개

기존 두 카드(Google Forms 연동 / 응답 파일로 업로드)를 **「응답 수집」 카드 하나**로 합치고 그 안에 탭 3개를 둔다. 선택한 탭의 설명·양식 받기·업로드만 보인다.

| 탭 | 라벨 | 한 줄 설명(화면에 그대로 나간다) |
| --- | --- | --- |
| `file` | 응답 파일로 업로드 | 여러 명의 답변을 **파일 하나**에 정리해 한 번에 등록합니다 |
| `offline` | 오프라인 응답파일 업로드 | 각자 작성한 **HTML 응답지를 낱장으로**, 여러 장을 한 번에 등록합니다 |
| `googleForms` | Google Forms 연동 | 개발 중입니다. 준비되면 이 자리에서 바로 쓸 수 있습니다 |

기본 선택 탭은 `file` 이다.

### 오프라인 HTML 왕복

```
[관리자] 오프라인 HTML 받기  →  Kano_오프라인_응답지_<프로젝트>.html (자체 완결형, 인터넷 불필요)
[응답자] 브라우저로 열어 라디오 선택 → 「응답 저장」 버튼 클릭
          → 답변이 <script type="application/json"> 블록에 박힌 HTML 이 다시 내려받아진다
[관리자] 받은 HTML 여러 장을 한 번에 선택해 업로드 → 파일별 성공/실패 목록 확인
```

임베드 payload(Task 2 가 만들고 Task 3 이 읽는 **계약**):

```json
{
    "kind": "kano-offline-response",
    "version": 1,
    "projectId": "proj_1",
    "respondentEmail": "",
    "answers": [{ "index": 0, "positive": 1, "negative": 5 }]
}
```

- `index` 는 요구사항의 0-based 순서(`order asc`). `positive`/`negative` 는 1~5 정수 또는 미응답 `null`.
- 직렬화할 때 `<` 를 `\u003c` 로 바꾼다 — 안 그러면 값에 `</script>` 가 들어와 태그가 조기 종료된다.
- 파서는 `kind`/`version` 이 다르면 거부하고, `projectId` 가 다르면 거부한다(다른 프로젝트 응답지를 잘못 올리는 사고를 막는다).

### 결정 사항

계획을 세우며 정한 것이다. 바꾸려면 Task 1 착수 전에 알려야 한다.

| # | 항목 | 결정 | 이유 |
| --- | --- | --- | --- |
| 1 | Google Forms 비활성 범위 | **화면 + 서버 라우트 3개 모두** | 화면만 막으면 엔드포인트는 그대로 살아 있어 "비활성화"가 화면에서만 참이다. 플래그 상수 한 곳(`lib/feature-flags.ts`)을 화면과 라우트가 함께 읽어 개발 완료 시 한 줄로 되살린다 |
| 2 | 「Apps Script 파일 받기」 | **함께 막는다** | Google 연동 없이 폼을 만드는 보조 수단이지만 결과물이 Google Forms 다. 탭 전체가 "개발 중"인데 이 링크만 살아 있으면 사용자가 반쯤 동작하는 경로로 들어간다 |
| 3 | 「양식 확인」(미리보기) | **오프라인 탭으로 옮긴다** | 미리보기는 Google 과 무관한 로컬 기능이다. Google 탭을 통째로 비활성화하면서 여기 두면 같이 죽는다. 요구 3 이 "오프라인 쪽에 추가하라"이므로 옮기는 것이 요구와도 맞는다 |
| 4 | 「응답 파일로 업로드」의 `Google Forms 형식` 선택지 | **남긴다** | Google Forms 응답 **시트(xlsx)** 를 읽는 오프라인 경로이고 Google API 를 부르지 않는다. 비활성 대상은 연동이지 이 형식이 아니다 |
| 5 | 오프라인 HTML 왕복 방식 | **페이지 안 「응답 저장」 버튼이 답변 박힌 HTML 을 재저장** | 브라우저의 "다른 이름으로 저장"은 런타임 입력 상태를 보존하지 않아 답변이 유실된다. JSON 블록에 박아 두면 서버 파싱이 정규식 하나로 끝나 순수 모듈이 되고 뮤테이션으로 고정된다 |
| 6 | 응답자 식별 | **이메일 입력은 선택, 비면 파일 순번으로 합성** | 오프라인은 익명 현장 조사가 많다. 비었을 때 `offline-html-<n>@import.local` 로 채운다(기존 `excel-row-N@import.local` 관례와 같다) |
| 7 | 업로드 결과 보고 | **파일명 기준** | CLAUDE.md 가 이메일을 응답 본문에 남기지 말라고 한다. 관리자가 실패한 장을 찾는 데 필요한 것은 파일명이다 |
| 8 | DB 쓰기 트랜잭션 | **`lib/kano-response-store.ts` 로 추출 후 두 라우트가 공유** | 응답을 쓰는 트랜잭션이 두 벌이 되면 한쪽만 고쳐지는 사고가 난다. 다만 기존 라우트에 테스트가 없으므로 **특성화 테스트를 먼저 만들고 추출한다** |
| 9 | 업로드 한도 | **HTML 1장 2MB, 한 번에 100장까지** | 낱장 HTML 은 수십 KB 다. 엑셀의 10MB 를 그대로 쓰면 100장이 1GB 가 된다 |

### 파일 지도

- Task 1: `lib/feature-flags.ts`(신규·순수), 라우트 3개, `tests/feature-flags.test.ts`(신규), `tests/api-kano-google-forms-disabled.test.ts`(신규), `stryker.crap.config.json`
- Task 2: `lib/kano-survey-document.ts`(수정 — stryker 재실행 대상), `lib/kano-offline-form.ts`(신규·순수), `tests/kano-offline-form.test.ts`(신규), `stryker.crap.config.json`
- Task 3: `lib/kano-offline-response.ts`(신규·순수), `lib/upload-guard.ts`(수정), `tests/kano-offline-response.test.ts`(신규), `tests/upload-guard.test.ts`(수정), `stryker.crap.config.json`
- Task 4: `tests/api-kano-upload-excel.test.ts`(신규·특성화), `lib/kano-response-store.ts`(신규), `app/api/projects/[id]/kano/upload-excel/route.ts`(수정)
- Task 5: `app/api/projects/[id]/kano/offline-form/route.ts`(신규), `app/api/projects/[id]/kano/upload-offline/route.ts`(신규), `tests/api-kano-offline-form.test.ts`(신규), `tests/api-kano-upload-offline.test.ts`(신규)
- Task 6: `components/project/KanoManager.tsx`(수정)

Task 1 은 독립이다. Task 2 → 3 → 5, 4 → 5, 5 → 6 순으로 의존한다.

---

### Task 1: Google Forms 연동 비활성화

**Files:**
- Create: `lib/feature-flags.ts`, `tests/feature-flags.test.ts`, `tests/api-kano-google-forms-disabled.test.ts`
- Modify: `app/api/projects/[id]/kano/create-form/route.ts`, `.../form-responses/route.ts`, `.../form-script/route.ts`, `stryker.crap.config.json`

**Interfaces:**
- Produces: `GOOGLE_FORMS_INTEGRATION_ENABLED`, `GOOGLE_FORMS_DISABLED_MESSAGE`. Task 6 의 화면이 쓴다. (감리 정정: 초안에 적혔던 `googleFormsDisabledResponse()` 는 확정 계약에 없는 오기였다 — 실행 AI 가 확정 계약대로 export 2개만 만든 것이 맞다.)

- [x] **Step 1: 플래그 모듈을 만든다**

```ts
// Google Forms 연동처럼 아직 열지 않은 기능의 on/off 를 한 곳에 모은다.
//
// 화면과 라우트가 각자 false 를 들고 있으면 기능을 열 때 한쪽만 고쳐져 반쯤 열린 상태가
// 된다. 여기 한 줄만 true 로 바꾸면 화면과 서버가 함께 열리게 한다.

/** Google Forms 연동은 개발 중이다. 완료되면 이 값을 true 로 바꾼다. */
export const GOOGLE_FORMS_INTEGRATION_ENABLED = false;

export const GOOGLE_FORMS_DISABLED_MESSAGE =
    'Google Forms 연동은 개발 중입니다. 응답 파일 업로드 또는 오프라인 응답파일 업로드를 사용해 주세요.';
```

- [x] **Step 2: 라우트 3개를 막는다**

세 라우트 모두 `requireProjectAccess` **뒤**, 기존 본문 **앞**에 같은 가드를 넣는다. 권한 확인을 먼저 두는 이유는 권한 없는 요청에까지 기능 상태를 알려 줄 필요가 없어서다.

```ts
        if (!GOOGLE_FORMS_INTEGRATION_ENABLED) {
            return NextResponse.json({ error: GOOGLE_FORMS_DISABLED_MESSAGE }, { status: 503 });
        }
```

`import { GOOGLE_FORMS_DISABLED_MESSAGE, GOOGLE_FORMS_INTEGRATION_ENABLED } from '@/lib/feature-flags';` 를 더한다. **가드 아래의 기존 코드는 지우지 마라** — 기능을 되살릴 때 그대로 써야 한다. 그 코드가 도달 불가가 되어 lint 가 경고하면 보고하고 멈춰라(임의로 `eslint-disable` 를 붙이지 마라).

- [x] **Step 3: 테스트**

`tests/feature-flags.test.ts` — 플래그가 `false` 이고 안내 문구에 "개발 중"이 들어 있음을 단언한다(뮤테이션 100% 를 위해 문구 전문을 단언한다).

`tests/api-kano-google-forms-disabled.test.ts` — `tests/api-kano-survey-document.test.ts` 의 mock 방식을 그대로 따라 세 라우트가 각각 503 과 `GOOGLE_FORMS_DISABLED_MESSAGE` 를 돌려주는지, 그리고 **권한이 없으면 503 이전에 권한 응답이 나가는지**를 단언한다.

- [x] **Step 4: `stryker.crap.config.json` 의 `mutate` 에 `"lib/feature-flags.ts"` 를 더하고 100% 를 확인한다**

**완료 판정**
1. `npx tsc --noEmit` / `npx vitest run` / `npx next lint` 전부 그린.
2. `npx stryker run stryker.crap.config.json --mutate lib/feature-flags.ts` mutation score 100%.
3. 새 테스트가 결함을 실제로 잡는다 — 라우트의 가드 한 개를 임시로 지우면 `tests/api-kano-google-forms-disabled.test.ts` 가 실패하고, 되돌리면 통과한다(확인 후 원복).

> **감리 기록(2026-09-05) — 승인.** 작업 커밋 `683f66a`, 보고서 `f6ad5d3`(`docs/superpowers/reports/2026-09-05-kano-response-upload-ux/task-1.md`).
> 감리자가 직접 확인한 것: ① 경계 — 변경 10개 파일이 전부 파일 지도 안이고, 기존 테스트 2개(`api-form-responses-invitation`, `api-error-exposure`)의 변경은 플래그 mock 5줄 추가뿐(삭제 0줄), 라우트 3개는 각각 +5/−0 로 가드 아래 코드가 남아 있다. ② 표본 — 세 라우트 모두 `requireProjectAccess` 반환 직후·`try` 앞에 가드가 있다(`create-form:22-24`, `form-responses:26-28`, `form-script:18-20`); 플래그 문구가 확정 계약과 한 글자도 다르지 않다; 신설 테스트가 503+문구, 권한 거부 403 선행, mock 10개 미호출까지 단언한다. ③ `stryker.crap.config.json` 은 유효 JSON 이고 `lib/feature-flags.ts` 가 추가됐다.
> 감리자가 재실행하지 못한 것: 게이트 3종·stryker 는 원격 세션의 npm 차단으로 실행 AI 의 로컬 출력(vitest 100파일·1,137개, stryker 2/2 사멸)에 의존한다. `api-error-exposure.test.ts` 의 mock 추가는 Ask First 를 거친 정당한 처리로 판정한다.

---

### Task 2: 오프라인 HTML 설문지 생성기(순수)

**Files:**
- Modify: `lib/kano-survey-document.ts`, `stryker.crap.config.json`
- Create: `lib/kano-offline-form.ts`, `tests/kano-offline-form.test.ts`

**Interfaces:**
- Produces: `kanoSurveyFileNameStem(projectName)` (모델), `buildKanoOfflineFormHtml({...})`, `kanoOfflineFormFileName(projectName)`. Task 3 의 파서 왕복 테스트와 Task 5 의 라우트가 쓴다.

- [x] **Step 1: 파일명 어간을 모델에서 뽑아 쓴다**

`lib/kano-survey-document.ts` 의 `kanoSurveyFileName` 이 하는 정리(경로 문자·제어 문자 → `_`, 공백 축약, 60자 제한, 빈 값이면 `프로젝트`)를 오프라인 HTML 파일명도 똑같이 해야 한다. 규칙을 복사하지 말고 어간 함수를 export 한다.

```ts
/**
 * 파일명에 쓸 수 있게 프로젝트명을 다듬는다. 접두사와 확장자는 부르는 쪽이 붙인다 —
 * 설문지(.docx)와 오프라인 응답지(.html)가 같은 정리 규칙을 써야 하기 때문이다.
 */
export function kanoSurveyFileNameStem(projectName: string | null | undefined): string {
    const cleaned = (projectName ?? '')
        .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, FILE_NAME_MAX);
    return cleaned || '프로젝트';
}

export function kanoSurveyFileName(projectName: string | null | undefined): string {
    return `Kano_설문지_${kanoSurveyFileNameStem(projectName)}.docx`;
}
```

기존 주석 블록은 `kanoSurveyFileNameStem` 위로 옮긴다. **`kanoSurveyFileName` 의 반환값은 한 글자도 바뀌면 안 된다** — `tests/kano-survey-document.test.ts` 와 `tests/api-kano-survey-document.test.ts` 가 그대로 통과해야 한다.

- [x] **Step 2: `lib/kano-offline-form.ts` 를 만든다**

문구의 정본은 계속 `kano-survey-document.ts` 다. 여기서는 그것을 HTML 로 그리기만 한다.

```ts
// WS-6 오프라인 응답지(자체 완결형 HTML)를 문자열로 만든다.
//
// 응답자는 인터넷 없이 파일 하나만 열어 답하고 「응답 저장」 을 눌러 답변이 박힌 HTML 을
// 다시 받는다. 관리자는 그 파일을 업로드한다. 답변은 화면 상태가 아니라 JSON 블록에
// 박히므로 kano-offline-response.ts 가 정규식 하나로 읽을 수 있다.
```

내보낼 것:

```ts
export const KANO_OFFLINE_PAYLOAD_ID = 'kano-offline-response';
export const KANO_OFFLINE_PAYLOAD_KIND = 'kano-offline-response';
export const KANO_OFFLINE_PAYLOAD_VERSION = 1;

export interface KanoOfflineFormInput {
    projectId: string;
    projectName: string;
    requirements: KanoSurveyRequirement[];
}

export function kanoOfflineFormFileName(projectName: string | null | undefined): string {
    return `Kano_오프라인_응답지_${kanoSurveyFileNameStem(projectName)}.html`;
}

export function buildKanoOfflineFormHtml(input: KanoOfflineFormInput): string;
```

HTML 이 반드시 갖춰야 할 것(테스트가 이것들을 단언한다):

- `<!DOCTYPE html>` 로 시작하고 `<html lang="ko">`.
- 외부 자원 참조 0 — `http://`·`https://`·`<link` 가 문서 어디에도 없다. 인터넷 없는 현장에서 열리기 때문이다.
- 제목 `KANO_SURVEY_TITLE`, 안내문 `KANO_SURVEY_GUIDE`, 소개문 `KANO_SURVEY_INTRODUCTION`, 맺음말 `KANO_SURVEY_CLOSING` 을 **전문 그대로** 담는다.
- 요구사항마다 `resolveKanoQuestionPair` 로 긍정·부정 질문을 만들고, `1-1`(긍정)·`1-2`(부정) 번호를 붙인다.
- 문항마다 라디오 5개. 라벨은 `kanoSurveyAnswerLabels()` 순서(1~5)를 그대로 쓴다. `name="q<index>-<positive|negative>"`, `value="1"`~`"5"`.
- 응답자 이메일 입력 `<input id="kano-respondent-email">` — 라벨에 "선택 사항"이라고 적는다.
- `<script id="kano-offline-response" type="application/json">` 블록. 초기값은 `answers` 가 전부 `null` 인 payload.
- 「응답 저장」 버튼과 인라인 `<script>`. 스크립트가 하는 일은 셋이다.
  1. 열릴 때 JSON 블록을 읽어 라디오를 복원한다(응답자가 저장본을 다시 열면 자기 답이 보인다).
  2. 저장 시 라디오를 모아 payload 를 만들고, 미응답이 있으면 개수를 알리고 `confirm` 으로 확인받는다.
  3. JSON 블록의 textContent 를 교체한 뒤 `'<!DOCTYPE html>\n' + document.documentElement.outerHTML` 를 Blob 으로 내려받는다.
- **모든 사용자 문자열**(프로젝트명, 질문 문구, projectId)은 `escapeHtml` 를 통과시킨다. JSON 직렬화 뒤에는 `<` 를 `\u003c` 로 치환한다.

- [x] **Step 3: 테스트 `tests/kano-offline-form.test.ts`**

최소한 이것들을 단언한다.

1. `<!DOCTYPE html>` 로 시작하고 `lang="ko"` 다.
2. 제목·안내문·소개문·맺음말 **전문**이 들어 있다(부분 일치 금지 — 문자열 뮤턴트를 죽이려면 전문이어야 한다).
3. 요구사항 2개를 주면 라디오 그룹이 4개(`q0-positive`, `q0-negative`, `q1-positive`, `q1-negative`) 생기고 각 그룹에 `value="1"`~`"5"` 가 있다.
4. 저장된 질문이 없는 요구사항은 `resolveKanoQuestionPair` 기본 문구가 나온다.
5. 프로젝트명이 `<img src=x onerror=alert(1)>` 여도 `<img` 가 원문으로 나오지 않는다(`&lt;img` 로 escape).
6. 질문 문구에 `</script>` 가 들어가도 JSON 블록이 조기 종료되지 않는다.
7. `http://`·`https://`·`<link` 가 문서에 없다.
8. 초기 payload 의 `kind`/`version`/`projectId` 가 계약대로이고 `answers` 길이가 요구사항 수와 같으며 전부 `null` 이다.
9. `kanoOfflineFormFileName('스마트팜')` → `Kano_오프라인_응답지_스마트팜.html`, 빈 이름 → `Kano_오프라인_응답지_프로젝트.html`, 경로 문자 `a/b` → `Kano_오프라인_응답지_a_b.html`.

- [x] **Step 4: stryker**

`mutate` 에 `"lib/kano-offline-form.ts"` 를 더한다. **`lib/kano-survey-document.ts` 는 이미 목록에 있으므로 이번 수정 후 재실행해 점수 하락이 없음을 보고서에 담는다.**

**완료 판정**
1. 게이트 3종 그린.
2. `npx stryker run stryker.crap.config.json --mutate lib/kano-offline-form.ts` 100%.
3. `npx stryker run stryker.crap.config.json --mutate lib/kano-survey-document.ts` 100% (Step 1 수정 전과 같은 점수). 보고서 VERIFIED BY 에 두 점수를 원문으로 적는다.
4. `kanoSurveyFileName` 의 반환 문자열이 바뀌지 않았다 — 기존 두 테스트 파일이 수정 없이 통과한다.

> **감리 기록(2026-09-05) — 승인.** 작업 커밋 `cd3ef95`, 보고서 `8c81a37`(`.../task-2.md`).
> 감리자가 직접 확인한 것: ① 경계 — 변경 6개 파일이 파일 지도 안이고 `kano-survey-document.ts` 의 변경은 어간 추출뿐, 기존 `kanoSurveyFileName` 테스트는 한 줄도 바뀌지 않았다. ② 표본 — export 이름·payload 계약·`<` 치환(TS 쪽 `'\\u003c'`, 인라인 JS 쪽 `'\\\\u003c'` 로 이스케이프 단계가 맞다)·`escapeHtml` 적용·외부 자원 0·백틱/`${` 금지 전부 코드에서 확인. 테스트는 문구 4종 전문 일치, 필드셋 구조·라벨·값 정확 비교, `</script>` 주입 시 닫힘 2개, `vm` 가짜 DOM 으로 복원·confirm·저장까지 단언한다. ③ **신설 실행물 직접 실행** — 전역 tsc 로 컴파일해 `buildKanoOfflineFormHtml` 을 호출, 9,936바이트·`<!DOCTYPE html>` 시작·`</script>` 2개·외부 자원 없음 확인. ④ **실브라우저 왕복(Chromium 141, Playwright)** — `file://` 에서 A 전부 답하고 저장(confirm 없음, JSON 정확), B 한 문항 비우고 저장(`1개 문항이 비어 있습니다. 그래도 저장할까요?` 확인 후 `null` 저장), C confirm 취소 시 내려받기 없음, D 저장본 재열기 시 라디오 4개·이메일 복원, E 저장본에서 답 바꿔 재저장 — 5개 시나리오 전부 통과, 페이지 오류 0.
> 환경 주의: Linux 컨테이너의 `LANG` 이 비어 있으면 Chrome 이 한글 다운로드 이름을 `download`(확장자 없음)로 떨어뜨린다. `LANG=C.UTF-8` 에서는 `Kano_오프라인_응답_<stem>_<시각>.html` 이 정확히 반영됐다 — 코드 결함이 아니라 감리 환경 로케일 문제다. 이후 Playwright 검증은 반드시 UTF-8 로케일로 돌린다.
> 감리자가 재실행하지 못한 것: 게이트 3종·stryker 두 건(24/24, 54/54 사멸)은 실행 AI 의 로컬 출력에 의존한다.

---

### Task 3: 저장된 오프라인 HTML 파서(순수) + 업로드 가드

**Files:**
- Create: `lib/kano-offline-response.ts`, `tests/kano-offline-response.test.ts`
- Modify: `lib/upload-guard.ts`, `tests/upload-guard.test.ts`, `stryker.crap.config.json`

**Interfaces:**
- Produces: `parseKanoOfflineResponseHtml(html, options)`, `guardUploadedOfflineHtml(value)`, `MAX_OFFLINE_HTML_BYTES`, `MAX_OFFLINE_HTML_FILES`. Task 5 의 라우트가 쓴다.
- Consumes: Task 2 의 payload 계약, `ParsedKanoUploadAnswer`(`lib/kano-upload-parser.ts`).

- [x] **Step 1: 파서**

```ts
// 응답자가 저장한 오프라인 HTML 에서 답변을 꺼낸다.
//
// HTML 을 파싱하지 않고 임베드된 JSON 블록만 꺼낸다 — 마크업이 어떻게 바뀌어도 계약은
// JSON 하나뿐이고, 업로드된 파일의 스크립트를 실행할 일이 없어 안전하다.

export type KanoOfflineParseResult =
    | { ok: true; respondentEmail: string; answers: ParsedKanoUploadAnswer[] }
    | { ok: false; error: string };

export function parseKanoOfflineResponseHtml(
    html: string,
    options: { requirementCount: number; projectId: string; fallbackEmail: string }
): KanoOfflineParseResult;
```

규칙:

- `<script id="kano-offline-response" type="application/json">…</script>` 를 정규식으로 꺼낸다. 속성 순서와 따옴표 종류에 흔들리지 않게 `id="kano-offline-response"` 를 기준으로 찾고 비탐욕(`[\s\S]*?`)으로 닫는다.
- 블록이 없으면 `'오프라인 응답지 형식이 아닙니다. 설문지에서 「응답 저장」 으로 만든 HTML 을 올려 주세요.'`
- JSON 파싱 실패면 `'응답 데이터를 읽을 수 없습니다. 파일이 손상되었을 수 있습니다.'`
- `kind`/`version` 불일치면 `'지원하지 않는 오프라인 응답지 버전입니다.'`
- `projectId` 불일치면 `'다른 프로젝트의 응답지입니다.'`
- `answers` 중 `index` 가 정수가 아니거나 `0 <= index < requirementCount` 밖이면 **그 항목만** 버린다.
- `positive`·`negative` 가 둘 다 1~5 정수인 항목만 채택한다(한쪽만 답한 문항은 버린다 — 기존 엑셀 파서와 같은 규칙).
- 채택된 항목이 0개면 `'응답이 하나도 없습니다.'`
- `respondentEmail` 이 비었거나 문자열이 아니면 `fallbackEmail` 을 쓴다. 있으면 `trim()` 한다.

- [x] **Step 2: 업로드 가드**

`lib/upload-guard.ts` 에 더한다. **`guardUploadedExcel` 과 `checkUploadedExcel` 은 건드리지 마라.**

```ts
export const MAX_OFFLINE_HTML_BYTES = 2 * 1024 * 1024;
export const MAX_OFFLINE_HTML_FILES = 100;

/**
 * 오프라인 응답지는 낱장이라 수십 KB 다. 엑셀의 10MB 를 그대로 쓰면 100장을 받을 때
 * 1GB 가 되므로 한도를 따로 둔다.
 */
export function guardUploadedOfflineHtml(value: unknown): UploadGuardResult;
```

- `File` 이 아니면 `'업로드할 HTML 응답지가 필요합니다.'`(400)
- 크기 0 이면 `'빈 파일입니다. 내용이 있는 HTML 응답지를 올려 주세요.'`(400)
- `MAX_OFFLINE_HTML_BYTES` 초과면 `'HTML 응답지 하나는 2MB를 초과할 수 없습니다.'`(413)
- 확장자가 `.html`/`.htm` 이 아니면 `'.html 또는 .htm 파일만 업로드할 수 있습니다.'`(400)

- [x] **Step 3: 테스트**

`tests/kano-offline-response.test.ts` — 위 규칙 하나마다 케이스를 둔다. **왕복 테스트를 반드시 포함한다**: Task 2 의 `buildKanoOfflineFormHtml` 로 HTML 을 만들고, 그 JSON 블록을 답변이 채워진 payload 로 치환한 뒤 파서에 넣어 기대한 `ParsedKanoUploadAnswer[]` 가 나오는지 본다. 이것이 두 모듈의 계약을 고정하는 유일한 테스트다.

`tests/upload-guard.test.ts` — 기존 케이스를 그대로 두고 `guardUploadedOfflineHtml` 케이스를 더한다.

- [x] **Step 4: `stryker.crap.config.json` 의 `mutate` 에 `"lib/kano-offline-response.ts"` 를 더한다**

**완료 판정**
1. 게이트 3종 그린.
2. `npx stryker run stryker.crap.config.json --mutate lib/kano-offline-response.ts` 100%.
3. 왕복 테스트가 존재하고, `buildKanoOfflineFormHtml` 의 `KANO_OFFLINE_PAYLOAD_ID` 를 임시로 다른 값으로 바꾸면 그 테스트가 실패한다(확인 후 원복).

> **감리 기록(2026-09-05) — 승인.** 작업 커밋 `1802840`, 보고서 `c5b8f25`(`.../task-3.md`).
> 감리자가 직접 확인한 것: ① 경계 — 변경 6개 파일이 파일 지도 안, `upload-guard.ts` 는 기존 함수 무수정에 추가만(+40/−0), 기존 가드 테스트 삭제 줄 0. ② 표본 — export 시그니처·오류 문구 5종·판정 순서(형식→JSON→kind/version→projectId→답변)·항목별 버림·이메일 trim/fallback 전부 계약대로. 정규식은 `id` 속성을 실제 속성 위치에서만 잡는 강화판(다른 속성값 속 가짜 id·대문자 id 거부 테스트 있음). 왕복 테스트는 `buildKanoOfflineFormHtml` 의 실제 출력을 쓴다. ③ **파서 직접 실행** — 전역 tsc 로 컴파일해 Task 2 감리 때 Chromium 이 실제로 저장한 `saved-A/B/E.html` 을 넣었다: A·E 는 답변 2세트, B 는 미응답 항목만 버리고 `offline-html-1@import.local` 로 합성, 미작성 원본은 `응답이 하나도 없습니다.`, 다른 projectId 는 거부, `requirementCount=1` 이면 index 1 만 버림. 변조 8종(JSON 손상·version 2·positive 9·문자열 "1"·index 0.5·answers 비배열·이메일 공백 등)도 전부 계약대로. ④ 가드 직접 실행 — 실제 저장본(9,941B) 통과, 확장자 없는 `download` 거부, `.HTM` 허용, 2MB 경계·빈 파일·비파일 전부 정확.
> DEVIATIONS 판정: "오류 문구 6종" 은 감리자 프롬프트의 오기(파서 5종 + 가드 4종이 맞다) — 계획서 계약을 따른 실행 AI 가 옳다.
> 감리자가 재실행하지 못한 것: 게이트 3종·stryker(134/134)는 실행 AI 의 로컬 출력에 의존한다.

---

### Task 4: 응답 저장 트랜잭션 추출 (특성화 테스트 먼저)

**Files:**
- Create: `tests/api-kano-upload-excel.test.ts`, `lib/kano-response-store.ts`
- Modify: `app/api/projects/[id]/kano/upload-excel/route.ts`

**Interfaces:**
- Produces: `persistKanoUploadAnswers(...)`. Task 5 의 오프라인 라우트가 쓴다.

- [x] **Step 1: 특성화 테스트를 먼저 만든다 (RED 아님 — 현재 동작을 고정한다)**

`upload-excel` 라우트에는 테스트가 없다. 추출 전에 현재 동작을 고정한다. `tests/api-kano-survey-document.test.ts` 의 mock 방식을 따르되 `prisma.$transaction` 이 필요하다.

```ts
const tx = {
    kanoResponse: { deleteMany: vi.fn(), createMany: vi.fn() },
    kanoSurveyInvitation: { deleteMany: vi.fn(), upsert: vi.fn() },
};
vi.mock('../lib/prisma', () => ({
    prisma: {
        customerRequirement: { findMany: findManyRequirement },
        $transaction: (fn: (t: typeof tx) => unknown) => fn(tx),
    },
}));
```

고정할 동작:
1. 요구사항이 0개면 400 과 `'먼저 고객요구사항을 등록하세요.'`
2. 파싱 결과가 0개면 400.
3. `writePolicy='replace'` 면 `kanoResponse.deleteMany({ where: { projectId } })` 와 `kanoSurveyInvitation.deleteMany` 가 불린다.
4. `writePolicy='append'` 면 초대는 지우지 않고 응답만 해당 이메일 범위로 지운다.
5. 성공 응답의 `message`·`respondentCount`·`importedCount` 형태.

이 테스트는 Step 2 의 추출 **전에** 통과해야 하고, 추출 **후에도** 수정 없이 통과해야 한다.

- [x] **Step 2: `lib/kano-response-store.ts` 로 추출한다**

```ts
// 업로드된 Kano 응답을 초대·응답 테이블에 쓰는 트랜잭션.
//
// 엑셀 업로드와 오프라인 HTML 업로드가 같은 쓰기를 해야 한다. 두 벌로 두면 한쪽만
// 고쳐지는 사고가 나므로 한 곳에 둔다.

export interface PersistKanoUploadInput {
    projectId: string;
    invitedBy: string;
    writePolicy: 'append' | 'replace';
    requirements: { id: string }[];
    answers: ParsedKanoUploadAnswer[];
}

export interface PersistKanoUploadResult {
    respondentCount: number;
    importedCount: number;
}

export async function persistKanoUploadAnswers(input: PersistKanoUploadInput): Promise<PersistKanoUploadResult>;
```

`upload-excel/route.ts` 의 `prisma.$transaction(...)` 블록을 **로직 변경 없이** 그대로 옮긴다. 라우트는 파싱까지만 하고 이 함수를 부른 뒤 응답을 만든다. `parseWritePolicy` 도 이 모듈로 옮겨 두 라우트가 함께 쓴다.

- [x] **Step 3: 게이트를 돌리고 특성화 테스트가 그대로 통과함을 확인한다**

**완료 판정**
1. 게이트 3종 그린.
2. `tests/api-kano-upload-excel.test.ts` 가 Step 1 시점(추출 전)과 Step 2 시점(추출 후) 모두 통과했음을 보고서에 커밋 해시 2개로 남긴다.
3. `git diff` 에서 `upload-excel/route.ts` 의 변경이 **추출로 인한 이동뿐**이고 조건·순서·문구가 바뀌지 않았다.

> **감리 기록(2026-09-05) — 승인.** 커밋 ① `3903314`(특성화 테스트) ② `797cd40`(추출) ③ `bac204b`(보고서, `.../task-4.md`).
> 감리자가 직접 확인한 것: ① 경계 — ①은 테스트 1개 파일만, ②는 라우트·신규 모듈·계획서 3개 파일만. 테스트 파일은 ①→② 사이 diff 가 비어 있다(무수정). ② **이동 동등성을 기계적으로 대조** — 원본 라우트(`3903314` 기준 152~205행)와 새 모듈의 트랜잭션 본문을 공백 정규화해 diff 한 결과 51줄 중 유일한 차이는 `invitedBy: accessResult.user.userId` → 구조 분해된 `invitedBy` 축약 표기뿐이다. 라우트 diff 의 삭제 줄은 로컬 타입·`parseWritePolicy`·트랜잭션·불필요해진 import 2개뿐이고 조건문·상태 코드·오류 문구·응답 JSON 키는 그대로다. ③ 특성화 테스트는 전용 양식 xlsx 를 실제로 만들어 라우트를 호출하며, 요구사항 0건·파싱 0건·replace 삭제 순서·append 이메일 범위 삭제·성공 응답·createMany 행 매핑(kanoCategory 포함) 6개를 고정한다.
> 참고(재작업 불요): 새 모듈의 머리 주석이 계획서 스니펫의 "왜" 문단(두 라우트가 같은 쓰기를 공유해야 하는 이유) 없이 역할 한 줄만 있다. 결정 사항 8 에 이유가 있으므로 그대로 둔다.
> 감리자가 재실행하지 못한 것: 게이트 3종(vitest 103파일·1,191개)은 실행 AI 의 로컬 출력에 의존한다. 이 모듈은 Prisma 를 부르므로 컨테이너에서 실행하지 않았다.

---

### Task 5: 오프라인 HTML 내려받기·업로드 라우트

**Files:**
- Create: `app/api/projects/[id]/kano/offline-form/route.ts`, `app/api/projects/[id]/kano/upload-offline/route.ts`, `tests/api-kano-offline-form.test.ts`, `tests/api-kano-upload-offline.test.ts`

**Interfaces:**
- Consumes: Task 2·3·4 의 산출물 전부.
- Produces: Task 6 의 화면이 부르는 두 엔드포인트.

- [x] **Step 1: `GET /api/projects/[id]/kano/offline-form`**

`survey-document/route.ts` 를 본으로 삼는다. 다른 점은 렌더러와 헤더뿐이다.

```ts
        return new NextResponse(html, {
            headers: {
                'Content-Type': 'text/html; charset=utf-8',
                'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
                'Cache-Control': 'no-store',
            },
        });
```

요구사항이 0개면 400 과 `'먼저 고객요구사항을 등록하세요.'`(`upload-template` 라우트와 같은 문구).

- [x] **Step 2: `POST /api/projects/[id]/kano/upload-offline`**

- `requireProjectAccess(request, projectId, { write: true })`.
- `formData.getAll('files')` 로 여러 장을 받는다. 0개면 400. `MAX_OFFLINE_HTML_FILES` 초과면 400 과 `'한 번에 100장까지 올릴 수 있습니다.'`
- `writePolicy` 는 `formData.get('writePolicy')` 로 받아 Task 4 의 `parseWritePolicy` 를 쓴다.
- 파일마다: `guardUploadedOfflineHtml` → `await file.text()` → `parseKanoOfflineResponseHtml(text, { requirementCount, projectId, fallbackEmail: 'offline-html-<순번>@import.local' })`.
- 결과를 파일별로 모은다. **이메일은 넣지 않는다**(결정 사항 7).

```ts
type OfflineUploadFileResult = {
    fileName: string;      // 100자로 자른다
    status: 'ok' | 'failed';
    answerCount?: number;
    reason?: string;
};
```

- 성공한 파일이 하나도 없으면 400 과 결과 목록을 함께 돌려준다(관리자가 왜 실패했는지 봐야 한다).
- 하나라도 성공하면 성공분만 모아 `persistKanoUploadAnswers` 를 **한 번** 부른다(파일마다 트랜잭션을 열지 않는다 — `replace` 가 앞 파일을 지워 버린다).
- 응답: `{ success: true, message, respondentCount, importedCount, fileCount, results }`.
- `catch` 에서 `log.error('오프라인 응답지 업로드 실패', error, { projectId })` — **파일 내용·이메일을 로그에 넣지 마라.**

- [x] **Step 3: 테스트**

`tests/api-kano-offline-form.test.ts` — 200 과 `Content-Type: text/html; charset=utf-8`, `Content-Disposition` 파일명, 요구사항 0개면 400, 권한 거부가 그대로 전달되는지.

`tests/api-kano-upload-offline.test.ts` — Task 2 의 생성기로 만든 실제 HTML 2장을 `File` 로 만들어 올린다. 확인할 것: 2장이 각각 다른 응답자로 저장된다 / 한 장이 깨졌으면 그 장만 `failed` 이고 나머지는 저장된다 / `persistKanoUploadAnswers` 가 **한 번만** 불린다 / 101장이면 400 / 결과 목록에 이메일이 들어 있지 않다.

**완료 판정**
1. 게이트 3종 그린.
2. **신설 실행물 1회 실행**: `npx vitest run tests/api-kano-offline-form.test.ts tests/api-kano-upload-offline.test.ts` 가 두 라우트를 실제로 호출해 통과한다. 추가로 생성된 HTML 을 파일로 떨궈(`node -e` 또는 테스트 내 `fs.writeFileSync`) 바이트 수와 `<!DOCTYPE html>` 시작을 확인하고 그 경로를 보고서에 적는다.
3. 결과 목록에 이메일이 없다는 단언이 테스트에 있다.

> **감리자 이월**: 실제 브라우저에서 내려받은 HTML 을 열어 라디오 선택 → 「응답 저장」 → 재업로드하는 왕복은 **감리자/사용자가 로컬에서** 수행한다. dev 서버 기동은 실행 AI 에게 위임하지 않는다.

> **감리 기록(2026-09-05) — 승인.** 작업 커밋 `43db76e`, 보고서 `46c833a`(`.../task-5.md`).
> 감리자가 직접 확인한 것: ① 경계 — 변경 5개 파일이 파일 지도 안, `lib/`·`tests/fixtures/`·`components/` 무변경. ② 표본 — GET 은 `survey-document` 본과 같은 순서(권한→project→requirements order asc→렌더)이고 생성기 문자열을 가공 없이 `text/html; charset=utf-8` 첨부로 내보낸다(47행). 따라서 Task 2 감리의 Chromium 저장 왕복 검증이 라우트 출력에도 그대로 적용된다. POST 는 `formData.getAll('files')`·0장/101장 400·파일별 `guardUploadedOfflineHtml`→`file.text()`→`parseKanoOfflineResponseHtml(fallbackEmail: offline-html-<순번>)`·같은 이메일 재출현 시 뒤 파일만 failed·성공분으로 `persistKanoUploadAnswers` 1회·응답에 파일명만·`log.error(…, { projectId })` 전부 계약 B·C 와 일치. ③ 테스트 — 위 이월 항목을 대신하는 **실브라우저 픽스처 3장이 POST 테스트의 실제 입력**이며, (a)~(h) 8건 + 100장 경계·파일명 대체/절단·로그 인수 비노출 3건. persist 1회 호출·`@` 부재·로그 인수 검사가 단언돼 있다.
> 감리자가 재실행하지 못한 것: 게이트 3종(vitest 105파일·1,206개)은 실행 AI 의 로컬 출력에 의존한다. 라우트는 `next/server`·Prisma 가 필요해 컨테이너에서 실행하지 않았다. 실화면 조작은 Task 6 판정으로 넘긴다.

---

### Task 6: 화면 재배치 — 「응답 수집」 카드와 방식 탭 3개

**Files:**
- Modify: `components/project/KanoManager.tsx`

- [ ] **Step 1: 두 카드를 하나로 합친다**

`KanoManager.tsx:663-812`(Google Forms 연동)과 `815-865`(응답 파일로 업로드)를 지우고 그 자리에 「응답 수집」 카드 하나를 둔다. 카드 머리에 탭 3개를 두고 상태는 `const [collectMode, setCollectMode] = useState<'file' | 'offline' | 'googleForms'>('file')` 로 잡는다. 탭 버튼 스타일은 `KanoManager.tsx:559-593` 의 기존 탭 네비게이션을 그대로 따른다.

각 탭 라벨 아래에 설계 요약의 "한 줄 설명"을 그대로 표시한다 — 요구 2 의 "구분해서 알 수 있게 하라"가 이 문장으로 충족된다.

- [ ] **Step 2: `file` 탭**

기존 「응답 파일로 업로드」 내용을 그대로 옮긴다(셀렉트·양식 받기·파일 1개·업로드). 제목은 「응답 파일로 업로드」, 설명은 "여러 명의 답변을 파일 하나에 정리해 한 번에 등록합니다". `handleUploadExcelResponses` 는 그대로 쓴다.

- [ ] **Step 3: `offline` 탭 (신규)**

- 설명: "각자 작성한 HTML 응답지를 낱장으로, 여러 장을 한 번에 등록합니다".
- **「양식 확인」** 버튼 — `setShowPreview(true)`. Google Forms 카드에서 옮겨 온 것이다.
- **「오프라인 HTML 받기」** 링크 — `href={`/api/projects/${projectId}/kano/offline-form`}`.
- 파일 input 에 **`multiple`** 과 `accept=".html,.htm"`.
- 선택한 장수를 "N장 선택됨"으로 보여 준다.
- 「업로드」 → `handleUploadOfflineResponses`: `writePolicy` 를 정하는 방식은 기존 `handleUploadExcelResponses:352` 의 `window.prompt` 와 동일하게 맞춘다(두 경로의 조작이 달라지면 헷갈린다).
- 응답의 `results` 를 파일별 목록으로 렌더한다. 성공은 초록, 실패는 빨강에 `reason` 을 붙인다. `inviteResults` 렌더(초대 모달)의 시각 언어를 따른다.

- [ ] **Step 4: `googleForms` 탭 — 비활성**

- `import { GOOGLE_FORMS_INTEGRATION_ENABLED } from '@/lib/feature-flags';`
- 탭 버튼에 「개발 중」 배지를 붙이고, 탭 내용은 기존 3단계 그리드를 **회색 비활성 상태로** 보여 준다(무엇이 준비되는지 사용자가 알 수 있게 남긴다).
- 3단계의 버튼·「Apps Script 파일 받기」 링크는 전부 `disabled` 이고 클릭해도 아무 요청이 나가지 않는다. 링크는 `<a>` 대신 `disabled` 된 `<button>` 으로 바꾼다.
- 안내 문구 한 줄: "Google Forms 연동은 개발 중입니다. 준비되면 이 자리에서 바로 쓸 수 있습니다."
- `handleCreateGoogleForm`·`handleImportResponses` 와 `createdFormUrl`·`createdFormId` 상태는 **지우지 마라** — 기능을 되살릴 때 그대로 쓴다. 도달 불가로 lint 가 경고하면 보고하고 멈춰라.

- [ ] **Step 5: 남는 것 확인**

「설문 질문 구성」 카드(`868-986`), 「응답자 초대」, 「초대 내역」, 「분석 결과」 탭은 건드리지 않는다. `showPreview` 모달 렌더(`1194-1201`)는 그대로 둔다.

**완료 판정**
1. 게이트 3종 그린.
2. `googleConfigured` 로 갈라지던 분기가 남아 잘못된 상태를 만들지 않는다 — Google 탭은 설정 여부와 무관하게 항상 비활성이다.
3. `grep -n "오프라인 HTML 받기\|양식 확인\|multiple" components/project/KanoManager.tsx` 가 세 항목을 모두 찾는다.
4. `handleCreateGoogleForm`·`handleImportResponses` 가 파일에 남아 있다.

> **감리자 이월**: 실화면 조작(탭 전환, 여러 장 선택, 업로드 결과 목록, Google 탭 버튼이 눌리지 않음)은 **감리자/사용자가 로컬 브라우저에서** 확인한다.

---

## 감리 검증 계획 (감리자용)

이 세션(원격)은 `npm ci` 가 403 으로 막혀 게이트를 재실행할 수 없다. 따라서 판정은 다음과 같이 나눈다.

| 단계 | 누가 | 무엇 |
| --- | --- | --- |
| 경계 확인 | 감리자(원격) | diff 가 파일 지도 안에 있는지, 기존 테스트 약화·게이트 설정 변조가 없는지 |
| 표본 대조 | 감리자(원격) | 보고서의 핵심 주장 3~5개를 파일:라인으로 직접 확인 |
| 게이트 재실행 | **사용자(로컬)** | `npx tsc --noEmit && npx vitest run && npx next lint` 원문 출력 |
| 뮤테이션 | **사용자(로컬)** | Task 1·2·3 의 stryker 점수. 특히 `lib/kano-survey-document.ts` 의 점수 하락 여부 |
| 회귀 역검증 | **사용자(로컬)** | 각 Task 완료 판정의 "임시로 되돌리면 실패" 항목 |
| 화면 3단계 | **사용자(로컬 브라우저)** | 탭 전환 / HTML 내려받기 → 작성 → 저장 → 여러 장 업로드 왕복 / Google 탭 비활성 |
