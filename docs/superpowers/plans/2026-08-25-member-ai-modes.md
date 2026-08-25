# 회원 AI 연결 4모드 (규칙·API·원격 MCP·로컬) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AI 연결을 회원 개인 설정으로 일원화한다. 각 회원이 ① 규칙 기반 ② API 연결(OpenAI·Claude·Gemini 키) ③ 원격 MCP(Remote/HTTP) ④ 로컬 AI(Ollama·LM Studio) 중 하나를 고르고, AI 기능은 항상 "버튼을 누른 본인"의 설정으로 돈다. 서비스 전역 AI 엔진 설정과 프로젝트 단위 AI 모드 선택은 제거한다.

**Architecture:** 기존 개인 키 체계(UserAiConnection·personal 프로바이더·registry personalConnection)를 4모드로 확장한다. 세 실행 모드(api/mcp/local) 모두 OpenAI 호환 클라이언트(`lib/ai/openai-compatible.ts`)를 재사용하고, 모드별 차이는 프로바이더 팩토리에서 흡수한다. 원격 MCP 는 사용자 입력 URL 이므로 SSRF 가드(https + 공인 호스트만)를 새로 둔다.

**Tech Stack:** 기존과 동일 (Next.js 15, Prisma 6, zod, vitest 4, Stryker)

**Spec:** 이 문서의 "확정 설계" 절. (대화 확정: 전역 설정 제거 / 프로젝트 AI 모드 UI 제거 / 회원 설정 일원화 / MCP = OpenAI 호환 HTTP 엔드포인트로 해석)

## Global Constraints

- 원격 실DB (CLAUDE.md 최우선 제약 그대로): migrate deploy/db push/DB 쓰기 스크립트/dev 서버 기동 금지. validate·generate 만 안전. EPERM 은 BLOCKED 보고.
- git reset/checkout/브랜치 이동/push/reflog 조작 전면 금지. 커밋만 허용.
- 키·URL 자격증명을 로그·응답에 남기지 않는다.
- 들여쓰기 4칸, 한국어 "~다" 주석. 테스트 tests/ 평면, prisma 는 mock.
- Task 완료 기준: tsc 0건 + vitest 전체 통과 + lint 0건 (+ 지정 시 stryker 100%).
- 계획서 체크박스 [x] 갱신·동커밋은 허용 관례 (FILES CHANGED + DEVIATIONS 에 선언).

## 확정 설계 (모든 Task 공통 문맥)

- `UserAiConnection` 확장 (1인 1행 유지):
  - `mode: 'rule' | 'api' | 'mcp' | 'local'` — 기존 행은 'api' 로 백필, 신규 기본 'rule'
  - api 모드: 기존 `vendor`/`apiKey`(암호화)/`model`
  - mcp 모드: `mcpBaseUrl`(https 공인 호스트만)/`mcpModel`, 키는 `apiKey` 컬럼 공용
  - local 모드: `localBaseUrl`(비우면 기본 후보)/`localModel`
  - `vendor`·`apiKey` 는 nullable 로 완화 (rule/local 모드는 키가 없다)
- 실행 규칙: 라우트는 요청자 본인의 연결을 읽어 `mode !== 'rule'` 이면
  `requested: 'personal'` + 연결 전달, 아니면 `'rule'`. Project.aiMode 는 더 이상
  읽지 않는다(컬럼은 남기되 UI·라우트에서 제거).
- 실패는 전부 기존 degrade 폴백(규칙 기반 + degraded 표시). 온라인 배포 서버는
  회원 PC 의 localhost 에 닿지 못하므로 local 모드는 서버측 실패 → 폴백이 정상이다
  (spec 초안의 브라우저 경유 경로는 기존대로 유지).
- 파일 지도:
  - Task A: `prisma/schema.prisma`, `prisma/migrations/20260825120000_member_ai_modes/migration.sql`
  - Task B: `lib/ai/personal-vendors.ts`(모드 상수 추가), `lib/ai/url-guard.ts`(신규),
    `lib/ai/personal.ts`(모드 분기), `lib/ai/personal-store.ts`(확장 필드),
    `tests/ai-member-modes.test.ts`(신규), `stryker.crap.config.json`
  - Task C: `app/api/me/ai-connection/route.ts`, `.../verify/route.ts`,
    `tests/api-me-ai-connection.test.ts`(확장)
  - Task D: `components/member/PersonalAiConnection.tsx`(4모드 선택 UI)
  - Task E: `app/api/projects/[id]/attributes/mentor/route.ts`,
    `app/api/projects/[id]/spec/generate/route.ts`, `app/dashboard/page.tsx`,
    `app/project/[id]/settings/page.tsx`, `app/settings/page.tsx`(전역 절 제거),
    `tests/api-ai-personal-mode.test.ts`(갱신)

---

### Task A: 스키마 확장 + 마이그레이션 SQL

**Files:**
- Modify: `prisma/schema.prisma` (UserAiConnection 모델)
- Create: `prisma/migrations/20260825120000_member_ai_modes/migration.sql`

**Interfaces:**
- Produces: `UserAiConnection { userId PK, mode, vendor?, apiKey?, model?, mcpBaseUrl?, mcpModel?, localBaseUrl?, localModel?, createdAt, updatedAt }`

- [x] **Step 1: 모델 교체** — schema.prisma 의 UserAiConnection 을 다음으로 교체
  (문서 주석 포함, User 관계·@@map 은 그대로):

```prisma
/// 회원의 AI 연결 설정. 본인의 AI 작업에만 쓰이고 절대 공유되지 않는다.
/// mode 가 연결 방식을 정한다: rule(기본)·api(벤더 키)·mcp(원격 HTTP)·local(내 PC).
/// apiKey 는 lib/settings-crypto 로 암호화된 값(enc:v1: 접두)만 저장한다.
model UserAiConnection {
  userId    String   @id
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  // 'rule' | 'api' | 'mcp' | 'local' — lib/ai/personal-vendors.ts 가 정본
  mode      String   @default("rule")
  // api 모드: 'openai' | 'anthropic' | 'gemini'
  vendor    String?
  // api·mcp 모드의 인증 키(암호화). rule·local 은 없다
  apiKey    String?
  // api 모드의 모델. 비우면 벤더 기본
  model     String?
  // mcp 모드: 원격 OpenAI 호환 엔드포인트. https 공인 호스트만 허용된다
  mcpBaseUrl String?
  mcpModel   String?
  // local 모드: 비우면 Ollama·LM Studio 기본 후보 주소를 차례로 두드린다
  localBaseUrl String?
  localModel   String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("user_ai_connections")
}
```

- [x] **Step 2: `npx prisma validate`** → "is valid"

- [x] **Step 3: 마이그레이션 SQL 작성 (적용 금지)** — `prisma/migrations/20260825120000_member_ai_modes/migration.sql`:

```sql
-- 회원 AI 연결을 4모드로 확장한다. 기존 행은 전부 벤더 키 등록분이므로
-- mode='api' 로 백필하고, 새 행의 기본은 'rule' 이다.
ALTER TABLE "user_ai_connections" ALTER COLUMN "vendor" DROP NOT NULL;
ALTER TABLE "user_ai_connections" ALTER COLUMN "apiKey" DROP NOT NULL;

ALTER TABLE "user_ai_connections" ADD COLUMN "mode" TEXT;
UPDATE "user_ai_connections" SET "mode" = 'api';
ALTER TABLE "user_ai_connections" ALTER COLUMN "mode" SET NOT NULL;
ALTER TABLE "user_ai_connections" ALTER COLUMN "mode" SET DEFAULT 'rule';

ALTER TABLE "user_ai_connections" ADD COLUMN "mcpBaseUrl" TEXT;
ALTER TABLE "user_ai_connections" ADD COLUMN "mcpModel" TEXT;
ALTER TABLE "user_ai_connections" ADD COLUMN "localBaseUrl" TEXT;
ALTER TABLE "user_ai_connections" ADD COLUMN "localModel" TEXT;
```

- [x] **Step 4: `npx prisma generate`** (EPERM 이면 BLOCKED 보고) → **Step 5: tsc·vitest 확인**
  — 주의: `lib/ai/personal-store.ts` 가 `PersonalAiConnection['vendor']`(non-null) 를
  받으므로 vendor nullable 화로 tsc 가 깨질 수 있다. 깨지면 이 Task 에서 고치지 말고
  **BLOCKED + QUESTIONS 로 보고**하라(Task B 의 몫이다). 깨지지 않으면 그대로 진행.

- [x] **Step 6: 커밋**

```bash
git add prisma/schema.prisma "prisma/migrations/20260825120000_member_ai_modes/migration.sql"
git commit -m "feat: 회원 AI 연결을 4모드 스키마로 확장한다

규칙·API·원격 MCP·로컬 네 방식을 한 행에 담는다. 기존 행은 전부 벤더
키 등록분이라 mode='api' 로 백필하고 새 행의 기본은 'rule' 이다.
rule·local 은 키가 없으므로 vendor·apiKey 를 nullable 로 완화했다.
마이그레이션은 작성만 하고 적용하지 않았다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task B: 모드 상수·SSRF 가드·프로바이더 분기

**Files:**
- Modify: `lib/ai/personal-vendors.ts` — 끝에 추가:

```ts
// ─── 회원 AI 연결 모드 ─────────────────────────────────────────

export const MEMBER_AI_MODES = ['rule', 'api', 'mcp', 'local'] as const;
export type MemberAiMode = (typeof MEMBER_AI_MODES)[number];

export const MEMBER_AI_MODE_LABELS: Record<MemberAiMode, string> = {
    rule: '규칙 기반',
    api: 'API 연결 (OpenAI · Claude · Gemini)',
    mcp: '원격 MCP (Remote/HTTP)',
    local: '로컬 AI (Ollama · LM Studio)',
};

export const MEMBER_AI_MODE_DESCRIPTIONS: Record<MemberAiMode, string> = {
    rule: '설정 없이 바로 씁니다. 프로젝트 문맥으로 초안을 조립합니다.',
    api: '본인의 벤더 API 키로 호출합니다. 요금은 본인 벤더 계정에 청구됩니다.',
    mcp: '본인이 운영하는 원격 OpenAI 호환 엔드포인트(https)로 호출합니다.',
    local: '내 PC의 로컬 LLM을 씁니다. 온라인 서버에서는 연결되지 않을 수 있으며, 그 경우 규칙 기반으로 자동 전환됩니다.',
};

export function parseMemberAiMode(value: unknown): MemberAiMode | null {
    return MEMBER_AI_MODES.includes(value as MemberAiMode) ? (value as MemberAiMode) : null;
}
```

- Create: `lib/ai/url-guard.ts`:

```ts
// 사용자 입력 원격 엔드포인트의 SSRF 가드.
//
// 원격 MCP 모드는 회원이 임의 URL 을 넣는다. 서버가 그 주소를 대신 두드리므로,
// 내부망·메타데이터 주소를 넣어 서버를 프록시로 쓰는 SSRF 를 막아야 한다.
// 규칙: https 만, 호스트는 공인 호스트명만(로컬·사설 IP·IP 리터럴 금지).

const PRIVATE_HOST_PATTERNS = [
    /^localhost$/i, /^127\./, /^0\.0\.0\.0$/, /^::1$/, /^\[::1\]$/,
    /^10\./, /^192\.168\./, /^169\.254\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
];

export class RemoteUrlError extends Error {}

/** 통과하면 정규화된 origin+path(끝 슬래시 제거)를 돌려준다. 실패는 RemoteUrlError. */
export function assertPublicHttpsUrl(raw: string): string {
    let url: URL;
    try {
        url = new URL(raw.trim());
    } catch {
        throw new RemoteUrlError('올바른 URL 형식이 아닙니다.');
    }
    if (url.protocol !== 'https:') {
        throw new RemoteUrlError('원격 엔드포인트는 https 만 허용됩니다.');
    }
    if (url.username || url.password) {
        throw new RemoteUrlError('URL 에 인증 정보를 넣을 수 없습니다. 키 칸을 쓰세요.');
    }
    const host = url.hostname;
    // IP 리터럴은 사설 대역 검사망을 피해 갈 수 있어 통째로 막는다. 도메인만 허용.
    if (/^[\d.]+$/.test(host) || host.includes(':')) {
        throw new RemoteUrlError('IP 주소가 아닌 도메인 주소를 입력하세요.');
    }
    if (PRIVATE_HOST_PATTERNS.some((p) => p.test(host))) {
        throw new RemoteUrlError('내부망 주소는 사용할 수 없습니다.');
    }
    return `${url.origin}${url.pathname}`.replace(/\/+$/, '');
}
```

- Modify: `lib/ai/personal.ts` — `PersonalAiConnection` 을 4모드로 확장하고 팩토리 분기:

```ts
import { buildCandidateBaseUrls, LOCAL_BASE_URL_DEFAULTS } from './endpoint-discovery';
import { assertPublicHttpsUrl } from './url-guard';
import { ruleProvider } from './provider-rule';
import type { MemberAiMode, PersonalAiVendor } from './personal-vendors';

export interface PersonalAiConnection {
    mode: MemberAiMode;
    vendor: PersonalAiVendor | null;
    apiKey: string | null;
    model: string | null;
    mcpBaseUrl: string | null;
    mcpModel: string | null;
    localBaseUrl: string | null;
    localModel: string | null;
}

export function createPersonalProvider(conn: PersonalAiConnection): AiProvider {
    switch (conn.mode) {
        case 'api': {
            if (!conn.vendor || !conn.apiKey) {
                throw new AiProviderError('API 연결에 필요한 벤더와 키가 없습니다. 설정을 확인하세요.');
            }
            const preset = PERSONAL_AI_VENDOR_PRESETS[conn.vendor];
            return createOpenAiCompatibleProvider({
                id: 'personal', label: '내 AI',
                baseUrls: [preset.baseUrl],
                model: resolvePersonalModel(conn.vendor, conn.model),
                apiKey: conn.apiKey, allowRemoteHost: true, directEndpoint: true,
            });
        }
        case 'mcp': {
            if (!conn.mcpBaseUrl) {
                throw new AiProviderError('원격 MCP 주소가 없습니다. 설정을 확인하세요.');
            }
            // 저장 시에도 검사하지만, 저장 후 규칙이 바뀌었을 수 있어 실행 직전에 다시 검사한다.
            const baseUrl = assertPublicHttpsUrl(conn.mcpBaseUrl);
            return createOpenAiCompatibleProvider({
                id: 'personal', label: '내 AI',
                baseUrls: [baseUrl],
                model: conn.mcpModel ?? undefined,
                apiKey: conn.apiKey ?? undefined,
                allowRemoteHost: true,
                // 모델을 지정했으면 탐색 생략, 아니면 /models 탐색에 맡긴다.
                directEndpoint: Boolean(conn.mcpModel),
            });
        }
        case 'local':
            return createOpenAiCompatibleProvider({
                id: 'personal', label: '내 AI',
                baseUrls: buildCandidateBaseUrls(conn.localBaseUrl ?? undefined, LOCAL_BASE_URL_DEFAULTS),
                model: conn.localModel ?? undefined,
                apiKey: 'local',
                allowRemoteHost: false, // localhost 만 — 기존 로컬 엔진과 같은 경계다
            });
        case 'rule':
        default:
            return ruleProvider;
    }
}
```

`verifyPersonalConnection(conn)` 도 모드 분기: rule → `{ ok: true, message: '규칙 기반은 별도 연결이 필요 없습니다.' }`; api → 기존 ping; mcp → `assertPublicHttpsUrl` 후 같은 ping(모델은 `conn.mcpModel ?? 'default'` 대신, 모델 미지정이면 `${base}/models` GET 으로 대체); local → 서버에서 `createPersonalProvider(conn).isAvailable()` 로 확인하고 실패 시 `'서버에서 로컬 엔진에 연결하지 못했습니다. 온라인 환경에서는 정상이며, 규칙 기반으로 자동 전환됩니다.'`.

- Modify: `lib/ai/personal-store.ts` — select·upsert 를 새 컬럼까지 확장. `loadPersonalConnection` 은 mode 를 `parseMemberAiMode` 로 좁히고(모르는 값 → null 반환), api 모드인데 키 복호화 실패면 기존처럼 null. rule 모드는 apiKey 없어도 유효.
- Test: `tests/ai-member-modes.test.ts` — 최소 케이스: ① url-guard 표(https 아님/사설 IP 4종/IP 리터럴/인증정보 포함/정상 도메인) ② createPersonalProvider 모드 4종이 각각 올바른 대상(rule→ruleProvider id 'rule', api→벤더 주소, mcp→입력 주소, local→localhost 후보)을 쓰는지(fetch mock) ③ mcp 사설 주소는 생성 시점에 던지는지 ④ parseMemberAiMode 표.
- `stryker.crap.config.json` mutate 에 `"lib/ai/url-guard.ts",` 추가, 100% 요구.
- 기존 테스트 갱신: `tests/ai-personal-provider.test.ts` 의 연결 객체에 `mode: 'api'` 와 null 필드들을 채워 통과시켜라(단언 약화 금지).

- [ ] RED → GREEN → stryker(url-guard 100%) → 전체 게이트 → 커밋:
  `feat: 회원 AI 연결을 4모드 프로바이더로 확장한다` (본문에 SSRF 가드 이유 포함)

---

### Task C: 연결 API 4모드 확장

**Files:** `app/api/me/ai-connection/route.ts`, `verify/route.ts`, `tests/api-me-ai-connection.test.ts`

- PUT 스키마: `{ mode, vendor?, apiKey?, model?, mcpBaseUrl?, mcpModel?, localBaseUrl?, localModel? }`.
  검증 규칙(전부 테스트로 잠근다):
  - `parseMemberAiMode(mode)` 실패 → 400
  - mode='api': 신규 또는 벤더 변경 시 apiKey 필수(기존 규칙 유지), vendor 필수
  - mode='mcp': `assertPublicHttpsUrl(mcpBaseUrl)` 통과 필수(RemoteUrlError 메시지를 400 으로), apiKey 는 선택(있으면 암호화)
  - mode='local': localBaseUrl 은 선택, 입력 시 http(s) localhost 계열만(`assertAllowedBaseUrl(url, false)` 재사용) — 아니면 400
  - mode='rule': 부가 필드 전부 무시하고 mode 만 저장
  - 모드를 바꿔도 다른 모드의 저장값은 지우지 않는다(돌아왔을 때 재입력 방지)
- GET 요약: `{ mode, vendor, model, mcpBaseUrl, mcpModel, localBaseUrl, localModel, updatedAt }` — apiKey 는 여전히 어떤 형태로도 제외.
- verify: 저장된 연결로 `verifyPersonalConnection`. 연결 행이 없으면 rule 취급으로 ok 응답.
- 보안 불변식 4종(암호화 저장·응답 무키·로그 무키·세션 userId만)은 기존 테스트 유지 + mcp 키에도 동일 적용 케이스 추가.

- [ ] RED → GREEN → 전체 게이트 → 커밋: `feat: AI 연결 API 를 4모드로 확장한다`

---

### Task D: 설정 카드 4모드 UI

**Files:** `components/member/PersonalAiConnection.tsx`

- 카드 상단에 모드 라디오 4개(`MEMBER_AI_MODES` 순회, `MEMBER_AI_MODE_LABELS`/`_DESCRIPTIONS`).
  기존 전역 엔진 선택 UI(제거 예정)의 라디오 마크업 패턴을 참고하되 이 카드 스타일을 따른다.
- 모드별 조건부 필드:
  - rule: 입력 없음(설명만)
  - api: 기존 벤더/모델/키 3필드 그대로
  - mcp: `mcpBaseUrl`(placeholder `https://my-llm.example.com/v1`), `mcpModel`(선택),
    `apiKey`(선택, password) — 안내문: "https 공인 주소만 허용됩니다."
  - local: `localBaseUrl`(placeholder `http://localhost:11434/v1`, 비우면 자동 탐색), `localModel`(선택)
    — 안내문: "온라인 접속 시에는 서버가 내 PC 에 닿지 못해 규칙 기반으로 자동 전환될 수 있습니다."
- 저장 payload 는 현재 모드의 필드만 싣는다. [연결 확인]은 rule 이 아니면 항상 노출.
- 저장 버튼 활성 조건: rule → 항상 / api → 기존 규칙 / mcp → mcpBaseUrl 입력 시 / local → 항상.
- GET 응답으로 폼 초기값 복원(mode 포함). 키 입력칸 비우기·password 타입·busy 탈출 계약은 그대로.

- [ ] tsc·vitest·lint → 커밋: `feat: AI 연결 카드에 4모드 선택을 붙인다`

---

### Task E: 라우트 일원화 + 전역·프로젝트 선택 제거

**Files:** mentor/route.ts, spec/generate/route.ts, dashboard/page.tsx, project/[id]/settings/page.tsx, settings/page.tsx, tests/api-ai-personal-mode.test.ts

- 두 AI 라우트: `project.aiMode` 를 더 이상 읽지 않는다(선택에서 aiMode 제거).
  공통 패턴:

```ts
const personalConnection = await loadPersonalConnection(accessResult.user.userId);
const requested = personalConnection && personalConnection.mode !== 'rule'
    ? 'personal' as const : 'rule' as const;
```

  spec 라우트의 브라우저 경유(relay) 분기는 `aiMode === 'local'` 대신
  `personalConnection?.mode === 'local'` 로 바꿔 유지한다. `serverLocalDisabled` 도 유지.
- `app/dashboard/page.tsx` 새 프로젝트 모달과 `app/project/[id]/settings/page.tsx` 에서
  AI 모드 선택 블록을 제거한다(POST 본문의 aiMode 도 보내지 않는다 — 서버 기본값 'rule'
  이 들어가되 어차피 읽지 않는다). `PROJECT_AI_MODES` 임포트가 안 쓰이게 되면 제거.
- `app/settings/page.tsx`: 전역 AI 엔진 절(상태 목록·엔진 선택 폼·안내 카드)과
  `AI_PROVIDER_GUIDE`·`aiForm`·`handleSaveAi` 를 제거. AI 탭 = `PersonalAiConnection` 만.
  사이드바 AI 탭 버튼·초록 점 조건은 유지하되 `currentSettings?.ai` 의존을 없앤다.
- `tests/api-ai-personal-mode.test.ts` 를 새 규칙으로 다시 잠근다: ① 연결 없음 → 'rule'
  ② mode:'rule' → 'rule' ③ mode:'api' 연결 → 'personal' + 연결 전달 ④ 본문 userId 무시
  ⑤ mode:'local' 이면 spec 라우트가 relay 를 제안하는지.
- lib/ai/project-ai-mode.ts 와 registry·getProviderStatuses 등 서버 잔여물은 이번에
  지우지 않는다(죽은 코드 정리는 후속) — 단 라우트·UI 참조는 위대로 끊는다.

- [ ] RED(라우트 테스트 갱신 먼저) → GREEN → 전체 게이트 → 커밋:
  `feat: AI 실행을 회원 연결 설정으로 일원화한다` (본문에 전역·프로젝트 선택 제거 이유)

---

## 감리 체크리스트 (Task 승인 게이트)

1. 보안: 평문 키 4경로(저장·응답·로그·화면) + **mcp URL 의 SSRF 가드가 저장·실행 양쪽에** 있는가
2. 키 공유 차단: 연결 조회 인자가 세션 userId 뿐인가
3. 폴백 보존: 모드별 실패가 전부 degraded+rule 로 끝나는 테스트가 있는가
4. 원격 DB·dev 서버 무접촉, reflog/과거 커밋 미사용
5. 수치: tsc 0 · vitest 전체 · lint 0 · (B) url-guard 뮤테이션 100%

## 계획 밖 (사람이 하는 일)

- Task A 승인 후 `npx prisma migrate deploy` (운영자)
- 전체 완료 후 실검증: 각 모드로 저장→[연결 확인]→WS-3 실동작. local 모드는
  로컬 접속과 온라인 접속에서 각각 확인(온라인은 폴백 표시가 정상).
