# 개인 AI 키 연결 (OpenAI · Claude · Gemini) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 모든 회원(멘티·멘토·매니저)이 각자 자기 OpenAI/Claude/Gemini API 키를 등록하고, 프로젝트 AI 모드에서 「내 AI (개인 키)」를 골라 본인 키로 AI 기능을 쓸 수 있게 한다.

**Architecture:** 세 벤더 모두 OpenAI 호환 엔드포인트를 제공하므로 기존 클라이언트(`lib/ai/openai-compatible.ts`)를 재사용한다. 키는 사용자별 테이블(`UserAiConnection`)에 AES-256-GCM 암호화(`lib/settings-crypto`)로 저장한다. `runAiTask` 에 `personalConnection` 옵션을 추가해 요청한 사용자의 키로 프로바이더를 만들고, 실패하면 기존 폴백 장치가 규칙 기반으로 자동 전환한다. 키는 언제나 "AI 버튼을 누른 본인"의 것만 쓰인다 — 공유 없음.

**Tech Stack:** Next.js 15 App Router, Prisma 6, zod, vitest 4 (Prisma 전부 mock), Stryker

**Spec:** 이 문서의 "설계 요약" 절이 스펙을 겸한다 (별도 스펙 문서 없음 — 대화에서 확정된 요구: ① 전 역할 허용 ② 키 공유 금지 ③ 벤더 3종 프리셋 고정 ④ 실패 시 규칙 기반 폴백 ⑤ 키는 암호화 저장·재표시 금지)

## Global Constraints

- **원격 DB 절대 금지**: `.env` 의 `POSTGRES_PRISMA_URL` 은 실데이터가 있는 원격 Supabase 다. `prisma migrate deploy`/`db push`/`studio`, DB 에 쓰는 스크립트 실행 전부 금지. `npx prisma validate`/`npx prisma generate` 는 안전.
- `npx prisma generate` 가 `EPERM ... query_engine-windows.dll.node` 로 실패하면 dev 서버가 DLL 을 잠근 것이다. 직접 죽이지 말고 **작업을 멈추고 보고하라** (수퍼바이저가 서버를 내린다).
- **키·비밀번호·이메일을 로그에 남기지 않는다** (`lib/logger.ts` 규칙). API 키는 응답 본문에도 절대 담지 않는다.
- 들여쓰기 4칸, 주석은 기존 파일과 같은 한국어 문체("~다" 체, 이유 중심).
- 테스트는 `tests/` 평면 배치, Prisma 는 `vi.mock('../lib/prisma', ...)` 로 전부 mock (기존 파일 패턴 참조).
- 커밋 메시지는 한국어, 본문에 "왜"를 적는다. 끝에 `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- 각 Task 완료 기준: `npx tsc --noEmit` 통과 + `npx vitest run` 전체 통과 + (해당 시) `npx next lint` 통과.

## 설계 요약 (모든 Task 의 공통 문맥)

- 벤더 프리셋 (주소는 자유 입력 불가 — SSRF 차단):
  - openai → `https://api.openai.com/v1`, 기본 모델 `gpt-4o-mini`
  - anthropic → `https://api.anthropic.com/v1`, 기본 모델 `claude-haiku-4-5`
  - gemini → `https://generativelanguage.googleapis.com/v1beta/openai`, 기본 모델 `gemini-2.0-flash`
- 저장: `UserAiConnection` 1인 1행 (`userId` PK). `apiKey` 는 `encryptSettingsValue()` 결과(`enc:v1:` 접두).
- 실행 흐름: 프로젝트 `aiMode === 'personal'` → 라우트가 **요청자 본인**의 연결을 `loadPersonalConnection(userId)` 로 읽어 `runAiTask(..., { requested: 'personal', personalConnection })` 에 넘김 → 키 없음/호출 실패 시 기존 degrade 경로로 규칙 기반 폴백.
- 파일 지도:
  - Task 1: `prisma/schema.prisma`, `prisma/migrations/20260825000000_add_user_ai_connection/migration.sql`
  - Task 2: `lib/ai/personal-vendors.ts`(신규·순수), `tests/ai-personal-vendors.test.ts`, `stryker.crap.config.json`
  - Task 3: `lib/ai/openai-compatible.ts`(directEndpoint), `lib/ai/types.ts`('personal'), `lib/ai/engine-label.ts`, `lib/ai/providers.ts`, `lib/ai/personal.ts`(신규), `lib/ai/registry.ts`, `tests/ai-personal-provider.test.ts`
  - Task 4: `lib/ai/personal-store.ts`(신규), `app/api/me/ai-connection/route.ts`(신규), `app/api/me/ai-connection/verify/route.ts`(신규), `tests/api-me-ai-connection.test.ts`
  - Task 5: `app/profile/page.tsx`
  - Task 6: `lib/ai/project-ai-mode.ts`, `app/api/projects/[id]/attributes/mentor/route.ts`, `app/api/projects/[id]/spec/generate/route.ts`, `tests/api-ai-personal-mode.test.ts`

---

### Task 1: UserAiConnection 스키마 + 마이그레이션 SQL

**Files:**
- Modify: `prisma/schema.prisma` (User 모델과 파일 끝)
- Create: `prisma/migrations/20260825000000_add_user_ai_connection/migration.sql`

**Interfaces:**
- Produces: Prisma 모델 `UserAiConnection { userId(PK), vendor, apiKey, model?, createdAt, updatedAt }`, `User.aiConnection: UserAiConnection?` — Task 4 의 store 가 `prisma.userAiConnection` 으로 접근한다.

- [ ] **Step 1: schema.prisma 에 모델 추가**

`model User` 블록의 `profile MemberProfile?` 줄 아래에 관계 필드를 추가:

```prisma
  aiConnection        UserAiConnection?
```

파일 끝(마지막 모델 뒤)에 새 모델 추가:

```prisma
/// 회원이 등록한 개인 AI 키. 본인의 AI 작업에만 쓰이고 절대 공유되지 않는다.
/// apiKey 는 lib/settings-crypto 로 암호화된 값(enc:v1: 접두)만 저장한다.
model UserAiConnection {
  userId    String   @id
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  // 'openai' | 'anthropic' | 'gemini' — lib/ai/personal-vendors.ts 가 정본
  vendor    String
  apiKey    String
  // 비우면 벤더 기본 모델을 쓴다
  model     String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("user_ai_connections")
}
```

- [ ] **Step 2: 검증**

Run: `npx prisma validate`  → "The schema ... is valid"

- [ ] **Step 3: 마이그레이션 SQL 작성 (적용 금지)**

`prisma/migrations/20260825000000_add_user_ai_connection/migration.sql`:

```sql
-- 회원 개인 AI 키 보관함. 새 테이블만 추가하므로 기존 행에 영향이 없다.
CREATE TABLE "user_ai_connections" (
    "userId" TEXT NOT NULL,
    "vendor" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_ai_connections_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "user_ai_connections" ADD CONSTRAINT "user_ai_connections_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 4: 클라이언트 재생성**

Run: `npx prisma generate`
Expected: "Generated Prisma Client". `EPERM ... dll.node` 가 나오면 **중단하고 보고** (Global Constraints 참조).

- [ ] **Step 5: 타입 확인 후 커밋**

Run: `npx tsc --noEmit` → 출력 없음

```bash
git add prisma/schema.prisma "prisma/migrations/20260825000000_add_user_ai_connection/migration.sql"
git commit -m "feat: 개인 AI 키 테이블을 추가한다

회원마다 자기 OpenAI/Claude/Gemini 키를 하나 등록할 수 있는 보관함.
키는 lib/settings-crypto 로 암호화해 넣는다(후속 작업). 새 테이블만
추가하므로 기존 데이터에 영향이 없고, 마이그레이션은 작성만 하고
적용하지 않았다 — 운영자가 npx prisma migrate deploy 를 직접 실행한다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: 벤더 프리셋 순수 모듈

**Files:**
- Create: `lib/ai/personal-vendors.ts`
- Test: `tests/ai-personal-vendors.test.ts`
- Modify: `stryker.crap.config.json` (mutate 배열)

**Interfaces:**
- Produces (뒤 Task 들이 그대로 임포트):
  - `PERSONAL_AI_VENDORS: readonly ['openai','anthropic','gemini']`, `type PersonalAiVendor`
  - `PERSONAL_AI_VENDOR_LABELS: Record<PersonalAiVendor, string>`
  - `PERSONAL_AI_VENDOR_PRESETS: Record<PersonalAiVendor, { baseUrl: string; defaultModel: string }>`
  - `parsePersonalAiVendor(value: unknown): PersonalAiVendor | null`
  - `resolvePersonalModel(vendor: PersonalAiVendor, model: string | null | undefined): string`

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/ai-personal-vendors.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import {
    PERSONAL_AI_VENDORS, PERSONAL_AI_VENDOR_LABELS, PERSONAL_AI_VENDOR_PRESETS,
    parsePersonalAiVendor, resolvePersonalModel,
} from '../lib/ai/personal-vendors';

describe('벤더 목록', () => {
    it('세 벤더만 허용한다', () => {
        expect(PERSONAL_AI_VENDORS).toEqual(['openai', 'anthropic', 'gemini']);
    });

    it('벤더마다 라벨·주소·기본 모델이 있다', () => {
        for (const vendor of PERSONAL_AI_VENDORS) {
            expect(PERSONAL_AI_VENDOR_LABELS[vendor]).toBeTruthy();
            expect(PERSONAL_AI_VENDOR_PRESETS[vendor].baseUrl).toMatch(/^https:\/\//);
            expect(PERSONAL_AI_VENDOR_PRESETS[vendor].defaultModel).toBeTruthy();
        }
    });

    it('주소는 https 고정 프리셋이다(자유 입력 불가 — SSRF 차단)', () => {
        expect(PERSONAL_AI_VENDOR_PRESETS.openai.baseUrl).toBe('https://api.openai.com/v1');
        expect(PERSONAL_AI_VENDOR_PRESETS.anthropic.baseUrl).toBe('https://api.anthropic.com/v1');
        expect(PERSONAL_AI_VENDOR_PRESETS.gemini.baseUrl).toBe('https://generativelanguage.googleapis.com/v1beta/openai');
    });
});

describe('parsePersonalAiVendor', () => {
    it('알려진 벤더만 통과시킨다', () => {
        expect(parsePersonalAiVendor('openai')).toBe('openai');
        expect(parsePersonalAiVendor('anthropic')).toBe('anthropic');
        expect(parsePersonalAiVendor('gemini')).toBe('gemini');
    });

    it('모르는 값은 null 이다', () => {
        expect(parsePersonalAiVendor('azure')).toBeNull();
        expect(parsePersonalAiVendor('')).toBeNull();
        expect(parsePersonalAiVendor(null)).toBeNull();
        expect(parsePersonalAiVendor(undefined)).toBeNull();
        expect(parsePersonalAiVendor(1)).toBeNull();
    });
});

describe('resolvePersonalModel', () => {
    it('지정한 모델을 다듬어 쓴다', () => {
        expect(resolvePersonalModel('openai', ' gpt-4o ')).toBe('gpt-4o');
    });

    it('비어 있으면 벤더 기본 모델이다', () => {
        expect(resolvePersonalModel('openai', '')).toBe('gpt-4o-mini');
        expect(resolvePersonalModel('anthropic', '   ')).toBe('claude-haiku-4-5');
        expect(resolvePersonalModel('gemini', null)).toBe('gemini-2.0-flash');
        expect(resolvePersonalModel('gemini', undefined)).toBe('gemini-2.0-flash');
    });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run tests/ai-personal-vendors.test.ts` → FAIL (모듈 없음)

- [ ] **Step 3: 구현** — `lib/ai/personal-vendors.ts`

```ts
// 개인 AI 키가 붙을 수 있는 벤더 프리셋.
//
// 세 벤더 모두 OpenAI 호환 엔드포인트를 공식 제공하므로 기존 클라이언트
// (openai-compatible.ts)를 그대로 쓴다. 주소를 자유 입력으로 열지 않고 여기
// 프리셋으로 고정하는 이유: 사용자가 내부망 주소를 넣어 서버가 대신 두드리게
// 만드는 SSRF 를 원천 차단하기 위해서다.
export const PERSONAL_AI_VENDORS = ['openai', 'anthropic', 'gemini'] as const;
export type PersonalAiVendor = (typeof PERSONAL_AI_VENDORS)[number];

export const PERSONAL_AI_VENDOR_LABELS: Record<PersonalAiVendor, string> = {
    openai: 'OpenAI (ChatGPT)',
    anthropic: 'Claude (Anthropic)',
    gemini: 'Gemini (Google)',
};

// 기본 모델은 각 벤더의 저가 라인으로 둔다. 개인 키라 요금이 본인에게
// 청구되므로, 기본값이 비싼 모델이면 안 된다. 화면에서 바꿀 수 있다.
export const PERSONAL_AI_VENDOR_PRESETS: Record<PersonalAiVendor, { baseUrl: string; defaultModel: string }> = {
    openai: { baseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o-mini' },
    anthropic: { baseUrl: 'https://api.anthropic.com/v1', defaultModel: 'claude-haiku-4-5' },
    gemini: { baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', defaultModel: 'gemini-2.0-flash' },
};

export function parsePersonalAiVendor(value: unknown): PersonalAiVendor | null {
    return PERSONAL_AI_VENDORS.includes(value as PersonalAiVendor)
        ? (value as PersonalAiVendor)
        : null;
}

/** 쓸 모델을 정한다. 지정이 없거나 공백뿐이면 벤더 기본 모델이다. */
export function resolvePersonalModel(vendor: PersonalAiVendor, model: string | null | undefined): string {
    const trimmed = model?.trim();
    return trimmed || PERSONAL_AI_VENDOR_PRESETS[vendor].defaultModel;
}
```

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run tests/ai-personal-vendors.test.ts` → PASS

- [ ] **Step 5: stryker 대상 추가** — `stryker.crap.config.json` 의 `"mutate"` 배열에서 `"lib/member-profile-payload.ts",` 줄 아래에 `"lib/ai/personal-vendors.ts",` 추가. Run: `npx stryker run stryker.crap.config.json --mutate lib/ai/personal-vendors.ts` → 점수 100% 확인 (미달이면 생존 뮤턴트를 죽이는 테스트를 보강).

- [ ] **Step 6: 커밋**

```bash
git add lib/ai/personal-vendors.ts tests/ai-personal-vendors.test.ts stryker.crap.config.json
git commit -m "feat: 개인 AI 벤더 프리셋을 추가한다

OpenAI·Claude·Gemini 세 벤더의 OpenAI 호환 엔드포인트 주소와 기본
모델을 고정 프리셋으로 둔다. 주소를 자유 입력으로 열지 않는 것은 SSRF
차단 때문이고, 기본 모델을 저가 라인으로 두는 것은 요금이 개인에게
청구되기 때문이다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: personal 프로바이더와 폴백 배선

**Files:**
- Modify: `lib/ai/openai-compatible.ts` (config 에 `directEndpoint` 추가)
- Modify: `lib/ai/types.ts` (`AI_PROVIDER_IDS` 에 `'personal'`)
- Modify: `lib/ai/engine-label.ts` (`personal: '내 AI'`)
- Modify: `lib/ai/providers.ts` (case 'personal' 방어)
- Create: `lib/ai/personal.ts`
- Modify: `lib/ai/registry.ts` (`RunAiTaskOptions.personalConnection`)
- Test: `tests/ai-personal-provider.test.ts`

**Interfaces:**
- Consumes: Task 2 의 `PersonalAiVendor`, `PERSONAL_AI_VENDOR_PRESETS`, `resolvePersonalModel`
- Produces:
  - `interface PersonalAiConnection { vendor: PersonalAiVendor; apiKey: string; model: string | null }` (lib/ai/personal.ts)
  - `createPersonalProvider(conn: PersonalAiConnection): AiProvider`
  - `verifyPersonalConnection(conn: PersonalAiConnection): Promise<{ ok: boolean; message: string }>`
  - `RunAiTaskOptions.personalConnection?: PersonalAiConnection | null` — Task 6 라우트가 넘긴다

- [x] **Step 1: openai-compatible.ts 에 directEndpoint 추가**

`OpenAiCompatibleConfig` 에 필드 추가 (`allowRemoteHost` 아래):

```ts
    // true 면 /models 탐색 없이 첫 baseUrl + 지정한 model 을 그대로 쓴다.
    // 개인 키 벤더는 주소·모델이 프리셋으로 확정돼 있고, Anthropic 호환
    // 레이어는 /models 조회를 지원하지 않을 수 있어 탐색이 오히려 방해다.
    directEndpoint?: boolean;
```

`resolveEndpoint()` 함수 맨 앞(`if (resolved) return resolved;` 바로 아래)에 분기 추가:

```ts
        if (config.directEndpoint && config.model && config.baseUrls[0]) {
            assertAllowedBaseUrl(config.baseUrls[0], config.allowRemoteHost);
            resolved = { baseUrl: config.baseUrls[0], model: config.model };
            return resolved;
        }
```

- [x] **Step 2: types / engine-label / providers 수정**

`lib/ai/types.ts`: `AI_PROVIDER_IDS` 를 `['rule', 'local', 'hermes', 'api', 'personal'] as const` 로.

`lib/ai/engine-label.ts`: `ENGINE_LABELS` 에 `personal: '내 AI',` 추가 (Record 타입이 강제하므로 누락 시 컴파일 오류).

`lib/ai/providers.ts`: switch 에 case 추가 (`case 'rule':` 위):

```ts
        case 'personal':
            // 개인 프로바이더는 사용자별 키가 필요해 전역 설정으로는 만들 수 없다.
            // registry 가 personalConnection 으로 직접 만들므로 여기 오면 배선 버그다.
            throw new Error('personal 프로바이더는 registry 의 personalConnection 으로만 생성됩니다.');
```

- [x] **Step 3: lib/ai/personal.ts 작성**

```ts
// 개인 키 프로바이더. DB 를 모른다 — 복호화된 연결 정보를 받아 프로바이더만 만든다.
// (DB 접근은 lib/ai/personal-store.ts 가 맡아, 이 파일은 fetch mock 만으로 테스트된다.)
import { createOpenAiCompatibleProvider } from './openai-compatible';
import { PERSONAL_AI_VENDOR_PRESETS, resolvePersonalModel, type PersonalAiVendor } from './personal-vendors';
import type { AiProvider } from './types';

export interface PersonalAiConnection {
    vendor: PersonalAiVendor;
    apiKey: string;
    model: string | null;
}

export function createPersonalProvider(conn: PersonalAiConnection): AiProvider {
    const preset = PERSONAL_AI_VENDOR_PRESETS[conn.vendor];
    return createOpenAiCompatibleProvider({
        id: 'personal',
        label: '내 AI',
        baseUrls: [preset.baseUrl],
        model: resolvePersonalModel(conn.vendor, conn.model),
        apiKey: conn.apiKey,
        allowRemoteHost: true,
        directEndpoint: true,
    });
}

const VERIFY_TIMEOUT_MS = 10_000;

/**
 * 키가 실제로 통하는지 최소 비용으로 확인한다(짧은 chat 요청 1회).
 * 응답 본문은 버린다 — 필요한 것은 인증이 통과했는가 뿐이다.
 */
export async function verifyPersonalConnection(
    conn: PersonalAiConnection
): Promise<{ ok: boolean; message: string }> {
    const preset = PERSONAL_AI_VENDOR_PRESETS[conn.vendor];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);

    try {
        const response = await fetch(`${preset.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${conn.apiKey}`,
            },
            body: JSON.stringify({
                model: resolvePersonalModel(conn.vendor, conn.model),
                max_tokens: 8,
                messages: [{ role: 'user', content: 'ping' }],
            }),
            signal: controller.signal,
        });

        if (response.ok) return { ok: true, message: '연결에 성공했습니다.' };
        if (response.status === 401 || response.status === 403) {
            return { ok: false, message: 'API 키가 유효하지 않습니다. 키를 다시 확인하세요.' };
        }
        if (response.status === 404) {
            return { ok: false, message: '모델을 찾을 수 없습니다. 모델 이름을 확인하세요.' };
        }
        if (response.status === 429) {
            return { ok: false, message: '요청 한도를 초과했습니다. 벤더 계정의 한도를 확인하세요.' };
        }
        return { ok: false, message: `벤더 응답 오류 (HTTP ${response.status})` };
    } catch {
        return { ok: false, message: '벤더에 연결하지 못했습니다. 네트워크를 확인하세요.' };
    } finally {
        clearTimeout(timer);
    }
}
```

- [x] **Step 4: registry.ts 배선**

임포트 추가: `import { AiProviderError } from './openai-compatible';` / `import { createPersonalProvider, type PersonalAiConnection } from './personal';`

`RunAiTaskOptions` 에 필드 추가:

```ts
    // requested 가 'personal' 일 때 쓸, 요청한 사용자 본인의 복호화된 연결.
    // 라우트가 세션의 userId 로 읽어 넘긴다 — 다른 사용자의 키가 올 수 없는 구조다.
    personalConnection?: PersonalAiConnection | null;
```

`runAiTask` 안의 `const resolve = ...` 줄을 다음으로 교체:

```ts
    const resolve = options.resolveProvider ?? ((id: AiProviderId) => {
        if (id === 'personal') {
            if (!options.personalConnection) {
                // resolve 는 try 안에서 불리므로 이 throw 는 기존 degrade 경로를 탄다.
                throw new AiProviderError('등록된 개인 AI 키가 없습니다. 사용자 정보에서 키를 등록하세요.');
            }
            return createPersonalProvider(options.personalConnection);
        }
        return createProvider(id, settings);
    });
```

주의: `requested === 'rule'` 조기 반환 분기의 `resolve('rule')` 는 그대로 동작한다.

- [x] **Step 5: 실패하는 테스트 작성** — `tests/ai-personal-provider.test.ts`

기존 `tests/ai-provider-registry.test.ts` 의 mock 패턴(어떤 모듈을 어떻게 mock 하는지)을 먼저 읽고 그대로 따른다. 핵심 케이스:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
// (registry 테스트 파일과 동일한 방식으로 lib/prisma 또는 service-settings 를 mock)
import { runAiTask } from '../lib/ai/registry';
import { createPersonalProvider, verifyPersonalConnection } from '../lib/ai/personal';

afterEach(() => vi.unstubAllGlobals());

describe('runAiTask personal', () => {
    it('연결이 없으면 규칙 기반으로 폴백하고 이유를 알린다', async () => {
        const outcome = await runAiTask(async (p) => p.id, { requested: 'personal', personalConnection: null });
        expect(outcome.provider).toBe('rule');
        expect(outcome.degraded).toBe(true);
        expect(outcome.degradedReason).toContain('개인 AI 키');
    });

    it('연결이 있으면 personal 프로바이더로 실행한다', async () => {
        // directEndpoint 라 /models 탐색 없이 chat/completions 만 부른다.
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
            choices: [{ message: { content: JSON.stringify({ questions: [{ id: 'q1', field: 'customerNeed', question: '?' }], focus: '' }) } }],
        }), { status: 200 })));

        const outcome = await runAiTask(
            (p) => p.mentorQuestions({ project: { name: 'T' } }),
            { requested: 'personal', personalConnection: { vendor: 'openai', apiKey: 'sk-test', model: null } }
        );
        expect(outcome.provider).toBe('personal');
        expect(outcome.degraded).toBe(false);
    });

    it('호출이 실패하면 규칙 기반으로 폴백한다', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));
        const outcome = await runAiTask(
            (p) => p.mentorQuestions({ project: { name: 'T' } }),
            { requested: 'personal', personalConnection: { vendor: 'openai', apiKey: 'sk-test', model: null } }
        );
        expect(outcome.provider).toBe('rule');
        expect(outcome.degraded).toBe(true);
    });
});

describe('createPersonalProvider', () => {
    it('벤더 프리셋 주소와 Bearer 키로 호출한다', async () => {
        const calls: Array<{ url: string; init: RequestInit }> = [];
        vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
            calls.push({ url, init });
            return new Response(JSON.stringify({
                choices: [{ message: { content: JSON.stringify({ questions: [{ id: 'q1', field: 'customerNeed', question: '?' }], focus: '' }) } }],
            }), { status: 200 });
        }));

        await createPersonalProvider({ vendor: 'gemini', apiKey: 'g-key', model: null })
            .mentorQuestions({ project: { name: 'T' } });

        expect(calls[0].url).toBe('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
        expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer g-key');
        const body = JSON.parse(String(calls[0].init.body));
        expect(body.model).toBe('gemini-2.0-flash');
    });
});

describe('verifyPersonalConnection', () => {
    it('200 이면 성공이다', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
        expect((await verifyPersonalConnection({ vendor: 'openai', apiKey: 'k', model: null })).ok).toBe(true);
    });

    it('401 은 키 오류 메시지를 준다', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })));
        const result = await verifyPersonalConnection({ vendor: 'openai', apiKey: 'bad', model: null });
        expect(result.ok).toBe(false);
        expect(result.message).toContain('키가 유효하지 않습니다');
    });

    it('네트워크 실패도 ok:false 로 끝난다(던지지 않는다)', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));
        const result = await verifyPersonalConnection({ vendor: 'anthropic', apiKey: 'k', model: null });
        expect(result.ok).toBe(false);
    });
});
```

- [x] **Step 6: 실패 확인 → 구현 마무리 → 통과 확인**

Run: `npx vitest run tests/ai-personal-provider.test.ts` → PASS 까지.

- [x] **Step 7: 전체 검증 후 커밋**

Run: `npx tsc --noEmit` / `npx vitest run` / `npx next lint` 모두 통과.

```bash
git add lib/ai/ tests/ai-personal-provider.test.ts
git commit -m "feat: 개인 키로 도는 personal AI 프로바이더를 추가한다

세 벤더 모두 OpenAI 호환 창구가 있어 기존 클라이언트를 재사용한다.
directEndpoint 를 새로 둔 이유: 주소·모델이 프리셋으로 확정돼 있고
Anthropic 호환 레이어는 /models 조회가 없을 수 있어 탐색이 방해라서다.
연결이 없거나 호출이 실패하면 기존 degrade 경로로 규칙 기반 폴백한다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: 키 저장소와 내 AI 연결 API

**Files:**
- Create: `lib/ai/personal-store.ts`
- Create: `app/api/me/ai-connection/route.ts`
- Create: `app/api/me/ai-connection/verify/route.ts`
- Test: `tests/api-me-ai-connection.test.ts`

**Interfaces:**
- Consumes: Task 2 `parsePersonalAiVendor`, Task 3 `PersonalAiConnection`, `verifyPersonalConnection`, 기존 `encryptSettingsValue`/`decryptSettingsValue`(lib/settings-crypto), `requireAuth`(lib/auth)
- Produces (Task 5·6 이 쓴다):
  - `loadPersonalConnection(userId: string): Promise<PersonalAiConnection | null>` — 복호화 실패 시 null
  - API: `GET/PUT/DELETE /api/me/ai-connection`, `POST /api/me/ai-connection/verify`
  - GET 응답: `{ connection: { vendor, model, updatedAt } | null }` — **키는 어떤 형태로도 응답에 담지 않는다**

- [x] **Step 1: lib/ai/personal-store.ts 작성**

```ts
// 개인 AI 키의 DB 저장·조회. 키는 암호화된 형태로만 저장되고, 복호화는
// 서버 안에서 프로바이더를 만드는 순간에만 일어난다.
import { prisma } from '../prisma';
import { createLogger } from '../logger';
import { decryptSettingsValue, encryptSettingsValue } from '../settings-crypto';
import { parsePersonalAiVendor } from './personal-vendors';
import type { PersonalAiConnection } from './personal';

const log = createLogger('lib/ai/personal-store');

/** 화면에 보여줄 요약. 키는 존재 여부조차 값으로 싣지 않는다(행이 있으면 키가 있는 것). */
export async function getPersonalConnectionSummary(userId: string) {
    const row = await prisma.userAiConnection.findUnique({
        where: { userId },
        select: { vendor: true, model: true, updatedAt: true },
    });
    return row ?? null;
}

/** AI 실행 직전에 쓰는 복호화 조회. 키가 손상됐으면 없다고 답해 폴백을 태운다. */
export async function loadPersonalConnection(userId: string): Promise<PersonalAiConnection | null> {
    const row = await prisma.userAiConnection.findUnique({ where: { userId } });
    if (!row) return null;

    const vendor = parsePersonalAiVendor(row.vendor);
    if (!vendor) return null;

    const apiKey = decryptSettingsValue(row.apiKey);
    if (apiKey === null) {
        // 암호화 키가 바뀌었거나 값이 손상됐다. 키 내용 없이 사실만 남긴다.
        log.warn('개인 AI 키를 복호화하지 못해 미등록으로 처리합니다.', { userId });
        return null;
    }

    return { vendor, apiKey, model: row.model };
}

export async function upsertPersonalConnection(
    userId: string,
    input: { vendor: PersonalAiConnection['vendor']; apiKey?: string; model: string | null }
): Promise<void> {
    const encrypted = input.apiKey ? encryptSettingsValue(input.apiKey) : undefined;
    await prisma.userAiConnection.upsert({
        where: { userId },
        // 새로 만들 때는 키가 반드시 있어야 한다 — 라우트가 먼저 검증한다.
        create: { userId, vendor: input.vendor, apiKey: encrypted ?? '', model: input.model },
        update: { vendor: input.vendor, model: input.model, ...(encrypted ? { apiKey: encrypted } : {}) },
    });
}

export async function deletePersonalConnection(userId: string): Promise<void> {
    // 행이 없어도 조용히 성공해야 한다(삭제 버튼 연타 등).
    await prisma.userAiConnection.deleteMany({ where: { userId } });
}
```

- [x] **Step 2: app/api/me/ai-connection/route.ts 작성**

```ts
// 본인 AI 키 연결의 조회·저장·삭제. /api/me/profile 과 같은 원칙 —
// 경로에 userId 를 받지 않고 세션의 userId 만 쓴다.
//
// 키는 응답에 어떤 형태로도 담지 않는다. 저장 후에는 "등록됨" 사실만 보인다.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { createLogger } from '@/lib/logger';
import { toErrorResponse } from '@/lib/api-error';
import { parsePersonalAiVendor } from '@/lib/ai/personal-vendors';
import {
    deletePersonalConnection, getPersonalConnectionSummary, upsertPersonalConnection,
} from '@/lib/ai/personal-store';

const log = createLogger('api/me/ai-connection');

const putSchema = z.object({
    vendor: z.string(),
    apiKey: z.string().trim().min(1).max(500).optional(),
    model: z.string().trim().max(100).optional(),
});

export async function GET(request: NextRequest) {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;

    try {
        return NextResponse.json({ connection: await getPersonalConnectionSummary(authResult.userId) });
    } catch (error: unknown) {
        return toErrorResponse(error, { log, message: 'AI 연결 정보를 불러오지 못했습니다.' });
    }
}

export async function PUT(request: NextRequest) {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;

    try {
        const parsed = putSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
            return NextResponse.json({ error: '입력 형식이 올바르지 않습니다.' }, { status: 400 });
        }

        const vendor = parsePersonalAiVendor(parsed.data.vendor);
        if (!vendor) {
            return NextResponse.json({ error: '지원하지 않는 벤더입니다.' }, { status: 400 });
        }

        const existing = await getPersonalConnectionSummary(authResult.userId);
        // 새 등록이거나 벤더를 바꿀 때는 그 벤더의 키가 반드시 필요하다.
        // 이전 벤더의 키를 새 벤더에 이어 붙이면 인증만 조용히 깨진다.
        if (!parsed.data.apiKey && (!existing || existing.vendor !== vendor)) {
            return NextResponse.json({ error: 'API 키를 입력하세요.' }, { status: 400 });
        }

        await upsertPersonalConnection(authResult.userId, {
            vendor,
            apiKey: parsed.data.apiKey,
            model: parsed.data.model?.trim() || null,
        });

        // 키 값은 로그에도 응답에도 싣지 않는다.
        log.info('개인 AI 연결 저장', { userId: authResult.userId, vendor });
        return NextResponse.json({ connection: await getPersonalConnectionSummary(authResult.userId) });
    } catch (error: unknown) {
        return toErrorResponse(error, { log, message: 'AI 연결을 저장하지 못했습니다.' });
    }
}

export async function DELETE(request: NextRequest) {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;

    try {
        await deletePersonalConnection(authResult.userId);
        log.info('개인 AI 연결 삭제', { userId: authResult.userId });
        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        return toErrorResponse(error, { log, message: 'AI 연결을 삭제하지 못했습니다.' });
    }
}
```

- [x] **Step 3: app/api/me/ai-connection/verify/route.ts 작성**

```ts
// 등록된 본인 키가 실제로 통하는지 확인한다(짧은 요청 1회 — 비용은 사실상 0원).
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createLogger } from '@/lib/logger';
import { toErrorResponse } from '@/lib/api-error';
import { verifyPersonalConnection } from '@/lib/ai/personal';
import { loadPersonalConnection } from '@/lib/ai/personal-store';

const log = createLogger('api/me/ai-connection/verify');

export async function POST(request: NextRequest) {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;

    try {
        const connection = await loadPersonalConnection(authResult.userId);
        if (!connection) {
            return NextResponse.json(
                { error: '등록된 AI 키가 없습니다. 먼저 키를 저장하세요.' },
                { status: 400 }
            );
        }

        const result = await verifyPersonalConnection(connection);
        log.info('개인 AI 연결 확인', { userId: authResult.userId, ok: result.ok });
        return NextResponse.json(result);
    } catch (error: unknown) {
        return toErrorResponse(error, { log, message: '연결 확인에 실패했습니다.' });
    }
}
```

- [x] **Step 4: 실패하는 테스트 작성** — `tests/api-me-ai-connection.test.ts`

mock 패턴은 `tests/api-me-profile.test.ts` 를 따른다. 필수 케이스:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const findUniqueConn = vi.fn();
const upsertConn = vi.fn();
const deleteManyConn = vi.fn();

vi.mock('../lib/prisma', () => ({
    prisma: { userAiConnection: { findUnique: findUniqueConn, upsert: upsertConn, deleteMany: deleteManyConn } },
}));

const requireAuth = vi.fn();
vi.mock('../lib/auth', () => ({
    requireAuth: (...args: unknown[]) => requireAuth(...(args as [])),
}));

// settings-crypto 는 실제 구현을 쓰되 키 재료를 환경변수로 준다.
vi.stubEnv('SETTINGS_ENCRYPTION_KEY', 'test-key-material-for-ai-connection');

const { GET, PUT, DELETE } = await import('../app/api/me/ai-connection/route');

function authAs(userId = 'user_1') {
    requireAuth.mockResolvedValue({ userId, email: 'u@x.com', name: '사용자', isAdmin: false, role: 'MENTEE', accessExpiresAt: null });
}

function jsonRequest(method: string, body?: unknown): NextRequest {
    return new NextRequest('http://localhost/api/me/ai-connection', {
        method, headers: { 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
}

beforeEach(() => {
    authAs();
    findUniqueConn.mockResolvedValue(null);
    upsertConn.mockResolvedValue({});
    deleteManyConn.mockResolvedValue({ count: 1 });
});

afterEach(() => vi.clearAllMocks());

describe('저장', () => {
    it('키를 암호화해 저장한다(평문이 DB 로 가지 않는다)', async () => {
        const res = await PUT(jsonRequest('PUT', { vendor: 'openai', apiKey: 'sk-plain-secret' }));
        expect(res.status).toBe(200);
        const saved = upsertConn.mock.calls[0][0];
        expect(saved.create.apiKey).toMatch(/^enc:v1:/);
        expect(JSON.stringify(saved)).not.toContain('sk-plain-secret');
    });

    it('응답에 키가 어떤 형태로도 실리지 않는다', async () => {
        findUniqueConn.mockResolvedValue({ vendor: 'openai', model: null, updatedAt: new Date() });
        const res = await PUT(jsonRequest('PUT', { vendor: 'openai', apiKey: 'sk-plain-secret' }));
        expect(JSON.stringify(await res.json())).not.toContain('sk-plain-secret');
        expect(JSON.stringify(await res.json())).not.toContain('apiKey');
    });

    it('모르는 벤더를 막는다', async () => {
        expect((await PUT(jsonRequest('PUT', { vendor: 'azure', apiKey: 'k' }))).status).toBe(400);
        expect(upsertConn).not.toHaveBeenCalled();
    });

    it('새 등록에 키가 없으면 막는다', async () => {
        expect((await PUT(jsonRequest('PUT', { vendor: 'openai' }))).status).toBe(400);
    });

    it('같은 벤더의 모델만 바꿀 때는 키를 다시 받지 않는다', async () => {
        findUniqueConn.mockResolvedValue({ vendor: 'openai', model: null, updatedAt: new Date() });
        const res = await PUT(jsonRequest('PUT', { vendor: 'openai', model: 'gpt-4o' }));
        expect(res.status).toBe(200);
        // apiKey 를 update 에 싣지 않아 기존 키가 유지된다.
        expect(upsertConn.mock.calls[0][0].update.apiKey).toBeUndefined();
    });

    it('벤더를 바꾸면 새 키를 요구한다', async () => {
        findUniqueConn.mockResolvedValue({ vendor: 'openai', model: null, updatedAt: new Date() });
        expect((await PUT(jsonRequest('PUT', { vendor: 'gemini' }))).status).toBe(400);
    });
});

describe('조회·삭제', () => {
    it('GET 은 요약만 준다', async () => {
        findUniqueConn.mockResolvedValue({ vendor: 'gemini', model: 'gemini-2.0-flash', updatedAt: new Date() });
        const body = await (await GET(jsonRequest('GET'))).json();
        expect(body.connection.vendor).toBe('gemini');
        expect(JSON.stringify(body)).not.toContain('apiKey');
    });

    it('DELETE 는 행이 없어도 성공한다', async () => {
        deleteManyConn.mockResolvedValue({ count: 0 });
        expect((await DELETE(jsonRequest('DELETE'))).status).toBe(200);
    });

    it('본인 세션의 userId 로만 조회한다', async () => {
        authAs('user_77');
        await GET(jsonRequest('GET'));
        expect(findUniqueConn.mock.calls[0][0].where).toEqual({ userId: 'user_77' });
    });
});
```

verify 라우트 테스트도 같은 파일에 추가: 등록 없음 → 400 / `verifyPersonalConnection` mock(`vi.mock('../lib/ai/personal', ...)`) 이 `{ ok: false, message: ... }` 를 주면 그대로 전달되는지.

- [x] **Step 5: 실패 확인 → 통과 확인 → 전체 검증**

Run: `npx vitest run tests/api-me-ai-connection.test.ts` → PASS. 이어서 `npx tsc --noEmit`, `npx vitest run`, `npx next lint` 통과.

- [x] **Step 6: 커밋**

```bash
git add lib/ai/personal-store.ts app/api/me/ai-connection tests/api-me-ai-connection.test.ts
git commit -m "feat: 본인 AI 키를 등록·확인·삭제하는 API 를 추가한다

키는 AES-256-GCM(lib/settings-crypto)으로 암호화해 저장하고, 응답과
로그 어디에도 싣지 않는다. 복호화는 프로바이더를 만드는 순간에만
서버 안에서 일어난다. 벤더를 바꿀 때는 새 키를 요구한다 — 이전
벤더의 키를 이어 붙이면 인증만 조용히 깨지기 때문이다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: 사용자 정보 화면에 「내 AI 연결」 섹션

**Files:**
- Modify: `app/profile/page.tsx`

**Interfaces:**
- Consumes: Task 4 API (`GET/PUT/DELETE /api/me/ai-connection`, `POST .../verify`), Task 2 `PERSONAL_AI_VENDORS`, `PERSONAL_AI_VENDOR_LABELS`, `PERSONAL_AI_VENDOR_PRESETS`

- [x] **Step 1: 상태와 로딩 추가**

임포트 추가:

```ts
import {
    PERSONAL_AI_VENDORS, PERSONAL_AI_VENDOR_LABELS, PERSONAL_AI_VENDOR_PRESETS,
    type PersonalAiVendor,
} from '@/lib/ai/personal-vendors';
```

컴포넌트 상태 추가 (`const [name, setName] = useState('');` 아래):

```ts
    // 내 AI 연결. null = 미등록. 키 값은 서버가 돌려주지 않으므로 화면에 없다.
    const [aiConn, setAiConn] = useState<{ vendor: PersonalAiVendor; model: string | null } | null>(null);
    const [aiForm, setAiForm] = useState({ vendor: 'openai' as PersonalAiVendor, apiKey: '', model: '' });
    const [aiBusy, setAiBusy] = useState(false);
    const [aiMsg, setAiMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
```

`load()` 의 `Promise.all` 에 `fetch('/api/me/ai-connection')` 를 세 번째로 추가하고, 성공 시:

```ts
            const aiData = await aiRes.json().catch(() => null);
            if (aiRes.ok && aiData?.connection) {
                setAiConn(aiData.connection);
                setAiForm({ vendor: aiData.connection.vendor, apiKey: '', model: aiData.connection.model ?? '' });
            }
```

- [x] **Step 2: 핸들러 3개 추가** (`handleSave` 아래)

```ts
    const saveAiConnection = async () => {
        setAiBusy(true);
        setAiMsg(null);
        try {
            const res = await fetch('/api/me/ai-connection', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    vendor: aiForm.vendor,
                    ...(aiForm.apiKey.trim() ? { apiKey: aiForm.apiKey.trim() } : {}),
                    ...(aiForm.model.trim() ? { model: aiForm.model.trim() } : {}),
                }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error(data?.error || '저장에 실패했습니다.');
            setAiConn(data.connection);
            // 키는 저장 즉시 입력칸에서 지운다 — 화면에 남겨둘 이유가 없다.
            setAiForm((prev) => ({ ...prev, apiKey: '' }));
            setAiMsg({ type: 'success', text: '저장했습니다. [연결 확인]으로 키가 통하는지 점검해 보세요.' });
        } catch (error) {
            setAiMsg({ type: 'error', text: error instanceof Error ? error.message : '저장에 실패했습니다.' });
        } finally {
            setAiBusy(false);
        }
    };

    const verifyAiConnection = async () => {
        setAiBusy(true);
        setAiMsg(null);
        try {
            const res = await fetch('/api/me/ai-connection/verify', { method: 'POST' });
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error(data?.error || '연결 확인에 실패했습니다.');
            setAiMsg({ type: data.ok ? 'success' : 'error', text: data.message });
        } catch (error) {
            setAiMsg({ type: 'error', text: error instanceof Error ? error.message : '연결 확인에 실패했습니다.' });
        } finally {
            setAiBusy(false);
        }
    };

    const removeAiConnection = async () => {
        if (!window.confirm('등록된 AI 키를 삭제하시겠습니까?')) return;
        setAiBusy(true);
        setAiMsg(null);
        try {
            const res = await fetch('/api/me/ai-connection', { method: 'DELETE' });
            if (!res.ok) throw new Error('삭제에 실패했습니다.');
            setAiConn(null);
            setAiForm({ vendor: 'openai', apiKey: '', model: '' });
            setAiMsg({ type: 'success', text: '삭제했습니다.' });
        } catch (error) {
            setAiMsg({ type: 'error', text: error instanceof Error ? error.message : '삭제에 실패했습니다.' });
        } finally {
            setAiBusy(false);
        }
    };
```

- [x] **Step 3: 섹션 JSX 추가** — 「회원 정보 수정」 섹션 바로 위에:

```tsx
                        {/* ── 내 AI 연결 ──────────────────────────────── */}
                        <section className="card space-y-4">
                            <div>
                                <h2 className="text-sm font-bold text-white">내 AI 연결</h2>
                                <p className="mt-1 text-xs text-gray-500">
                                    본인의 OpenAI·Claude·Gemini API 키를 등록하면, 프로젝트 AI 모드에서
                                    「내 AI (개인 키)」를 골라 쓸 수 있습니다. 키는 암호화되어 저장되고 다시
                                    표시되지 않으며, 사용 요금은 본인의 벤더 계정에 청구됩니다.
                                </p>
                            </div>

                            {aiConn && (
                                <p className="text-xs text-emerald-300">
                                    ✅ {PERSONAL_AI_VENDOR_LABELS[aiConn.vendor]} 키가 등록되어 있습니다.
                                </p>
                            )}

                            <div className="grid gap-3 sm:grid-cols-2">
                                <label className="block text-sm font-medium text-gray-400">
                                    벤더
                                    <select className="input mt-2" value={aiForm.vendor}
                                        onChange={(e) => setAiForm({ ...aiForm, vendor: e.target.value as PersonalAiVendor })}
                                        id="profile-ai-vendor">
                                        {PERSONAL_AI_VENDORS.map((v) => (
                                            <option key={v} value={v}>{PERSONAL_AI_VENDOR_LABELS[v]}</option>
                                        ))}
                                    </select>
                                </label>
                                <label className="block text-sm font-medium text-gray-400">
                                    모델 <span className="text-gray-600">(선택)</span>
                                    <input className="input mt-2" value={aiForm.model}
                                        placeholder={PERSONAL_AI_VENDOR_PRESETS[aiForm.vendor].defaultModel}
                                        onChange={(e) => setAiForm({ ...aiForm, model: e.target.value })}
                                        id="profile-ai-model" />
                                </label>
                            </div>

                            <label className="block text-sm font-medium text-gray-400">
                                API 키 {aiConn?.vendor === aiForm.vendor && (
                                    <span className="text-gray-600">(비워 두면 저장된 키 유지)</span>
                                )}
                                <input type="password" className="input mt-2" value={aiForm.apiKey}
                                    autoComplete="off" placeholder="sk-..."
                                    onChange={(e) => setAiForm({ ...aiForm, apiKey: e.target.value })}
                                    id="profile-ai-key" />
                            </label>

                            {aiMsg && (
                                <div className={`rounded-lg border px-4 py-3 text-sm ${aiMsg.type === 'success'
                                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                                    : 'border-rose-500/30 bg-rose-500/10 text-rose-200'
                                    }`}>
                                    {aiMsg.text}
                                </div>
                            )}

                            <div className="flex justify-end gap-2">
                                {aiConn && (
                                    <button type="button" onClick={removeAiConnection} disabled={aiBusy}
                                        className="text-xs px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 transition-colors disabled:opacity-50"
                                        id="profile-ai-delete">
                                        삭제
                                    </button>
                                )}
                                {aiConn && (
                                    <button type="button" onClick={verifyAiConnection} disabled={aiBusy}
                                        className="btn-secondary text-sm disabled:opacity-50" id="profile-ai-verify">
                                        연결 확인
                                    </button>
                                )}
                                <button type="button" onClick={saveAiConnection}
                                    disabled={aiBusy || (!aiForm.apiKey.trim() && aiConn?.vendor !== aiForm.vendor)}
                                    className="btn-primary text-sm disabled:opacity-50" id="profile-ai-save">
                                    {aiBusy ? '처리 중...' : '저장'}
                                </button>
                            </div>
                        </section>
```

- [x] **Step 4: 검증 후 커밋**

Run: `npx tsc --noEmit`, `npx vitest run`, `npx next lint` 통과. dev 서버가 떠 있으면 `/profile` 이 컴파일 오류 없이 열리는지(미로그인 → /login 리다이렉트) 확인.

```bash
git add app/profile/page.tsx
git commit -m "feat: 사용자 정보 화면에 내 AI 연결 섹션을 붙인다

벤더 선택·모델·키 입력과 저장/연결 확인/삭제. 키는 저장 즉시 입력칸에서
지우고 서버도 돌려주지 않으므로 화면에 다시 나타나지 않는다. 같은 벤더의
모델만 바꿀 때는 키 재입력 없이 저장할 수 있다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: 프로젝트 AI 모드에 「내 AI」 + 두 AI 라우트 배선

**Files:**
- Modify: `lib/ai/project-ai-mode.ts`
- Modify: `app/api/projects/[id]/attributes/mentor/route.ts`
- Modify: `app/api/projects/[id]/spec/generate/route.ts`
- Modify: `prisma/schema.prisma` (Project.aiMode 주석만 — 마이그레이션 불필요)
- Test: `tests/api-ai-personal-mode.test.ts`

**Interfaces:**
- Consumes: Task 3 `RunAiTaskOptions.personalConnection`, Task 4 `loadPersonalConnection`
- Produces: `PROJECT_AI_MODES = ['rule','local','personal']` — 대시보드 모달과 프로젝트 설정 화면은 이 배열을 순회하므로 자동으로 세 번째 선택지가 나타난다

- [ ] **Step 1: project-ai-mode.ts 확장**

```ts
export const PROJECT_AI_MODES = ['rule', 'local', 'personal'] as const;
```

라벨·설명 추가:

```ts
export const PROJECT_AI_MODE_LABELS: Record<ProjectAiMode, string> = {
    rule: '규칙 기반만 사용',
    local: '로컬 AI 연결 (Ollama · LM Studio)',
    personal: '내 AI (개인 키)',
};

export const PROJECT_AI_MODE_DESCRIPTIONS: Record<ProjectAiMode, string> = {
    rule: '설치나 설정 없이 바로 씁니다. 프로젝트 문맥으로 초안을 조립합니다.',
    local: '내 PC의 로컬 LLM을 씁니다. 찾지 못하면 규칙 기반으로 자동 전환되므로 실패해도 작업이 멈추지 않습니다.',
    personal: '사용자 정보에서 등록한 본인의 OpenAI·Claude·Gemini 키를 씁니다. 요금은 본인 벤더 계정에 청구되고, 키가 없거나 실패하면 규칙 기반으로 자동 전환됩니다.',
};
```

`schema.prisma` 의 `Project.aiMode` 주석을 `// AI 에이전트 연결 방식: "rule" | "local" | "personal"` 로 갱신 (주석만 — 컬럼 변화 없음).

- [ ] **Step 2: attributes/mentor 라우트 배선**

임포트 추가: `parseProjectAiMode`(lib/ai/project-ai-mode), `loadPersonalConnection`(lib/ai/personal-store).

prisma select 에 `aiMode: true,` 추가. `projectContext` 정의 아래에:

```ts
        // 이 라우트는 지금까지 프로젝트의 aiMode 를 무시하고 전역 설정을 따랐다.
        // 프로젝트 설정 화면이 "이 프로젝트의 연결 방식"을 약속하므로 여기서도 따른다.
        const aiMode = parseProjectAiMode(project.aiMode);
        // 개인 키는 언제나 "버튼을 누른 본인"의 것이다. 남의 키는 구조적으로 올 수 없다.
        const personalConnection = aiMode === 'personal'
            ? await loadPersonalConnection(accessResult.user.userId)
            : null;
        const requested = aiMode === 'personal' ? 'personal' as const
            : aiMode === 'local' ? 'local' as const : 'rule' as const;
```

두 `runAiTask(...)` 호출에 둘째 인자 `{ requested, personalConnection }` 를 추가.

- [ ] **Step 3: spec/generate 라우트 배선**

임포트 추가: `loadPersonalConnection`(lib/ai/personal-store). 기존 `const requested = ...` 줄을 다음으로 교체:

```ts
        const personalConnection = aiMode === 'personal'
            ? await loadPersonalConnection(accessResult.user.userId)
            : null;
        const requested = aiMode === 'personal'
            ? 'personal' as const
            : aiMode === 'local' && !serverLocalDisabled ? 'local' as const : 'rule' as const;
```

`runAiTask(...)` 호출의 옵션을 `{ requested, personalConnection }` 로. `shouldOfferRelay` 조건은 그대로 둔다(로컬 전용 — personal 실패는 폴백 결과가 이미 담겨 있다).

- [ ] **Step 4: 선택 UI 자동 반영 확인**

Run: `grep -rn "PROJECT_AI_MODES" app/ components/`
확인: 대시보드 모달과 프로젝트 설정 화면이 배열을 순회(map)하고 있으면 코드 수정 없이 세 선택지가 나온다. 순회하지 않고 두 개를 하드코딩한 곳이 있으면 배열 순회로 바꾼다.

- [ ] **Step 5: 실패하는 테스트 작성** — `tests/api-ai-personal-mode.test.ts`

`runAiTask` 와 `loadPersonalConnection` 을 mock 해 라우트가 올바른 옵션을 넘기는지 잠근다:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const runAiTask = vi.fn();
vi.mock('../lib/ai/registry', () => ({
    runAiTask: (...args: unknown[]) => runAiTask(...(args as [])),
}));

const loadPersonalConnection = vi.fn();
vi.mock('../lib/ai/personal-store', () => ({
    loadPersonalConnection: (...args: unknown[]) => loadPersonalConnection(...(args as [])),
}));

const requireProjectAccess = vi.fn();
vi.mock('../lib/authorization', () => ({
    requireProjectAccess: (...args: unknown[]) => requireProjectAccess(...(args as [])),
}));

const findUniqueProject = vi.fn();
vi.mock('../lib/prisma', () => ({
    prisma: { project: { findUnique: findUniqueProject } },
}));

const { POST } = await import('../app/api/projects/[id]/attributes/mentor/route');

const CONN = { vendor: 'openai', apiKey: 'sk-x', model: null };

function call(body: unknown = {}) {
    const req = new NextRequest('http://localhost/api/projects/proj_1/attributes/mentor', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    return POST(req, { params: Promise.resolve({ id: 'proj_1' }) });
}

beforeEach(() => {
    requireProjectAccess.mockResolvedValue({
        user: { userId: 'user_9', email: 'u@x.com', name: '사용자', isAdmin: false, role: 'MENTEE', accessExpiresAt: null },
        role: 'OWNER',
    });
    findUniqueProject.mockResolvedValue({
        name: 'P', description: null, detailedDescription: null, aiMode: 'personal', productAttributes: [],
    });
    loadPersonalConnection.mockResolvedValue(CONN);
    runAiTask.mockResolvedValue({
        result: { questions: [], focus: '' }, provider: 'personal', requestedProvider: 'personal', degraded: false,
    });
});

afterEach(() => vi.clearAllMocks());

describe('attributes/mentor 의 personal 모드', () => {
    it('버튼을 누른 본인의 연결을 읽어 personal 로 요청한다', async () => {
        await call();
        expect(loadPersonalConnection).toHaveBeenCalledWith('user_9');
        expect(runAiTask.mock.calls[0][1]).toMatchObject({ requested: 'personal', personalConnection: CONN });
    });

    it('rule 모드에서는 개인 연결을 조회하지 않는다', async () => {
        findUniqueProject.mockResolvedValue({
            name: 'P', description: null, detailedDescription: null, aiMode: 'rule', productAttributes: [],
        });
        await call();
        expect(loadPersonalConnection).not.toHaveBeenCalled();
        expect(runAiTask.mock.calls[0][1]).toMatchObject({ requested: 'rule' });
    });

    it('키 미등록이어도 500 이 나지 않는다(null 이 그대로 넘어가 폴백을 탄다)', async () => {
        loadPersonalConnection.mockResolvedValue(null);
        const res = await call();
        expect(res.status).toBe(200);
        expect(runAiTask.mock.calls[0][1]).toMatchObject({ requested: 'personal', personalConnection: null });
    });
});
```

`lib/ai/project-ai-mode` 확장에 대한 단위 케이스도 추가: `parseProjectAiMode('personal') === 'personal'`, 모르는 값은 `'rule'`.

- [ ] **Step 6: 실패 확인 → 통과 → 전체 검증 → 커밋**

Run: `npx vitest run tests/api-ai-personal-mode.test.ts` → PASS. `npx tsc --noEmit` / `npx vitest run` / `npx next lint` 통과.

```bash
git add lib/ai/project-ai-mode.ts app/api/projects prisma/schema.prisma tests/api-ai-personal-mode.test.ts
git commit -m "feat: 프로젝트 AI 모드에 내 AI(개인 키)를 추가한다

aiMode 가 personal 이면 버튼을 누른 본인의 키로 호출한다 — 키는 언제나
요청자 자신의 것만 쓰이고 공유되지 않는다. 키가 없거나 실패하면 기존
폴백이 규칙 기반으로 전환한다.

함께 고친 것: attributes/mentor 라우트가 지금까지 프로젝트 aiMode 를
무시하고 전역 설정을 따랐다. 프로젝트 설정 화면의 약속과 어긋나므로
spec/generate 와 같은 규칙으로 맞췄다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## 수퍼바이저 감리 체크리스트 (Task 승인 게이트)

각 Task 완료 보고 후 감리자가 확인한다. 하나라도 걸리면 반려한다.

1. **보안 4종**: 평문 키가 ① DB 로 가는 경로(upsert 인자) ② API 응답 ③ 로그 호출부 ④ 클라이언트 상태에 남는 곳 — 전부 없는가. `grep -rn "apiKey" app/ lib/ | grep -v enc` 로 훑는다.
2. **키 공유 차단**: `loadPersonalConnection` 호출부의 인자가 반드시 세션에서 온 `userId` 인가(요청 본문·쿼리에서 온 값이면 반려).
3. **폴백 보존**: personal 실패가 예외로 새지 않고 `degraded: true` + 규칙 기반 결과로 끝나는 테스트가 있는가.
4. **원격 DB**: 작업 로그에 `migrate deploy`/`db push`/DB 쓰기 스크립트 실행 흔적이 없는가.
5. **검증 수치**: `tsc` 0건, `vitest` 전체 통과(기존 894개 + 신규), `lint` 0건, Task 2 뮤테이션 100%.

## 계획 밖 (사람이 하는 일)

- **마이그레이션 적용** (Task 1 이후 아무 때나, Task 4 이전 권장): `npx prisma migrate deploy` — 운영자가 직접 실행.
- **실키 검증** (전체 완료 후): 본인 키 하나를 `/profile` 에 등록 → [연결 확인] → 프로젝트 AI 모드를 「내 AI」로 → WS-3 AI 버튼으로 실제 응답 확인. 에이전트는 실키가 없어 이 단계를 대신할 수 없다. Claude·Gemini 호환 레이어의 미세한 차이는 이 단계에서만 드러난다.
