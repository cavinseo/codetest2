# WS-6 오프라인 HTML 설문 Implementation Plan

> **For agentic workers:** 이 계획서가 각 Task 의 정본이다. Step 은 체크박스(`- [ ]`)로 추적하고, 완료 시 `- [x]` 로 갱신해 코드와 함께 커밋한다.

**Goal:** WS-6 미리보기 양식을 오프라인에서 답할 수 있는 단일 HTML 파일로 내려주고, 피설문자가 **답을 담아 다시 저장한 그 HTML 파일**(보조로 JSON)을 여러 개 올리면 `KanoResponse` 가 자동으로 만들어지게 한다. 설계·결정의 근거는 `docs/superpowers/specs/2026-09-04-kano-offline-html-survey-design.md`(이하 "설계서")다.

**Architecture:** 세 층이다. **공용 수입 함수**(`lib/kano-response-import.ts`)가 엑셀 경로와 오프라인 경로의 초대 upsert → `createMany` 트랜잭션을 하나로 묶는다. **오프라인 설문 모델·렌더러**(`lib/kano-offline-survey.ts`)가 requirementId·질문 해시를 내장한 자급자족 HTML 문자열을 만든다. **응답 파일 파서**(`lib/kano-offline-response.ts`)가 답이 담긴 HTML(응답 섬) 또는 JSON 텍스트를 검증된 응답으로 바꾸고 현재 질문 세트와 대조한다. 라우트 둘(GET 내려받기, POST 수입)은 얇고, 화면은 링크 하나와 업로드 카드 하나를 더한다.

**Tech Stack:** Next.js 15 App Router, Prisma 6, node `crypto`(sha256), vitest(Prisma 전부 mock), Stryker. **새 npm 의존성 없음, 스키마 변경 없음.**

## Global Constraints

- **원격 DB 절대 금지**: `.env` 의 `POSTGRES_PRISMA_URL` 은 실데이터가 있는 원격 Supabase 다. `prisma migrate deploy`/`db push`/`studio`, DB 에 쓰는 스크립트, dev 서버 기동 전부 금지. 이 계획은 스키마를 바꾸지 않는다.
- **이메일·비밀번호를 로그와 응답 본문에 남기지 않는다**(`lib/logger.ts` 규칙). 응답 파일에는 피설문자가 선택 입력한 이메일이 들어가므로, 라우트는 파일 수·응답자 수·응답 수만 로그·응답에 담고 이메일·submissionId·파일 내용은 담지 않는다.
- 들여쓰기 4칸, 주석은 한국어 "~다" 체이며 무엇이 아니라 **왜**를 적는다.
- 테스트는 `tests/` 평면 배치, Prisma 는 `vi.mock('../lib/prisma', ...)` 로 전부 mock. 라우트 테스트의 `$transaction` 목 패턴은 `tests/api-spec-upload-transaction.test.ts:11-50` 을 따른다(tx 객체와 bare 목을 분리해 "트랜잭션 밖 쓰기 없음"을 단언).
- 커밋 메시지는 한국어, 본문에 "왜". 트레일러 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` + `Claude-Session: https://claude.ai/code/session_01SDup2TWZkUrJcoo5M5xWv1`.
- 각 Task 완료 기준: `npx tsc --noEmit` 통과 + `npx vitest run` 전체 통과 + `npx next lint` 통과.
- **뮤테이션**: 신규 순수 모듈 `lib/kano-response-import.ts`, `lib/kano-offline-survey.ts`, `lib/kano-offline-response.ts` 는 `stryker.crap.config.json` 의 `mutate` 목록에 올리고 100% 를 기준으로 삼는다. `lib/kano-survey-document.ts`(이미 목록에 있음)를 수정하는 Task 는 재실행 점수를 보고서에 담는다. 등가 뮤턴트는 이유를 적은 `// Stryker disable next-line` 으로만 제외한다.
- **소스·테스트·문서에 날 제어 바이트·보이지 않는 문자(U+FEFF, U+2028/2029)를 넣지 않는다.** 필요하면 `\xNN`/`\uXXXX`/`String.fromCharCode` 로 코드 안에서 만든다. `tests/` 에 BOM·바이너리 픽스처 파일을 두지 않는다 — `pretest` 의 `scripts/check-text-encoding.mjs` 가 선두 BOM 과 깨진 문자를 거부한다. 이 계획서 자체도 처음 쓸 때 코드 스니펫에 날 U+FEFF·U+2028 이 들어갔다가 이스케이프 표기로 고쳐졌다.
- **운영 중인 엑셀 업로드 라우트(`upload-excel`)는 이 계획에서 건드리지 않는다.** 실DB 에 대해 `replace` 전체 삭제를 수행하는 경로이고 라우트 테스트가 0건이라, 공용 함수로 옮기는 것은 감리자 실계정 실기동을 동반한 별도 계획으로 분리한다(설계서 10절).
- `components/` 는 `'use client'` 다. **node `crypto` 를 쓰는 `lib/kano-offline-survey.ts` 를 클라이언트 컴포넌트에서 import 하지 않는다** — 브라우저 번들에 node 모듈이 들어가 빌드가 깨진다. 화면이 필요한 값(형식 상수)은 `lib/constants.ts` 처럼 순수한 곳에서 가져온다. 화면 Task 의 게이트에는 `npm run build` 를 더한다.
- 원격 세션은 npm 레지스트리가 막혀 게이트(tsc·vitest·lint·stryker·build)를 돌리지 못한다. 순수 모듈은 `node --experimental-strip-types` 하네스로 대체 검증하고, 게이트는 사용자 로컬에서 돈다(WS-6 Word 계획서와 같은 관례).

## 설계 요약 (모든 Task 의 공통 문맥)

### 결정 사항 (설계서 9절 — 바꾸려면 Task 1 착수 전에 알려야 한다)

| # | 결정 |
| --- | --- |
| 1 | 응답 페이로드는 아래 JSON 형식. 값은 enum 만 허용 |
| 2 | **답변 파일은 설문 HTML 자체다(자기 저장형 왕복, 사용자 결정 B, 2026-09-04).** 「답변 저장」이 라디오 상태를 `checked` 속성으로 굳히고 응답 섬(`<script type="application/json" id="kano-offline-response">`)에 페이로드를 써 넣은 뒤 `kano-response-<id8>.html` 로 내려준다. 다시 열면 답이 복원되고 재저장하면 같은 submissionId 로 갱신된다. 서버는 `.html`(응답 섬 추출)과 `.json`(「내용 복사」 폴백)을 둘 다 받는다. 응답 섬이 비어 있으면 "아직 답하지 않은 설문 파일" 로 거절 |
| 3 | 기존 응답자(다른 경로)와 이메일이 겹치면 **기본 거절**, 파일별 명시 승인(`overwriteFiles`) 시만 덮어쓰기 |
| 4 | 오프라인 경로에 `replace`(전체 삭제) 없음 — append 고정 |
| 5 | 오프라인 초대: `token = offline_<submissionId>`, `expiresAt = now`, `invitedBy = 업로더`, `respondedAt = submittedAt` |
| 6 | 이메일 선택. 없으면 `offline-<submissionId 앞 12자>@import.local` |
| 7 | 파일명: 설문 `Kano_설문_<프로젝트명 정제>.html`(서버, RFC 5987), 답변 `kano-response-<submissionId 앞 8자>.html`(브라우저, ASCII) |
| 8 | **요청당 최대 10 파일, 파일당 최대 400 KB**(답변 HTML 은 기본 ≈15 KB + 문항당 ≈2.3 KB — 100문항이면 ≈250 KB). 화면이 10개씩 순차 배치로 보내고 배치마다 원자 저장. 실패 파일은 목록 반환. 라우트는 `export const maxDuration = 60`, 트랜잭션은 `{ timeout: 60_000, maxWait: 10_000 }` — Vercel 서버리스의 본문 상한(약 4.5 MB)·실행 시간과 Prisma 대화형 트랜잭션 기본 5초를 넘지 않기 위해서다. 재시도는 submissionId 멱등으로 안전하다 |
| 9 | 질문 세트 불일치는 409. `acceptQuestionSetMismatch=true` 면 문항별 해시 일치분만 수입. **id 가 전부 바뀐 경우(AI 재생성·JSON 이관)에도 문구 해시 `t` 가 정확히 하나의 현재 문항과 일치하면 그 문항으로 재매칭**한다 |
| 10 | 파서는 zod 없이 손 검증(순수 TS) |
| 11 | `KanoSurveyPreview` 기본 문구도 `resolveKanoQuestionPair` 로 통일 |
| 12 | 엑셀 라우트는 무수정. 공용 수입 함수는 오프라인 경로만 쓴다(엑셀 통합은 후속 계획) |
| 13 | 화면 노출은 환경 변수 `NEXT_PUBLIC_KANO_OFFLINE_SURVEY=on` 으로 게이팅한다 — 코드 배포와 기능 공개를 분리해 파일럿·되돌리기를 쉽게 한다. 라우트는 플래그와 무관하게 존재한다 |
| 14 | 업로드 권한은 엑셀 업로드와 같은 쓰기 권한(OWNER/EDITOR/ADMIN). 코치·매니저가 대신 올려야 하면 사용자 결정으로 `roles` 를 넓힌다 |
| 15 | 오프라인 초대의 `invitedBy` 는 업로더(엑셀과 동일). 관리자 삭제 미리보기의 "보낸 초대 수" 에 엑셀·오프라인 유입이 섞인다는 한 줄을 삭제 지침 문서에 더한다 |
| 16 | HTML 에 개인정보 고지 한 줄을 넣는다: "입력한 이메일은 답변 파일에 담기며 설문 결과 관리 목적으로만 쓰입니다. 문의: 설문 담당자". 응답자 단위 삭제 API 는 이번 범위 밖(설계서 10절) |
| 17 | **Task 1 착수 전에 파일럿(Task 0)** 을 한다 — 실제 수신 채널(카카오톡·Outlook+Edge·iPhone)에서 열기·답·저장이 되는지 사용자가 확인한다. 채널이 막히면 이 계획은 재검토한다 |

### 응답 파일 형식 정본

```json
{
  "format": "kano-offline-response",
  "version": 1,
  "projectId": "proj_…",
  "questionSetHash": "<64 hex>",
  "questions": [ { "id": "<requirementId>", "h": "<16 hex>" } ],
  "submissionId": "<uuid v4>",
  "exportedAt": "<ISO>",
  "submittedAt": "<ISO>",
  "respondentEmail": "hong@example.com",
  "answers": [ { "requirementId": "<id>", "functional": "LIKE", "dysfunctional": "DISLIKE" } ]
}
```

`respondentEmail` 은 `null` 일 수 있다. `answers` 는 1~300개, `requirementId` 중복 금지.

이 JSON 은 두 곳에 실린다. (1) **답변 HTML 의 응답 섬** `<script type="application/json" id="kano-offline-response">…</script>` — 기본 경로. (2) 「내용 복사」 textarea — 다운로드가 막힌 환경의 폴백. 서버 파서는 텍스트가 `<` 로 시작하면 응답 섬(여러 개면 **마지막 비어 있지 않은 것**)을 뽑고, 아니면 JSON 으로 본다. JSON 안의 `\u003c` 는 `JSON.parse` 가 그대로 `<` 로 되돌리므로 별도 처리가 없다.

**자기 저장형 HTML 의 규칙(실증으로 확정)** — 응답 섬은 반드시 설문 섬·스크립트보다 **앞에** 빈 채로 미리 둔다(문서 끝에 붙이면 다시 연 파일에서 스크립트가 섬보다 먼저 실행돼 이전 답을 못 찾고 재저장 시 섬이 두 개가 된다). 이전 답 조회는 페이지 로드 시가 아니라 **저장 버튼 클릭 시점**에 한다. 재저장은 같은 submissionId 를 쓴다.

### 해시 규칙 (Task 3 이 구현, Task 4 가 대조)

- `questionHash(q) = sha256(q.id + '\n' + q.positive + '\n' + q.negative).slice(0, 16)` — 문구는 `resolveKanoQuestionPair` 결과(trim 된 저장값 또는 기본 문구).
- `questionTextHash(q) = sha256(q.positive + '\n' + q.negative).slice(0, 16)` — id 를 뺀 문구만의 해시. id 가 통째로 바뀐 뒤의 재매칭에 쓴다.
- `questionSetHash(qs) = sha256(JSON.stringify(qs 를 id 오름차순으로 정렬한 [id, positive, negative][]))` — **order 가 아니라 id** 로 정렬한다.

응답 파일의 `questions[]` 는 `{ id, h, t }` 세 값을 갖는다.

### 파일 지도

- Task 0(사용자): 파일럿 — 코드 변경 없음
- Task 1: `lib/kano-response-import.ts`(신규), `tests/kano-response-import.test.ts`(신규), `stryker.crap.config.json`
- Task 2: `lib/upload-guard.ts`(수정), `tests/upload-guard.test.ts`(수정)
- Task 3: `lib/kano-offline-survey.ts`(신규), `lib/kano-survey-document.ts`(수정: 파일명 정제 분리), `app/api/projects/[id]/kano/offline-survey/route.ts`(신규), `tests/kano-offline-survey.test.ts`(신규), `tests/api-kano-offline-survey.test.ts`(신규), `stryker.crap.config.json`
- Task 4: `lib/kano-offline-response.ts`(신규), `tests/kano-offline-response.test.ts`(신규), `stryker.crap.config.json`
- Task 5: `app/api/projects/[id]/kano/offline-responses/route.ts`(신규), `tests/api-kano-offline-responses.test.ts`(신규)
- Task 6: `components/project/KanoManager.tsx`, `components/KanoSurveyPreview.tsx`, `.env.example`
- Task 7: `docs/2026-09-04-kano-offline-survey-guide.md`(신규 운영 지침), `docs/2026-09-02-mentee-account-deletion-guide.md`(한 줄 추가)
- Task 8(감리자): 실기동

### 감리자가 확인한 좌표 (재조사하지 마라)

- `requireProjectAccess(request, projectId, { write?: boolean })` → `ProjectAccess | NextResponse`, 허용 시 `{ user: { userId, … }, role }` — `lib/authorization.ts:91-133`.
- `createLogger(name).error(message, error?, meta?)` — `lib/logger.ts:53`. `toErrorResponse(error, { log, message, context? })` → 500 고정 문구 + referenceId — `lib/api-error.ts:31-47`.
- `generateId('inv' | 'response')` — `lib/id.ts`. `escapeHtml(value)` — `lib/html-escape.ts`.
- `KANO_ANSWER_SCORE = { LIKE: 1, EXPECT: 2, NEUTRAL: 3, TOLERATE: 4, DISLIKE: 5 }`, `type KanoAnswer = keyof typeof KANO_ANSWER_SCORE` — `lib/constants.ts:32-40`. `classifyKanoResponse(positive, negative)` — `lib/kano-algorithm.ts:28`.
- `resolveKanoQuestionPair(req)`, `kanoSurveyAnswerLabels()`, `kanoSurveyFileName(name)` — `lib/kano-survey-document.ts`.
- `upload-excel` 트랜잭션 본문 — `app/api/projects/[id]/kano/upload-excel/route.ts:152-205`.
- `CustomerRequirement { id, projectId, requirement, kanoPositiveQ?, kanoNegativeQ?, order }`, `KanoSurveyInvitation @@unique([projectId, email])`, `KanoResponse.invitationId` 필수 — `prisma/schema.prisma`.
- 화면: 미리보기 버튼 `KanoManager.tsx:692-697`, 업로드 카드 814-866, 엑셀 업로드 핸들러 346-386, 초대 내역 목록 1028-1062, `showPreview` 98·1194-1198. `KanoSurveyPreview.tsx` 기본 문구 66-67, 제어바 148-161.
- vitest 환경은 node(`vitest.config.ts`) — DOM 없이 문자열로 HTML 을 단언한다. `@` 별칭이 설정돼 있어 라우트를 직접 import 할 수 있다.

---

### Task 0 (사용자): 수신 채널 파일럿

코드 변경 없음. 감리자가 실증에 쓴 프로토타입 HTML(감리자가 채팅으로 전달한다. 형식·파일명은 최종안과 다르지만 "열기·답·저장" 검증에는 충분하다)을 **실제로 쓸 채널**로 보내 아래 표를 채운다. 한 채널이라도 "열기 실패"면 Task 1 전에 이 계획을 재검토한다(설계서 6절 리스크).

| 채널 | 파일이 열리는가 | 답할 수 있는가 | 「응답 저장」으로 파일이 받아지는가 | 받은 파일을 되돌려 보낼 수 있는가 |
| --- | --- | --- | --- | --- |
| Windows Outlook 첨부 → Edge | | | | |
| Windows Chrome (파일 더블클릭) | | | | |
| 카카오톡 PC/Android 에서 파일 열기 | | | | |
| iPhone 메일/파일 앱 | | | | |
| 회사 메일(첨부 필터) | | | | |

- [x] **Step 1: 표를 채워 설계서 8절 아래에 "파일럿 결과" 로 기록한다(감리자가 커밋)**

> 완료(2026-09-04, 사용자 보고): 파일럿 정상. 채널별 세부 표는 받지 못했고 "정상" 보고만 있다 — 설계서 8.1절.

---

### Task 1: 공용 수입 트랜잭션 (오프라인 경로 전용)

**Files:**
- Create: `lib/kano-response-import.ts`, `tests/kano-response-import.test.ts`
- Modify: `stryker.crap.config.json`

**Interfaces:**
- Produces: `importKanoResponses(tx, respondents, options)`. Task 5 의 라우트가 쓴다. 엑셀 라우트는 **이번에 건드리지 않는다**(결정 12) — `upload-excel/route.ts:152-205` 의 규칙을 그대로 옮겨 두고, 통합은 후속 계획에서 감리자 실기동과 함께 한다.

- [x] **Step 1: `lib/kano-response-import.ts` 를 만든다**

```ts
// 파일로 들어온 Kano 응답을 DB 에 쓰는 트랜잭션 본문이다.
//
// 규칙(초대 upsert → 응답 createMany, 삭제 범위)은 엑셀 업로드 라우트
// (app/api/projects/[id]/kano/upload-excel/route.ts:152-205)와 같다 — 경로마다 갈라지면
// 초대 상태·응답자 표가 어긋난다. 엑셀 라우트는 실DB 에 대해 전체 삭제를 수행하는 운영
// 경로라 이번에는 옮기지 않고, 여기가 그 규칙의 두 번째 사본이 된다는 것을 안다.
// prisma 를 직접 import 하지 않고 트랜잭션 클라이언트를 인자로 받아 목 객체로 테스트한다.
import { generateId } from './id';
import { classifyKanoResponse, type KanoAnswer } from './kano-algorithm';

export interface KanoImportAnswer {
    requirementId: string;
    positiveAnswer: KanoAnswer;
    negativeAnswer: KanoAnswer;
}

export interface KanoImportRespondent {
    email: string;
    respondedAt: Date;
    /** 초대 토큰. 없으면 `${tokenPrefix}_${generateId('inv')}` 로 만든다. 오프라인 경로는 submissionId 로 고정한다. */
    token?: string;
    answers: KanoImportAnswer[];
}

export interface KanoImportOptions {
    projectId: string;
    invitedBy: string;
    /** 'excel' | 'offline'. 초대 토큰 접두어이자 어느 경로가 만든 초대인지 구분하는 표지다. */
    tokenPrefix: 'excel' | 'offline';
    /** 'replace' 는 프로젝트의 응답·초대를 전부 지운다(엑셀 경로 전용). 'append' 는 이 응답자들의 응답만 지운다. */
    writePolicy: 'append' | 'replace';
    /** 초대가 새로 만들어질 때의 만료 시각. 엑셀은 +1년, 오프라인은 now(즉시 만료). */
    invitationExpiresAt: (now: Date) => Date;
    now?: Date;
}

export interface KanoImportResult {
    respondentCount: number;
    importedCount: number;
    /** 이미 응답이 있던 이메일 수. 라우트가 응답 본문·토스트로 알린다. */
    overwrittenRespondentCount: number;
}

/** 이 함수가 쓰는 Prisma 메서드만 담은 최소 인터페이스다. Prisma.TransactionClient 가 구조적으로 만족한다. */
export interface KanoImportTx {
    kanoResponse: {
        deleteMany(args: { where: { projectId: string; respondentEmail?: { in: string[] } } }): Promise<{ count: number }>;
        findMany(args: { where: { projectId: string; respondentEmail: { in: string[] } }; select: { respondentEmail: true }; distinct: ['respondentEmail'] }): Promise<Array<{ respondentEmail: string }>>;
        createMany(args: { data: Array<Record<string, unknown>> }): Promise<{ count: number }>;
    };
    kanoSurveyInvitation: {
        deleteMany(args: { where: { projectId: string } }): Promise<{ count: number }>;
        upsert(args: {
            where: { projectId_email: { projectId: string; email: string } };
            update: { respondedAt: Date; isUsed: true };
            create: Record<string, unknown>;
            select: { id: true };
        }): Promise<{ id: string }>;
    };
}

export async function importKanoResponses(
    tx: KanoImportTx,
    respondents: KanoImportRespondent[],
    options: KanoImportOptions
): Promise<KanoImportResult> {
    const now = options.now ?? new Date();
    const { projectId } = options;
    const emails = respondents.map((respondent) => respondent.email);

    // 덮어쓴 수는 삭제 전에 세어야 한다.
    const existing = options.writePolicy === 'replace' || emails.length === 0
        ? []
        : await tx.kanoResponse.findMany({
            where: { projectId, respondentEmail: { in: emails } },
            select: { respondentEmail: true },
            distinct: ['respondentEmail'],
        });

    if (options.writePolicy === 'replace') {
        await tx.kanoResponse.deleteMany({ where: { projectId } });
        await tx.kanoSurveyInvitation.deleteMany({ where: { projectId } });
    } else if (emails.length > 0) {
        await tx.kanoResponse.deleteMany({ where: { projectId, respondentEmail: { in: emails } } });
    }

    const invitationIds = new Map<string, string>();
    for (const respondent of respondents) {
        const invitation = await tx.kanoSurveyInvitation.upsert({
            where: { projectId_email: { projectId, email: respondent.email } },
            update: { respondedAt: respondent.respondedAt, isUsed: true },
            create: {
                id: generateId('inv'),
                projectId,
                email: respondent.email,
                token: respondent.token ?? `${options.tokenPrefix}_${generateId('inv')}`,
                invitedBy: options.invitedBy,
                expiresAt: options.invitationExpiresAt(now),
                respondedAt: respondent.respondedAt,
                isUsed: true,
            },
            select: { id: true },
        });
        invitationIds.set(respondent.email, invitation.id);
    }

    const rows = respondents.flatMap((respondent) => {
        const invitationId = invitationIds.get(respondent.email);
        if (!invitationId) throw new Error('Invitation missing after upsert.');
        return respondent.answers.map((answer) => ({
            id: generateId('response'),
            invitationId,
            projectId,
            requirementId: answer.requirementId,
            respondentEmail: respondent.email,
            positiveAnswer: answer.positiveAnswer,
            negativeAnswer: answer.negativeAnswer,
            kanoCategory: classifyKanoResponse(answer.positiveAnswer, answer.negativeAnswer),
            respondedAt: respondent.respondedAt,
        }));
    });
    if (rows.length > 0) {
        await tx.kanoResponse.createMany({ data: rows });
    }

    return {
        respondentCount: respondents.length,
        importedCount: rows.length,
        overwrittenRespondentCount: existing.length,
    };
}
```

`writePolicy: 'replace'` 분기는 엑셀 라우트와의 규칙 동일성을 위해 두되, 이번 계획의 호출자(Task 5)는 항상 `'append'` 를 준다(결정 4).

- [x] **Step 2: 테스트를 쓴다**

`tests/kano-response-import.test.ts` — tx 목 객체로: (1) `append` 는 해당 이메일의 응답만 `deleteMany` 하고 초대는 지우지 않는다, (2) `replace` 는 응답 전체 → 초대 전체 순으로 지운다, (3) upsert 인자(`projectId_email`, `create.token` 이 접두어로 시작, `expiresAt` 이 옵션 함수 결과, `respondedAt` 이 응답자 값), (4) `token` 을 준 응답자는 그 토큰으로 create, (5) `createMany` 행이 답 수와 같고 `kanoCategory` 가 `classifyKanoResponse` 와 같다, (6) `overwrittenRespondentCount` 는 `findMany` 결과 수, `replace` 면 0, (7) 답이 0개면 `createMany` 를 부르지 않는다, (8) 응답자가 0명이면 `findMany`·`deleteMany` 를 부르지 않는다.

- [x] **Step 3: `stryker.crap.config.json` `mutate` 에 `lib/kano-response-import.ts` 를 더한다**

- [x] **Step 4: 검증하고 커밋한다**

```sh
npx tsc --noEmit && npx vitest run && npx next lint
npx stryker run stryker.crap.config.json --mutate lib/kano-response-import.ts
```

> 감리 승인(2026-09-04, 커밋 `f7015c9`+`e93d775`): 경계(파일 5·금지 파일 무접촉·LF·제어바이트 0), lib 가 계획서 블록과 차이 0줄, 테스트에 `vi.fn` 없음, 감리 하네스 10/10·테스트 원본 8/8 을 원격 컨테이너에서 재실행, `generateId('inv')` 뮤턴트를 주입해 강화된 단언이 1건 실패로 잡는 것을 역검증. tsc·vitest 99/1137·lint·stryker 66 killed 100% 는 사용자 로컬 보고.

---

### Task 2: 업로드 가드 일반화

**Files:**
- Modify: `lib/upload-guard.ts`, `tests/upload-guard.test.ts`

- [x] **Step 1: `checkUploadedFile` 을 두고 엑셀 함수는 래퍼로 남긴다**

```ts
export interface UploadFileRule {
    /** 소문자, 점 포함. 예: ['.json', '.kano.json'] */
    extensions: string[];
    maxBytes?: number;
    /** 오류 문구에 들어가는 이름. 예: '엑셀', '답변' */
    label: string;
}

export function checkUploadedFile(value: unknown, rule: UploadFileRule): UploadGuardFailure | null {
    const maxBytes = rule.maxBytes ?? MAX_UPLOAD_BYTES;
    if (!(value instanceof File)) {
        return { error: `업로드할 ${rule.label} 파일이 필요합니다.`, status: 400 };
    }
    if (value.size === 0) {
        return { error: `빈 파일입니다. 내용이 있는 ${rule.label} 파일을 올려 주세요.`, status: 400 };
    }
    if (value.size > maxBytes) {
        return { error: `파일 크기는 ${formatLimit(maxBytes)}를 초과할 수 없습니다.`, status: 413 };
    }
    const lower = value.name.trim().toLowerCase();
    if (!rule.extensions.some((extension) => lower.endsWith(extension))) {
        return { error: `${rule.extensions.join(' 또는 ')} 파일만 업로드할 수 있습니다.`, status: 400 };
    }
    return null;
}

export function guardUploadedFile(value: unknown, rule: UploadFileRule): UploadGuardResult {
    const failure = checkUploadedFile(value, rule);
    return failure ? { ok: false, failure } : { ok: true, file: value as File };
}
```

`checkUploadedExcel(value, options)` 는 `checkUploadedFile(value, { extensions: ['.xlsx', '.xls'], maxBytes: options.maxBytes, label: '엑셀' })` 로 위임한다. **기존 오류 문구 세 개(`업로드할 엑셀 파일이 필요합니다.`, `빈 파일입니다. 내용이 있는 엑셀 파일을 올려 주세요.`, `.xlsx 또는 .xls 파일만 업로드할 수 있습니다.`)와 `파일 크기는 10MB를 초과할 수 없습니다.` 는 글자 단위로 같아야 한다** — `tests/upload-guard.test.ts` 의 기존 단언이 그대로 통과해야 한다. `formatLimit` 은 MB 단위면 `10MB`, 그 아래면 `1MB`/`512KB` 로 만든다. 머리 주석의 "세 업로드 라우트" 는 실제 사용처가 Kano 업로드 1곳뿐이므로 사실대로 고친다.

- [x] **Step 2: 테스트를 더한다** — 규칙 `{ extensions: ['.html', '.htm', '.json'], maxBytes: 400 * 1024, label: '답변' }` 로 `a.html`/`A.HTM`/`b.json`/`c.kano.json` 허용, `.txt` 거부 문구에 `.html 또는 .htm 또는 .json` 포함, 400 KB + 1 바이트가 413 이고 문구에 `400KB`, 0 바이트 문구에 `답변`, `File` 이 아닌 값의 문구에 `답변`. 기존 엑셀 케이스는 그대로.

- [x] **Step 3: 검증하고 커밋한다**

> 감리 승인(2026-09-04, 커밋 `e5682e3`+`7505897`): 경계(파일 4·기존 테스트 제거 0줄·skip/only 도입 없음·테스트 파일 99 유지), `lib/upload-guard.ts` 가 위 Step 1 블록과 차이 0줄, 계약대로 `checkUploadedExcel` 이 래퍼가 되었다. 원격 컨테이너에서 감리 하네스 15/15(엑셀 문구 4종을 글자 단위 `deepEqual` 로 고정)와 워커 테스트 원본 15/15 재실행. 뮤턴트 9종 역검증 결과 워커 테스트가 5종(확장자 무력화·항상 MB·`>`→`>=`·`maxBytes` 무시·0바이트 무력화)을 잡았고 4종이 생존했다(아래). tsc·vitest 99 파일·lint·check:encoding 은 사용자 로컬 보고.
>
> 생존 뮤턴트 4종은 **코드 결함이 아니라 회귀 넷의 공백**이다(감리 하네스가 3종을 잡아 구현이 계약대로임을 확인했다): ① `label: '엑셀'` 을 `'파일'` 로 바꿔도 저장소 테스트는 전부 통과한다 — 기존 4개 단언이 모두 라벨과 무관한 부분 문자열만 본다. 이번 Task 의 핵심 위험(문구 글자 단위 유지)을 저장소가 스스로 지키지 못한다. ② `formatLimit` 의 `Math.floor`→`Math.ceil`, ③ `name.trim()` 제거, ④ `endsWith`→`includes` 도 잡히지 않는다(③④ 는 리팩터 이전부터 있던 공백). 보강 4케이스는 Task 3 위임 프롬프트의 선행 Step 으로 이월한다.
>
> 함께 확인한 동작 변화: 이전 문구는 `Math.floor(maxBytes / 1MiB)MB` 로 항상 MB 였으므로 MiB 배수가 아닌 `maxBytes` 에서 새 `formatLimit` 과 결과가 갈린다(400 KiB → 이전 `0MB`, 지금 `400KB`). 유일한 프로덕션 사용처 `app/api/projects/[id]/kano/upload-excel/route.ts:123` 이 `maxBytes` 를 넘기지 않아 기본 10 MiB 경로만 타므로 실사용 문구는 그대로다.

---

### Task 3: 오프라인 설문 모델·해시·HTML 렌더러 + 내려받기 라우트

**Files:**
- Create: `lib/kano-offline-survey.ts`
- Modify: `lib/kano-survey-document.ts` (`sanitizeKanoFileNameStem` 분리)
- Create: `app/api/projects/[id]/kano/offline-survey/route.ts`
- Create: `tests/kano-offline-survey.test.ts`, `tests/api-kano-offline-survey.test.ts`
- Modify: `stryker.crap.config.json`

**Interfaces:**
- Produces: `computeKanoQuestionHash`, `computeKanoQuestionSetHash`, `buildKanoOfflineSurveyModel`, `renderKanoOfflineSurveyHtml`, `kanoOfflineSurveyFileName`, 상수 `KANO_OFFLINE_FORMAT`/`KANO_OFFLINE_VERSION`. Task 4 가 해시 함수와 상수를, Task 5 가 모델을 쓴다.

- [x] **Step 1: `lib/kano-survey-document.ts` 에서 파일명 정제를 분리한다**

```ts
/** 파일명 줄기 정제. 경로 구분자·제어 문자는 밑줄, 겹공백은 하나, 60자 상한. .docx 와 .html 이 같이 쓴다. */
export function sanitizeKanoFileNameStem(name: string | null | undefined): string {
    return (name ?? '')
        .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, FILE_NAME_MAX);
}

export function kanoSurveyFileName(projectName: string | null | undefined): string {
    return `Kano_설문지_${sanitizeKanoFileNameStem(projectName) || '프로젝트'}.docx`;
}
```

기존 테스트 17개는 그대로 통과해야 하고, 이 파일은 뮤테이션 목록에 있으므로 Step 6 에서 재실행 점수를 보고한다.

- [x] **Step 2: `lib/kano-offline-survey.ts` 를 만든다**

```ts
// 오프라인 HTML 설문의 내용과 마크업을 만든다.
//
// 자급자족 파일이어야 한다 — 피설문자는 인터넷 없이 파일을 더블클릭해 연다. 그래서
// Tailwind·폰트·이미지·CDN 을 쓰지 않고 CSS 와 JS 를 인라인으로 넣는다. 문구의 정본은
// lib/kano-survey-document.ts(화면·Word 와 같은 출처)이고, 이 파일은 배치와 응답 파일
// 생성 로직만 가진다. 실DB 도 브라우저도 없이 테스트한다.
import { createHash } from 'crypto';
import { escapeHtml } from './html-escape';
import { KANO_ANSWER_SCORE } from './constants';
import { kanoSurveyAnswerLabels, resolveKanoQuestionPair, sanitizeKanoFileNameStem } from './kano-survey-document';

export const KANO_OFFLINE_FORMAT = 'kano-offline-response';
export const KANO_OFFLINE_VERSION = 1;

export interface KanoOfflineRequirement {
    id: string;
    requirement: string;
    category?: string | null;
    kanoPositiveQ?: string | null;
    kanoNegativeQ?: string | null;
}

export interface KanoOfflineQuestion {
    id: string;
    no: number;
    requirement: string;
    category: string;
    positive: string;
    negative: string;
    /** 문항 해시(id 포함). 세트 해시가 어긋나도 이 답이 어떤 문구에 대한 것인지 문항 단위로 증명한다. */
    h: string;
    /** 문구만의 해시(id 제외). AI 재생성·JSON 이관으로 id 가 통째로 바뀐 뒤 문구로 재매칭할 때 쓴다. */
    t: string;
}

export interface KanoOfflineSurveyModel {
    projectId: string;
    projectName: string;
    questionSetHash: string;
    questions: KanoOfflineQuestion[];
    /** [enum 값, 라벨]. 점수 1~5 순서다. */
    answerOptions: Array<{ value: keyof typeof KANO_ANSWER_SCORE; label: string }>;
    exportedAt: string;
}

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

export function computeKanoQuestionHash(question: { id: string; positive: string; negative: string }): string {
    return sha256(`${question.id}\n${question.positive}\n${question.negative}`).slice(0, 16);
}

export function computeKanoQuestionTextHash(question: { positive: string; negative: string }): string {
    return sha256(`${question.positive}\n${question.negative}`).slice(0, 16);
}

/** id 로 정렬한다 — 매칭이 id 기반이라 순서 변경은 답을 무효화할 이유가 아니다. */
export function computeKanoQuestionSetHash(questions: Array<{ id: string; positive: string; negative: string }>): string {
    const sorted = [...questions]
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        .map((q) => [q.id, q.positive, q.negative]);
    return sha256(JSON.stringify(sorted));
}

export function buildKanoOfflineSurveyModel(input: {
    projectId: string;
    projectName: string;
    requirements: KanoOfflineRequirement[];
    exportedAt?: Date;
}): KanoOfflineSurveyModel {
    const labels = kanoSurveyAnswerLabels();
    const answerOptions = (Object.keys(KANO_ANSWER_SCORE) as Array<keyof typeof KANO_ANSWER_SCORE>)
        .sort((a, b) => KANO_ANSWER_SCORE[a] - KANO_ANSWER_SCORE[b])
        .map((value) => ({ value, label: labels[KANO_ANSWER_SCORE[value] - 1] }));

    const questions = input.requirements.map((requirement, index) => {
        const pair = resolveKanoQuestionPair(requirement);
        const base = { id: requirement.id, positive: pair.positive, negative: pair.negative };
        return {
            ...base,
            no: index + 1,
            requirement: requirement.requirement,
            category: requirement.category ?? '',
            h: computeKanoQuestionHash(base),
            t: computeKanoQuestionTextHash(base),
        };
    });

    return {
        projectId: input.projectId,
        projectName: input.projectName,
        questionSetHash: computeKanoQuestionSetHash(questions),
        questions,
        answerOptions,
        exportedAt: (input.exportedAt ?? new Date()).toISOString(),
    };
}

export function kanoOfflineSurveyFileName(projectName: string | null | undefined): string {
    return `Kano_설문_${sanitizeKanoFileNameStem(projectName) || '프로젝트'}.html`;
}

/** <script> 안에 JSON 을 넣을 때 </script> 나 <!-- 로 파서가 끊기지 않게 한다. */
export function jsonForScript(value: unknown): string {
    return JSON.stringify(value)
        .replace(/</g, '\\u003c')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
}

export function renderKanoOfflineSurveyHtml(model: KanoOfflineSurveyModel): string {
    const island = {
        format: KANO_OFFLINE_FORMAT,
        version: KANO_OFFLINE_VERSION,
        projectId: model.projectId,
        questionSetHash: model.questionSetHash,
        questions: model.questions.map((q) => ({ id: q.id, h: q.h, t: q.t })),
        exportedAt: model.exportedAt,
    };
    const options = (name: string) => model.answerOptions.map((option) =>
        `<label><input type="radio" name="${name}" value="${option.value}"><span>${escapeHtml(option.label)}</span></label>`
    ).join('');
    const blocks = model.questions.map((q) => `
<section class="item" data-qid="${escapeHtml(q.id)}">
    <div class="head"><span class="no">${q.no}</span>${q.category ? `<span class="cat">${escapeHtml(q.category)}</span>` : ''}<h3>${escapeHtml(q.requirement)}</h3></div>
    <div class="q" id="q-f-${escapeHtml(q.id)}"><p><span class="dot pos"></span>Q${q.no}-1. ${escapeHtml(q.positive)}<span class="star">*</span></p><div class="options">${options(`f_${escapeHtml(q.id)}`)}</div></div>
    <div class="q neg-bg" id="q-d-${escapeHtml(q.id)}"><p><span class="dot neg"></span>Q${q.no}-2. ${escapeHtml(q.negative)}<span class="star">*</span></p><div class="options">${options(`d_${escapeHtml(q.id)}`)}</div></div>
</section>`).join('');

    return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Kano 설문 - ${escapeHtml(model.projectName)}</title>
<style>${CSS}</style>
</head>
<body>
<main class="paper">
    <div class="bar"></div>
    <header>
        <h1>Kano 모델 기반 고객 만족도 조사</h1>
        <div class="project">프로젝트: ${escapeHtml(model.projectName)}</div>
        <p>안녕하세요! 본 설문은 제품의 각 기능이 제공되었을 때와 제공되지 않았을 때 여러분이 느끼시는 만족도를 파악하기 위한 조사입니다.</p>
        <div class="tips"><b>💡 응답 요령:</b><ul><li>각 기능에 대해 <b>긍정 질문(있는 경우)</b>과 <b>부정 질문(없는 경우)</b> 두 가지에 모두 답해 주세요.</li><li>모두 답한 뒤 맨 아래 <b>「답변 파일 저장」</b>을 누르고, 받은 파일을 설문 담당자에게 보내 주세요. <b>한 번만</b> 저장해 주세요.</li></ul></div>
        <div class="req">* 표시는 필수 항목입니다</div>
        <noscript><div class="req">이 설문은 브라우저의 JavaScript 가 켜져 있어야 답변 파일을 만들 수 있습니다.</div></noscript>
    </header>
    <div class="body">${blocks}
        <section class="submit">
            <label class="email">이메일 (선택) <input type="email" id="email" placeholder="입력하지 않으면 익명으로 집계됩니다"></label>
            <p class="note">입력한 이메일은 답변 파일에 담기며 설문 결과 관리 목적으로만 쓰입니다. 문의: 설문 담당자</p>
            <button type="button" id="save">답변 저장</button>
            <p id="status" class="status" aria-live="polite"></p>
            <div id="fallback" class="fallback" hidden>
                <p>다운로드 창이 뜨지 않았다면 아래 내용을 <b>「내용 복사」</b>로 복사해 담당자에게 메일로 보내 주세요.</p>
                <textarea id="payload" readonly rows="6"></textarea>
                <button type="button" id="copy">내용 복사</button>
            </div>
        </section>
    </div>
</main>
<script type="application/json" id="kano-offline-response"></script>
<script type="application/json" id="kano-offline-survey">${jsonForScript(island)}</script>
<script>${SCRIPT}</script>
</body>
</html>`;
}
```

`CSS` 는 미리보기(`KanoSurveyPreview.tsx`)의 보라 헤더(`#673ab7`)·5열 라디오 격자·긍정/부정 색점을 흉내내는 인라인 스타일이고 `@media print { .submit { display: none } }` 를 포함한다. 외양은 근사치다 — 테스트는 구조만 단언한다.

`SCRIPT` 의 동작(이 순서와 문구가 계약이다):
1. 설문 섬(`#kano-offline-survey`)을 `JSON.parse` 한다. 응답 섬(`#kano-offline-response`)은 **저장 버튼 클릭 시점에** `textContent.trim()` 으로 읽는다 — 로드 시점에 읽으면 안 된다(정본 절의 규칙). 페이지를 열었을 때 응답 섬에 내용이 있으면 `#status` 에 `이전에 저장한 답변이 실려 있습니다. 수정 후 다시 저장할 수 있습니다.` 를 쓴다(이 표시만 로드 시 허용 — `DOMContentLoaded` 뒤에).
2. `submissionId` 는 응답 섬에 있으면 그 값을 재사용하고, 없으면 처음 저장할 때 만든다: `crypto.randomUUID` 가 있으면 그것, 없으면 `crypto.getRandomValues` 로 만든 UUID v4.
3. 「답변 저장」: 모든 `questions[].id` 에 대해 `f_<id>`·`d_<id>` 라디오가 둘 다 선택됐는지 검사. 미완이면 첫 미답 문항으로 스크롤하고 그 `.q` 에 `class="missing"` 을 더하며 `#status` 에 `아직 답하지 않은 질문이 N개 있습니다.` 를 쓴다. 다운로드하지 않는다.
4. 완료면 (a) 모든 라디오에 대해 선택된 것은 `setAttribute('checked', '')`, 아닌 것은 `removeAttribute('checked')` — `outerHTML` 은 프로퍼티가 아니라 속성만 담기 때문이다. 이메일 입력은 `setAttribute('value', …)`. (b) 응답 페이로드 JSON(형식 정본)을 만들어 응답 섬의 `textContent` 에 `jsonForScript` 와 같은 규칙(`<` → `\u003c`)으로 써 넣는다. (c) `'<!DOCTYPE html>\n' + document.documentElement.outerHTML` 을 `Blob(text/html)` + `<a download="kano-response-<submissionId 앞 8자>.html">` 으로 저장한다. (d) 같은 JSON 을 `#payload` 에 넣고 `#fallback` 을 **항상** 보인다(다운로드 실패는 감지할 수 없다).
5. `#status` 는 성공을 단정하지 않는다: `답변이 담긴 설문 파일 kano-response-….html 을 저장합니다. 다운로드된 파일을 설문 담당자에게 보내 주세요. 다시 저장하면 같은 응답이 갱신됩니다.` 저장 버튼은 **비활성화하지 않는다**(재저장 허용).
6. 「내용 복사」: `navigator.clipboard.writeText` 시도, 실패하면 textarea 를 선택해 `document.execCommand('copy')`.

- [x] **Step 3: 내려받기 라우트를 만든다** — `app/api/projects/[id]/kano/survey-document/route.ts` 를 그대로 본뜬다. 차이: `select` 에 `id`·`category` 추가, `renderKanoOfflineSurveyHtml(buildKanoOfflineSurveyModel({ projectId, projectName: project.name, requirements }))`, 요구사항 0건이면 400 `'먼저 고객요구사항을 등록하세요.'`, 헤더 `Content-Type: text/html; charset=utf-8`, `Content-Disposition: attachment; filename*=UTF-8''<encodeURIComponent(kanoOfflineSurveyFileName(project.name))>`, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`. 로거 이름 `api/kano-offline-survey`.

- [x] **Step 4: `tests/kano-offline-survey.test.ts`**

- 해시: 같은 입력 → 같은 값(결정성), 순서만 바꾼 요구사항 → 세트 해시 동일, 문구 한 글자 변경 → 세트 해시·해당 문항 `h`·`t` 변경, id 만 바꾼 문항 → `h` 는 변하고 `t` 는 그대로, 문항 추가/삭제 → 세트 해시 변경, 저장값 앞뒤 공백은 `resolveKanoQuestionPair` 가 잘라 해시가 같음.
- 모델: `answerOptions` 가 `[LIKE,'마음에 든다'] … [DISLIKE,'마음에 안든다']` 순, 저장된 질문이 없으면 화면 기본 문구, `no` 는 1부터.
- HTML: `<script type="application/json" id="kano-offline-survey">` 섬을 정규식으로 뽑아 `JSON.parse` 하면 `format`/`version`/`projectId`/`questionSetHash`/`questions[].h`/`questions[].t` 가 모델과 같다; **응답 섬 `id="kano-offline-response"` 가 정확히 하나, 내용이 비어 있고, 설문 섬과 `<script>` 보다 앞에 있다**(문자열 인덱스 비교); 인라인 스크립트 문자열에 `setAttribute('checked'`·`outerHTML`·`kano-offline-response` 가 있다; 개인정보 고지 문구(결정 16)가 있다; 문항마다 `name="f_<id>"`·`name="d_<id>"` 라디오가 각 5개(값 5종); 요구사항 문구에 `</script><script>alert(1)</script>` 를 넣으면 HTML 본문에 `<script>alert` 가 없고 `&lt;/script&gt;` 로 나오며 섬 JSON 에도 `</script>` 문자열이 없다; `https?://`·`src=`·`@import`·`url(` 가 0건(자급자족); `charset=utf-8`·`lang="ko"`·`noscript` 포함; 파일명 `kanoOfflineSurveyFileName('a/b')` → `Kano_설문_a_b.html`, 빈 이름 → `Kano_설문_프로젝트.html`.

- [x] **Step 5: `tests/api-kano-offline-survey.test.ts`** — `tests/api-kano-survey-document.test.ts` 와 같은 5 케이스(200 헤더 4종 + 본문에 `<!DOCTYPE html>`·프로젝트명, 요구사항 order asc 조회, 404, 403 그대로, 500 본문에 원인 없음) + 요구사항 0건 400.

- [x] **Step 6: stryker 목록에 `lib/kano-offline-survey.ts` 를 더하고 검증·커밋한다**

```sh
npx tsc --noEmit && npx vitest run && npx next lint
npx stryker run stryker.crap.config.json --mutate lib/kano-offline-survey.ts
npx stryker run stryker.crap.config.json --mutate lib/kano-survey-document.ts   # 수정 파일 재실행
```

`renderKanoOfflineSurveyHtml` 의 CSS/JS 문자열 상수는 StringLiteral 뮤턴트가 대량으로 생긴다. 테스트가 계약 문구(상태 메시지·id·name)를 단언해 죽이되, 순수 장식 CSS 는 `// Stryker disable next-line StringLiteral: 장식 CSS 는 동작 계약이 아니다` 로 **상수 선언 줄에만** 제외한다. 제외로 줄어든 뮤턴트 수를 보고서에 적는다.

---

### Task 4: 응답 파일 파서·대조 (순수)

**Files:**
- Create: `lib/kano-offline-response.ts`, `tests/kano-offline-response.test.ts`
- Modify: `stryker.crap.config.json`

- [ ] **Step 1: `lib/kano-offline-response.ts` 를 만든다**

```ts
// 피설문자가 저장한 답변 파일(.kano.json)을 읽어 검증하고 현재 질문 세트와 대조한다.
//
// zod 를 쓰지 않는다 — 이 모듈은 뮤테이션 100% 대상이라 판정 하나하나가 테스트로 고정돼야
// 하고, node_modules 없는 원격 세션에서도 실행 검증할 수 있어야 한다.
// 오류 사유는 코드로만 돌려주고 파일 내용은 에코하지 않는다.
import { KANO_ANSWER_SCORE, type KanoAnswer } from './constants';
import { KANO_OFFLINE_FORMAT, KANO_OFFLINE_VERSION } from './kano-offline-survey';

export const KANO_OFFLINE_MAX_ANSWERS = 300;

export type KanoOfflineParseFailure =
    | 'empty' | 'survey-file' | 'html-no-island' | 'not-json' | 'format' | 'version'
    | 'project-id' | 'question-set-hash' | 'questions' | 'submission-id'
    | 'submitted-at' | 'email' | 'answers-empty' | 'answers-too-many'
    | 'answer-shape' | 'answer-value' | 'answer-duplicate';

export interface KanoOfflineResponseFile {
    projectId: string;
    questionSetHash: string;
    questions: Array<{ id: string; h: string; t: string }>;
    submissionId: string;
    submittedAt: Date;
    /** 소문자·trim. 없으면 null. */
    respondentEmail: string | null;
    answers: Array<{ requirementId: string; functional: KanoAnswer; dysfunctional: KanoAnswer }>;
}

export type KanoOfflineParseResult =
    | { ok: true; file: KanoOfflineResponseFile }
    | { ok: false; reason: KanoOfflineParseFailure };

const HEX_64 = /^[0-9a-f]{64}$/;
const HEX_16 = /^[0-9a-f]{16}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// 최소한의 이메일 모양. 형식이 다르면 파일을 거절한다 — 조용히 합성 이메일로 바꾸면 응답자가 사라진다.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ANSWER_VALUES = new Set(Object.keys(KANO_ANSWER_SCORE));

const RESPONSE_ISLAND = /<script type="application\/json" id="kano-offline-response">([\s\S]*?)<\/script>/g;

/**
 * 답변 HTML 이면 응답 섬의 JSON 을, 아니면 텍스트 그대로를 돌려준다.
 * 섬이 여러 개면 마지막 비어 있지 않은 것을 쓴다 — 재저장된 파일의 최신 답이 뒤에 온다.
 */
export function extractKanoOfflinePayloadText(rawText: string): { ok: true; text: string } | { ok: false; reason: 'empty' | 'survey-file' | 'html-no-island' } {
    // 메모장이 붙이는 BOM 은 JSON 이 아니다.
    const text = rawText.replace(/^\uFEFF/, '').trim();
    if (!text) return { ok: false, reason: 'empty' };
    if (!text.startsWith('<')) return { ok: true, text };
    const islands = [...text.matchAll(RESPONSE_ISLAND)].map((m) => m[1].trim());
    if (islands.length === 0) return { ok: false, reason: 'html-no-island' };
    const filled = islands.filter((island) => island.length > 0);
    if (filled.length === 0) return { ok: false, reason: 'survey-file' };
    return { ok: true, text: filled[filled.length - 1] };
}

export function parseKanoOfflineResponseText(rawText: string, now: Date = new Date()): KanoOfflineParseResult {
    const extracted = extractKanoOfflinePayloadText(rawText);
    if (!extracted.ok) return { ok: false, reason: extracted.reason };
    const text = extracted.text;

    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        return { ok: false, reason: 'not-json' };
    }
    if (!isRecord(data)) return { ok: false, reason: 'not-json' };
    if (data.format !== KANO_OFFLINE_FORMAT) return { ok: false, reason: 'format' };
    if (data.version !== KANO_OFFLINE_VERSION) return { ok: false, reason: 'version' };
    if (!isNonEmptyString(data.projectId)) return { ok: false, reason: 'project-id' };
    if (typeof data.questionSetHash !== 'string' || !HEX_64.test(data.questionSetHash)) return { ok: false, reason: 'question-set-hash' };
    if (!Array.isArray(data.questions) || !data.questions.every((q) => isRecord(q) && isNonEmptyString(q.id)
        && typeof q.h === 'string' && HEX_16.test(q.h) && typeof q.t === 'string' && HEX_16.test(q.t))) {
        return { ok: false, reason: 'questions' };
    }
    if (typeof data.submissionId !== 'string' || !UUID.test(data.submissionId)) return { ok: false, reason: 'submission-id' };

    // 시계가 틀린 PC 에서 저장한 미래 시각은 now 로 대체한다(5분 허용).
    const submittedAtRaw = typeof data.submittedAt === 'string' ? new Date(data.submittedAt) : new Date(NaN);
    const submittedAt = Number.isNaN(submittedAtRaw.getTime()) || submittedAtRaw.getTime() > now.getTime() + 5 * 60 * 1000
        ? now
        : submittedAtRaw;

    let respondentEmail: string | null = null;
    if (data.respondentEmail !== null && data.respondentEmail !== undefined && data.respondentEmail !== '') {
        if (typeof data.respondentEmail !== 'string') return { ok: false, reason: 'email' };
        const normalized = data.respondentEmail.trim().toLowerCase();
        if (!EMAIL.test(normalized)) return { ok: false, reason: 'email' };
        respondentEmail = normalized;
    }

    if (!Array.isArray(data.answers) || data.answers.length === 0) return { ok: false, reason: 'answers-empty' };
    if (data.answers.length > KANO_OFFLINE_MAX_ANSWERS) return { ok: false, reason: 'answers-too-many' };
    const seen = new Set<string>();
    const answers: KanoOfflineResponseFile['answers'] = [];
    for (const answer of data.answers) {
        if (!isRecord(answer) || !isNonEmptyString(answer.requirementId)) return { ok: false, reason: 'answer-shape' };
        if (typeof answer.functional !== 'string' || typeof answer.dysfunctional !== 'string'
            || !ANSWER_VALUES.has(answer.functional) || !ANSWER_VALUES.has(answer.dysfunctional)) {
            return { ok: false, reason: 'answer-value' };
        }
        if (seen.has(answer.requirementId)) return { ok: false, reason: 'answer-duplicate' };
        seen.add(answer.requirementId);
        answers.push({ requirementId: answer.requirementId, functional: answer.functional as KanoAnswer, dysfunctional: answer.dysfunctional as KanoAnswer });
    }

    return {
        ok: true,
        file: {
            projectId: data.projectId,
            questionSetHash: data.questionSetHash,
            questions: data.questions.map((q) => {
                const question = q as { id: string; h: string; t: string };
                return { id: question.id, h: question.h, t: question.t };
            }),
            submissionId: data.submissionId.toLowerCase(),
            submittedAt,
            respondentEmail,
            answers,
        },
    };
}

export interface KanoCurrentQuestionSet {
    projectId: string;
    questionSetHash: string;
    /** requirementId → 문항 해시 h */
    questionHashById: Map<string, string>;
    /** 문구 해시 t → 그 문구를 가진 현재 requirementId 목록. 재매칭은 정확히 하나일 때만 한다. */
    requirementIdsByTextHash: Map<string, string[]>;
}

export type KanoOfflineReconcile =
    | { status: 'wrong-project' }
    | { status: 'unknown-requirement'; unknownIds: string[] }
    | { status: 'ok'; answers: KanoOfflineResponseFile['answers']; dropped: 0; rematched: 0 }
    | { status: 'question-set-changed'; matched: KanoOfflineResponseFile['answers']; dropped: number; rematched: number };

/**
 * 현재 질문 세트와 대조한다. 세트 해시가 같으면 전부 수입 가능. 다르면 (1) 문항 해시 h 가 현재와
 * 같은 답은 그대로, (2) id 는 없어졌지만 문구 해시 t 가 현재 문항 정확히 하나와 같은 답은 그
 * 문항으로 재매칭(AI 재생성·JSON 이관으로 id 가 통째로 바뀐 경우), (3) 나머지는 버린다 —
 * 문구가 바뀐 문항의 답은 어떤 경로로도 저장되지 않는다.
 * requirementId 소속 검증은 해시가 같아도 항상 한다(해시 충돌·조작 방어의 최종선).
 */
export function reconcileKanoOfflineResponse(file: KanoOfflineResponseFile, current: KanoCurrentQuestionSet): KanoOfflineReconcile {
    if (file.projectId !== current.projectId) return { status: 'wrong-project' };
    const unknownIds = file.answers.map((a) => a.requirementId).filter((id) => !current.questionHashById.has(id));
    if (file.questionSetHash === current.questionSetHash) {
        if (unknownIds.length > 0) return { status: 'unknown-requirement', unknownIds };
        return { status: 'ok', answers: file.answers, dropped: 0, rematched: 0 };
    }
    const fileQuestionById = new Map(file.questions.map((q) => [q.id, q]));
    const matched: KanoOfflineResponseFile['answers'] = [];
    const taken = new Set<string>();
    let rematched = 0;
    for (const answer of file.answers) {
        const fileQuestion = fileQuestionById.get(answer.requirementId);
        if (!fileQuestion) continue;
        const currentHash = current.questionHashById.get(answer.requirementId);
        if (currentHash !== undefined && currentHash === fileQuestion.h) {
            matched.push(answer);
            taken.add(answer.requirementId);
            continue;
        }
        if (currentHash !== undefined) continue; // id 는 있는데 문구가 바뀜 — 버린다
        const candidates = (current.requirementIdsByTextHash.get(fileQuestion.t) ?? []).filter((id) => !taken.has(id));
        if (candidates.length === 1) {
            matched.push({ ...answer, requirementId: candidates[0] });
            taken.add(candidates[0]);
            rematched += 1;
        }
    }
    return { status: 'question-set-changed', matched, dropped: file.answers.length - matched.length, rematched };
}

export function resolveKanoOfflineRespondentEmail(file: Pick<KanoOfflineResponseFile, 'respondentEmail' | 'submissionId'>): string {
    return file.respondentEmail ?? `offline-${file.submissionId.replace(/-/g, '').slice(0, 12)}@import.local`;
}

export function kanoOfflineInvitationToken(file: Pick<KanoOfflineResponseFile, 'submissionId'>): string {
    return `offline_${file.submissionId}`;
}

/** 한 배치 안에서 같은 이메일(또는 submissionId)이 둘 이상이면 그 파일들의 인덱스를 돌려준다. 서버가 승자를 고르지 않는다. */
export function findDuplicateKanoOfflineFiles(files: Array<Pick<KanoOfflineResponseFile, 'respondentEmail' | 'submissionId'>>): number[] {
    const byKey = new Map<string, number[]>();
    files.forEach((file, index) => {
        for (const key of [`e:${resolveKanoOfflineRespondentEmail(file)}`, `s:${file.submissionId}`]) {
            byKey.set(key, [...(byKey.get(key) ?? []), index]);
        }
    });
    const duplicates = new Set<number>();
    for (const indexes of byKey.values()) {
        if (indexes.length > 1) indexes.forEach((i) => duplicates.add(i));
    }
    return [...duplicates].sort((a, b) => a - b);
}

/** 409 안내용 변경 요약. */
export function describeKanoQuestionSetChange(
    fileQuestions: Array<{ id: string; h: string }>,
    current: Map<string, string>
): { added: number; removed: number; changed: number } {
    const fileById = new Map(fileQuestions.map((q) => [q.id, q.h]));
    let removed = 0;
    let changed = 0;
    for (const [id, h] of fileById) {
        const now = current.get(id);
        if (now === undefined) removed += 1;
        else if (now !== h) changed += 1;
    }
    let added = 0;
    for (const id of current.keys()) if (!fileById.has(id)) added += 1;
    return { added, removed, changed };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}
```

- [ ] **Step 2: `tests/kano-offline-response.test.ts`**

파싱 실패 사유 하나당 케이스 하나(빈 문자열, BOM 만 — 문자열은 `'\uFEFF'` 이스케이프로 만든다, 응답 섬이 없는 HTML → `html-no-island`, 응답 섬이 비어 있는 HTML(미답 원본) → `survey-file`, **응답 섬이 채워진 HTML → 정상 파싱**(값이 JSON 경로와 같음), 빈 섬 + 채워진 섬이 함께 있으면 채워진 것을 씀, 채워진 섬 둘이면 **마지막 것**을 씀, 섬 안의 `\u003c/script>` 이스케이프가 `<` 로 복원됨, 깨진 JSON, 배열, `format` 다름, `version: 2`, projectId 빈 문자열, 해시 63자, questions 의 h 15자·t 누락, submissionId 대문자는 허용되나 하이픈 누락은 거절, submittedAt 미래 10분 → now 로 폴백·미래 4분 → 유지·파싱 불가 → now, 이메일 `' Hong@X.COM '` → `hong@x.com`, 이메일 형식 오류 거절, `respondentEmail: ''` → null, answers 빈 배열, 301개, 값 `'like'`(소문자) 거절, 숫자 1 거절, requirementId 중복). 대조: 프로젝트 불일치, 해시 같고 미지 id → `unknown-requirement`, 해시 같음 → 전부, 해시 다르고 문항 h 일부 일치 → `matched`/`dropped` 정확, 문구가 바뀐 문항(id 는 있고 h 다름)은 버림, **id 가 전부 바뀌고 문구는 같음 → 전부 재매칭·`rematched` = 답 수**, 같은 문구가 현재 두 문항에 있으면 재매칭하지 않음, 재매칭된 id 는 두 번 쓰이지 않음, 문항이 삭제된 경우 dropped 에 포함. 합성 이메일 결정성·길이, 토큰 접두어, 배치 중복(같은 이메일 두 파일·같은 submissionId 두 파일·둘 다 없음 → `[]`), 변경 요약 added/removed/changed.

- [ ] **Step 3: stryker 목록에 더하고 검증·커밋한다**

원격 세션에서는 아래 하네스로 대체 검증한다(감리자가 제공): `node --experimental-strip-types` 로 이 모듈을 import 해 위 케이스를 `node:assert` 로 실행. `crypto`·`./constants`·`./kano-offline-survey` 만 의존하므로 컨테이너에서 돈다.

---

### Task 5: 수입 라우트 `POST /api/projects/[id]/kano/offline-responses`

**Files:**
- Create: `app/api/projects/[id]/kano/offline-responses/route.ts`, `tests/api-kano-offline-responses.test.ts`

- [ ] **Step 1: 라우트를 만든다**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';
import { createLogger } from '@/lib/logger';
import { toErrorResponse } from '@/lib/api-error';
import { guardUploadedFile } from '@/lib/upload-guard';
import { KANO_ANSWER_SCORE } from '@/lib/constants';
import { buildKanoOfflineSurveyModel } from '@/lib/kano-offline-survey';
import {
    describeKanoQuestionSetChange, findDuplicateKanoOfflineFiles, kanoOfflineInvitationToken,
    parseKanoOfflineResponseText, reconcileKanoOfflineResponse, resolveKanoOfflineRespondentEmail,
    type KanoOfflineResponseFile,
} from '@/lib/kano-offline-response';
import { importKanoResponses, type KanoImportRespondent } from '@/lib/kano-response-import';

const log = createLogger('api/kano-offline-responses');
// Vercel 서버리스의 본문 상한(약 4.5 MB)과 실행 시간 안에 들어야 한다. 답변 HTML 은 문항당
// 약 2.3 KB 라 100문항이어도 250 KB 안팎이고, 10 × 400 KB = 4 MB 로 상한 아래다. 화면이 10개씩 나눠 보낸다.
const MAX_FILES = 10;
const MAX_FILE_BYTES = 400 * 1024;
// 답변 HTML 이 기본 경로, .json 은 「내용 복사」 폴백. 업로드된 HTML 은 파싱만 하고 어디에도 렌더하지 않는다.
const FILE_RULE = { extensions: ['.html', '.htm', '.json'], maxBytes: MAX_FILE_BYTES, label: '답변' };

export const maxDuration = 60;

type FailureCode =
    | 'GUARD' | 'PARSE' | 'WRONG_PROJECT' | 'UNKNOWN_REQUIREMENT'
    | 'DUPLICATE_IN_BATCH' | 'RESPONDENT_EXISTS';

interface FileFailure { index: number; fileName: string; code: FailureCode; detail?: string }

// 오프라인 답변 파일(.kano.json)을 여러 개 받아 응답 기록을 만든다. 파일 단위로 판정하고
// 통과한 파일만 한 트랜잭션으로 쓴다 — 담당자가 폴더째 올리는 현실에서 한 장 때문에
// 전부 막히는 것과, 한 장이 조용히 빠지는 것을 둘 다 피하기 위해 실패 목록을 함께 돌려준다.
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const { id: projectId } = await props.params;
    const accessResult = await requireProjectAccess(request, projectId, { write: true });
    if (accessResult instanceof NextResponse) return accessResult;

    try {
        const formData = await request.formData();
        const entries = formData.getAll('files');
        if (entries.length === 0) return NextResponse.json({ error: '업로드할 답변 파일이 필요합니다.' }, { status: 400 });
        if (entries.length > MAX_FILES) return NextResponse.json({ error: `한 번에 ${MAX_FILES}개까지 올릴 수 있습니다.` }, { status: 400 });
        const acceptQuestionSetMismatch = formData.get('acceptQuestionSetMismatch') === 'true';
        // 파일별 덮어쓰기 승인. 인덱스 목록("0,3") — 이메일을 폼에 다시 실어 보내지 않기 위해 인덱스로 가리킨다.
        const overwriteFiles = new Set(String(formData.get('overwriteFiles') ?? '').split(',').filter(Boolean).map(Number));

        const requirements = await prisma.customerRequirement.findMany({
            where: { projectId },
            orderBy: { order: 'asc' },
            select: { id: true, requirement: true, category: true, kanoPositiveQ: true, kanoNegativeQ: true },
        });
        if (requirements.length === 0) return NextResponse.json({ error: '먼저 고객요구사항을 등록하세요.' }, { status: 400 });
        const model = buildKanoOfflineSurveyModel({ projectId, projectName: '', requirements });
        const requirementIdsByTextHash = new Map<string, string[]>();
        for (const q of model.questions) requirementIdsByTextHash.set(q.t, [...(requirementIdsByTextHash.get(q.t) ?? []), q.id]);
        const current = {
            projectId,
            questionSetHash: model.questionSetHash,
            questionHashById: new Map(model.questions.map((q) => [q.id, q.h])),
            requirementIdsByTextHash,
        };

        const failures: FileFailure[] = [];
        const parsed: Array<{ index: number; fileName: string; file: KanoOfflineResponseFile }> = [];
        for (const [index, entry] of entries.entries()) {
            const guard = guardUploadedFile(entry, FILE_RULE);
            const fileName = entry instanceof File ? entry.name : `file-${index}`;
            if (!guard.ok) { failures.push({ index, fileName, code: 'GUARD', detail: guard.failure.error }); continue; }
            const result = parseKanoOfflineResponseText(await guard.file.text());
            if (!result.ok) { failures.push({ index, fileName, code: 'PARSE', detail: result.reason }); continue; }
            parsed.push({ index, fileName, file: result.file });
        }

        // 질문 세트 대조. 하나라도 어긋나면 수락 플래그 없이는 전체를 멈춘다 — 대개 전 파일이 같은 배포본이다.
        const reconciled = parsed.map((p) => ({ ...p, outcome: reconcileKanoOfflineResponse(p.file, current) }));
        const changedFiles = reconciled.filter((r) => r.outcome.status === 'question-set-changed');
        if (changedFiles.length > 0 && !acceptQuestionSetMismatch) {
            const summary = describeKanoQuestionSetChange(changedFiles[0].file.questions, current.questionHashById);
            return NextResponse.json({
                error: '설문 배포 후 질문이 바뀌어 답을 그대로 등록할 수 없습니다.',
                code: 'QUESTION_SET_CHANGED',
                ...summary,
                affectedFiles: changedFiles.map((r) => r.fileName),
            }, { status: 409 });
        }

        const candidates: Array<{ index: number; fileName: string; file: KanoOfflineResponseFile; answers: KanoOfflineResponseFile['answers']; dropped: number; rematched: number }> = [];
        for (const r of reconciled) {
            if (r.outcome.status === 'wrong-project') failures.push({ index: r.index, fileName: r.fileName, code: 'WRONG_PROJECT' });
            else if (r.outcome.status === 'unknown-requirement') failures.push({ index: r.index, fileName: r.fileName, code: 'UNKNOWN_REQUIREMENT' });
            else if (r.outcome.status === 'ok') candidates.push({ ...r, answers: r.outcome.answers, dropped: 0, rematched: 0 });
            else if (r.outcome.matched.length === 0) failures.push({ index: r.index, fileName: r.fileName, code: 'UNKNOWN_REQUIREMENT' });
            else candidates.push({ ...r, answers: r.outcome.matched, dropped: r.outcome.dropped, rematched: r.outcome.rematched });
        }

        for (const dupIndex of findDuplicateKanoOfflineFiles(candidates.map((c) => c.file))) {
            const c = candidates[dupIndex];
            failures.push({ index: c.index, fileName: c.fileName, code: 'DUPLICATE_IN_BATCH' });
        }
        const deduped = candidates.filter((c) => !failures.some((f) => f.index === c.index));

        // 다른 경로(온라인·엑셀·구글폼)로 이미 존재하는 이메일은 파일별 승인 없이는 덮어쓰지 않는다 — 파일의
        // 이메일은 자기 신고 값이라 사칭으로 타인의 응답을 지울 수 있다. 같은 오프라인 경로(offline_ 토큰)는 재수입으로 본다.
        const emails = deduped.map((c) => resolveKanoOfflineRespondentEmail(c.file));
        const existing = emails.length === 0 ? [] : await prisma.kanoSurveyInvitation.findMany({
            where: { projectId, email: { in: emails, mode: 'insensitive' } },
            select: { email: true, token: true },
        });
        const foreign = new Set(existing.filter((inv) => !inv.token.startsWith('offline_')).map((inv) => inv.email.toLowerCase()));
        const respondents: KanoImportRespondent[] = [];
        let droppedAnswerCount = 0;
        let rematchedAnswerCount = 0;
        for (const c of deduped) {
            const email = resolveKanoOfflineRespondentEmail(c.file);
            if (foreign.has(email) && !overwriteFiles.has(c.index)) {
                failures.push({ index: c.index, fileName: c.fileName, code: 'RESPONDENT_EXISTS' });
                continue;
            }
            droppedAnswerCount += c.dropped;
            rematchedAnswerCount += c.rematched;
            respondents.push({
                email,
                respondedAt: c.file.submittedAt,
                token: kanoOfflineInvitationToken(c.file),
                answers: c.answers.map((a) => ({ requirementId: a.requirementId, positiveAnswer: KANO_ANSWER_SCORE[a.functional], negativeAnswer: KANO_ANSWER_SCORE[a.dysfunctional] })),
            });
        }

        if (respondents.length === 0) {
            return NextResponse.json({ error: '등록할 수 있는 답변 파일이 없습니다.', failures }, { status: 400 });
        }

        const result = await prisma.$transaction((tx) => importKanoResponses(tx, respondents, {
            projectId,
            invitedBy: accessResult.user.userId,
            tokenPrefix: 'offline',
            writePolicy: 'append',
            // 즉시 만료: 리셋으로 respondedAt 이 비어도 이 초대로는 온라인 응답을 할 수 없어야 한다.
            invitationExpiresAt: (now) => now,
        }), { timeout: 60_000, maxWait: 10_000 });

        log.info('오프라인 답변 파일 업로드', { projectId, fileCount: entries.length, ...result, droppedAnswerCount, rematchedAnswerCount, failedCount: failures.length });
        return NextResponse.json({
            success: true,
            message: `${result.respondentCount}명 응답자의 ${result.importedCount}개 응답을 등록했습니다.`,
            ...result,
            droppedAnswerCount,
            rematchedAnswerCount,
            failures,
        });
    } catch (error) {
        return toErrorResponse(error, { log, message: '오프라인 답변 파일 업로드에 실패했습니다.', context: { projectId } });
    }
}
```

`failures[].detail` 은 가드 문구·파서 사유 코드뿐이다 — 파일 내용·이메일은 절대 넣지 않는다. `fileName` 은 업로더 자신의 파일명이라 응답에는 담되 로그에는 남기지 않는다.

- [ ] **Step 2: `tests/api-kano-offline-responses.test.ts`**

`$transaction` 목 + bare 목 패턴. 파일은 `new File([JSON.stringify(payload)], 'a.kano.json', { type: 'application/json' })` 로 만들고 `formData.append('files', file)` 로 여러 개 붙인다. 현재 질문 세트는 `customerRequirement.findMany` 목이 돌려주는 요구사항으로 `buildKanoOfflineSurveyModel` 이 계산하므로, 테스트는 같은 요구사항으로 `questionSetHash`·`questions[].h` 를 만들어 페이로드에 넣는다.

케이스: (1) 정상 2파일 → tx 로만 쓰기, `respondentCount 2`, 응답 본문에 이메일 없음, (2) 1파일 가드 실패 + 1파일 정상 → 정상 1건 저장 + `failures[0].code 'GUARD'`, (3) 전부 실패 → 400 + failures, (4) 해시 불일치 + 플래그 없음 → 409 `QUESTION_SET_CHANGED` + added/removed/changed + 쓰기 0, (5) 같은 요청에 `acceptQuestionSetMismatch=true` → 일치 문항만 저장·`droppedAnswerCount`, (5b) 요구사항 id 를 전부 바꾼 현재 세트(문구 동일) + 수락 → 전부 재매칭·`rematchedAnswerCount`, (6) 다른 projectId → `WRONG_PROJECT`, (7) 해시 같은데 미지 requirementId → `UNKNOWN_REQUIREMENT`·쓰기 0, (7b) 수락했는데 일치 문항이 0개인 파일 → `UNKNOWN_REQUIREMENT`, (8) 같은 이메일 두 파일 → 둘 다 `DUPLICATE_IN_BATCH`, (9) 기존 초대(token `uuid…`, 온라인)와 같은 이메일(대소문자 다름) → `RESPONDENT_EXISTS`·쓰기 0, (10) 같은 요청에 `overwriteFiles=0` → 저장, (11) 기존 초대 token 이 `offline_` 이면 승인 없이 저장(재수입), (12) `$transaction` 옵션에 `timeout` 이 있다, (13) 403 그대로, (14) 11 파일 400, (14b) 401 KB 파일은 `GUARD` 실패, (14c) 답변 HTML(응답 섬 채움) 1건 → 200·저장, (14d) 미답 원본 HTML → `failures[].code 'PARSE'`·`detail 'survey-file'`, (15) 500 본문에 내부 오류 없음, (16) 라우트 모듈이 `maxDuration` 을 export 한다.

- [ ] **Step 3: 검증하고 커밋한다**

---

### Task 6: 화면 연결

**Files:**
- Modify: `components/project/KanoManager.tsx`, `components/KanoSurveyPreview.tsx`, `.env.example`

**플래그:** 이 Task 가 더하는 링크·카드는 전부 `process.env.NEXT_PUBLIC_KANO_OFFLINE_SURVEY === 'on'` 일 때만 렌더한다(결정 13). `.env.example` 에 `NEXT_PUBLIC_KANO_OFFLINE_SURVEY=off` 와 한 줄 설명을 더한다. **`lib/kano-offline-survey.ts` 를 import 하지 않는다**(node `crypto`). 형식 상수가 필요하면 `'kano-offline-response'` 리터럴을 쓰고 테스트가 두 곳의 일치를 단언한다.

- [ ] **Step 1: 내려받기 링크** — Google Forms 카드 1단계 「양식 확인」 버튼(692-697행) 아래에 `<a href={`/api/projects/${projectId}/kano/offline-survey`} className="mt-2 w-full …btn-secondary text-xs …">오프라인 HTML 받기</a>`. `KanoSurveyPreview` 에 `offlineSurveyUrl?: string` prop 을 더하고 제어바(148-161행)에 같은 링크를 「PDF 출력」 왼쪽에 둔다(prop 이 있을 때만). 66-67행 기본 문구는 `resolveKanoQuestionPair(req)` 로 바꾼다(`getKanoTopic` 은 주제 표시에 여전히 쓰이므로 import 유지).

- [ ] **Step 2: 업로드 카드** — 「응답 파일로 업로드」 카드(814-866행) 바로 아래에 새 카드 「오프라인 응답 파일 업로드」. 상태: `offlineFiles: File[]`, `isUploadingOffline`, `offlineProgress: { done; total }`, `offlineResult: { message; failures; rematchedAnswerCount; droppedAnswerCount } | null`, `offlineConflict: { code; added; removed; changed; affectedFiles } | { code; indexes } | null`. `<input type="file" multiple accept=".html,.htm,.json,.kano.json">`. 선택 직후 각 파일을 `File.text()` 로 읽어 — `<` 로 시작하면 `id="kano-offline-response"` 섬의 마지막 비어 있지 않은 내용을, 아니면 텍스트 전체를 — `JSON.parse` 가 되고 `format === 'kano-offline-response'` 이며 `projectId` 가 현재 프로젝트와 같은지만 확인해 목록에 ✓/✗(빈 섬이면 "답하지 않은 원본 설문 파일")로 표시한다(서버 검증을 대체하지 않는다). 업로드 핸들러는 파일을 **10개씩 순차 배치**로 `POST …/kano/offline-responses` 에 보내고 진행(`3/7 배치`)을 표시한다 — 한 배치가 409/에러면 거기서 멈추고 남은 파일 수를 알린다(재시도는 submissionId 멱등이라 안전하다). `failures` 의 `index` 는 배치 안 인덱스이므로 화면은 배치 오프셋을 더해 파일명으로 보여 준다. **`replace` 선택지·`window.prompt` 없음.**
  - 200: 토스트 `data.message`, `failures` 가 있으면 카드 안 결과 패널에 파일명·사유(코드별 한국어 문구 매핑: `GUARD` 는 detail 그대로, `PARSE:survey-file` → "아직 답하지 않은 원본 설문 파일입니다", `PARSE:html-no-island` → "이 앱이 만든 설문 파일이 아닙니다", `PARSE:*` → "답변 파일 형식이 올바르지 않습니다", `WRONG_PROJECT`, `UNKNOWN_REQUIREMENT`, `DUPLICATE_IN_BATCH`, `RESPONDENT_EXISTS` → "이미 다른 방법으로 응답한 이메일입니다"), `droppedAnswerCount > 0` 이면 "문구가 바뀐 문항의 답 N개는 등록하지 않았습니다". 그 뒤 `await loadData()`.
  - 409 `QUESTION_SET_CHANGED`: 안내 박스 "설문 배포 후 질문이 바뀌었습니다(추가 a·삭제 b·문구 변경 c). 영향 파일: …" + 버튼 「일치하는 문항만 등록」 → `acceptQuestionSetMismatch=true` 로 재전송.
  - `RESPONDENT_EXISTS` 가 있는 200: 박스 "이미 응답한 이메일과 겹치는 파일 N개" + 버튼 「해당 파일만 덮어쓰기」 → 그 인덱스들을 `overwriteFiles` 로 재전송.

- [ ] **Step 3: 초대 내역 라벨** — 1028-1062행에서 `inv.token.startsWith('offline_')` 이면 이메일 대신 `오프라인 응답 #${inv.token.slice(8, 16)}` 을 굵게 보이고(이메일이 실제 값이면 그 아래 작은 글씨로), 「링크 복사」 버튼을 렌더하지 않는다(즉시 만료 토큰).

- [ ] **Step 4: 검증하고 커밋한다**

```sh
npx tsc --noEmit && npx vitest run && npx next lint && npm run build
```

`npm run build` 는 클라이언트 번들에 node 모듈이 섞이지 않았는지 보는 게이트다. 화면 실기동 검증은 Task 8 에서 한다.

---

### Task 7: 운영 지침 문서

**Files:**
- Create: `docs/2026-09-04-kano-offline-survey-guide.md`
- Modify: `docs/2026-09-02-mentee-account-deletion-guide.md`

- [ ] **Step 1: 운영 지침을 쓴다** — 선례 `docs/2026-09-02-mentee-account-deletion-guide.md` 의 어조로. 절: (1) 언제 쓰는가(온라인 초대 링크·Word 종이 설문·엑셀 손입력과의 관계 — 오프라인 HTML 은 "기기는 있지만 인터넷이 없는" 현장용, Word 는 종이용, 둘 다 엑셀 경로로 보완), (2) 배포 절차(플래그 켜기 → 「오프라인 HTML 받기」 → 파일럿에서 검증된 채널로 전달 → 피설문자 안내문 예시), (3) 수집 절차(회신 파일을 한 폴더에 → 「오프라인 응답 파일 업로드」 → 결과 패널 읽는 법 — 실패 코드별 조치, 409 안내와 「일치하는 문항만 등록」, `RESPONDENT_EXISTS` 와 「덮어쓰기」), (4) 하지 말 것(배포 후 요구사항 AI 재생성·JSON 이관 — id 가 바뀌어 문구가 같은 문항만 재매칭된다, 같은 파일 두 번 저장 안내), (5) 되돌리기(플래그 끄기, 오프라인 응답만 지우는 수단은 없으므로 파일럿은 별도 프로젝트에서).

- [ ] **Step 2: 삭제 지침에 한 줄** — "삭제 미리보기의 '설문 초대 발송 수' 에는 엑셀·오프라인 파일 업로드로 생긴 초대(토큰 `excel_`/`offline_`)가 포함된다."

- [ ] **Step 3: 커밋한다** (게이트: `npm run check:encoding`)

---

### Task 8 (감리자): 실기동 검증

- [ ] **Step 1: 컨테이너 스모크(Playwright)** — `node --experimental-strip-types` 로 `renderKanoOfflineSurveyHtml(buildKanoOfflineSurveyModel(샘플 3개))` 를 파일로 쓰고, 전역 Playwright(`/opt/node22/lib/node_modules/playwright`)로 `file://` 로 열어 네트워크 전면 차단 상태에서: 미답 저장 → 차단·다운로드 없음·`missing` 강조 / 전부 답 + 이메일 → 다운로드 캡처 → 파일명 `kano-response-<8hex>.html` / **다운로드된 HTML 을 다시 `file://` 로 열어 라디오·이메일이 복원되고 상태문구가 뜨는지** / 답 하나 바꿔 재저장 → 같은 submissionId·바뀐 값·응답 섬 1개 / 내용을 `parseKanoOfflineResponseText` → `reconcileKanoOfflineResponse`(같은 모델) → `status 'ok'`·answers 3 / **원본(미답) HTML → `survey-file`** / `#payload` 의 JSON 도 같은 파서로 통과 / 문구 하나 바꾼 모델로 대조 → `question-set-changed`·dropped 1 / `#fallback` 이 보이고 `#payload` 가 같은 JSON / `</script>` 요구사항으로 렌더한 파일이 브라우저에서 깨지지 않음.
- [ ] **Step 2: 사용자 실계정(Windows Chrome·Edge, 파일럿용 별도 프로젝트)** — 플래그 켠 뒤 WS-6 에서 「오프라인 HTML 받기」 → 받은 파일 더블클릭 → 답 → 「답변 저장」 → 받은 `kano-response-….html` 을 다시 열어 답이 복원되는지 → 그 파일을 「오프라인 응답 파일 업로드」 → 응답자 표·초대 내역·분석에 반영 확인. 같은 파일 재업로드 → 응답 수 불변. 원본(미답) 설문 HTML 을 올리면 "아직 답하지 않은 원본 설문 파일". 질문 저장으로 문구 하나 바꾼 뒤 재업로드 → 409 안내 → 「일치하는 문항만 등록」. 온라인 초대로 이미 응답한 이메일을 파일에 적어 업로드 → `RESPONDENT_EXISTS` → 「덮어쓰기」. **실배포 URL(Vercel)에서 파일 11개(10+1 배치)를 한 번에 올려 배치 진행과 결과가 맞는지** 확인 — 서버리스 상한은 로컬에서 재현되지 않는다.
- [ ] **Step 3: 미확인으로 남기는 것** — Task 0 파일럿에서 못 본 채널, 회사 보안 정책(파일 다운로드 차단·`.html` 첨부 필터). 설계서 11절.
