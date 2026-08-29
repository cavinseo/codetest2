# 온보딩 관문 서버 강제 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:test-driven-development.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 임시 비밀번호를 안 바꿨거나 프로필이 미완성인 계정이 서버 API 를 쓰지 못하게 막는다. 지금은 클라이언트 리디렉트뿐이라 주소창으로 우회된다.

**Architecture:** `lib/auth.ts` 의 `requireAuth` 한 곳에 게이트를 넣는다. `requireAdmin` 과 `requireProjectAccess` 가 내부에서 이 함수를 부르므로 61/67 라우트가 여기로 수렴한다. 이미 도는 PK 조회에 컬럼 하나와 관계 하나를 얹으므로 쿼리는 늘지 않는다. 예외는 옵트인이라 앞으로 생기는 라우트는 아무것도 하지 않아도 막힌다(fail closed).

**Tech Stack:** 기존과 동일. 외부 라이브러리 추가 없음.

**Spec:** `docs/superpowers/specs/2026-08-30-onboarding-gate-design.md` — 먼저 정독하라. 이 계획은 그 설계를 그대로 구현한다.

## Global Constraints

- CLAUDE.md 최우선 제약: 원격 실DB — `prisma migrate deploy`/`db push`/`studio`, DB 에
  쓰는 스크립트, **dev 서버 기동** 전부 금지. 이번 작업에는 DB 도 서버도 필요 없다.
- git `reset`/`checkout`/브랜치 이동/`push`/reflog 조작 전면 금지. 커밋만 허용.
- 들여쓰기 4칸. 주석은 한국어 "~다" 체이고 무엇이 아니라 **왜**를 적는다.
- 테스트는 `tests/` 평면 배치, Prisma 는 `vi.mock('../lib/prisma', ...)` 로 mock.
- **이메일·토큰·비밀번호를 로그·응답 본문에 남기지 않는다** (`lib/logger.ts` 규칙).
- 완료 기준: `npx tsc --noEmit` 0건 + `npx vitest run` 전체 통과 + `npx next lint` 0건.
- `lib/auth.ts` 는 `stryker.crap.config.json` 의 `mutate` 목록에 없다. stryker 요구는
  없다(CLAUDE.md 「뮤테이션 회귀 방지」는 목록에 오른 파일에만 적용된다).
- 계획서 체크박스 `[x]` 갱신을 작업 커밋에 포함한다.
- 보고서는 `docs/superpowers/reports/2026-08-30-onboarding-gate/task-1.md` 로
  작업 커밋과 **별도의 둘째 커밋**.

## File Structure

| 파일 | 책임 | 변경 |
|---|---|---|
| `lib/auth.ts` | 세션 검증 + 계정 상태 게이트. 온보딩 게이트가 여기 붙는다 | Modify |
| `app/api/me/profile/route.ts` | 온보딩이 프로필을 읽고 쓴다 → 예외 옵트인 | Modify (2곳) |
| `app/api/admin/password/route.ts` | 온보딩이 임시 비밀번호를 바꾼다 → 예외 옵트인 | Modify (1곳) |
| `tests/api-onboarding-gate.test.ts` | 게이트 규칙과 예외를 실제 `requireAuth` 로 검증 | Create |
| `tests/auth.test.ts` | 실제 `requireAuth` 를 돌리는 기존 테스트 → 픽스처 확장 | Modify |
| `tests/authorization.test.ts` | 같은 이유 → 픽스처 확장 | Modify |

`lib/member-profile.ts` 는 **읽기만 한다.** 역할별 완성 기준은 이미 그 파일이 정본이므로 새로 정의하지 않는다.

---

### Task 1: `requireAuth` 온보딩 게이트와 예외 3경로

게이트와 예외는 한 커밋에 함께 들어간다. 게이트만 넣으면 온보딩을 끝낼 방법이 없어져 전원이 잠기므로, 둘을 나누면 중간 커밋이 고장 난 상태가 된다.

**Files:**
- Modify: `lib/auth.ts`
- Modify: `app/api/me/profile/route.ts:24`, `app/api/me/profile/route.ts:59`
- Modify: `app/api/admin/password/route.ts:24`
- Create: `tests/api-onboarding-gate.test.ts`
- Modify: `tests/auth.test.ts:31` (`approvedUser` 픽스처)
- Modify: `tests/authorization.test.ts:43` (`approvedRow` 픽스처)

**Interfaces:**
- Produces: `RequireAuthOptions { allowIncompleteOnboarding?: boolean }` 와
  `requireAuth(request: NextRequest, options?: RequireAuthOptions)`.
  기존 한 인자 호출부는 전부 그대로 동작한다(두 번째 인자에 기본값이 있다).
- Consumes: `isProfileCompleteForRole(role: MemberRole, profile: {...} | null): boolean`
  (`lib/member-profile.ts:57`), `parseMemberRole` (`lib/member-roles.ts`).

- [ ] **Step 1: 실패하는 테스트를 쓴다** — `tests/api-onboarding-gate.test.ts` 를 만든다.

```typescript
// 온보딩(임시 비밀번호 변경 + 프로필 작성)을 마치기 전에는 API 를 쓸 수 없어야 한다.
//
// 이 파일은 다른 라우트 테스트와 달리 lib/auth 를 mock 하지 않는다.
// requireAuth 를 스텁하면 검증 대상인 게이트가 아예 돌지 않기 때문이다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const findUniqueUser = vi.fn();
const updateUser = vi.fn();
const findUniqueMemberProfile = vi.fn();
const upsertMemberProfile = vi.fn();
const transaction = vi.fn();

vi.mock('../lib/prisma', () => ({
    prisma: {
        user: { findUnique: findUniqueUser, update: updateUser },
        memberProfile: { findUnique: findUniqueMemberProfile, upsert: upsertMemberProfile },
        $transaction: (...args: unknown[]) => transaction(...args),
    },
}));

// 임시 비밀번호 변경 경로가 쓰는 것들. 게이트만 보면 되므로 최소한으로 채운다.
const compare = vi.fn();
const hash = vi.fn();
vi.mock('bcryptjs', () => ({
    default: {
        compare: (...args: unknown[]) => compare(...args),
        hash: (...args: unknown[]) => hash(...args),
    },
}));

vi.mock('next/headers', () => ({
    cookies: async () => ({ set: vi.fn() }),
}));

const { encodeSessionCookie, requireAuth } = await import('../lib/auth');
const { GET: getMyProfile, PUT: putMyProfile } = await import('../app/api/me/profile/route');
const { POST: changePassword } = await import('../app/api/admin/password/route');

/** 역할별로 완성된 프로필. 이 값이 있으면 게이트를 통과해야 한다. */
function completeProfile(role: string) {
    if (role === 'MENTOR' || role === 'PROGRAM_MANAGER') {
        return { organization: '기관', phone: '010-0000-0000', expertise: '제조', careerYears: 10 };
    }
    if (role === 'MENTEE') {
        return { organization: '기관', phone: '010-0000-0000', companyName: '회사', industry: '제조' };
    }
    return { organization: '기관', phone: '010-0000-0000' };
}

function userRow(overrides: Record<string, unknown> = {}) {
    const role = (overrides.role as string) ?? 'MENTEE';
    return {
        id: 'user_1',
        email: 'user@example.com',
        name: '사용자',
        status: 'APPROVED',
        isAdmin: false,
        sessionVersion: 0,
        role,
        accessExpiresAt: null,
        mustChangePassword: false,
        profile: completeProfile(role),
        // 비밀번호 변경 경로가 이 행에서 passwordHash 를 읽는다.
        passwordHash: 'hashed',
        ...overrides,
    };
}

function sessionCookieHeader(): string {
    const cookie = encodeSessionCookie(
        { userId: 'user_1', email: 'user@example.com', name: '사용자' },
        { sessionVersion: 0 }
    );
    return `session=${cookie}`;
}

function requestWithSession(): NextRequest {
    return new NextRequest('http://localhost/test', {
        headers: { cookie: sessionCookieHeader() },
    });
}

async function bodyOf(result: unknown): Promise<Record<string, unknown>> {
    return await (result as NextResponse).json();
}

beforeEach(() => {
    vi.stubEnv('SESSION_SECRET', 'test-secret');
    findUniqueUser.mockResolvedValue(userRow());
    findUniqueMemberProfile.mockResolvedValue(completeProfile('MENTEE'));
});

afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
});

describe('온보딩 관문', () => {
    it('임시 비밀번호를 안 바꿨으면 막는다', async () => {
        findUniqueUser.mockResolvedValue(userRow({ mustChangePassword: true }));

        const result = await requireAuth(requestWithSession());

        expect(result).toBeInstanceOf(NextResponse);
        expect((result as NextResponse).status).toBe(403);
        expect(await bodyOf(result)).toMatchObject({ code: 'onboarding_required' });
    });

    it('프로필이 아예 없으면 터지지 않고 막는다', async () => {
        // profile 이 null 일 때 isProfileCompleteForRole 에 undefined 가 흘러가면
        // undefined.organization 에서 TypeError 로 죽는다. 403 이어야 한다.
        findUniqueUser.mockResolvedValue(userRow({ profile: null }));

        const result = await requireAuth(requestWithSession());

        expect((result as NextResponse).status).toBe(403);
        expect(await bodyOf(result)).toMatchObject({ code: 'onboarding_required' });
    });

    it('멘토인데 전문분야가 없으면 막는다', async () => {
        findUniqueUser.mockResolvedValue(userRow({
            role: 'MENTOR',
            profile: { organization: '기관', phone: '010-0000-0000', careerYears: 10 },
        }));

        expect((await requireAuth(requestWithSession()) as NextResponse).status).toBe(403);
    });

    it('멘티인데 기업명이 없으면 막는다', async () => {
        findUniqueUser.mockResolvedValue(userRow({
            role: 'MENTEE',
            profile: { organization: '기관', phone: '010-0000-0000', industry: '제조' },
        }));

        expect((await requireAuth(requestWithSession()) as NextResponse).status).toBe(403);
    });

    it('관리자도 예외가 아니다', async () => {
        // 권한이 가장 큰 계정에 구멍을 남기지 않는다. 관리자도 온보딩을 거친다.
        findUniqueUser.mockResolvedValue(userRow({
            role: 'ADMIN', isAdmin: true, mustChangePassword: true,
        }));

        const result = await requireAuth(requestWithSession());

        expect((result as NextResponse).status).toBe(403);
        expect(await bodyOf(result)).toMatchObject({ code: 'onboarding_required' });
    });

    it('온보딩을 마친 계정은 통과한다', async () => {
        const result = await requireAuth(requestWithSession());

        expect(result).not.toBeInstanceOf(NextResponse);
        expect(result).toMatchObject({ userId: 'user_1', role: 'MENTEE' });
    });

    it('승인 대기 계정은 온보딩이 아니라 승인 대기로 막는다', async () => {
        // 게이트 순서가 뒤집히면 승인도 안 난 계정이 "온보딩을 마치라"는
        // 엉뚱한 안내를 받는다.
        findUniqueUser.mockResolvedValue(userRow({
            status: 'PENDING', mustChangePassword: true,
        }));

        const result = await requireAuth(requestWithSession());

        expect((result as NextResponse).status).toBe(403);
        expect(await bodyOf(result)).not.toMatchObject({ code: 'onboarding_required' });
    });

    it('allowIncompleteOnboarding 을 준 호출은 미완료여도 통과한다', async () => {
        findUniqueUser.mockResolvedValue(userRow({ mustChangePassword: true, profile: null }));

        const result = await requireAuth(requestWithSession(), { allowIncompleteOnboarding: true });

        expect(result).not.toBeInstanceOf(NextResponse);
    });

    it('온보딩 화면이 쓰는 GET /api/me/profile 은 미완료여도 열린다', async () => {
        // 이 경로가 막히면 아무도 온보딩을 끝낼 수 없어 전원이 영구 잠긴다.
        findUniqueUser.mockResolvedValue(userRow({ mustChangePassword: true, profile: null }));
        findUniqueMemberProfile.mockResolvedValue(null);

        const response = await getMyProfile(requestWithSession());

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ needsProfile: true, mustChangePassword: true });
    });

    it('온보딩 화면이 쓰는 PUT /api/me/profile 은 미완료여도 열린다', async () => {
        findUniqueUser.mockResolvedValue(userRow({ mustChangePassword: true, profile: null }));
        transaction.mockResolvedValue([]);

        const response = await putMyProfile(new NextRequest('http://localhost/api/me/profile', {
            method: 'PUT',
            headers: { cookie: sessionCookieHeader(), 'content-type': 'application/json' },
            body: JSON.stringify({
                organization: '기관',
                phone: '010-0000-0000',
                privacyConsent: true,
                companyName: '회사',
                industry: '제조',
            }),
        }));

        expect(response.status).toBe(200);
        expect(upsertMemberProfile).toHaveBeenCalled();
    });

    it('온보딩 화면이 쓰는 POST /api/admin/password 는 미완료여도 열린다', async () => {
        findUniqueUser.mockResolvedValue(userRow({ mustChangePassword: true, profile: null }));
        compare.mockResolvedValue(true);
        hash.mockResolvedValue('new-hash');
        updateUser.mockResolvedValue({
            id: 'user_1', email: 'user@example.com', name: '사용자', sessionVersion: 1,
        });

        const response = await changePassword(new NextRequest('http://localhost/api/admin/password', {
            method: 'POST',
            headers: { cookie: sessionCookieHeader(), 'content-type': 'application/json' },
            body: JSON.stringify({
                currentPassword: 'temp-pass-1234',
                newPassword: 'brand-new-5678',
                confirmPassword: 'brand-new-5678',
            }),
        }));

        expect(response.status).toBe(200);
        expect(updateUser).toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/api-onboarding-gate.test.ts`
Expected: FAIL. 차단 테스트들이 403 대신 통과 객체를 받는다(게이트가 아직 없다).
`allowIncompleteOnboarding` 테스트는 타입 오류로 실패한다(옵션이 아직 없다).

- [ ] **Step 3: `lib/auth.ts` 에 import 와 옵션 타입을 추가한다**

5행 import 아래에 한 줄을 더한다. `lib/member-profile.ts` 는 `zod` 와
`member-roles` 의 타입만 쓰므로 순환 참조가 생기지 않는다.

```typescript
import { isProfileCompleteForRole } from './member-profile';
```

`AuthenticatedUser` 인터페이스(105~109행) **아래**에 옵션 타입을 놓는다.

```typescript
export interface RequireAuthOptions {
    /**
     * 온보딩 미완료 계정도 통과시킨다.
     *
     * 기본값이 "막힘"이라 새로 생기는 라우트는 아무것도 하지 않아도 게이트된다.
     * 이 옵션은 온보딩 자체를 끝내는 경로에만 준다 — 하나 늘릴 때마다 임시
     * 비밀번호로 닿을 수 있는 표면이 그만큼 넓어진다.
     */
    allowIncompleteOnboarding?: boolean;
}
```

- [ ] **Step 4: `requireAuth` 시그니처와 `select` 를 넓힌다**

118행 시그니처를 바꾼다. 두 번째 인자에 기본값이 있으므로 기존 호출부는 그대로 돈다.

```typescript
export async function requireAuth(
    request: NextRequest,
    options: RequireAuthOptions = {}
): Promise<AuthenticatedUser | NextResponse> {
```

124~131행의 `select` 에 두 항목을 더한다.

```typescript
        select: {
            id: true, email: true, name: true, status: true, isAdmin: true,
            sessionVersion: true, role: true, accessExpiresAt: true,
            mustChangePassword: true,
            profile: {
                select: {
                    organization: true, phone: true,
                    expertise: true, careerYears: true,
                    companyName: true, industry: true,
                },
            },
        },
```

- [ ] **Step 5: 게이트를 넣는다**

`isAccessExpired` 검사 블록 **뒤**, `return { ... }` **앞**에 넣는다. 순서가 이래야
승인 대기·세션 만료·기간 만료가 각자의 메시지를 먼저 낸다.

기존 `return` 문의 `role:` 줄은 아래처럼 미리 뽑아 둔 `role` 변수를 쓰도록 바꾼다
(같은 값을 두 번 계산하지 않는다).

```typescript
    // 저장값이 깨져 있어도 최소 권한으로 떨어뜨린다.
    const role = parseMemberRole(dbUser.role) ?? 'MENTEE';

    // 임시 비밀번호와 미완성 프로필은 온보딩을 마치기 전까지 서비스 전체를 막는다.
    // app/login/page.tsx 의 클라이언트 리디렉트는 주소창으로 우회되므로, 막는 일은
    // 서버가 해야 한다. profile 에 ?? null 을 붙이는 이유는 isProfileCompleteForRole
    // 이 null 만 걸러내기 때문이다 — undefined 가 들어가면 undefined.organization 에서
    // TypeError 로 죽는다.
    if (!options.allowIncompleteOnboarding
        && (dbUser.mustChangePassword
            || !isProfileCompleteForRole(role, dbUser.profile ?? null))) {
        return NextResponse.json(
            { error: '온보딩을 먼저 마쳐야 합니다.', code: 'onboarding_required' },
            { status: 403 }
        );
    }

    return {
        userId: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        isAdmin: dbUser.isAdmin,
        role,
        accessExpiresAt: dbUser.accessExpiresAt,
    };
```

- [ ] **Step 6: 예외 3경로에 옵트인을 준다**

`app/api/me/profile/route.ts` 24행과 59행:

```typescript
    // 온보딩 화면이 이 경로로 프로필을 읽고 쓴다. 게이트를 걸면 온보딩을 끝낼
    // 방법이 없어져 전원이 잠긴다.
    const authResult = await requireAuth(request, { allowIncompleteOnboarding: true });
```

`app/api/admin/password/route.ts` 24행:

```typescript
    // 임시 비밀번호를 스스로 바꿀 수 있어야 하므로 requireAuth 로 연다.
    // 온보딩 게이트도 열어 둔다 — 이 경로가 막히면 임시 비밀번호를 바꿀 수 없다.
    const authResult = await requireAuth(request, { allowIncompleteOnboarding: true });
```

- [ ] **Step 7: 기존 픽스처 두 개를 넓힌다**

`tests/auth.test.ts:31` 의 `approvedUser` 에 두 항목을 더한다.

```typescript
function approvedUser(overrides: Record<string, unknown> = {}) {
    return {
        id: SESSION.userId,
        email: SESSION.email,
        name: SESSION.name,
        status: 'APPROVED',
        isAdmin: false,
        sessionVersion: 0,
        // requireAuth 가 온보딩까지 보므로 기본값을 완료 상태로 둔다.
        // 없으면 기존 테스트가 전부 403 onboarding_required 로 떨어진다.
        mustChangePassword: false,
        profile: { organization: '기관', phone: '010-0000-0000' },
        ...overrides,
    };
}
```

`tests/authorization.test.ts:43` 의 `approvedRow` 에도 같은 두 항목을 더한다. 이
픽스처는 `role` 을 오버라이드로 받으므로, 멘토·멘티 역할로 부르는 테스트가 깨지지
않도록 **역할별 필수 항목을 모두 채운 프로필**을 기본값으로 준다.

```typescript
        // requireAuth 가 온보딩까지 보므로 어떤 역할로 불러도 완성으로 판정되도록
        // 역할별 필수 항목을 모두 채워 둔다.
        mustChangePassword: false,
        profile: {
            organization: '기관', phone: '010-0000-0000',
            expertise: '제조', careerYears: 10,
            companyName: '회사', industry: '제조',
        },
```

- [ ] **Step 8: 테스트가 통과하는지 확인한다**

Run: `npx vitest run tests/api-onboarding-gate.test.ts tests/auth.test.ts tests/authorization.test.ts`
Expected: PASS (신규 11개 포함 전부).

- [ ] **Step 9: 전체 게이트를 돌린다**

```sh
npx tsc --noEmit
npx vitest run
npx next lint
```

Expected: tsc 출력 없음 / vitest 전체 통과, 테스트 수가 **1034 + 11 = 1045 이상** /
lint `✔ No ESLint warnings or errors`.

vitest 가 신규 11개 말고 다른 곳에서 깨지면 그 라우트 테스트가 `lib/auth` 를 스텁하지
않고 실제 `requireAuth` 를 돌린다는 뜻이다. 그 파일의 user mock 에도 Step 7 과 같은
두 항목을 더하고, **어느 파일이었는지 보고서 DEVIATIONS 에 적어라** — 감리자가
"영향 테스트는 2개뿐"으로 계획을 세웠으므로 어긋난 사실이 기록돼야 한다.

- [ ] **Step 10: 커밋한다**

계획서 체크박스 `[x]` 갱신을 포함한다.

```sh
git add lib/auth.ts app/api/me/profile/route.ts app/api/admin/password/route.ts \
        tests/api-onboarding-gate.test.ts tests/auth.test.ts tests/authorization.test.ts \
        docs/superpowers/plans/2026-08-30-onboarding-gate.md
git commit
```

메시지: `feat: 온보딩을 마치기 전에는 API 를 쓰지 못하게 막는다`
본문에 **왜**를 적는다 — 클라이언트 리디렉트는 주소창으로 우회되고, 그 결과 메일로
간 임시 비밀번호가 무기한 유효했다는 것.
트레일러: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

그다음 보고서를 `docs/superpowers/reports/2026-08-30-onboarding-gate/task-1.md` 로
쓰고 **둘째 커밋** (`docs: Task 1 결과 보고서`). 형식은 RESULT / FILES CHANGED /
COMMIT / VERIFIED BY / DEVIATIONS / RISKS / QUESTIONS. VERIFIED BY 에는 각 게이트의
실행 명령과 출력 마지막 줄을 원문 그대로 담는다.

---

## 감리 체크리스트 (Task 승인 게이트)

1. 예외가 정확히 3곳인가 — `grep -rn "allowIncompleteOnboarding" app/` 이
   `me/profile` 2건 + `admin/password` 1건만 내야 한다. 더 있으면 게이트에 구멍이다.
2. `dbUser.profile ?? null` 이 있는가 — 없으면 프로필 없는 계정에서 TypeError 로 죽는다.
3. 게이트가 `isAccessExpired` 검사 **뒤**에 있는가 (PENDING 테스트로 증명)
4. 관리자 예외가 없는가 (ADMIN 403 테스트 존재)
5. 기존 테스트를 약화(skip·단언 완화)하지 않고 픽스처만 넓혔는가
6. 감리자 직접 재실행: tsc 0 · vitest 전체(1043 이상) · lint 0

## 계획 밖 (사람이 하는 일 / 후속 계획)

- **실기동 검증** — dev 서버 기동은 실행 AI 에게 위임하지 않는다. 감리자가 직접
  수행한다. 미검증으로 남아 있는 Google 회원 로그인 실검증과 같은 세션에서 함께 본다:
  임시 비밀번호 계정으로 로그인 → `/dashboard` 직접 이동 시 API 가 403 →
  온보딩 완료 후 정상 이용.
- **페이지 UX (후속 계획)** — 클라이언트가 403 `code: 'onboarding_required'` 를 보고
  `/onboarding` 으로 보내는 작업. 설계 9절이 범위 밖으로 둔 항목이다. 이 계획으로
  보안은 닫히지만, 주소창으로 대시보드를 열면 빈 화면에 오류가 보인다.
