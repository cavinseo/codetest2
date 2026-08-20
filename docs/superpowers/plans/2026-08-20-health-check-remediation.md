# 종합검진 조치 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 종합검진 보고서(`docs/2026-08-20-code-health-check.md`)의 Critical 2건과 High 11건 중 코드로 고칠 수 있는 항목을 위험도 순으로 제거한다.

**Architecture:** 새 패턴을 만들지 않는다. 이 저장소에는 이미 `toErrorResponse`(고정 문구+상관ID), `createLogger`(PII 금지), `countCascadeImpact`+`confirmCascade`(연쇄 삭제 확인), `bulk-worksheet-route` 팩토리라는 검증된 도구가 있고, 문제는 그 **적용 반경**이다. 각 Task는 기존 도구를 아직 안 쓰는 라우트로 넓히는 방식으로 진행한다. 테스트는 기존 관례(Vitest + `vi.mock('../lib/prisma')`로 Prisma mock, 라우트 핸들러 직접 import)를 따르되, mock으로는 원리적으로 잡히지 않는 FK·캐스케이드는 Task 9에서 실DB 통합 테스트로 따로 덮는다.

**Tech Stack:** Next.js 15 App Router, React 19, Prisma 6.19 (PostgreSQL), TypeScript 5 strict, Vitest 4, zod 3, bcryptjs

## Global Constraints

- 새 소스 파일 첫 줄에 파일 역할을 설명하는 **한국어 한 줄 주석**을 둔다 (AGENTS.md 규칙). `*.config.*`는 예외.
- 한국어 문장은 마침표·물음표·느낌표로 끝내고 콜론으로 끝내지 않는다.
- `scripts/check-text-encoding.mjs`가 `app`·`components`·`lib`·`prisma`·`tests`의 `.ts/.tsx/.sql/.prisma/.json/.css/.js/.mjs/.jsx`를 검사한다. 한글은 UTF-8로 저장한다. `npm test`·`npm run build` 전에 자동 실행된다.
- 요청과 직접 관련된 파일과 줄만 수정한다. 주변 코드·주석·포맷을 임의로 정리하지 않는다.
- 각 Task는 `npm test`가 통과한 상태로 끝난다. **기준선은 437개 통과(52파일)이며, 이 숫자는 Task마다 늘어나기만 해야 한다.**
- 커밋 메시지는 기존 관례를 따른다 — `fix:` / `feat:` / `refactor:` + 영문 요약.
- Prisma delegate 이름은 모델명의 camelCase다. `QFDMatrix`의 delegate는 **`qFDMatrix`**다.
- 이 계획은 `feat/member-roles-and-invites` 브랜치의 미커밋 작업(member-roles, invite-code)을 **건드리지 않는다.** Task 0에서 먼저 커밋해 분리한다.

## 사용자가 직접 해야 하는 것 (코드로 대신할 수 없음)

**보고서 C-1(공개 저장소 히스토리의 개발 DB)은 이 계획에 포함하지 않는다.** 저장소 공개 범위 변경과 히스토리 재작성은 계정 설정 변경 + force push라 되돌릴 수 없고 협업자에게 영향을 준다. 아래를 사용자가 직접 판단해 실행해야 한다.

```bash
gh repo edit cavinseo/codetest2 --visibility private --accept-visibility-change-consequences
```

히스토리 제거(`git filter-repo --invert-paths --path prisma/dev.db` + force push)는 **Task 0의 WIP 커밋·푸시가 끝난 뒤에** 해야 한다. 순서가 바뀌면 방금 푸시한 브랜치가 재작성 대상과 엉킨다.

---

## Task 0: 미커밋 작업 백업

912라인이 커밋 0개 상태로 Dropbox 안 워킹트리에만 있다(보고서 H-9). 다른 Task가 파일을 건드리기 전에 분리해 둔다. 회원관리 기능 코드와 검진 조치를 한 커밋에 섞지 않기 위한 단계이기도 하다.

**Files:**
- Commit only: 기존 미커밋 8건 (`lib/auth.ts`, `prisma/schema.prisma`, `lib/invite-code.ts`, `lib/member-roles.ts`, `prisma/migrations/20260820020000_add_member_roles_and_invites/`, `tests/invite-code.test.ts`, `tests/member-roles.test.ts`, `docs/superpowers/specs/`)
- Commit: `docs/2026-08-20-code-health-check.md`, `docs/superpowers/plans/2026-08-20-health-check-remediation.md`

- [ ] **Step 1: 낡은 Prisma 클라이언트 재생성**

`prisma generate`를 안 돌려 로컬 `tsc`가 4건 실패한다(보고서 Low). 코드 결함이 아니라 생성물 누락이다. DB 접속이 없어 안전하다.

```bash
npx prisma generate
```

- [ ] **Step 2: 타입체크가 복구됐는지 확인**

```bash
npx tsc --noEmit
```

Expected: 출력 없음(에러 0건). `lib/auth.ts`의 `'role' does not exist` 4건이 사라진다.

- [ ] **Step 3: 회원관리 WIP 커밋**

```bash
git add lib/auth.ts prisma/schema.prisma lib/invite-code.ts lib/member-roles.ts prisma/migrations/20260820020000_add_member_roles_and_invites tests/invite-code.test.ts tests/member-roles.test.ts docs/superpowers/specs
git commit -m "wip: member roles, invite codes, and member management design"
```

- [ ] **Step 4: 검진 문서 커밋**

```bash
git add docs/2026-08-20-code-health-check.md docs/superpowers/plans/2026-08-20-health-check-remediation.md
git commit -m "docs: code health check report and remediation plan"
```

- [ ] **Step 5: 원격 백업**

```bash
git push -u origin feat/member-roles-and-invites
```

Expected: `origin/feat/member-roles-and-invites` 생성. 이후 워킹트리 손상이 나도 작업이 남는다.

---

## Task 1: Google Forms 응답 가져오기 FK 버그 (보고서 C-2)

`invitedBy: 'system'`은 `User.id` 필수 FK인데 `'system'` 사용자가 없어 이 기능이 **첫 실행부터 100% P2003으로 실패**한다. 요청한 사용자의 ID를 쓰면 된다. `requireProjectAccess`가 이미 검증한 실제 사용자다.

**Files:**
- Modify: `app/api/projects/[id]/kano/form-responses/route.ts:83`
- Test: `tests/api-form-responses-invitation.test.ts` (신규)

**Interfaces:**
- Consumes: `requireProjectAccess(request, projectId, opts)` → `{ user: { userId, email, name }, role }` (lib/authorization.ts)
- Produces: 없음 (라우트 내부 수정)

- [ ] **Step 1: 실패하는 테스트 작성**

Create `tests/api-form-responses-invitation.test.ts`:

```typescript
// Google Forms 시스템 초대가 실재하는 사용자 ID 를 참조하는지 확인한다.
//
// invitedBy 는 users.id 에 대한 필수 FK 다. 예전에는 'system' 이라는 문자열을
// 넣어서, 그런 사용자가 없는 모든 프로젝트에서 P2003 으로 항상 실패했다.
// Prisma 를 mock 하는 테스트라 FK 자체는 돌지 않으므로, 넘기는 값이
// 요청자의 userId 인지를 직접 확인한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const findRequirements = vi.fn();
const findInvitation = vi.fn();
const createInvitation = vi.fn();
const createManyResponses = vi.fn();

vi.mock('../lib/prisma', () => ({
    prisma: {
        customerRequirement: { findMany: findRequirements },
        kanoSurveyInvitation: { findUnique: findInvitation, create: createInvitation },
        kanoResponse: { createMany: createManyResponses },
    },
}));

const requireProjectAccess = vi.fn();
vi.mock('../lib/authorization', () => ({
    requireProjectAccess: (...args: unknown[]) => requireProjectAccess(...(args as [])),
}));

vi.mock('../lib/service-settings', () => ({
    isGoogleConfigured: () => Promise.resolve(true),
    getGoogleToken: () => Promise.resolve({ accessToken: 'token_x' }),
}));

const getFormResponses = vi.fn();
vi.mock('../lib/google-forms', () => ({
    getFormResponses: (...args: unknown[]) => getFormResponses(...(args as [])),
}));

const { POST } = await import('../app/api/projects/[id]/kano/form-responses/route');

const REQUESTER = { userId: 'user_42', email: 'pm@ks-qfd.com', name: '매니저' };

function postRequest(body: unknown): NextRequest {
    return new NextRequest('http://localhost/api/projects/proj_1/kano/form-responses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

const params = Promise.resolve({ id: 'proj_1' });

beforeEach(() => {
    requireProjectAccess.mockResolvedValue({ user: REQUESTER, role: 'OWNER' });
    findRequirements.mockResolvedValue([{ id: 'req_1', order: 0 }]);
    findInvitation.mockResolvedValue(null);
    createInvitation.mockResolvedValue({ id: 'inv_1' });
    createManyResponses.mockResolvedValue({ count: 1 });
    getFormResponses.mockResolvedValue({
        responses: [
            {
                respondentEmail: 'r@example.com',
                submittedAt: '2026-08-20T00:00:00.000Z',
                answers: [{ requirementIndex: 0, functional: 'LIKE', dysfunctional: 'TOLERATE' }],
            },
        ],
    });
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('form-responses 시스템 초대', () => {
    it('invitedBy 에 요청자의 userId 를 넣는다', async () => {
        const res = await POST(postRequest({ formId: 'form_1' }), { params });

        expect(res.status).toBe(200);
        expect(createInvitation).toHaveBeenCalledTimes(1);
        const created = createInvitation.mock.calls[0][0].data;
        expect(created.invitedBy).toBe('user_42');
    });

    it("invitedBy 에 'system' 같은 가짜 ID 를 넣지 않는다", async () => {
        await POST(postRequest({ formId: 'form_1' }), { params });

        const created = createInvitation.mock.calls[0][0].data;
        expect(created.invitedBy).not.toBe('system');
    });

    it('초대가 이미 있으면 새로 만들지 않는다', async () => {
        findInvitation.mockResolvedValue({ id: 'inv_old' });

        await POST(postRequest({ formId: 'form_1' }), { params });

        expect(createInvitation).not.toHaveBeenCalled();
        expect(createManyResponses.mock.calls[0][0].data[0].invitationId).toBe('inv_old');
    });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

```bash
npx vitest run tests/api-form-responses-invitation.test.ts
```

Expected: FAIL. 첫 테스트가 `expected 'system' to be 'user_42'`로 깨진다.

- [ ] **Step 3: 최소 수정**

`app/api/projects/[id]/kano/form-responses/route.ts:83`을 바꾼다.

기존:
```typescript
                    invitedBy: 'system', // 시스템 응답은 현재 사용자 ID가 필요하지 않음
```

수정:
```typescript
                    // invitedBy 는 users.id 에 대한 필수 FK 다. 예전에는 'system' 을
                    // 넣어서 그런 사용자가 없는 모든 프로젝트에서 P2003 으로 실패했다.
                    invitedBy: accessResult.user.userId,
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx vitest run tests/api-form-responses-invitation.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: 커밋**

```bash
git add tests/api-form-responses-invitation.test.ts "app/api/projects/[id]/kano/form-responses/route.ts"
git commit -m "fix: use the requesting user's id for the Google Forms system invitation"
```

---

## Task 2: 오픈 리디렉트 차단 (보고서 H-1)

`rawReturnUrl.startsWith('/')`를 `//evil.com`이 통과한다. `new URL(returnUrl, request.url)`이 이를 protocol-relative URL로 해석해 호스트가 외부로 바뀐다. 두 라우트가 같은 결함을 복붙하고 있으므로 판정을 lib 함수 하나로 뽑아 양쪽이 쓰게 한다.

**Files:**
- Create: `lib/safe-return-url.ts`
- Create: `tests/safe-return-url.test.ts`
- Modify: `app/api/auth/google/route.ts:23`
- Modify: `app/api/auth/google/callback/route.ts:38`

**Interfaces:**
- Produces: `safeReturnUrl(raw: string | null | undefined): string` — 내부 경로면 그대로, 아니면 `'/'`. 반환값은 항상 `/`로 시작하고 `//`로는 시작하지 않는다.

- [ ] **Step 1: 실패하는 테스트 작성**

Create `tests/safe-return-url.test.ts`:

```typescript
// 로그인 후 되돌아갈 주소가 외부 사이트로 새지 않는지 확인한다.
import { describe, expect, it } from 'vitest';
import { safeReturnUrl } from '../lib/safe-return-url';

describe('safeReturnUrl', () => {
    it('내부 경로는 그대로 둔다', () => {
        expect(safeReturnUrl('/dashboard')).toBe('/dashboard');
        expect(safeReturnUrl('/project/abc?tab=kano')).toBe('/project/abc?tab=kano');
    });

    it('protocol-relative URL 을 막는다', () => {
        // startsWith('/') 만 보던 예전 검사가 이걸 통과시켰다.
        expect(safeReturnUrl('//evil.com')).toBe('/');
        expect(safeReturnUrl('//evil.com/path')).toBe('/');
    });

    it('역슬래시 변형을 막는다', () => {
        // 일부 브라우저가 \ 를 / 로 정규화한다.
        expect(safeReturnUrl('/\\evil.com')).toBe('/');
        expect(safeReturnUrl('\\\\evil.com')).toBe('/');
    });

    it('절대 URL 을 막는다', () => {
        expect(safeReturnUrl('https://evil.com')).toBe('/');
        expect(safeReturnUrl('http://evil.com')).toBe('/');
        expect(safeReturnUrl('javascript:alert(1)')).toBe('/');
    });

    it('비어 있으면 루트로 보낸다', () => {
        expect(safeReturnUrl(null)).toBe('/');
        expect(safeReturnUrl(undefined)).toBe('/');
        expect(safeReturnUrl('')).toBe('/');
    });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

```bash
npx vitest run tests/safe-return-url.test.ts
```

Expected: FAIL — `Cannot find module '../lib/safe-return-url'`.

- [ ] **Step 3: 최소 구현**

Create `lib/safe-return-url.ts`:

```typescript
// 로그인·OAuth 후 되돌아갈 내부 경로만 통과시키는 판정.
//
// 예전에는 각 라우트가 rawReturnUrl.startsWith('/') 로만 걸렀다. 그런데
// "//evil.com" 은 슬래시로 시작하므로 이 검사를 통과하고, 이후
// new URL(returnUrl, request.url) 이 그것을 protocol-relative URL 로 읽어
// 호스트를 외부로 바꾼다. 즉 오픈 리디렉트가 그대로 열려 있었다.

/**
 * 내부 경로면 그대로, 아니면 '/' 를 돌려준다.
 * 반환값은 항상 '/' 로 시작하고 '//' 나 '/\' 로는 시작하지 않는다.
 */
export function safeReturnUrl(raw: string | null | undefined): string {
    if (!raw) return '/';

    // 첫 글자가 슬래시가 아니면 절대 URL 이거나 스킴이다.
    if (raw[0] !== '/') return '/';
    // 두 번째 글자가 슬래시나 역슬래시면 호스트가 붙는 형태다.
    if (raw[1] === '/' || raw[1] === '\\') return '/';

    return raw;
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx vitest run tests/safe-return-url.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 5: 시작 라우트에 적용**

`app/api/auth/google/route.ts`에 import를 추가한다(4행 아래).

```typescript
import { safeReturnUrl } from '@/lib/safe-return-url';
```

23행을 바꾼다.

기존:
```typescript
    // 오픈 리디렉트 방지: 내부 경로만 허용
    const returnUrl = rawReturnUrl.startsWith('/') ? rawReturnUrl : '/';
```

수정:
```typescript
    // 오픈 리디렉트 방지: 내부 경로만 허용 (//evil.com 형태 포함)
    const returnUrl = safeReturnUrl(rawReturnUrl);
```

- [ ] **Step 6: 콜백 라우트에 적용**

`app/api/auth/google/callback/route.ts`에 import를 추가한다(4행 아래).

```typescript
import { safeReturnUrl } from '@/lib/safe-return-url';
```

38행을 바꾼다.

기존:
```typescript
    const rawReturnUrl = state.returnUrl || '/';
    const returnUrl = rawReturnUrl.startsWith('/') ? rawReturnUrl : '/';
```

수정:
```typescript
    const returnUrl = safeReturnUrl(state.returnUrl);
```

- [ ] **Step 7: 타입체크와 전체 테스트**

```bash
npx tsc --noEmit && npm test
```

Expected: 타입 에러 0건. 테스트 통과 수가 Task 1 기준선보다 5 늘어난다.

- [ ] **Step 8: 커밋**

```bash
git add lib/safe-return-url.ts tests/safe-return-url.test.ts app/api/auth/google/route.ts app/api/auth/google/callback/route.ts
git commit -m "fix: reject protocol-relative return URLs in the Google OAuth flow"
```

---

## Task 3: OAuth 콜백에 관리자 인증 추가 (보고서 H-2)

콜백은 서비스 전역 Google 토큰을 저장하는 상태변경 엔드포인트인데 인증이 없다. nonce는 쿠키·state를 공격자가 자기 요청에 모두 세팅할 수 있어 직접 호출을 막지 못한다. 시작 라우트와 같은 `requireAdmin`을 건다.

**Files:**
- Modify: `app/api/auth/google/callback/route.ts:10-14`
- Test: `tests/api-google-callback-auth.test.ts` (신규)

**Interfaces:**
- Consumes: `requireAdmin(request)` → `SessionUser | NextResponse` (lib/authorization.ts)

- [ ] **Step 1: 실패하는 테스트 작성**

Create `tests/api-google-callback-auth.test.ts`:

```typescript
// OAuth 콜백이 서비스 Google 토큰을 저장하기 전에 관리자인지 확인하는지 본다.
//
// 콜백은 setGoogleToken 으로 서비스 전역 계정을 바꾼다. nonce 검증만으로는
// 직접 호출을 막지 못한다. 공격자는 자기 요청에 쿠키와 state 를 모두 세팅할
// 수 있기 때문이다. 그러면 공격자의 Google 계정으로 서비스가 바뀐다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const setGoogleToken = vi.fn();
vi.mock('../lib/service-settings', () => ({
    setGoogleToken: (...args: unknown[]) => setGoogleToken(...(args as [])),
}));

const exchangeCodeForToken = vi.fn();
vi.mock('../lib/google-auth', () => ({
    exchangeCodeForToken: (...args: unknown[]) => exchangeCodeForToken(...(args as [])),
}));

const requireAdmin = vi.fn();
vi.mock('../lib/authorization', () => ({
    requireAdmin: (...args: unknown[]) => requireAdmin(...(args as [])),
}));

const { GET } = await import('../app/api/auth/google/callback/route');

const NONCE = 'nonce_abc';

function callbackRequest(): NextRequest {
    const state = encodeURIComponent(JSON.stringify({ returnUrl: '/', projectId: '', nonce: NONCE }));
    const req = new NextRequest(`http://localhost/api/auth/google/callback?code=code_1&state=${state}`, {
        headers: { cookie: `google_oauth_nonce=${NONCE}` },
    });
    return req;
}

beforeEach(() => {
    requireAdmin.mockResolvedValue({ userId: 'admin_1', email: 'admin@ks-qfd.com', name: '관리자' });
    exchangeCodeForToken.mockResolvedValue({ accessToken: 'tok' });
    setGoogleToken.mockResolvedValue(undefined);
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('google callback 인증', () => {
    it('관리자가 아니면 토큰을 저장하지 않는다', async () => {
        requireAdmin.mockResolvedValue(
            NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
        );

        const res = await GET(callbackRequest());

        expect(res.status).toBe(403);
        expect(setGoogleToken).not.toHaveBeenCalled();
        expect(exchangeCodeForToken).not.toHaveBeenCalled();
    });

    it('관리자면 토큰을 저장한다', async () => {
        const res = await GET(callbackRequest());

        expect(setGoogleToken).toHaveBeenCalledTimes(1);
        expect(res.status).toBe(307);
    });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

```bash
npx vitest run tests/api-google-callback-auth.test.ts
```

Expected: FAIL. 첫 테스트에서 `setGoogleToken`이 호출돼 `expected "spy" not to be called`로 깨진다.

- [ ] **Step 3: 최소 수정**

`app/api/auth/google/callback/route.ts`에 import를 추가한다(4행 아래).

```typescript
import { requireAdmin } from '@/lib/authorization';
```

10-14행의 함수 시작부를 바꾼다.

기존:
```typescript
export async function GET(request: NextRequest) {
    const { searchParams, origin } = new URL(request.url);
    const code = searchParams.get('code');
```

수정:
```typescript
export async function GET(request: NextRequest) {
    // 이 콜백은 서비스 전역 Google 계정을 바꾼다. nonce 는 CSRF 방어일 뿐,
    // 공격자가 자기 쿠키와 state 를 함께 만들어 직접 호출하는 것은 막지 못한다.
    // 시작 라우트와 같은 관리자 게이트를 여기에도 건다.
    const adminResult = await requireAdmin(request);
    if (adminResult instanceof NextResponse) return adminResult;

    const { searchParams, origin } = new URL(request.url);
    const code = searchParams.get('code');
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx vitest run tests/api-google-callback-auth.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 5: 커밋**

```bash
git add tests/api-google-callback-auth.test.ts app/api/auth/google/callback/route.ts
git commit -m "fix: require admin auth on the Google OAuth callback"
```

---

## Task 4: 로그아웃이 세션을 무효화하도록 (보고서 H-7)

지금은 쿠키만 지운다. 유출된 쿠키는 로그아웃 후에도 `exp`(최대 7일)까지 유효하다. 비밀번호 변경·승인취소가 이미 쓰는 `sessionVersion` 증가를 로그아웃에도 적용한다.

**Files:**
- Modify: `app/api/auth/logout/route.ts` (전체)
- Test: `tests/api-logout-session.test.ts` (신규)

**Interfaces:**
- Consumes: `getSessionUser(request)` → `SessionUser | null` (lib/auth.ts). 쿠키만 검증하고 DB를 보지 않는 동기 함수다.

- [ ] **Step 1: 실패하는 테스트 작성**

Create `tests/api-logout-session.test.ts`:

```typescript
// 로그아웃이 이미 발급된 세션까지 끊는지 확인한다.
//
// 예전에는 클라이언트 쿠키만 지웠다. 그래서 쿠키가 유출·탈취된 경우
// 사용자가 로그아웃해도 만료 시각까지 그 쿠키가 계속 통했다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const updateUser = vi.fn();
vi.mock('../lib/prisma', () => ({
    prisma: { user: { update: updateUser } },
}));

const getSessionUser = vi.fn();
vi.mock('../lib/auth', () => ({
    getSessionUser: (...args: unknown[]) => getSessionUser(...(args as [])),
}));

const { POST } = await import('../app/api/auth/logout/route');

function logoutRequest(): NextRequest {
    return new NextRequest('http://localhost/api/auth/logout', { method: 'POST' });
}

beforeEach(() => {
    getSessionUser.mockReturnValue({ userId: 'user_7', email: 'u@x.com', name: '사용자' });
    updateUser.mockResolvedValue({ id: 'user_7' });
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('logout', () => {
    it('sessionVersion 을 올려 발급된 세션을 끊는다', async () => {
        const res = await POST(logoutRequest());

        expect(res.status).toBe(200);
        expect(updateUser).toHaveBeenCalledWith({
            where: { id: 'user_7' },
            data: { sessionVersion: { increment: 1 } },
        });
    });

    it('쿠키를 만료시킨다', async () => {
        const res = await POST(logoutRequest());

        expect(res.headers.get('set-cookie')).toContain('Max-Age=0');
    });

    it('세션이 없어도 200 으로 끝낸다', async () => {
        getSessionUser.mockReturnValue(null);

        const res = await POST(logoutRequest());

        expect(res.status).toBe(200);
        expect(updateUser).not.toHaveBeenCalled();
    });

    it('DB 갱신이 실패해도 쿠키는 지우고 200 을 준다', async () => {
        // 로그아웃이 서버 오류로 실패하면 사용자는 로그인 상태로 남는다.
        // 최소한 이 브라우저에서는 나가지도록 쿠키는 반드시 지운다.
        updateUser.mockRejectedValue(new Error('db down'));

        const res = await POST(logoutRequest());

        expect(res.status).toBe(200);
        expect(res.headers.get('set-cookie')).toContain('Max-Age=0');
    });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

```bash
npx vitest run tests/api-logout-session.test.ts
```

Expected: FAIL — 첫 테스트가 `expected "spy" to be called` 로 깨진다.

- [ ] **Step 3: 최소 구현**

`app/api/auth/logout/route.ts` 전체를 바꾼다.

```typescript
// 로그인 세션 쿠키를 만료시키고 발급된 세션을 무효화하는 로그아웃 API
import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME } from '../../../../lib/constants';
import { getSessionUser } from '../../../../lib/auth';
import { prisma } from '../../../../lib/prisma';
import { createLogger } from '../../../../lib/logger';

const log = createLogger('api/auth/logout');

export async function POST(request: NextRequest) {
    const response = NextResponse.json({ success: true });
    response.cookies.set(SESSION_COOKIE_NAME, '', {
        httpOnly: true,
        sameSite: 'strict',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 0,
        path: '/',
    });

    // 쿠키만 지우면 유출된 쿠키는 만료 시각까지 계속 통한다.
    // sessionVersion 을 올려 그 전에 발급된 쿠키를 전부 거부한다.
    const sessionUser = getSessionUser(request);
    if (sessionUser) {
        try {
            await prisma.user.update({
                where: { id: sessionUser.userId },
                data: { sessionVersion: { increment: 1 } },
            });
        } catch (error: unknown) {
            // 여기서 실패해도 쿠키는 이미 지웠다. 이 브라우저에서는 나간 상태다.
            log.error('로그아웃 세션 무효화 실패', error, { userId: sessionUser.userId });
        }
    }

    return response;
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx vitest run tests/api-logout-session.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 5: 로그아웃 호출부가 깨지지 않는지 확인**

`POST()`가 이제 인자를 받는다. Next.js 라우트 핸들러는 항상 request를 넘기므로 런타임 영향은 없지만 타입은 확인한다.

```bash
npx tsc --noEmit && npm test
```

Expected: 타입 에러 0건, 전체 테스트 통과.

- [ ] **Step 6: 커밋**

```bash
git add tests/api-logout-session.test.ts app/api/auth/logout/route.ts
git commit -m "fix: revoke issued sessions on logout"
```

---

## Task 5: 오류 메시지·PII 노출 차단 (보고서 H-11)

세 라우트가 `error.message`를 그대로 응답에 담고(XLSX·Prisma·Google 내부 문자열 유출), `lib/email.ts`와 설문 제출 라우트가 이메일·비밀 토큰을 로그에 남긴다. 후자는 `lib/logger.ts:8`의 명시적 금지 규칙 위반이다.

**Files:**
- Modify: `app/api/projects/[id]/kano/form-responses/route.ts:129-135`
- Modify: `app/api/projects/[id]/kano/create-form/route.ts:65-70`
- Modify: `app/api/projects/[id]/import/route.ts:351-358`
- Modify: `lib/email.ts:48,84,87`
- Modify: `app/api/survey/[token]/submit/route.ts:133`
- Test: `tests/api-error-exposure.test.ts` (신규)

**Interfaces:**
- Consumes: `toErrorResponse(error, { log, message, context? })` → `NextResponse` (500 + `{ error, referenceId }`), `createLogger(module)` (lib/logger.ts)

- [ ] **Step 1: 실패하는 테스트 작성**

Create `tests/api-error-exposure.test.ts`:

```typescript
// 내부 오류 문자열이 클라이언트 응답으로 새지 않는지 확인한다.
//
// Prisma·XLSX·Google 오류 메시지에는 테이블명·컬럼명·내부 경로가 들어간다.
// 사용자에게는 고정 문구와 상관 ID 만 준다(lib/api-error.ts).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const findRequirements = vi.fn();

vi.mock('../lib/prisma', () => ({
    prisma: {
        customerRequirement: { findMany: findRequirements },
        kanoSurveyInvitation: { findUnique: vi.fn(), create: vi.fn() },
        kanoResponse: { createMany: vi.fn() },
    },
}));

const requireProjectAccess = vi.fn();
vi.mock('../lib/authorization', () => ({
    requireProjectAccess: (...args: unknown[]) => requireProjectAccess(...(args as [])),
}));

vi.mock('../lib/service-settings', () => ({
    isGoogleConfigured: () => Promise.resolve(true),
    getGoogleToken: () => Promise.resolve({ accessToken: 'token_x' }),
}));

vi.mock('../lib/google-forms', () => ({
    getFormResponses: () => Promise.resolve({ responses: [] }),
}));

const { POST } = await import('../app/api/projects/[id]/kano/form-responses/route');

const SECRET_DETAIL = 'Invalid `prisma.kanoSurveyInvitation.create()` — column "invitedBy"';

beforeEach(() => {
    requireProjectAccess.mockResolvedValue({
        user: { userId: 'user_1', email: 'u@x.com', name: '사용자' },
        role: 'OWNER',
    });
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('form-responses 오류 응답', () => {
    it('내부 오류 문자열을 응답에 담지 않는다', async () => {
        findRequirements.mockRejectedValue(new Error(SECRET_DETAIL));

        const req = new NextRequest('http://localhost/api/projects/proj_1/kano/form-responses', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ formId: 'form_1' }),
        });
        const res = await POST(req, { params: Promise.resolve({ id: 'proj_1' }) });
        const body = await res.json();

        expect(res.status).toBe(500);
        expect(JSON.stringify(body)).not.toContain('prisma');
        expect(JSON.stringify(body)).not.toContain('invitedBy');
        expect(body.referenceId).toBeTruthy();
    });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

```bash
npx vitest run tests/api-error-exposure.test.ts
```

Expected: FAIL — 응답 본문에 `prisma`가 들어 있어 깨진다.

- [ ] **Step 3: form-responses 라우트 수정**

`app/api/projects/[id]/kano/form-responses/route.ts`에 import를 추가한다(8행 아래).

```typescript
import { toErrorResponse } from '@/lib/api-error';
```

129-135행을 바꾼다.

기존:
```typescript
    } catch (error: any) {
        log.error('Form responses import error:', error);
        return NextResponse.json(
            { error: `응답 가져오기 실패: ${error.message}` },
            { status: 500 }
        );
    }
```

수정:
```typescript
    } catch (error: unknown) {
        return toErrorResponse(error, {
            log,
            message: '응답 가져오기에 실패했습니다.',
            context: { projectId },
        });
    }
```

- [ ] **Step 4: create-form 라우트 수정**

`app/api/projects/[id]/kano/create-form/route.ts`의 65-70행 catch 블록을 같은 형태로 바꾼다. import 추가가 필요하면 파일 상단 import 목록 끝에 넣는다.

```typescript
import { toErrorResponse } from '@/lib/api-error';
```

```typescript
    } catch (error: unknown) {
        return toErrorResponse(error, {
            log,
            message: 'Google Form 생성에 실패했습니다.',
            context: { projectId },
        });
    }
```

- [ ] **Step 5: import 라우트 수정**

`app/api/projects/[id]/import/route.ts:351-358`의 최종 catch를 바꾼다. 이 파일은 검증 오류(400)를 별도로 다루므로 **그 분기는 그대로 두고** 마지막 500 경로만 교체한다.

```typescript
        return toErrorResponse(error, {
            log,
            message: '가져오기에 실패했습니다.',
            context: { projectId },
        });
```

- [ ] **Step 6: 이메일 모듈의 PII 로깅 제거**

`lib/email.ts`에 로거를 추가한다(4행 아래).

```typescript
import { createLogger } from './logger';

const log = createLogger('lib/email');
```

48행을 바꾼다.

기존:
```typescript
        console.log(`📧 [이메일 미설정] ${email}에게 설문 링크: ${surveyLink}`);
```

수정:
```typescript
        // 수신자 이메일과 설문 링크(비밀 토큰)는 기록하지 않는다. lib/logger.ts 규칙.
        log.warn('SMTP 미설정으로 설문 초대 메일을 보내지 못했습니다.');
```

84행과 87행의 `console.error`도 같은 방식으로 바꾼다. 실패 사유는 남기되 이메일 주소는 meta에 넣지 않는다.

```typescript
        log.error('설문 초대 메일 발송 실패', error);
```

- [ ] **Step 7: 설문 제출의 토큰 로깅 제거**

`app/api/survey/[token]/submit/route.ts:133`에서 `context: { token }`을 바꾼다. 토큰은 이 설문의 비밀 자격증명이라 로그에 남으면 안 된다.

기존:
```typescript
            context: { token },
```

수정:
```typescript
            // 토큰은 이 설문의 비밀 자격증명이라 기록하지 않는다.
            context: { invitationId: invitation?.id },
```

`invitation`이 catch 스코프에서 보이지 않으면, `try` 앞에 `let invitationId: string | undefined;`를 선언하고 조회 직후 대입한 뒤 `context: { invitationId }`로 쓴다.

- [ ] **Step 8: 남은 PII 로깅 확인**

```bash
npx vitest run tests/api-error-exposure.test.ts && npx tsc --noEmit && npm test
```

Expected: 신규 테스트 PASS, 타입 에러 0건, 전체 테스트 통과.

- [ ] **Step 9: 커밋**

```bash
git add tests/api-error-exposure.test.ts "app/api/projects/[id]/kano/form-responses/route.ts" "app/api/projects/[id]/kano/create-form/route.ts" "app/api/projects/[id]/import/route.ts" lib/email.ts "app/api/survey/[token]/submit/route.ts"
git commit -m "fix: stop leaking internal errors and PII through responses and logs"
```

---

## Task 6: import-json 검증과 캐스케이드 확인 (보고서 H-3)

이 라우트는 하드닝된 팩토리를 거치지 않는 유일한 대량삽입 경로다.

**먼저 이미 있는 것을 정확히 파악한다.** 이 라우트에는 `importHasAnyData`(빈 payload로 전체 삭제 방지)와 `importDeletionPlan`(payload에 실제로 든 컬렉션만 삭제)이 이미 있다. 따라서 "키가 없는 컬렉션까지 지운다"는 위험은 **이미 막혀 있다.** 남은 진짜 위험은 하나다 — payload에 `customerRequirements`가 **들어 있으면** `customerRequirement.deleteMany`가 돌고, 그 CASCADE로 설문 응답·벤치마크·QFD가 함께 사라지는데 **그 사실을 알리지 않는다.** excel import에는 있는 `confirmCascade` 확인이 여기엔 없다.

여기에 더해 zod 검증과 행수 상한이 없어 `{...r, projectId}` 스프레드로 `id`·`createdAt` 등을 클라이언트가 지정할 수 있다.

**구현 중 발견할 기존 버그:** 88행 `relationship: q.strength || q.relationship`은 존재하지 않는 컬럼에 넣는다. `QFDMatrix` 모델의 필드명은 `strength`다(schema.prisma:243). 즉 `qfdRelationships`가 든 payload는 지금도 실패한다. 스키마를 쓰면서 이 필드명을 `strength`로 바로잡는다.

**Files:**
- Modify: `app/api/projects/[id]/import-json/route.ts`
- Test: `tests/api-import-json-guards.test.ts` (신규)

**Interfaces:**
- Consumes: `countCascadeImpact(db, projectId, { replacesCustomerRequirements })` → `CascadeImpact`, `hasCascadeImpact(impact)` → `boolean`, `describeCascadeImpact(impact)` → `string` (lib/import-cascade-guard.ts). delegate 이름은 `kanoResponse`·`benchmark`·`qFDMatrix`다.

- [ ] **Step 1: 실패하는 테스트 작성**

Create `tests/api-import-json-guards.test.ts`:

```typescript
// JSON 복원이 말없이 연쇄 삭제를 실행하지 않는지 확인한다.
//
// payload 에 customerRequirements 만 있고 kanoResponses 키가 없으면
// 요구사항 deleteMany 가 CASCADE 로 설문 응답까지 지운다. excel import 에는
// confirmCascade 확인이 있는데 이 경로에는 없었다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const countKanoResponse = vi.fn();
const countBenchmark = vi.fn();
const countQfd = vi.fn();
const transaction = vi.fn();

vi.mock('../lib/prisma', () => ({
    prisma: {
        kanoResponse: { count: countKanoResponse },
        benchmark: { count: countBenchmark },
        qFDMatrix: { count: countQfd },
        $transaction: (...args: unknown[]) => transaction(...(args as [])),
    },
}));

const requireProjectAccess = vi.fn();
vi.mock('../lib/authorization', () => ({
    requireProjectAccess: (...args: unknown[]) => requireProjectAccess(...(args as [])),
}));

const { POST } = await import('../app/api/projects/[id]/import-json/route');

const params = Promise.resolve({ id: 'proj_1' });

function jsonRequest(body: unknown): NextRequest {
    return new NextRequest('http://localhost/api/projects/proj_1/import-json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

beforeEach(() => {
    requireProjectAccess.mockResolvedValue({
        user: { userId: 'user_1', email: 'u@x.com', name: '사용자' },
        role: 'OWNER',
    });
    countKanoResponse.mockResolvedValue(0);
    countBenchmark.mockResolvedValue(0);
    countQfd.mockResolvedValue(0);
    transaction.mockResolvedValue(undefined);
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('import-json 가드', () => {
    it('설문 응답이 지워질 상황이면 409 로 막고 건수를 알려준다', async () => {
        countKanoResponse.mockResolvedValue(42);

        const res = await POST(
            jsonRequest({ customerRequirements: [{ category: 'A', requirement: 'x', order: 0 }] }),
            { params }
        );
        const body = await res.json();

        expect(res.status).toBe(409);
        expect(body.needsCascadeConfirm).toBe(true);
        expect(body.error).toContain('42');
        expect(transaction).not.toHaveBeenCalled();
    });

    it('confirmCascade 가 오면 진행한다', async () => {
        countKanoResponse.mockResolvedValue(42);

        const res = await POST(
            jsonRequest({
                confirmCascade: true,
                customerRequirements: [{ category: 'A', requirement: 'x', order: 0 }],
            }),
            { params }
        );

        expect(res.status).toBe(200);
        expect(transaction).toHaveBeenCalledTimes(1);
    });

    it('알 수 없는 필드를 저장하지 않는다', async () => {
        const res = await POST(
            jsonRequest({
                customerRequirements: [
                    { category: 'A', requirement: 'x', order: 0, id: 'evil', createdAt: '1999-01-01' },
                ],
            }),
            { params }
        );

        expect(res.status).toBe(400);
        expect(transaction).not.toHaveBeenCalled();
    });

    it('행이 너무 많으면 400 으로 막는다', async () => {
        const rows = Array.from({ length: 2001 }, (_, i) => ({
            category: 'A',
            requirement: `요구 ${i}`,
            order: i,
        }));

        const res = await POST(jsonRequest({ customerRequirements: rows }), { params });

        expect(res.status).toBe(400);
        expect(transaction).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

```bash
npx vitest run tests/api-import-json-guards.test.ts
```

Expected: FAIL — 첫 테스트가 409 대신 200을 받는다.

- [ ] **Step 3: 검증 스키마 추가**

Create `lib/import-json-schema.ts`. 라우트 파일에 두지 않는 이유는 스키마만 단위 테스트하기 위해서다.

컬렉션 7개와 `project`·`version`이 전부다(라우트 55~113행에서 확인). **하나라도 빠뜨리면 그 컬렉션의 복원이 조용히 사라지므로** 목록을 그대로 옮긴다.

```typescript
// JSON 복원 payload 의 화이트리스트 스키마.
//
// 예전에는 검증 없이 {...r, projectId} 로 펼쳐 넣어서 id·createdAt 같은
// 컬럼을 클라이언트가 지정할 수 있었고, 배열 길이 상한도 없었다.
import { z } from 'zod';

/** 한 컬렉션에 한 번에 넣을 수 있는 행수 상한. */
export const MAX_IMPORT_ROWS = 2000;

const rows = <T extends z.ZodTypeAny>(schema: T) => z.array(schema).max(MAX_IMPORT_ROWS);

const requirementRow = z.object({
    category: z.string(),
    subcategory: z.string().nullable().optional(),
    requirement: z.string(),
    kanoPositiveQ: z.string().nullable().optional(),
    kanoNegativeQ: z.string().nullable().optional(),
    kanoWeight: z.number().nullable().optional(),
    order: z.number().default(0),
}).strict();

const technicalRow = z.object({
    name: z.string(),
    unit: z.string().nullable().optional(),
    targetValue: z.string().nullable().optional(),
}).strict();

const specRow = z.object({
    level: z.string(),
    parentId: z.string().nullable().optional(),
    name: z.string(),
    technology: z.string().nullable().optional(),
    order: z.number().default(0),
}).strict();

const attributeRow = z.object({
    productName: z.string().nullable().optional(),
    customerName: z.string().nullable().optional(),
    marketSegment: z.string().nullable().optional(),
    customerNeed: z.string().nullable().optional(),
    benefit: z.string().nullable().optional(),
    attribute: z.string().nullable().optional(),
    techCapability: z.string().nullable().optional(),
    order: z.number().default(0),
}).strict();

const fitnessRow = z.object({
    attributeId: z.string(),
    importance: z.number().default(0),
    currentLevel: z.number().default(0),
    targetLevel: z.number().default(0),
    note: z.string().nullable().optional(),
}).strict();

// strength 가 실제 컬럼명이다. 라우트가 relationship 으로 넣고 있어 지금도 실패한다.
const qfdRow = z.object({
    requirementId: z.string(),
    technicalCharId: z.string(),
    strength: z.string(),
    currentScore: z.number().nullable().optional(),
    competitorScore: z.number().nullable().optional(),
}).strict();

const kanoRow = z.object({
    requirementId: z.string(),
    invitationId: z.string(),
    respondentEmail: z.string(),
    positiveAnswer: z.number(),
    negativeAnswer: z.number(),
    kanoCategory: z.string(),
}).strict();

export const importJsonSchema = z.object({
    version: z.union([z.string(), z.number()]),
    confirmCascade: z.boolean().optional(),
    project: z.object({
        description: z.string().nullable().optional(),
        detailedDescription: z.string().nullable().optional(),
    }).strict().optional(),
    customerRequirements: rows(requirementRow).optional(),
    technicalCharacteristics: rows(technicalRow).optional(),
    specFunctions: rows(specRow).optional(),
    productAttributes: rows(attributeRow).optional(),
    attributeFitnesses: rows(fitnessRow).optional(),
    qfdRelationships: rows(qfdRow).optional(),
    kanoResponses: rows(kanoRow).optional(),
}).strict();

export type ImportJsonPayload = z.infer<typeof importJsonSchema>;
```

**주의:** 기존 payload에는 각 행에 `id`가 들어 있을 수 있다(export가 그렇게 내보낸다면). `.strict()`가 그것을 거부하면 기존 백업 파일이 복원되지 않는다. Step 4에서 실제 export 출력으로 확인한다.

- [ ] **Step 4: export 출력과 스키마가 맞는지 확인**

`.strict()`가 기존 백업 파일을 거부하면 복원 기능이 망가진다. export 라우트가 실제로 무엇을 내보내는지 본다.

```bash
grep -n "select\|include\|customerRequirements\|qfdRelationships" "app/api/projects/[id]/export/route.ts" | head -30
```

각 행에 `id`·`createdAt`·`projectId`가 포함돼 나간다면 스키마에 그 세 필드를 `.optional()`로 받아들이되 **저장할 때는 무시**하도록 Step 5에서 처리한다. `.strict()`를 풀지는 않는다.

- [ ] **Step 5: 파싱과 캐스케이드 확인 삽입**

18행의 `const importData = await request.json()`부터 33행 `importHasAnyData` 블록까지를 바꾼다. `version` 검사와 `importHasAnyData`는 스키마가 대신하므로 함께 정리한다.

```typescript
        const parsed = importJsonSchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json(
                { error: `가져오기 형식이 올바르지 않습니다. ${parsed.error.errors[0].path.join('.')}` },
                { status: 400 }
            );
        }
        const importData = parsed.data;

        // 빈 payload 로 전체를 지우는 것을 막는다(기존 importHasAnyData 와 같은 목적).
        if (!importHasAnyData(importData)) {
            return NextResponse.json(
                { error: '가져올 데이터가 없습니다.' },
                { status: 400 }
            );
        }

        // 고객요구사항을 덮어쓰면 설문 응답·벤치마크·QFD 가 CASCADE 로 함께 사라진다.
        // 재수집이 불가능한 데이터라 건수를 세어 확인을 받는다.
        const impact = await countCascadeImpact(prisma, projectId, {
            replacesCustomerRequirements: Array.isArray(importData.customerRequirements),
        });
        if (hasCascadeImpact(impact) && importData.confirmCascade !== true) {
            return NextResponse.json(
                {
                    error: describeCascadeImpact(impact),
                    needsCascadeConfirm: true,
                    impact,
                },
                { status: 409 }
            );
        }
```

import를 추가한다.

```typescript
import { importJsonSchema } from '@/lib/import-json-schema';
import {
    countCascadeImpact,
    describeCascadeImpact,
    hasCascadeImpact,
} from '@/lib/import-cascade-guard';
```

- [ ] **Step 6: 스프레드 제거**

55~102행의 `createMany` 7곳에서 `{...r, projectId}` 스프레드를 명시적 매핑으로 바꾼다. 스키마가 이미 걸렀지만, 스프레드를 남겨 두면 스키마에 필드를 추가하는 순간 다시 새어 나간다.

```typescript
            if (importData.customerRequirements?.length) {
                await tx.customerRequirement.createMany({
                    data: importData.customerRequirements.map((r) => ({
                        id: generateId('req'),
                        projectId,
                        category: r.category,
                        subcategory: r.subcategory ?? null,
                        requirement: r.requirement,
                        kanoPositiveQ: r.kanoPositiveQ ?? null,
                        kanoNegativeQ: r.kanoNegativeQ ?? null,
                        kanoWeight: r.kanoWeight ?? null,
                        order: r.order,
                    })),
                });
            }
```

나머지 6개 컬렉션도 같은 형태로 바꾼다. `generateId`를 import한다.

```typescript
import { generateId } from '@/lib/id';
```

**qfdRelationships는 필드명을 바로잡는다.** 기존 88행 `relationship: q.strength || q.relationship`은 존재하지 않는 컬럼이라 지금도 실패한다.

```typescript
            if (importData.qfdRelationships?.length) {
                await tx.qFDMatrix.createMany({
                    data: importData.qfdRelationships.map((q) => ({
                        id: generateId('qfd'),
                        projectId,
                        requirementId: q.requirementId,
                        technicalCharId: q.technicalCharId,
                        // 컬럼명은 strength 다. 예전에는 relationship 으로 넣어 항상 실패했다.
                        strength: q.strength,
                        currentScore: q.currentScore ?? null,
                        competitorScore: q.competitorScore ?? null,
                    })),
                });
            }
```

`kanoResponses`의 legacy 폴백(97~99행 `functionalAnswer`·`dysfunctionalAnswer`)은 스키마가 `positiveAnswer`·`negativeAnswer`를 필수로 요구하므로 함께 제거한다. 옛 형식 파일을 계속 받아야 한다면 스키마에 `.transform()`으로 옮긴다.

`tx: any`도 이 기회에 타입을 지운다(`async (tx) =>`).

- [ ] **Step 7: 테스트 통과 확인**

```bash
npx vitest run tests/api-import-json-guards.test.ts && npx tsc --noEmit && npm test
```

Expected: 신규 4건 PASS, 전체 통과. **기존 `tests/import-json-plan.test.ts`가 깨지면** 스키마가 그 테스트의 payload 형태를 거부한 것이다. 스키마를 payload에 맞추고(테스트를 고치지 말고) 다시 돌린다.

- [ ] **Step 8: 커밋**

```bash
git add lib/import-json-schema.ts tests/api-import-json-guards.test.ts "app/api/projects/[id]/import-json/route.ts"
git commit -m "fix: validate and confirm cascading deletes in the JSON import route"
```

---

## Task 7: 워크시트 대량저장의 캐스케이드 경고 (보고서 H-4)

두 라우트가 하위 데이터를 조용히 연쇄 삭제한다. `requirements`는 클라이언트가 id 없는 행만 보내면 전량 삭제로 떨어지고, `attributes`는 빈 배열 POST 한 번에 적합도 워크시트까지 지운다. Task 6에서 쓴 것과 같은 confirm 흐름을 적용한다.

**Files:**
- Modify: `app/api/projects/[id]/requirements/route.ts:75-84`
- Modify: `app/api/projects/[id]/attributes/route.ts:65-85`
- Modify: `lib/import-cascade-guard.ts` (attributes용 카운터 추가)
- Test: `tests/api-worksheet-cascade.test.ts` (신규)

**Interfaces:**
- Produces: `countAttributeCascadeImpact(db, projectId)` → `{ fitnesses: number }`, `describeAttributeCascadeImpact(impact)` → `string`

- [ ] **Step 1: 실패하는 테스트 작성**

Create `tests/api-worksheet-cascade.test.ts`:

```typescript
// 워크시트 대량저장이 하위 데이터를 말없이 지우지 않는지 확인한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const countKanoResponse = vi.fn();
const countBenchmark = vi.fn();
const countQfd = vi.fn();
const countFitness = vi.fn();
const findProject = vi.fn();
const transaction = vi.fn();

vi.mock('../lib/prisma', () => ({
    prisma: {
        kanoResponse: { count: countKanoResponse },
        benchmark: { count: countBenchmark },
        qFDMatrix: { count: countQfd },
        attributeFitness: { count: countFitness },
        project: { findUnique: findProject },
        $transaction: (...args: unknown[]) => transaction(...(args as [])),
    },
}));

const requireProjectAccess = vi.fn();
vi.mock('../lib/authorization', () => ({
    requireProjectAccess: (...args: unknown[]) => requireProjectAccess(...(args as [])),
}));

const { POST: saveRequirements } = await import('../app/api/projects/[id]/requirements/route');
const { POST: saveAttributes } = await import('../app/api/projects/[id]/attributes/route');

const params = Promise.resolve({ id: 'proj_1' });

function postRequest(path: string, body: unknown): NextRequest {
    return new NextRequest(`http://localhost/api/projects/proj_1/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

beforeEach(() => {
    requireProjectAccess.mockResolvedValue({
        user: { userId: 'user_1', email: 'u@x.com', name: '사용자' },
        role: 'OWNER',
    });
    countKanoResponse.mockResolvedValue(0);
    countBenchmark.mockResolvedValue(0);
    countQfd.mockResolvedValue(0);
    countFitness.mockResolvedValue(0);
    findProject.mockResolvedValue({ id: 'proj_1' });
    transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        if (typeof fn !== 'function') return undefined;
        return fn({
            customerRequirement: {
                deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
                updateMany: vi.fn().mockResolvedValue({ count: 1 }),
                create: vi.fn().mockResolvedValue({}),
                findMany: vi.fn().mockResolvedValue([]),
            },
            productAttribute: {
                deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
                createMany: vi.fn().mockResolvedValue({ count: 0 }),
                findMany: vi.fn().mockResolvedValue([]),
            },
        });
    });
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('requirements 저장 캐스케이드', () => {
    it('id 없는 행만 보내 전량 삭제가 되는데 응답이 있으면 409 로 막는다', async () => {
        countKanoResponse.mockResolvedValue(17);

        const res = await saveRequirements(
            postRequest('requirements', {
                requirements: [{ category: 'A', requirement: 'x', order: 0 }],
            }),
            { params }
        );
        const body = await res.json();

        expect(res.status).toBe(409);
        expect(body.needsCascadeConfirm).toBe(true);
        expect(body.error).toContain('17');
    });

    it('id 를 유지한 정상 편집은 그대로 통과한다', async () => {
        countKanoResponse.mockResolvedValue(17);

        const res = await saveRequirements(
            postRequest('requirements', {
                requirements: [{ id: 'req_1', category: 'A', requirement: 'x', order: 0 }],
            }),
            { params }
        );

        expect(res.status).toBe(200);
    });
});

describe('attributes 저장 캐스케이드', () => {
    it('빈 배열로 전량 삭제할 때 적합도가 있으면 409 로 막는다', async () => {
        countFitness.mockResolvedValue(9);

        const res = await saveAttributes(postRequest('attributes', { attributes: [] }), { params });
        const body = await res.json();

        expect(res.status).toBe(409);
        expect(body.needsCascadeConfirm).toBe(true);
        expect(body.error).toContain('9');
    });

    it('confirmCascade 가 오면 진행한다', async () => {
        countFitness.mockResolvedValue(9);

        const res = await saveAttributes(
            postRequest('attributes', { attributes: [], confirmCascade: true }),
            { params }
        );

        expect(res.status).toBe(200);
    });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

```bash
npx vitest run tests/api-worksheet-cascade.test.ts
```

Expected: FAIL — 409를 기대한 두 테스트가 200을 받는다.

- [ ] **Step 3: 속성용 카운터를 가드 모듈에 추가**

`lib/import-cascade-guard.ts` 끝에 덧붙인다.

```typescript
// ─── 제품 속성 ──────────────────────────────────────────────────
//
// ProductAttribute 삭제는 AttributeFitness 를 캐스케이드로 함께 지운다
// (schema.prisma: onDelete: Cascade). 속성 시트를 비우면 적합도 시트가
// 통째로 사라지는데, 응답에도 화면에도 그 사실이 드러나지 않았다.

export interface AttributeCascadeImpact {
    fitnesses: number;
}

export interface AttributeCascadeCounter {
    attributeFitness: { count: (args: { where: { projectId: string } }) => Promise<number> };
}

export async function countAttributeCascadeImpact(
    db: AttributeCascadeCounter,
    projectId: string
): Promise<AttributeCascadeImpact> {
    const fitnesses = await db.attributeFitness.count({ where: { projectId } });
    return { fitnesses };
}

export function describeAttributeCascadeImpact(impact: AttributeCascadeImpact): string {
    if (impact.fitnesses === 0) return '';
    return `제품 속성을 모두 지우면 적합도 ${impact.fitnesses}건이 함께 삭제됩니다.`;
}
```

- [ ] **Step 4: requirements 라우트에 가드 삽입**

`app/api/projects/[id]/requirements/route.ts`에서 `bulkRequirementsSchema.parse(body)` 다음, `$transaction` 앞에 넣는다. 이 라우트는 `const body = await request.json()`로 원본을 이미 갖고 있으므로 `body?.confirmCascade`를 그대로 읽을 수 있다.

```typescript
        const submittedIds = requirements
            .map((req) => req.id)
            .filter((id): id is string => Boolean(id));

        // id 없는 행만 오면 deleteMany 가 프로젝트 전체를 지우고,
        // 그 캐스케이드로 설문 응답까지 사라진다. .min(1) 은 빈 배열만 막는다.
        if (submittedIds.length === 0) {
            const impact = await countCascadeImpact(prisma, projectId, {
                replacesCustomerRequirements: true,
            });
            if (hasCascadeImpact(impact) && body?.confirmCascade !== true) {
                return NextResponse.json(
                    {
                        error: describeCascadeImpact(impact),
                        needsCascadeConfirm: true,
                        impact,
                    },
                    { status: 409 }
                );
            }
        }
```

트랜잭션 안의 기존 `submittedIds` 계산은 중복이므로 위에서 계산한 값을 쓰도록 지운다. import를 추가한다.

```typescript
import {
    countCascadeImpact,
    describeCascadeImpact,
    hasCascadeImpact,
} from '@/lib/import-cascade-guard';
```

- [ ] **Step 5: attributes 라우트에 가드 삽입**

`app/api/projects/[id]/attributes/route.ts:65`는 `attributesBodySchema.parse(await request.json())`로 **본문을 한 번만 읽고 바로 파싱한다.** 이 스키마는 `z.object({ attributes: ... })`이고 `.strict()`가 아니라(lib/bulk-save-schemas.ts:98) 모르는 키를 **조용히 버린다.** 그대로 두면 `confirmCascade`가 사라져 확인이 영원히 통과하지 못한다. 본문을 먼저 변수에 담는다.

65행을 바꾼다.

기존:
```typescript
        const { attributes: newAttributes } = attributesBodySchema.parse(await request.json());
```

수정:
```typescript
        // 스키마가 strict 가 아니라 모르는 키를 버린다. confirmCascade 를 살리려면
        // 원본 본문을 따로 들고 있어야 한다.
        const rawBody = await request.json();
        const { attributes: newAttributes } = attributesBodySchema.parse(rawBody);
```

그 다음, `$transaction` 앞에 넣는다.

```typescript
        // 속성을 비우면 적합도 시트가 캐스케이드로 함께 사라진다.
        if (newAttributes.length === 0) {
            const impact = await countAttributeCascadeImpact(prisma, projectId);
            if (impact.fitnesses > 0 && rawBody?.confirmCascade !== true) {
                return NextResponse.json(
                    {
                        error: describeAttributeCascadeImpact(impact),
                        needsCascadeConfirm: true,
                        impact,
                    },
                    { status: 409 }
                );
            }
        }
```

```typescript
import {
    countAttributeCascadeImpact,
    describeAttributeCascadeImpact,
} from '@/lib/import-cascade-guard';
```

- [ ] **Step 6: 테스트 통과 확인**

```bash
npx vitest run tests/api-worksheet-cascade.test.ts && npx tsc --noEmit && npm test
```

Expected: 신규 4건 PASS, 전체 통과.

- [ ] **Step 7: 커밋**

```bash
git add tests/api-worksheet-cascade.test.ts lib/import-cascade-guard.ts "app/api/projects/[id]/requirements/route.ts" "app/api/projects/[id]/attributes/route.ts"
git commit -m "fix: confirm cascading deletes before wiping worksheet rows"
```

---

## Task 8: 의존성 취약점 패치 (보고서 H-8)

프로덕션 의존성에 high 12건이 있다. `next`(요청 스머글링·미들웨어 우회)와 `nodemailer`(SMTP 명령 주입) 둘 다 인증·메일 경로에 직접 닿는다. semver 호환 범위라 무중단으로 올라간다.

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: 현재 취약점 확인**

```bash
npm audit --omit=dev
```

Expected: 14건(high 12, moderate 2). 실제 숫자를 기록해 둔다.

- [ ] **Step 2: 무중단 패치 적용**

`--force`는 절대 쓰지 않는다. exceljs를 3.4.0으로, prisma를 6.12.0으로 다운그레이드해 버린다.

```bash
npm audit fix
```

- [ ] **Step 3: 무엇이 바뀌었는지 확인**

```bash
git diff --stat package.json package-lock.json && npm ls next prisma nodemailer
```

Expected: `next 15.5.12 → 15.5.23`, `prisma 6.19.2 → 6.19.3` 등 마이너·패치 상승만.

- [ ] **Step 4: 전체 검증**

```bash
npx prisma generate && npx tsc --noEmit && npm test && npm run build
```

Expected: 타입 에러 0건, 테스트 전량 통과, 빌드 성공. **빌드까지 도는지 반드시 확인한다** — next 버전 상승은 빌드에서만 드러나는 문제를 낼 수 있다.

- [ ] **Step 5: nodemailer 타입 정렬**

런타임은 v8인데 타입은 v6다(보고서 Medium). 타입이 실제와 다르게 서술할 수 있다.

```bash
npm install -D @types/nodemailer@^8
npx tsc --noEmit
```

타입 에러가 새로 나오면 그것이 **v6 타입이 감추고 있던 실제 불일치**다. `lib/email.ts`에서 해당 지점을 고친다.

- [ ] **Step 6: 잔여 취약점 기록**

```bash
npm audit --omit=dev
```

`uuid <11.1.1`(exceljs 경유)은 비파괴 수정이 불가능하다. 남은 건수를 확인하고 넘어간다.

- [ ] **Step 7: 커밋**

```bash
git add package.json package-lock.json lib/email.ts
git commit -m "chore: patch production dependency vulnerabilities"
```

---

## Task 9: FK·캐스케이드 실측 통합 테스트 (보고서 H-6)

이번 검진의 핵심 교훈이다. **테스트 437개가 전부 통과하는데 Task 1의 FK 버그가 살아 있었던 이유는 Prisma를 전면 mock해서 FK가 한 번도 실제로 실행되지 않기 때문이다.** mock 테스트를 아무리 늘려도 이 부류는 못 잡는다. 실DB에 붙는 테스트를 최소한으로 만든다.

**Files:**
- Create: `tests/integration/db-cascade.integration.test.ts`
- Modify: `vitest.config.ts` (통합 테스트 분리)
- Modify: `package.json` (`test:integration` 스크립트)

**Interfaces:**
- Consumes: 실제 `prisma` 클라이언트. `POSTGRES_PRISMA_URL`이 가리키는 **테스트 전용 DB**를 쓴다.

- [ ] **Step 1: 통합 테스트를 기본 실행에서 분리**

`vitest.config.ts`의 `exclude`에 통합 테스트를 넣어 `npm test`가 DB 없이 계속 돌게 한다.

```typescript
        exclude: ['**/node_modules/**', '**/tests/integration/**'],
```

`package.json`에 스크립트를 추가한다.

```json
        "test:integration": "vitest run tests/integration --pool=threads"
```

- [ ] **Step 2: 실패하는 통합 테스트 작성**

Create `tests/integration/db-cascade.integration.test.ts`:

```typescript
// 스키마의 FK 와 캐스케이드가 실제로 어떻게 동작하는지 실DB 로 확인한다.
//
// 단위 테스트는 Prisma 를 mock 하므로 FK 위반·캐스케이드·RESTRICT 가
// 한 번도 실행되지 않는다. 그래서 'system' 같은 존재하지 않는 사용자 ID 를
// invitedBy 에 넣는 버그가 437개 테스트를 모두 통과한 채로 살아 있었다.
//
// 이 파일은 POSTGRES_PRISMA_URL 이 가리키는 DB 에 실제로 쓴다.
// 반드시 테스트 전용 DB 를 가리키게 한 뒤 실행한다.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

let userId: string;
let projectId: string;

beforeAll(async () => {
    const user = await prisma.user.create({
        data: {
            id: `itest_user_${Date.now()}`,
            email: `itest_${Date.now()}@example.com`,
            passwordHash: 'x',
            status: 'APPROVED',
        },
    });
    userId = user.id;
});

afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
});

afterEach(async () => {
    await prisma.project.deleteMany({ where: { ownerId: userId } });
});

async function makeProject(): Promise<string> {
    const project = await prisma.project.create({
        data: { id: `itest_proj_${Date.now()}_${Math.random()}`, name: 'itest', ownerId: userId },
    });
    projectId = project.id;
    return project.id;
}

describe('FK 와 캐스케이드 실측', () => {
    it("존재하지 않는 사용자 ID 로 초대를 만들 수 없다", async () => {
        const pid = await makeProject();

        await expect(
            prisma.kanoSurveyInvitation.create({
                data: {
                    id: `itest_inv_${Date.now()}`,
                    projectId: pid,
                    email: 'x@example.com',
                    token: `itest_${Date.now()}`,
                    invitedBy: 'system',
                    expiresAt: new Date(Date.now() + 86400000),
                },
            })
        ).rejects.toMatchObject({ code: 'P2003' });
    });

    it('실재하는 사용자 ID 로는 초대를 만들 수 있다', async () => {
        const pid = await makeProject();

        const invitation = await prisma.kanoSurveyInvitation.create({
            data: {
                id: `itest_inv_ok_${Date.now()}`,
                projectId: pid,
                email: 'ok@example.com',
                token: `itest_ok_${Date.now()}`,
                invitedBy: userId,
                expiresAt: new Date(Date.now() + 86400000),
            },
        });

        expect(invitation.invitedBy).toBe(userId);
    });

    it('요구사항을 지우면 Kano 응답이 함께 사라진다', async () => {
        const pid = await makeProject();

        const req = await prisma.customerRequirement.create({
            data: { id: `itest_req_${Date.now()}`, projectId: pid, category: 'A', requirement: 'x', order: 0 },
        });
        const inv = await prisma.kanoSurveyInvitation.create({
            data: {
                id: `itest_inv_c_${Date.now()}`,
                projectId: pid,
                email: 'c@example.com',
                token: `itest_c_${Date.now()}`,
                invitedBy: userId,
                expiresAt: new Date(Date.now() + 86400000),
            },
        });
        await prisma.kanoResponse.create({
            data: {
                id: `itest_res_${Date.now()}`,
                projectId: pid,
                requirementId: req.id,
                invitationId: inv.id,
                respondentEmail: 'c@example.com',
                positiveAnswer: 1,
                negativeAnswer: 5,
                kanoCategory: 'A',
            },
        });

        await prisma.customerRequirement.delete({ where: { id: req.id } });

        const remaining = await prisma.kanoResponse.count({ where: { projectId: pid } });
        expect(remaining).toBe(0);
    });

    it('속성을 지우면 적합도가 함께 사라진다', async () => {
        const pid = await makeProject();

        const attr = await prisma.productAttribute.create({
            data: { id: `itest_attr_${Date.now()}`, projectId: pid, order: 0 },
        });
        await prisma.attributeFitness.create({
            data: { id: `itest_fit_${Date.now()}`, projectId: pid, attributeId: attr.id },
        });

        await prisma.productAttribute.delete({ where: { id: attr.id } });

        const remaining = await prisma.attributeFitness.count({ where: { projectId: pid } });
        expect(remaining).toBe(0);
    });

    it('응답이 있는 프로젝트도 삭제할 수 있다', async () => {
        // kano_responses.invitationId 가 RESTRICT 라, 프로젝트 삭제 캐스케이드가
        // invitations 에 먼저 닿으면 P2003 으로 삭제 자체가 실패할 수 있다.
        const pid = await makeProject();

        const req = await prisma.customerRequirement.create({
            data: { id: `itest_req_d_${Date.now()}`, projectId: pid, category: 'A', requirement: 'x', order: 0 },
        });
        const inv = await prisma.kanoSurveyInvitation.create({
            data: {
                id: `itest_inv_d_${Date.now()}`,
                projectId: pid,
                email: 'd@example.com',
                token: `itest_d_${Date.now()}`,
                invitedBy: userId,
                expiresAt: new Date(Date.now() + 86400000),
            },
        });
        await prisma.kanoResponse.create({
            data: {
                id: `itest_res_d_${Date.now()}`,
                projectId: pid,
                requirementId: req.id,
                invitationId: inv.id,
                respondentEmail: 'd@example.com',
                positiveAnswer: 1,
                negativeAnswer: 5,
                kanoCategory: 'A',
            },
        });

        await expect(prisma.project.delete({ where: { id: pid } })).resolves.toBeTruthy();
    });
});
```

- [ ] **Step 3: 테스트 DB 준비 후 실행**

`.env`의 `POSTGRES_PRISMA_URL`이 **개발 DB가 아닌 테스트 DB**를 가리키는지 확인한 뒤 실행한다. 이 테스트는 실제로 행을 만들고 지운다.

```bash
npm run test:integration
```

Expected: 5건 중 최소 1건이 FAIL하거나 PASS한다. **어느 쪽이든 정보다.**
- `'system'` FK 테스트가 PASS → Task 1의 수정이 옳았음이 실측으로 확정된다.
- 마지막 프로젝트 삭제 테스트가 FAIL(P2003) → 보고서가 지적한 FK 다이아몬드가 실재한다. Step 4로 간다.
- 마지막 테스트가 PASS → 다이아몬드는 문제가 아니다. Step 4를 건너뛴다.

- [ ] **Step 4: 다이아몬드가 실재하면 스키마 수정**

마지막 테스트가 P2003으로 실패한 경우에만 한다. `prisma/schema.prisma`의 `KanoResponse.invitation` 관계에 캐스케이드를 준다.

```prisma
  invitation      KanoSurveyInvitation @relation(fields: [invitationId], references: [id], onDelete: Cascade)
```

마이그레이션을 만든다.

```bash
npx prisma migrate dev --name cascade_kano_response_invitation
```

`npm run test:integration`을 다시 돌려 전부 통과하는지 본다.

- [ ] **Step 5: 기본 테스트가 여전히 DB 없이 도는지 확인**

```bash
npm test
```

Expected: 통합 테스트가 제외되어 기존과 같이 통과한다.

- [ ] **Step 6: 커밋**

```bash
git add tests/integration vitest.config.ts package.json
git commit -m "test: add integration tests that exercise real FK and cascade behavior"
```

Step 4를 수행했다면 스키마와 마이그레이션도 함께 커밋한다.

---

## Task 10: 최종 검증

**Files:** 없음 (검증만)

- [ ] **Step 1: 전체 게이트 통과 확인**

```bash
npx prisma generate && npm run lint && npx tsc --noEmit && npm test && npm run build
```

Expected: 전부 성공. 테스트 수가 기준선 437개에서 신규 테스트만큼 늘어 있다.

- [ ] **Step 2: 통합 테스트 확인**

```bash
npm run test:integration
```

Expected: 5건 전부 통과.

- [ ] **Step 3: 조치 결과를 보고서에 반영**

`docs/2026-08-20-code-health-check.md` 각 항목에 처리 상태를 적는다. 코드로 고치지 않고 남긴 것(C-1, H-5 동시성, H-10 자기호출, Medium·Low 전반)은 **왜 남겼는지**와 함께 적는다.

- [ ] **Step 4: 푸시**

```bash
git add docs/2026-08-20-code-health-check.md
git commit -m "docs: record remediation status in the health check report"
git push
```

---

## 이 계획에서 의도적으로 뺀 것

**C-1 저장소 공개 범위·히스토리** — 계정 설정 변경과 force push는 되돌릴 수 없고 협업자에게 영향을 준다. 사용자가 직접 판단해야 한다. 계획 상단에 명령어를 적어 두었다.

**H-5 동시 저장 낙관적 잠금** — 영향 라우트가 18곳이고 스키마 변경(version 컬럼)과 클라이언트 충돌 처리 UX가 함께 필요하다. 이 계획에 넣으면 다른 Task가 다 묻힌다. PostgreSQL 마이그레이션 계획서가 이미 유예 항목으로 기록해 둔 사안이라 **별도 계획**으로 다뤄야 한다. 다만 Task 9의 통합 테스트 기반이 생기면 그때 경합 테스트를 실제로 쓸 수 있다.

**H-10 라우트의 자기 서버 HTTP 호출** — 성능·비용 문제이고 데이터 안전이나 보안에 닿지 않는다. qfd/analysis의 조회+계산부를 lib으로 추출하는 리팩터링이라 범위가 독립적이다.

**Medium·Low 전반** — 팩토리 미이관 4라우트, 거대 컴포넌트 8개, `any` 89곳, `GET /api/projects/[id]` 신설 등은 전부 "일관성 회복" 부류다. 위험을 줄이는 작업이 아니라 유지보수성을 올리는 작업이므로 Critical·High가 정리된 뒤에 한다.

**회원관리 기능 구현** — `docs/superpowers/specs/2026-08-20-member-management-design.md`의 별도 계획이다. 다만 Task 9의 통합 테스트가 그 설계의 5.5(멘티 삭제 시 프로젝트 연쇄 소멸)를 검증할 기반이 되므로, 회원관리 구현은 이 계획 다음에 하는 편이 낫다.
