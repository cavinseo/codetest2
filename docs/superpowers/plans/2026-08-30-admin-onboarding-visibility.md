# 관리자 화면에 온보딩 차단 상태 노출 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:test-driven-development.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자 회원 목록에서 온보딩 미완료로 **차단된** 회원을 구분할 수 있게 한다. 관문이 서면서 프로필 미완성이 안내에서 차단으로 바뀌었는데 화면이 그걸 못 보여준다.

**Architecture:** `/api/admin/users` GET 의 `select` 에 `profile` 을 얹고, 서버에서 `isProfileCompleteForRole` 로 판정해 `profileComplete` 불리언 하나만 내려준다. 화면은 그 값으로 배지를 띄운다. 프로필 내용 자체는 내리지 않는다 — 목록에 필요한 것은 완성 여부뿐이고, 전화번호 같은 개인정보를 목록 응답에 실을 이유가 없다.

**Tech Stack:** 기존과 동일. 외부 라이브러리 추가 없음.

**배경 (감리자 실측, 2026-08-30):** 온보딩 관문(커밋 `19c202c`)이 서기 전에는 프로필 미완성이 안내였다. 이제는 `requireAuth` 가 403 `onboarding_required` 로 막는다. 그런데 `app/api/admin/users/route.ts:30~45` 의 `select` 에 `profile` 이 없어 `components/admin/MembersTab.tsx:292` 는 `mustChangePassword` 배지만 띄운다. **프로필 미완성으로 막힌 회원은 화면에서 구분되지 않는다.** 회원이 "아무것도 안 된다"고 문의하면 관리자가 DB 를 직접 봐야 답할 수 있다.

## Global Constraints

- CLAUDE.md 최우선 제약: 원격 실DB — `prisma migrate deploy`/`db push`/`studio`, DB 에
  쓰는 스크립트, **dev 서버 기동** 전부 금지. 스키마 변경이 없으므로 DB 도 서버도
  필요 없다.
- git `reset`/`checkout`/브랜치 이동/`push`/reflog 조작 전면 금지. 커밋만 허용.
- 들여쓰기 4칸. 주석은 한국어 "~다" 체이고 무엇이 아니라 **왜**를 적는다.
- 테스트는 `tests/` 평면 배치, Prisma 는 `vi.mock('../lib/prisma', ...)` 로 mock.
- **개인정보를 목록 응답에 싣지 않는다**(`lib/logger.ts` 규칙의 연장). 프로필 원본이
  아니라 판정 결과 불리언만 내린다.
- 완료 기준: `npx tsc --noEmit` 0건 + `npx vitest run` 전체 통과 + `npx next lint` 0건.
- `lib/member-profile.ts` 는 `stryker.crap.config.json` 의 `mutate` 목록에 있다.
  **이 계획은 그 파일을 수정하지 않으므로** stryker 재실행 요구는 없다. 만약 수정하게
  되면 CLAUDE.md 「뮤테이션 회귀 방지」에 따라 재실행하고 점수를 보고하라.
- 계획서 체크박스 `[x]` 갱신을 작업 커밋에 포함한다.
- 보고서는 `docs/superpowers/reports/2026-08-30-admin-onboarding-visibility/task-1.md`
  로 작업 커밋과 **별도의 둘째 커밋**.

## File Structure

| 파일 | 책임 | 변경 |
|---|---|---|
| `app/api/admin/users/route.ts` | GET 응답에 `profileComplete` 추가 | Modify |
| `components/admin/MembersTab.tsx` | `User` 타입에 필드 추가 + 배지 | Modify |
| `tests/api-admin-users-profile-complete.test.ts` | GET 응답 판정 테스트 | Create |

---

### Task 1: `profileComplete` 노출과 배지

**Files:** 위 File Structure 전부.

**Interfaces:**
- Produces: `/api/admin/users` GET 응답의 각 회원 객체에 `profileComplete: boolean`
- Consumes: `isProfileCompleteForRole(role, profile)` (`lib/member-profile.ts:57`),
  `parseMemberRole` (`lib/member-roles.ts`)

- [ ] **Step 1: 실패하는 테스트를 쓴다** — `tests/api-admin-users-profile-complete.test.ts`

기존 `tests/api-admin-user-role.test.ts` 의 mock 방식을 그대로 따른다
(`lib/authorization` 을 스텁해 관리자 권한을 통과시키고 `prisma` 를 mock 한다).

```typescript
// 관리자 회원 목록이 온보딩 차단 여부를 구분할 수 있게 내려주는지 확인한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const findManyUser = vi.fn();

vi.mock('../lib/prisma', () => ({
    prisma: { user: { findMany: findManyUser } },
}));

const requireAdmin = vi.fn();
vi.mock('../lib/authorization', () => ({
    requireAdmin: (...args: unknown[]) => requireAdmin(...(args as [])),
    hasAdminAccess: () => true,
}));

const { GET } = await import('../app/api/admin/users/route');

/** 역할별로 완성된 프로필. */
function completeProfile(role: string) {
    if (role === 'MENTOR' || role === 'PROGRAM_MANAGER') {
        return { organization: '기관', phone: '010-0000-0000', expertise: '제조', careerYears: 10 };
    }
    if (role === 'MENTEE') {
        return { organization: '기관', phone: '010-0000-0000', companyName: '회사', industry: '제조' };
    }
    return { organization: '기관', phone: '010-0000-0000' };
}

function userRow(id: string, role: string, profile: unknown) {
    return {
        id,
        name: '회원',
        email: `${id}@example.com`,
        status: 'APPROVED',
        isAdmin: false,
        role,
        accessExpiresAt: null,
        mustChangePassword: false,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
        programId: null,
        program: null,
        profile,
    };
}

beforeEach(() => {
    requireAdmin.mockResolvedValue({ userId: 'admin_1', email: 'a@x.com', name: '관리자' });
});

afterEach(() => {
    vi.clearAllMocks();
});

async function getUsers() {
    const response = await GET(new NextRequest('http://localhost/api/admin/users'));
    return await response.json();
}

describe('관리자 회원 목록의 온보딩 상태', () => {
    it('프로필이 완성된 회원은 profileComplete 가 참이다', async () => {
        findManyUser.mockResolvedValue([userRow('u1', 'MENTEE', completeProfile('MENTEE'))]);

        const body = await getUsers();

        expect(body.users[0]).toMatchObject({ id: 'u1', profileComplete: true });
    });

    it('프로필이 없는 회원은 profileComplete 가 거짓이다', async () => {
        findManyUser.mockResolvedValue([userRow('u2', 'MENTEE', null)]);

        const body = await getUsers();

        expect(body.users[0]).toMatchObject({ id: 'u2', profileComplete: false });
    });

    it('역할에 필요한 항목이 빠지면 거짓이다', async () => {
        // 멘토는 전문분야·경력이 있어야 완성이다. 멘티 기준으로 판정하면 안 된다.
        findManyUser.mockResolvedValue([
            userRow('u3', 'MENTOR', { organization: '기관', phone: '010-0000-0000' }),
        ]);

        const body = await getUsers();

        expect(body.users[0]).toMatchObject({ id: 'u3', profileComplete: false });
    });

    it('프로필 원본을 응답에 싣지 않는다', async () => {
        // 목록에 필요한 것은 완성 여부뿐이다. 전화번호 같은 개인정보를 목록 응답에
        // 실으면 화면이 쓰지도 않는 정보가 네트워크로 새어 나간다.
        findManyUser.mockResolvedValue([userRow('u4', 'MENTEE', completeProfile('MENTEE'))]);

        const body = await getUsers();

        expect(body.users[0]).not.toHaveProperty('profile');
        expect(JSON.stringify(body)).not.toContain('010-0000-0000');
    });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/api-admin-users-profile-complete.test.ts`
Expected: FAIL — `profileComplete` 가 응답에 없다.

주의: 이 테스트가 `body.users` 를 읽는다. 실제 응답의 최상위 키가 다르면
`app/api/admin/users/route.ts` 의 GET 반환문을 보고 테스트를 실제 모양에 맞춘 뒤
**DEVIATIONS 에 적어라.**

- [ ] **Step 3: 라우트를 고친다** — `app/api/admin/users/route.ts`

`select` 에 `profile` 을 더한다(30~45행 블록).

```typescript
                // 온보딩 관문이 프로필 미완성을 차단 사유로 쓰므로, 관리자가 누가
                // 막혔는지 볼 수 있어야 한다. 판정에 필요한 항목만 고른다.
                profile: {
                    select: {
                        organization: true, phone: true,
                        expertise: true, careerYears: true,
                        companyName: true, industry: true,
                    },
                },
```

그리고 **이미 있는 반환문의 `map` 에 얹는다**(51~55행). 새 `map` 을 만들지 마라 —
그 자리에서 `program` 을 이미 벗겨내고 있다. `profile` 도 같은 자리에서 벗긴다.

```typescript
        return NextResponse.json({
            // 프로필 원본이 아니라 판정 결과만 내린다. 목록에 필요한 것은 완성
            // 여부이고, 전화번호 같은 개인정보를 목록 응답에 실을 이유가 없다.
            users: users.map(({ program, profile, ...rest }) => ({
                ...rest,
                programName: program?.name ?? null,
                profileComplete: isProfileCompleteForRole(
                    parseMemberRole(rest.role) ?? 'MENTEE',
                    profile
                ),
            })),
        });
```

`parseMemberRole` import 를 파일 상단에 더하고, 이미 가져오고 있는
`@/lib/member-profile` 에서 `isProfileCompleteForRole` 을 함께 가져온다.

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/api-admin-users-profile-complete.test.ts`
Expected: PASS (4개)

- [ ] **Step 5: 화면에 배지를 붙인다** — `components/admin/MembersTab.tsx`

`User` 인터페이스(17~32행)에 필드를 더한다.

```typescript
    /** 온보딩 관문이 프로필 미완성으로 막고 있는지. 서버가 판정해 내려준다. */
    profileComplete: boolean;
```

배지 줄(292행 근처) `mustChangePassword` 배지 **뒤**에 하나를 더한다.

```tsx
                                                    {!m.profileComplete && <span className="ml-2 badge-rose text-[10px]">프로필 미작성</span>}
```

`badge-rose` 는 `app/globals.css:147` 에 이미 있다(라이트 테마 대응도 `:585` 에
있다). **새 CSS 클래스를 만들지 마라.**

- [ ] **Step 6: 전체 게이트를 돌린다**

```sh
npx tsc --noEmit
npx vitest run
npx next lint
```

Expected: tsc 출력 없음 / vitest 전체 통과, 테스트 수 **1055 + 4 = 1059 이상** /
lint `✔ No ESLint warnings or errors`.

- [ ] **Step 7: 커밋한다**

계획서 체크박스 `[x]` 갱신을 포함한다.

```sh
git add app/api/admin/users/route.ts components/admin/MembersTab.tsx \
        tests/api-admin-users-profile-complete.test.ts \
        docs/superpowers/plans/2026-08-30-admin-onboarding-visibility.md
git commit
```

메시지: `feat: 관리자 목록에 온보딩 차단 회원을 표시한다`
본문에 **왜**를 적는다 — 관문이 서면서 프로필 미완성이 안내에서 차단으로 바뀌었는데
화면이 그걸 못 보여줘 관리자가 문의에 답할 수 없었다는 것, 그리고 프로필 원본이
아니라 판정 결과만 내리는 이유.

그다음 보고서를
`docs/superpowers/reports/2026-08-30-admin-onboarding-visibility/task-1.md` 로 쓰고
**둘째 커밋** (`docs: Task 1 결과 보고서`).

---

## 감리 체크리스트 (Task 승인 게이트)

1. 응답에 `profile` 원본이 **없는가** — 테스트 4번이 이걸 잡는다. 목록 응답에
   전화번호가 실리면 안 된다
2. 판정이 **역할별**인가 — 멘토를 멘티 기준으로 판정하면 안 된다 (테스트 3번)
3. `parseMemberRole(...) ?? 'MENTEE'` 로 낮춰 읽는가 — `requireAuth` 와 같은 기준
4. `lib/member-profile.ts` 를 수정하지 않았는가 (수정했다면 stryker 재실행 결과가
   보고서에 있어야 한다)
5. 새 CSS 클래스를 만들지 않았는가
6. 감리자 직접 재실행: tsc 0 · vitest 전체(1059 이상) · lint 0

## 계획 밖 (사람이 하는 일)

- **실기동 검증** — 이 배지는 관리자 화면을 실제로 열어야 보인다. 아직 밀려 있는
  검증 3건(Google 로그인 / 온보딩 관문 403 / 자동 리디렉션)과 **같은 브라우저 세션에서
  함께 본다.** 이 계획으로 검증 항목이 하나 늘어 넷이 된다.
- **차단 회원 수 파악** — 기존 승인 회원 중 프로필이 없는 계정이 몇인지는 원격 실DB
  조회가 필요하다. 이 배지가 붙으면 관리자 화면에서 눈으로 셀 수 있으므로, 별도
  조회 없이 이 작업으로 갈음할 수 있다.
