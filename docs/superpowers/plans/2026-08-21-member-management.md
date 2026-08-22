# 회원관리 기능 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 설계 문서 `docs/superpowers/specs/2026-08-20-member-management-design.md` 의 회원관리 기능을 구현한다 — 시스템 역할 4종, 역할별 프로젝트 열람 범위, 멘토 배정, 초대 코드, 회원등록 정보, 관리자·매니저 화면.

**Architecture:** 이미 있는 것을 연결하는 일이 절반이다. `lib/member-roles.ts` 와 `lib/invite-code.ts` 는 순수 함수로 완성돼 있으나 **라우트 어디에서도 호출되지 않는다**. 새 패턴을 만들지 말고 이 저장소의 기존 도구를 쓴다 — `requireProjectAccess`(프로젝트 관문), `toErrorResponse`(오류 응답), `createLogger`(PII 금지 로깅), zod 스키마 검증, `countCascadeImpact` 계열의 confirm 게이트. 접근 제어는 `lib/authorization.ts` 한 곳만 고쳐 60여 개 워크시트 라우트가 자동으로 새 범위를 따르게 한다.

**Tech Stack:** Next.js 15 App Router, React 19, Prisma 6.19 (PostgreSQL), TypeScript 5 strict, Vitest 4, zod 3, bcryptjs, nodemailer

## Global Constraints

- 새 소스 파일 첫 줄에 파일 역할을 설명하는 **한국어 한 줄 주석**을 둔다 (AGENTS.md). `*.config.*` 는 예외. `'use client'` 가 있으면 그 바로 아래.
- 한국어 문장은 마침표·물음표·느낌표로 끝내고 **콜론으로 끝내지 않는다**. 콜론은 라벨·키값 안에서만.
- `scripts/check-text-encoding.mjs` 가 `app`·`components`·`lib`·`prisma`·`tests` 의 `.ts/.tsx/.sql/.prisma/.json/.css/.js/.mjs/.jsx` 를 검사한다. 한글은 UTF-8 로 저장한다. `npm test`·`npm run build` 전에 자동 실행된다.
- **기준선은 498개 통과(61파일)이며 이 숫자는 늘어나기만 해야 한다.** 각 Task 는 `npm test` 가 통과한 상태로 끝난다.
- 요청과 직접 관련된 파일과 줄만 수정한다. 주변 코드·주석·포맷을 임의로 정리하지 않는다.
- Prisma delegate 는 모델명의 camelCase 다. `QFDMatrix` 의 delegate 는 **`qFDMatrix`**, `MemberProfile` 은 `memberProfile` 이다.
- 커밋 메시지는 `feat:` / `fix:` / `test:` + 영문 요약. 끝에 `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` 를 넣는다.
- **`.env` 는 실데이터가 든 원격 Supabase 를 가리킨다.** 어떤 작업도 여기 접속하지 않는다 — `prisma migrate`·`db push`·`studio` 금지. `npx prisma generate` 만 안전하다. 마이그레이션은 SQL 파일을 손으로 작성하고 적용은 사람이 한다.
- 뮤테이션 테스트가 상시 도구다(`npm run test:mutation`). 새로 만드는 순수 lib 모듈은 대상에 추가한다.

## 선행 조건 (사람이 해야 함)

Task 1 의 마이그레이션 SQL 은 작성만 하고 적용하지 않는다. 사람이 테스트 DB 에 적용한 뒤 나머지 Task 를 진행한다.

```bash
npx prisma migrate deploy
```

---

## Task 1: 스키마 — `mustChangePassword` 와 `MemberProfile`

설계 3.1·3.2. 관리자가 만든 계정은 임시 비밀번호를 받고 첫 로그인 때 바꿔야 하며, 회원등록 정보는 인증에 쓰이는 `users` 행과 분리해 1:1 로 둔다. `requireAuth` 가 매 요청마다 `users` 를 읽으므로 관심사를 섞지 않는다.

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260821000000_add_member_profile/migration.sql`
- Test: `tests/db-migration-models.test.ts` (기존 파일에 추가)

**Interfaces:**
- Produces: Prisma 모델 `MemberProfile` (delegate `memberProfile`), `User.mustChangePassword: boolean`, `User.profile: MemberProfile?`

- [ ] **Step 1: 기존 마이그레이션 테스트의 형태를 확인한다**

```bash
head -40 tests/db-migration-models.test.ts
```

이 파일이 스키마 모델 존재를 어떻게 검증하는지 보고 같은 방식을 따른다.

- [ ] **Step 2: 실패하는 테스트를 쓴다**

`tests/db-migration-models.test.ts` 끝에 추가한다. 기존 파일의 import 와 헬퍼를 그대로 쓴다.

```typescript
describe('MemberProfile 모델', () => {
    it('스키마에 member_profiles 로 매핑돼 있다', () => {
        expect(schema).toContain('model MemberProfile');
        expect(schema).toContain('@@map("member_profiles")');
    });

    it('공통 항목은 필수, 역할별 항목은 nullable 이다', () => {
        // 멘토에게 companyName 을 NOT NULL 로 걸 수 없어 역할별 항목은 전부
        // nullable 이다. 필수 여부는 zod 스키마가 역할로 분기해 강제한다.
        const model = schema.slice(schema.indexOf('model MemberProfile'));
        const body = model.slice(0, model.indexOf('}'));

        expect(body).toMatch(/organization\s+String\s*$/m);
        expect(body).toMatch(/phone\s+String\s*$/m);
        expect(body).toMatch(/privacyConsentAt\s+DateTime\s*$/m);
        expect(body).toMatch(/expertise\s+String\?/);
        expect(body).toMatch(/companyName\s+String\?/);
    });

    it('User 에 mustChangePassword 가 있다', () => {
        expect(schema).toMatch(/mustChangePassword\s+Boolean\s+@default\(false\)/);
    });
});
```

`schema` 변수가 기존 파일에 없으면 파일 상단에 추가한다.

```typescript
import { readFileSync } from 'fs';
const schema = readFileSync('prisma/schema.prisma', 'utf8');
```

- [ ] **Step 3: 테스트가 실패하는지 확인한다**

```bash
npx vitest run tests/db-migration-models.test.ts
```

Expected: FAIL — `model MemberProfile` 을 찾지 못한다.

- [ ] **Step 4: 스키마에 필드와 모델을 넣는다**

`prisma/schema.prisma` 의 `model User` 안, `sessionVersion` 줄 아래에 추가한다.

```prisma
  // 관리자가 만든 계정은 임시 비밀번호를 받는다. 이 값이 true 인 동안에는
  // 비밀번호를 바꾸기 전까지 다른 화면으로 넘어가지 못한다.
  mustChangePassword  Boolean                @default(false)
```

같은 `model User` 안 관계 목록(`usedInviteCode` 줄 아래)에 추가한다.

```prisma
  profile             MemberProfile?
```

파일 끝(`model InviteCode` 아래)에 모델을 추가한다.

```prisma
// 회원등록 정보. 인증에 쓰이는 users 행과 분리해 둔다.
// requireAuth 가 매 요청마다 users 를 읽으므로 관심사를 섞지 않는다.
model MemberProfile {
  userId String @id
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  // 공통
  organization String  // 소속기관명
  jobTitle     String? // 직책·직위
  phone        String  // 휴대폰

  // 멘토·프로그램 매니저
  expertise     String? // 전문분야
  careerYears   Int?    // 경력 연수
  careerSummary String? // 주요이력·보유자격

  // 멘티
  companyName String? // 기업명
  industry    String? // 업종
  foundedYear Int?    // 창업 연차

  // 개인정보 수집·이용 동의 시각
  privacyConsentAt DateTime

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("member_profiles")
}
```

- [ ] **Step 5: 마이그레이션 SQL 을 손으로 작성한다**

`prisma/migrations/20260821000000_add_member_profile/migration.sql` 을 만든다. **적용하지 않는다.**

```sql
-- 회원등록 정보와 임시 비밀번호 플래그.
--
-- member_profiles 는 users 와 1:1 이다. 인증 경로(requireAuth)가 매 요청마다
-- users 를 읽으므로 등록 정보를 그 행에 섞지 않는다.

ALTER TABLE "users" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "member_profiles" (
    "userId" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "jobTitle" TEXT,
    "phone" TEXT NOT NULL,
    "expertise" TEXT,
    "careerYears" INTEGER,
    "careerSummary" TEXT,
    "companyName" TEXT,
    "industry" TEXT,
    "foundedYear" INTEGER,
    "privacyConsentAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_profiles_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "member_profiles" ADD CONSTRAINT "member_profiles_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 6: 검증한다**

```bash
npx prisma validate && npx prisma generate && npx vitest run tests/db-migration-models.test.ts && npx tsc --noEmit
```

Expected: 스키마 유효, 테스트 PASS, 타입 에러 0건.

- [ ] **Step 7: 커밋한다**

```bash
git add prisma/schema.prisma prisma/migrations/20260821000000_add_member_profile tests/db-migration-models.test.ts
git commit -m "feat: add MemberProfile and mustChangePassword to the schema

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: 역할 판정 — 읽기·쓰기 분리와 전환 규칙

설계 2.2·2.3. 사용자가 "매니저는 모든 프로젝트를 읽기 전용으로 본다"를 골랐으므로 현재 `canReadAnyProject`(ADMIN 만)를 고쳐야 한다. 매니저 승격은 멘토에서만 가능하다는 규칙도 순수 함수로 넣는다.

**Files:**
- Modify: `lib/member-roles.ts:68-74` (`canReadAnyProject`)
- Modify: `tests/member-roles.test.ts`
- Modify: `stryker.crap.config.json` (변경 없음 — 이미 대상)

**Interfaces:**
- Produces: `canReadAnyProject(role: MemberRole): boolean` (ADMIN, PROGRAM_MANAGER), `canWriteAnyProject(role: MemberRole): boolean` (ADMIN), `canTransitionRole(from: MemberRole, to: MemberRole): boolean`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/member-roles.test.ts` 에 추가한다. **기존 `canReadAnyProject('PROGRAM_MANAGER')` 를 `false` 로 단언하는 줄(약 68행)을 `true` 로 고친다** — 결정이 바뀌었기 때문이다.

```typescript
import { canWriteAnyProject, canTransitionRole } from '../lib/member-roles';

describe('전체 프로젝트 읽기·쓰기', () => {
    it('관리자와 매니저는 전체를 읽는다', () => {
        expect(canReadAnyProject('ADMIN')).toBe(true);
        expect(canReadAnyProject('PROGRAM_MANAGER')).toBe(true);
    });

    it('멘토와 멘티는 전체를 읽지 못한다', () => {
        expect(canReadAnyProject('MENTOR')).toBe(false);
        expect(canReadAnyProject('MENTEE')).toBe(false);
    });

    it('전체 쓰기는 관리자만 된다', () => {
        // 매니저는 전체를 보되 고치지는 못한다. 읽기와 쓰기를 나눠 둔 이유다.
        expect(canWriteAnyProject('ADMIN')).toBe(true);
        expect(canWriteAnyProject('PROGRAM_MANAGER')).toBe(false);
        expect(canWriteAnyProject('MENTOR')).toBe(false);
        expect(canWriteAnyProject('MENTEE')).toBe(false);
    });
});

describe('canTransitionRole', () => {
    it('멘토에서 매니저로 승격할 수 있다', () => {
        expect(canTransitionRole('MENTOR', 'PROGRAM_MANAGER')).toBe(true);
    });

    it('매니저를 멘토로 해임할 수 있다', () => {
        expect(canTransitionRole('PROGRAM_MANAGER', 'MENTOR')).toBe(true);
    });

    it('멘티를 바로 매니저로 올릴 수 없다', () => {
        // 매니저는 멘토 중에서 선택한다. 멘토를 거쳐 두 단계로 올린다.
        expect(canTransitionRole('MENTEE', 'PROGRAM_MANAGER')).toBe(false);
    });

    it('매니저를 바로 멘티로 내릴 수 없다', () => {
        expect(canTransitionRole('PROGRAM_MANAGER', 'MENTEE')).toBe(false);
    });

    it('멘토와 멘티 사이는 오갈 수 있다', () => {
        expect(canTransitionRole('MENTEE', 'MENTOR')).toBe(true);
        expect(canTransitionRole('MENTOR', 'MENTEE')).toBe(true);
    });

    it('관리자는 예외로 모든 전환이 열려 있다', () => {
        expect(canTransitionRole('ADMIN', 'MENTOR')).toBe(true);
        expect(canTransitionRole('MENTEE', 'ADMIN')).toBe(true);
    });

    it('같은 역할로의 전환은 허용한다', () => {
        expect(canTransitionRole('MENTOR', 'MENTOR')).toBe(true);
    });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

```bash
npx vitest run tests/member-roles.test.ts
```

Expected: FAIL — `canWriteAnyProject` 를 찾지 못하고, `canReadAnyProject('PROGRAM_MANAGER')` 가 false 다.

- [ ] **Step 3: 구현한다**

`lib/member-roles.ts` 의 `canReadAnyProject` 를 통째로 바꾼다.

```typescript
/**
 * 소속과 무관하게 모든 프로젝트의 내용을 열 수 있는가.
 * 매니저는 전체를 읽되 고치지는 못한다(canWriteAnyProject 참고).
 */
export function canReadAnyProject(role: MemberRole): boolean {
    return role === 'ADMIN' || role === 'PROGRAM_MANAGER';
}

/** 소속과 무관하게 모든 프로젝트를 고칠 수 있는가. */
export function canWriteAnyProject(role: MemberRole): boolean {
    return role === 'ADMIN';
}
```

파일 끝에 전환 규칙을 추가한다.

```typescript
// ─── 역할 전환 ──────────────────────────────────────────────────
//
// 매니저는 멘토 중에서 선택한다. 그래서 멘티를 바로 매니저로 올릴 수 없고,
// 관리자가 멘토를 거쳐 두 단계로 올린다. 그 과정에서 멘토 프로필
// (전문분야·경력 연수)을 채우게 되는 것도 의도한 바다.

/** from 에서 to 로 역할을 바꿀 수 있는가. */
export function canTransitionRole(from: MemberRole, to: MemberRole): boolean {
    if (from === to) return true;
    // 관리자가 얽히면 예외로 연다. 관리자는 모든 권한을 가지기 때문이다.
    if (from === 'ADMIN' || to === 'ADMIN') return true;
    if (to === 'PROGRAM_MANAGER') return from === 'MENTOR';
    if (from === 'PROGRAM_MANAGER') return to === 'MENTOR';
    return true;
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

```bash
npx vitest run tests/member-roles.test.ts && npm test
```

Expected: 전부 PASS. 전체 테스트 수가 498 보다 늘어난다.

- [ ] **Step 5: 뮤테이션 점수를 확인한다**

```bash
npm run test:mutation
```

Expected: `member-roles.ts` 가 92% 이상을 유지한다. 새 함수의 생존 뮤턴트가 많으면 테스트를 보강한다.

- [ ] **Step 6: 커밋한다**

```bash
git add lib/member-roles.ts tests/member-roles.test.ts
git commit -m "feat: split project read/write permission and add role transition rules

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: 접근 제어 — 합성 역할 `VIEWER`

설계 4.1. `requireProjectAccess` 가 실제 관문이라 여기만 고치면 워크시트 라우트 60여 개가 자동으로 새 열람 범위를 따른다. **기존 라우트를 한 줄도 고치지 않는 것이 이 설계의 핵심이다.**

**Files:**
- Modify: `lib/authorization.ts:5,38-78`
- Modify: `tests/authorization.test.ts`

**Interfaces:**
- Consumes: `canReadAnyProject`, `canWriteAnyProject` (Task 2)
- Produces: `ProjectAccessRole` 에 `'VIEWER'` 추가. `requireProjectAccess` 가 시스템 역할을 반영한다.

- [ ] **Step 1: 기존 테스트 파일의 mock 방식을 확인한다**

```bash
head -50 tests/authorization.test.ts
```

`requireAuth` 를 어떻게 mock 하는지 보고 그대로 따른다. `requireAuth` 는 이제 `role` 과 `accessExpiresAt` 을 포함한 객체를 돌려준다.

- [ ] **Step 2: 실패하는 테스트를 쓴다**

`tests/authorization.test.ts` 에 추가한다.

```typescript
describe('시스템 역할에 따른 프로젝트 접근', () => {
    it('관리자는 남의 프로젝트에도 ADMIN 으로 들어간다', async () => {
        // 관리자는 이상의 모든 권한을 가진다. 명시 역할이 없어도 전권이다.
        mockAuthUser({ userId: 'admin_1', role: 'ADMIN', isAdmin: true });
        mockProject({ ownerId: 'someone_else', members: [] });

        const result = await requireProjectAccess(req(), 'proj_1');

        expect(result).not.toBeInstanceOf(NextResponse);
        expect((result as ProjectAccess).role).toBe('ADMIN');
    });

    it('매니저는 배정되지 않은 프로젝트에 VIEWER 로 들어간다', async () => {
        mockAuthUser({ userId: 'pm_1', role: 'PROGRAM_MANAGER', isAdmin: false });
        mockProject({ ownerId: 'someone_else', members: [] });

        const result = await requireProjectAccess(req(), 'proj_1');

        expect((result as ProjectAccess).role).toBe('VIEWER');
    });

    it('VIEWER 는 쓰기가 막힌다', async () => {
        mockAuthUser({ userId: 'pm_1', role: 'PROGRAM_MANAGER', isAdmin: false });
        mockProject({ ownerId: 'someone_else', members: [] });

        const result = await requireProjectAccess(req(), 'proj_1', { write: true });

        expect(result).toBeInstanceOf(NextResponse);
        expect((result as NextResponse).status).toBe(403);
    });

    it('배정되지 않은 멘토는 거부된다', async () => {
        mockAuthUser({ userId: 'mentor_1', role: 'MENTOR', isAdmin: false });
        mockProject({ ownerId: 'someone_else', members: [] });

        const result = await requireProjectAccess(req(), 'proj_1');

        expect(result).toBeInstanceOf(NextResponse);
        expect((result as NextResponse).status).toBe(403);
    });

    it('배정된 멘토는 COACH 로 들어간다', async () => {
        mockAuthUser({ userId: 'mentor_1', role: 'MENTOR', isAdmin: false });
        mockProject({ ownerId: 'someone_else', members: [{ role: 'COACH' }] });

        const result = await requireProjectAccess(req(), 'proj_1');

        expect((result as ProjectAccess).role).toBe('COACH');
    });

    it('VIEWER 는 roles 로 특정 역할을 요구하는 라우트에서도 막힌다', async () => {
        // 팀원 초대처럼 소유자만 하는 동작이 매니저에게 열리면 안 된다.
        mockAuthUser({ userId: 'pm_1', role: 'PROGRAM_MANAGER', isAdmin: false });
        mockProject({ ownerId: 'someone_else', members: [] });

        const result = await requireProjectAccess(req(), 'proj_1', { roles: ['OWNER'] });

        expect(result).toBeInstanceOf(NextResponse);
        expect((result as NextResponse).status).toBe(403);
    });

    it('소유자는 시스템 역할과 무관하게 OWNER 다', async () => {
        mockAuthUser({ userId: 'mentee_1', role: 'MENTEE', isAdmin: false });
        mockProject({ ownerId: 'mentee_1', members: [] });

        const result = await requireProjectAccess(req(), 'proj_1');

        expect((result as ProjectAccess).role).toBe('OWNER');
    });
});
```

`mockAuthUser`·`mockProject`·`req` 헬퍼가 기존 파일에 없으면, 기존 테스트가 쓰는 방식에 맞춰 만든다.

- [ ] **Step 3: 테스트가 실패하는지 확인한다**

```bash
npx vitest run tests/authorization.test.ts
```

Expected: FAIL — 매니저·관리자 케이스가 403 을 받는다.

- [ ] **Step 4: 구현한다**

`lib/authorization.ts:5` 의 타입에 `VIEWER` 를 넣는다.

```typescript
export type ProjectAccessRole = 'OWNER' | 'EDITOR' | 'COACH' | 'ADMIN' | 'VIEWER';
```

`WRITE_ROLES` 는 그대로 둔다 — `VIEWER` 가 빠져 있으므로 쓰기가 자동으로 막힌다.

`requireProjectAccess` 의 역할 판정부(61-67행)를 바꾼다.

```typescript
    // 관리자는 명시 역할과 무관하게 전권이다. "관리자는 이상의 모든 권한을 가진다".
    const systemRole = authResult.role;
    const explicitRole = project.ownerId === authResult.userId
        ? 'OWNER'
        : (project.members[0]?.role as ProjectAccessRole | undefined);

    let role: ProjectAccessRole | undefined = explicitRole;
    if (canWriteAnyProject(systemRole)) {
        role = 'ADMIN';
    } else if (!role && canReadAnyProject(systemRole)) {
        // 매니저는 배정되지 않은 프로젝트도 읽는다. VIEWER 는 WRITE_ROLES 에
        // 없으므로 쓰기와 roles 검사에서 자동으로 걸러진다.
        role = 'VIEWER';
    }

    if (!role) {
        return NextResponse.json({ error: 'Project access denied.' }, { status: 403 });
    }
```

import 를 추가한다.

```typescript
import { canReadAnyProject, canWriteAnyProject } from './member-roles';
```

- [ ] **Step 5: 테스트가 통과하는지 확인한다**

```bash
npx vitest run tests/authorization.test.ts && npm test && npx tsc --noEmit
```

Expected: 전부 PASS. **기존 워크시트 라우트 테스트가 깨지면 안 된다** — 깨진다면 판정 순서가 잘못된 것이다.

- [ ] **Step 6: 커밋한다**

```bash
git add lib/authorization.ts tests/authorization.test.ts
git commit -m "feat: grant program managers read-only access to every project

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: 프로필 검증 스키마

설계 3.3. 역할별 필수 항목이 다르다. DB 는 전부 nullable 이므로 필수 여부는 여기서 강제한다. 가입·프로필 수정·관리자 생성 세 경로가 이 한 곳을 공유한다.

**Files:**
- Create: `lib/member-profile.ts`
- Create: `tests/member-profile.test.ts`
- Modify: `stryker.crap.config.json` (mutate 목록에 추가)

**Interfaces:**
- Produces: `memberProfileSchemaFor(role: MemberRole)` → zod 스키마. 파싱 결과 타입 `MemberProfileInput`.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/member-profile.test.ts` 를 만든다.

```typescript
// 역할별로 필수 항목이 갈리는지 확인한다.
//
// DB 에서는 역할별 항목이 전부 nullable 이다. 멘토에게 companyName 을
// NOT NULL 로 걸 수 없기 때문이다. 그래서 필수 여부는 이 스키마가 강제한다.
import { describe, expect, it } from 'vitest';
import { memberProfileSchemaFor } from '../lib/member-profile';

const common = {
    organization: '한국기술대',
    phone: '010-1234-5678',
    privacyConsent: true,
};

describe('멘티 프로필', () => {
    const schema = memberProfileSchemaFor('MENTEE');

    it('기업명과 업종이 있으면 통과한다', () => {
        const result = schema.safeParse({ ...common, companyName: '가나테크', industry: '제조' });

        expect(result.success).toBe(true);
    });

    it('기업명이 없으면 막는다', () => {
        expect(schema.safeParse({ ...common, industry: '제조' }).success).toBe(false);
    });

    it('업종이 없으면 막는다', () => {
        expect(schema.safeParse({ ...common, companyName: '가나테크' }).success).toBe(false);
    });

    it('창업 연차는 없어도 된다', () => {
        const result = schema.safeParse({ ...common, companyName: '가나테크', industry: '제조' });

        expect(result.success).toBe(true);
    });

    it('전문분야를 요구하지 않는다', () => {
        // 멘티에게 멘토 항목을 물으면 안 된다.
        const result = schema.safeParse({ ...common, companyName: '가나테크', industry: '제조' });

        expect(result.success).toBe(true);
    });
});

describe('멘토 프로필', () => {
    const schema = memberProfileSchemaFor('MENTOR');

    it('전문분야와 경력 연수가 있으면 통과한다', () => {
        const result = schema.safeParse({ ...common, expertise: '재료공학', careerYears: 12 });

        expect(result.success).toBe(true);
    });

    it('전문분야가 없으면 막는다', () => {
        // 배정 판단의 근거라 비면 기능이 성립하지 않는다.
        expect(schema.safeParse({ ...common, careerYears: 12 }).success).toBe(false);
    });

    it('경력 연수가 없으면 막는다', () => {
        expect(schema.safeParse({ ...common, expertise: '재료공학' }).success).toBe(false);
    });

    it('기업명을 요구하지 않는다', () => {
        const result = schema.safeParse({ ...common, expertise: '재료공학', careerYears: 12 });

        expect(result.success).toBe(true);
    });
});

describe('프로그램 매니저 프로필', () => {
    it('멘토와 똑같이 판정한다', () => {
        // 매니저는 멘토에서 승격되므로 이미 멘토 항목을 채운 상태다.
        // 승격했다고 항목이 사라지면 해임 후 다시 받아야 한다.
        const schema = memberProfileSchemaFor('PROGRAM_MANAGER');

        expect(schema.safeParse({ ...common, expertise: '재료공학', careerYears: 12 }).success).toBe(true);
        expect(schema.safeParse(common).success).toBe(false);
    });
});

describe('관리자 프로필', () => {
    it('공통 항목만 있으면 통과한다', () => {
        // 관리자는 운영자이지 멘토링 당사자가 아니다.
        expect(memberProfileSchemaFor('ADMIN').safeParse(common).success).toBe(true);
    });
});

describe('공통 항목', () => {
    const schema = memberProfileSchemaFor('ADMIN');

    it('소속기관명이 없으면 막는다', () => {
        expect(schema.safeParse({ phone: '010-1234-5678', privacyConsent: true }).success).toBe(false);
    });

    it('휴대폰이 없으면 막는다', () => {
        expect(schema.safeParse({ organization: '한국기술대', privacyConsent: true }).success).toBe(false);
    });

    it('개인정보 동의가 false 면 막는다', () => {
        expect(schema.safeParse({ ...common, privacyConsent: false }).success).toBe(false);
    });

    it('직책은 없어도 된다', () => {
        expect(schema.safeParse(common).success).toBe(true);
    });

    it('빈 문자열은 값이 없는 것으로 본다', () => {
        expect(schema.safeParse({ ...common, organization: '   ' }).success).toBe(false);
    });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

```bash
npx vitest run tests/member-profile.test.ts
```

Expected: FAIL — `Cannot find module '../lib/member-profile'`.

- [ ] **Step 3: 구현한다**

`lib/member-profile.ts` 를 만든다.

```typescript
// 회원등록 정보의 역할별 검증 스키마.
//
// DB 에서는 역할별 항목이 전부 nullable 이다. 멘토에게 companyName 을
// NOT NULL 로 걸 수 없기 때문이다. 그래서 필수 여부는 여기서 강제하고,
// 가입·프로필 수정·관리자 생성 세 경로가 이 한 곳을 공유한다.
import { z } from 'zod';
import type { MemberRole } from './member-roles';

/** 공백만 든 문자열을 값 없음으로 본다. */
const requiredText = (message: string) =>
    z.string().trim().min(1, message);

const commonShape = {
    organization: requiredText('소속기관명을 입력하세요.'),
    jobTitle: z.string().trim().optional(),
    phone: requiredText('휴대폰 번호를 입력하세요.'),
    privacyConsent: z.literal(true, {
        errorMap: () => ({ message: '개인정보 수집·이용에 동의해야 가입할 수 있습니다.' }),
    }),
};

const mentorShape = {
    expertise: requiredText('전문분야를 입력하세요.'),
    careerYears: z.number({ invalid_type_error: '경력 연수를 입력하세요.' }).int().min(0),
    careerSummary: z.string().trim().optional(),
};

const menteeShape = {
    companyName: requiredText('기업명을 입력하세요.'),
    industry: requiredText('업종을 입력하세요.'),
    foundedYear: z.number().int().optional(),
};

/**
 * 역할에 맞는 프로필 스키마를 돌려준다.
 * 매니저는 멘토에서 승격되므로 멘토와 똑같이 판정한다.
 * 관리자는 운영자이지 멘토링 당사자가 아니라 공통 항목만 본다.
 */
export function memberProfileSchemaFor(role: MemberRole) {
    if (role === 'MENTOR' || role === 'PROGRAM_MANAGER') {
        return z.object({ ...commonShape, ...mentorShape }).strict();
    }
    if (role === 'MENTEE') {
        return z.object({ ...commonShape, ...menteeShape }).strict();
    }
    return z.object(commonShape).strict();
}

export type MemberProfileInput = z.infer<ReturnType<typeof memberProfileSchemaFor>>;
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

```bash
npx vitest run tests/member-profile.test.ts && npm test && npx tsc --noEmit
```

Expected: 전부 PASS.

- [ ] **Step 5: 뮤테이션 대상에 추가한다**

`stryker.crap.config.json` 의 `mutate` 배열에 한 줄 넣는다.

```json
        "lib/member-profile.ts",
```

```bash
npm run test:mutation
```

Expected: `member-profile.ts` 가 목록에 나오고 85% 이상이다.

- [ ] **Step 6: 커밋한다**

```bash
git add lib/member-profile.ts tests/member-profile.test.ts stryker.crap.config.json
git commit -m "feat: add role-branching validation for member registration profiles

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: 프로젝트 생성 게이트와 목록 범위

설계 5·4.2. 멘티와 관리자만 프로젝트를 만든다. 목록은 역할에 따라 범위가 갈린다.

**Files:**
- Modify: `app/api/projects/route.ts`
- Create: `tests/api-project-scope.test.ts`

**Interfaces:**
- Consumes: `canCreateProject`, `canListAllProjects` (`lib/member-roles.ts`)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/api-project-scope.test.ts` 를 만든다.

```typescript
// 프로젝트 생성 권한과 목록 조회 범위가 역할을 따르는지 확인한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const findManyProject = vi.fn();
const createProject = vi.fn();

vi.mock('../lib/prisma', () => ({
    prisma: {
        project: { findMany: findManyProject, create: createProject },
    },
}));

const requireAuth = vi.fn();
vi.mock('../lib/auth', () => ({
    requireAuth: (...args: unknown[]) => requireAuth(...(args as [])),
}));

const { GET, POST } = await import('../app/api/projects/route');

function authAs(role: string, userId = 'user_1') {
    requireAuth.mockResolvedValue({
        userId, email: 'u@x.com', name: '사용자', isAdmin: role === 'ADMIN', role, accessExpiresAt: null,
    });
}

function postRequest(body: unknown): NextRequest {
    return new NextRequest('http://localhost/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

beforeEach(() => {
    findManyProject.mockResolvedValue([]);
    createProject.mockResolvedValue({
        id: 'proj_new', name: '새 과제', description: null, detailedDescription: null,
        aiMode: 'rule', createdAt: new Date(), updatedAt: new Date(),
    });
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('프로젝트 생성 권한', () => {
    it('멘티는 만들 수 있다', async () => {
        authAs('MENTEE');

        const res = await POST(postRequest({ name: '새 과제' }));

        expect(res.status).toBe(200);
        expect(createProject).toHaveBeenCalled();
    });

    it('관리자는 만들 수 있다', async () => {
        authAs('ADMIN');

        const res = await POST(postRequest({ name: '새 과제' }));

        expect(res.status).toBe(200);
    });

    it('멘토는 만들 수 없다', async () => {
        // 멘티가 과제를 만들고 멘토가 붙는 구조다.
        authAs('MENTOR');

        const res = await POST(postRequest({ name: '새 과제' }));

        expect(res.status).toBe(403);
        expect(createProject).not.toHaveBeenCalled();
    });

    it('매니저는 만들 수 없다', async () => {
        authAs('PROGRAM_MANAGER');

        const res = await POST(postRequest({ name: '새 과제' }));

        expect(res.status).toBe(403);
        expect(createProject).not.toHaveBeenCalled();
    });
});

describe('프로젝트 목록 범위', () => {
    it('멘티는 소유·참여한 것만 본다', async () => {
        authAs('MENTEE', 'mentee_1');

        await GET(new NextRequest('http://localhost/api/projects'));

        const where = findManyProject.mock.calls[0][0].where;
        expect(where.OR).toBeDefined();
    });

    it('관리자는 전체를 본다', async () => {
        authAs('ADMIN', 'admin_1');

        await GET(new NextRequest('http://localhost/api/projects'));

        const where = findManyProject.mock.calls[0][0].where;
        expect(where.OR).toBeUndefined();
    });

    it('매니저는 전체를 본다', async () => {
        authAs('PROGRAM_MANAGER', 'pm_1');

        await GET(new NextRequest('http://localhost/api/projects'));

        const where = findManyProject.mock.calls[0][0].where;
        expect(where.OR).toBeUndefined();
    });

    it('멘토는 소유·참여한 것만 본다', async () => {
        authAs('MENTOR', 'mentor_1');

        await GET(new NextRequest('http://localhost/api/projects'));

        const where = findManyProject.mock.calls[0][0].where;
        expect(where.OR).toBeDefined();
    });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

```bash
npx vitest run tests/api-project-scope.test.ts
```

Expected: FAIL — 멘토·매니저 생성이 200 이고, 관리자 목록에 `OR` 가 있다.

- [ ] **Step 3: 구현한다**

`app/api/projects/route.ts` 의 GET 에서 `where` 를 분기한다. 기존 `const userProjects = await prisma.project.findMany({ where: { OR: [...] }, ... })` 를 바꾼다.

```typescript
        // 관리자와 매니저는 배정 대상을 고르기 위해 전체 목록을 본다.
        const scope = canListAllProjects(authResult.role)
            ? {}
            : { OR: [{ ownerId: userId }, { members: { some: { userId } } }] };

        const userProjects = await prisma.project.findMany({
            where: scope,
```

응답의 `role` 계산도 바꾼다. 목록에서 편집 가능해 보이던 프로젝트가 열어 보면 읽기 전용인 어긋남을 막는다.

```typescript
                role: p.ownerId === userId
                    ? 'OWNER'
                    : (p.members[0]?.role ?? (canListAllProjects(authResult.role) ? 'VIEWER' : 'EDITOR')),
```

POST 시작부의 `const { userId } = authResult;` 아래에 게이트를 넣는다.

```typescript
    // 멘티가 과제를 만들고 멘토가 붙는 구조다. 멘토·매니저는 만들지 않는다.
    if (!canCreateProject(authResult.role)) {
        return NextResponse.json(
            { error: '프로젝트를 만들 권한이 없습니다. 멘티 계정으로 생성할 수 있습니다.' },
            { status: 403 }
        );
    }
```

import 를 추가한다.

```typescript
import { canCreateProject, canListAllProjects } from '@/lib/member-roles';
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

```bash
npx vitest run tests/api-project-scope.test.ts && npm test && npx tsc --noEmit
```

Expected: 전부 PASS.

- [ ] **Step 5: 커밋한다**

```bash
git add app/api/projects/route.ts tests/api-project-scope.test.ts
git commit -m "feat: gate project creation by role and scope the project list

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: 메일 발송 공용화와 초대·임시 비밀번호 메일

설계 5.4. `lib/email.ts` 는 발송 함수가 `sendSurveyInvitation` 하나뿐이고 트랜스포터가 모듈 안에 갇혀 있다. 초대 코드와 임시 비밀번호 두 종류가 더 필요하므로 공용 `sendMail` 을 빼내 셋이 공유한다.

**Files:**
- Modify: `lib/email.ts`
- Create: `lib/temp-password-email.ts`
- Create: `tests/temp-password-email.test.ts`
- Modify: `stryker.crap.config.json`

**Interfaces:**
- Produces: `sendMail(options: { to: string; subject: string; html: string }): Promise<boolean>`, `sendInviteCodeEmail(...)`, `sendTempPasswordEmail(...)`, `buildTempPasswordEmail(...)`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/temp-password-email.test.ts` 를 만든다. 본문 생성은 순수 함수라 mock 없이 검증한다.

```typescript
// 임시 비밀번호 메일 본문이 필요한 것을 담고, 값을 이스케이프하는지 본다.
import { describe, expect, it } from 'vitest';
import { buildTempPasswordEmail } from '../lib/temp-password-email';
import { escapeHtml } from '../lib/html-escape';

const params = {
    tempPassword: 'Abc123!xyz',
    roleLabel: '멘토',
    loginUrl: 'https://example.com/login',
    escapeHtml,
};

describe('buildTempPasswordEmail', () => {
    it('임시 비밀번호와 로그인 주소를 담는다', () => {
        const { subject, html } = buildTempPasswordEmail(params);

        expect(subject).toContain('멘토');
        expect(html).toContain('Abc123!xyz');
        expect(html).toContain('https://example.com/login');
    });

    it('첫 로그인 때 비밀번호를 바꿔야 한다고 알린다', () => {
        expect(buildTempPasswordEmail(params).html).toContain('변경');
    });

    it('역할 이름을 이스케이프한다', () => {
        const injected = buildTempPasswordEmail({ ...params, roleLabel: '<img src=x onerror=alert(1)>' });

        expect(injected.html).not.toContain('<img');
        expect(injected.html).toContain('&lt;img');
    });

    it('임시 비밀번호를 이스케이프한다', () => {
        // 생성 문자에 &, < 가 섞여도 본문이 깨지지 않아야 한다.
        const injected = buildTempPasswordEmail({ ...params, tempPassword: 'a<b&c' });

        expect(injected.html).toContain('a&lt;b&amp;c');
    });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

```bash
npx vitest run tests/temp-password-email.test.ts
```

Expected: FAIL — `Cannot find module '../lib/temp-password-email'`.

- [ ] **Step 3: 본문 생성 함수를 만든다**

`lib/temp-password-email.ts` 를 만든다. `lib/invite-code.ts` 의 `buildInviteEmail` 과 같은 형태로 맞춘다.

```typescript
// 관리자가 만든 계정에 임시 비밀번호를 알리는 메일 본문.
//
// 관리자가 평문 비밀번호를 다루지 않도록 서버가 생성해 본인에게만 보낸다.
// 받은 사람은 첫 로그인 때 반드시 바꿔야 한다(users.mustChangePassword).

export function buildTempPasswordEmail(params: {
    tempPassword: string;
    roleLabel: string;
    loginUrl: string;
    escapeHtml: (value: string) => string;
}): { subject: string; html: string } {
    const tempPassword = params.escapeHtml(params.tempPassword);
    const roleLabel = params.escapeHtml(params.roleLabel);
    const loginUrl = params.escapeHtml(params.loginUrl);

    return {
        subject: `[KS-QFD] ${params.roleLabel} 계정이 생성되었습니다`,
        html: `
    <div style="font-family: 'Segoe UI', Tahoma, sans-serif; max-width: 600px; margin: 0 auto; background: #f8f9fa; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px 12px 0 0; padding: 28px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 22px;">KS-QFD 계정 생성</h1>
            <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px;">${roleLabel} 계정이 만들어졌습니다</p>
        </div>
        <div style="background: white; padding: 28px; border-radius: 0 0 12px 12px;">
            <p style="color: #333; font-size: 15px;">아래 임시 비밀번호로 로그인해 주세요.</p>
            <div style="margin: 20px 0; padding: 16px; background: #f1f5f9; border-radius: 8px; text-align: center;">
                <span style="font-family: monospace; font-size: 20px; font-weight: 700; letter-spacing: 2px; color: #0f172a;">${tempPassword}</span>
            </div>
            <ul style="color: #555; font-size: 13px; line-height: 1.8; padding-left: 18px;">
                <li>첫 로그인 때 비밀번호를 <strong>변경</strong>해야 합니다.</li>
                <li>이 메일은 본인 외에는 전달하지 마세요.</li>
            </ul>
            <div style="text-align: center; margin: 26px 0 8px;">
                <a href="${loginUrl}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 13px 36px; border-radius: 8px; text-decoration: none; font-size: 15px; font-weight: 600; display: inline-block;">로그인 하러 가기</a>
            </div>
        </div>
    </div>
    `,
    };
}
```

- [ ] **Step 4: `lib/email.ts` 에 공용 발송 함수를 뺀다**

`createTransporter` 아래에 추가한다. **기존 `sendSurveyInvitation` 은 건드리지 않는다** — 동작이 검증돼 있다.

```typescript
/**
 * 공용 메일 발송. SMTP 가 설정되지 않았으면 false 를 돌려준다.
 * 호출부는 이 값을 보고 사용자에게 "메일이 나가지 않았다"고 알려야 한다.
 * 조용히 성공으로 처리하면 관리자가 코드를 전달할 기회를 놓친다.
 */
export async function sendMail(options: EmailOptions): Promise<boolean> {
    const mailer = await createTransporter();
    if (!mailer) {
        log.warn('SMTP 미설정으로 메일을 보내지 못했습니다.');
        return false;
    }

    try {
        await mailer.transport.sendMail({
            from: mailer.from,
            to: options.to,
            subject: sanitizeHeaderValue(options.subject),
            html: options.html,
        });
        return true;
    } catch (error: unknown) {
        log.error('메일 발송 실패', error);
        return false;
    }
}
```

- [ ] **Step 5: 검증한다**

```bash
npx vitest run tests/temp-password-email.test.ts && npm test && npx tsc --noEmit && npm run lint
```

Expected: 전부 PASS.

- [ ] **Step 6: 뮤테이션 대상에 추가하고 커밋한다**

`stryker.crap.config.json` 의 `mutate` 에 `"lib/temp-password-email.ts",` 를 넣는다.

```bash
npm run test:mutation
git add lib/email.ts lib/temp-password-email.ts tests/temp-password-email.test.ts stryker.crap.config.json
git commit -m "feat: extract a shared mail sender and add the temp-password email

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: 초대 코드 API

설계 5·5.3. 매니저도 쓰므로 `requireAdmin` 이 아니라 시스템 역할 게이트를 쓴다. 그래서 경로도 `/api/admin/` 아래에 두지 않는다.

**Files:**
- Create: `app/api/invites/route.ts`
- Create: `tests/api-invites.test.ts`

**Interfaces:**
- Consumes: `canIssueInviteCode`, `parseInvitableRole`, `MEMBER_ROLE_LABELS`, `DEFAULT_ACCESS_DURATION_DAYS` (`lib/member-roles.ts`); `generateInviteCode`, `inviteCodeExpiryFrom`, `buildInviteEmail` (`lib/invite-code.ts`); `sendMail` (Task 6)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/api-invites.test.ts` 를 만든다.

```typescript
// 초대 코드 발행·목록·회수가 역할 게이트를 지키는지 확인한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const createInvite = vi.fn();
const findManyInvite = vi.fn();
const findUniqueInvite = vi.fn();
const updateInvite = vi.fn();
const findUniqueUser = vi.fn();

vi.mock('../lib/prisma', () => ({
    prisma: {
        inviteCode: {
            create: createInvite, findMany: findManyInvite,
            findUnique: findUniqueInvite, update: updateInvite,
        },
        user: { findUnique: findUniqueUser },
    },
}));

const requireAuth = vi.fn();
vi.mock('../lib/auth', () => ({
    requireAuth: (...args: unknown[]) => requireAuth(...(args as [])),
}));

const sendMail = vi.fn();
vi.mock('../lib/email', () => ({
    sendMail: (...args: unknown[]) => sendMail(...(args as [])),
}));

const { GET, POST, DELETE } = await import('../app/api/invites/route');

function authAs(role: string) {
    requireAuth.mockResolvedValue({
        userId: 'issuer_1', email: 'i@x.com', name: '발행자',
        isAdmin: role === 'ADMIN', role, accessExpiresAt: null,
    });
}

function jsonRequest(method: string, body: unknown): NextRequest {
    return new NextRequest('http://localhost/api/invites', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

beforeEach(() => {
    findUniqueUser.mockResolvedValue(null);
    findManyInvite.mockResolvedValue([]);
    createInvite.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
        ...data, id: 'inv_1', createdAt: new Date(), usedAt: null, usedById: null,
    }));
    findUniqueInvite.mockResolvedValue({ id: 'inv_1', usedAt: null, issuedById: 'issuer_1' });
    updateInvite.mockResolvedValue({ id: 'inv_1' });
    sendMail.mockResolvedValue(true);
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('초대 코드 발행 권한', () => {
    it('관리자는 발행할 수 있다', async () => {
        authAs('ADMIN');

        const res = await POST(jsonRequest('POST', { email: 'm@x.com', role: 'MENTOR' }));

        expect(res.status).toBe(200);
        expect(createInvite).toHaveBeenCalled();
    });

    it('매니저도 발행할 수 있다', async () => {
        authAs('PROGRAM_MANAGER');

        const res = await POST(jsonRequest('POST', { email: 'm@x.com', role: 'MENTOR' }));

        expect(res.status).toBe(200);
    });

    it('멘토는 발행할 수 없다', async () => {
        authAs('MENTOR');

        const res = await POST(jsonRequest('POST', { email: 'm@x.com', role: 'MENTOR' }));

        expect(res.status).toBe(403);
        expect(createInvite).not.toHaveBeenCalled();
    });

    it('멘티는 발행할 수 없다', async () => {
        authAs('MENTEE');

        const res = await POST(jsonRequest('POST', { email: 'm@x.com', role: 'MENTOR' }));

        expect(res.status).toBe(403);
    });
});

describe('초대 코드 발행 규칙', () => {
    beforeEach(() => authAs('ADMIN'));

    it('매니저 역할로는 코드를 만들 수 없다', async () => {
        // 매니저는 멘토 중에서 승격으로만 생긴다.
        const res = await POST(jsonRequest('POST', { email: 'm@x.com', role: 'PROGRAM_MANAGER' }));

        expect(res.status).toBe(400);
        expect(createInvite).not.toHaveBeenCalled();
    });

    it('관리자 역할로도 코드를 만들 수 없다', async () => {
        const res = await POST(jsonRequest('POST', { email: 'm@x.com', role: 'ADMIN' }));

        expect(res.status).toBe(400);
    });

    it('이미 가입한 이메일에는 발행하지 않는다', async () => {
        findUniqueUser.mockResolvedValue({ id: 'user_9' });

        const res = await POST(jsonRequest('POST', { email: 'm@x.com', role: 'MENTOR' }));

        expect(res.status).toBe(409);
        expect(createInvite).not.toHaveBeenCalled();
    });

    it('기본 접근 기간 90일을 담는다', async () => {
        await POST(jsonRequest('POST', { email: 'm@x.com', role: 'MENTEE' }));

        expect(createInvite.mock.calls[0][0].data.accessDurationDays).toBe(90);
    });

    it('메일 발송이 실패하면 코드는 만들되 실패를 알린다', async () => {
        // 코드는 이미 만들어졌으므로 관리자가 직접 전달할 수 있어야 한다.
        sendMail.mockResolvedValue(false);

        const res = await POST(jsonRequest('POST', { email: 'm@x.com', role: 'MENTOR' }));
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.emailSent).toBe(false);
        expect(body.code).toBeTruthy();
    });
});

describe('초대 코드 회수', () => {
    beforeEach(() => authAs('ADMIN'));

    it('삭제가 아니라 만료 처리한다', async () => {
        // 누가 누구에게 무엇을 발급했는지가 이력으로 남아야 한다.
        const res = await DELETE(jsonRequest('DELETE', { id: 'inv_1' }));

        expect(res.status).toBe(200);
        expect(updateInvite).toHaveBeenCalled();
        const data = updateInvite.mock.calls[0][0].data;
        expect(data.expiresAt).toBeInstanceOf(Date);
    });

    it('이미 사용된 코드는 회수할 수 없다', async () => {
        findUniqueInvite.mockResolvedValue({ id: 'inv_1', usedAt: new Date(), issuedById: 'issuer_1' });

        const res = await DELETE(jsonRequest('DELETE', { id: 'inv_1' }));

        expect(res.status).toBe(400);
        expect(updateInvite).not.toHaveBeenCalled();
    });
});

describe('초대 코드 목록', () => {
    it('멘토는 목록을 볼 수 없다', async () => {
        authAs('MENTOR');

        const res = await GET(new NextRequest('http://localhost/api/invites'));

        expect(res.status).toBe(403);
    });

    it('매니저는 목록을 본다', async () => {
        authAs('PROGRAM_MANAGER');

        const res = await GET(new NextRequest('http://localhost/api/invites'));

        expect(res.status).toBe(200);
    });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

```bash
npx vitest run tests/api-invites.test.ts
```

Expected: FAIL — 모듈이 없다.

- [ ] **Step 3: 구현한다**

`app/api/invites/route.ts` 를 만든다.

```typescript
// 멘토·멘티 초대 코드의 발행·목록·회수 API.
//
// 매니저도 쓰므로 requireAdmin 이 아니라 시스템 역할 게이트를 쓴다.
// 그래서 경로도 /api/admin/ 아래에 두지 않는다.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { generateId } from '@/lib/id';
import { createLogger } from '@/lib/logger';
import { toErrorResponse } from '@/lib/api-error';
import { sendMail } from '@/lib/email';
import { escapeHtml } from '@/lib/html-escape';
import {
    canIssueInviteCode,
    parseInvitableRole,
    MEMBER_ROLE_LABELS,
    DEFAULT_ACCESS_DURATION_DAYS,
} from '@/lib/member-roles';
import { buildInviteEmail, generateInviteCode, inviteCodeExpiryFrom } from '@/lib/invite-code';

const log = createLogger('api/invites');

const issueSchema = z.object({
    email: z.string().email('유효한 이메일을 입력하세요.'),
    role: z.string(),
    accessDurationDays: z.number().int().min(1).max(365).optional(),
});

const revokeSchema = z.object({ id: z.string().min(1) });

export async function GET(request: NextRequest) {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    if (!canIssueInviteCode(authResult.role)) {
        return NextResponse.json({ error: '초대 코드를 볼 권한이 없습니다.' }, { status: 403 });
    }

    try {
        const invites = await prisma.inviteCode.findMany({
            select: {
                id: true, code: true, email: true, role: true, expiresAt: true,
                accessDurationDays: true, usedAt: true, createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
        });

        return NextResponse.json({ invites });
    } catch (error: unknown) {
        return toErrorResponse(error, { log, message: '초대 코드 목록을 불러오지 못했습니다.' });
    }
}

export async function POST(request: NextRequest) {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    if (!canIssueInviteCode(authResult.role)) {
        return NextResponse.json({ error: '초대 코드를 발행할 권한이 없습니다.' }, { status: 403 });
    }

    try {
        const parsed = issueSchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
        }

        // 매니저와 관리자는 코드로 만들지 않는다. 매니저는 멘토에서 승격으로만 생긴다.
        const role = parseInvitableRole(parsed.data.role);
        if (!role) {
            return NextResponse.json(
                { error: '초대 코드는 멘토 또는 멘티로만 발행할 수 있습니다.' },
                { status: 400 }
            );
        }

        const email = parsed.data.email.trim().toLowerCase();
        const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
        if (existing) {
            return NextResponse.json({ error: '이미 가입된 이메일입니다.' }, { status: 409 });
        }

        const now = new Date();
        const code = generateInviteCode();
        const accessDurationDays = parsed.data.accessDurationDays ?? DEFAULT_ACCESS_DURATION_DAYS;

        const invite = await prisma.inviteCode.create({
            data: {
                id: generateId('invite'),
                code,
                email,
                role,
                expiresAt: inviteCodeExpiryFrom(now),
                accessDurationDays,
                issuedById: authResult.userId,
            },
        });

        const origin = new URL(request.url).origin;
        const mail = buildInviteEmail({
            code,
            roleLabel: MEMBER_ROLE_LABELS[role],
            expiresAt: invite.expiresAt,
            accessDurationDays,
            signupUrl: `${origin}/signup`,
            escapeHtml,
        });
        const emailSent = await sendMail({ to: email, subject: mail.subject, html: mail.html });

        log.info('초대 코드 발행', { inviteId: invite.id, role, emailSent });

        // 발송이 실패해도 코드는 이미 만들어졌다. 관리자가 직접 전달할 수 있도록
        // 코드와 실패 사실을 함께 돌려준다. 조용히 성공으로 처리하지 않는다.
        return NextResponse.json({
            success: true,
            emailSent,
            code,
            invite: {
                id: invite.id, email: invite.email, role: invite.role,
                expiresAt: invite.expiresAt, accessDurationDays,
            },
        });
    } catch (error: unknown) {
        return toErrorResponse(error, { log, message: '초대 코드 발행에 실패했습니다.' });
    }
}

export async function DELETE(request: NextRequest) {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    if (!canIssueInviteCode(authResult.role)) {
        return NextResponse.json({ error: '초대 코드를 회수할 권한이 없습니다.' }, { status: 403 });
    }

    try {
        const parsed = revokeSchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json({ error: 'id 가 필요합니다.' }, { status: 400 });
        }

        const invite = await prisma.inviteCode.findUnique({
            where: { id: parsed.data.id },
            select: { id: true, usedAt: true },
        });
        if (!invite) {
            return NextResponse.json({ error: '초대 코드를 찾을 수 없습니다.' }, { status: 404 });
        }
        if (invite.usedAt) {
            return NextResponse.json({ error: '이미 사용된 코드는 회수할 수 없습니다.' }, { status: 400 });
        }

        // 삭제가 아니라 만료 처리다. 누가 누구에게 발급했는지가 이력으로 남아야 한다.
        await prisma.inviteCode.update({
            where: { id: invite.id },
            data: { expiresAt: new Date() },
        });

        log.info('초대 코드 회수', { inviteId: invite.id });
        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        return toErrorResponse(error, { log, message: '초대 코드 회수에 실패했습니다.' });
    }
}
```

- [ ] **Step 4: `generateId` 접두사에 `'invite'` 를 추가한다**

`lib/id.ts:11` 의 union 에는 `'invite'` 가 **없다**(확인됨). 없는 값을 쓰면 컴파일되지 않으므로 먼저 넣는다.

기존:
```typescript
    prefix: 'user' | 'proj' | 'member' | 'response' | 'inv' | 'spec' | 'attr' | 'fitness' | 'rel' | 'corr' | 'bm' | 'tech'
```

수정:
```typescript
    prefix: 'user' | 'proj' | 'member' | 'response' | 'inv' | 'invite' | 'spec' | 'attr' | 'fitness' | 'rel' | 'corr' | 'bm' | 'tech'
```

`'inv'` 는 이미 Kano 설문 초대(`KanoSurveyInvitation`)가 쓰고 있으므로 재사용하지 않는다. 회원 초대 코드는 `'invite'` 로 구분한다.

- [ ] **Step 5: 검증하고 커밋한다**

```bash
npx vitest run tests/api-invites.test.ts && npm test && npx tsc --noEmit && npm run lint
git add app/api/invites/route.ts tests/api-invites.test.ts lib/id.ts
git commit -m "feat: add invite code issue, list, and revoke API

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: 초대 코드 가입과 프로필

설계 5.1. 코드가 있으면 자동 승인·역할 부여·만료 설정을 **하나의 트랜잭션**에서 처리한다. 코드가 없으면 현행대로 승인 대기다. 어느 쪽이든 프로필은 함께 받는다.

**Files:**
- Modify: `app/api/auth/signup/route.ts`
- Create: `tests/api-signup-invite.test.ts`

**Interfaces:**
- Consumes: `checkInviteCode`, `normalizeInviteCode`, `INVITE_CODE_MESSAGES` (`lib/invite-code.ts`); `memberProfileSchemaFor` (Task 4); `accessExpiryFrom`, `parseInvitableRole` (`lib/member-roles.ts`)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/api-signup-invite.test.ts` 를 만든다.

```typescript
// 초대 코드 가입이 역할·만료·승인을 한 트랜잭션에서 처리하는지 확인한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const findUniqueUser = vi.fn();
const findUniqueInvite = vi.fn();
const transaction = vi.fn();
const txCreateUser = vi.fn();
const txCreateProfile = vi.fn();
const txUpdateInvite = vi.fn();

vi.mock('../lib/prisma', () => ({
    prisma: {
        user: { findUnique: findUniqueUser },
        inviteCode: { findUnique: findUniqueInvite },
        $transaction: (fn: unknown) => transaction(fn),
    },
}));

vi.mock('../lib/rate-limit', () => ({
    SIGNUP_RATE_LIMIT: {},
    clientIpFrom: () => '127.0.0.1',
    consumeRateLimit: () => ({ allowed: true }),
}));

const { POST } = await import('../app/api/auth/signup/route');

const menteeProfile = {
    organization: '가나대', phone: '010-0000-0000', privacyConsent: true,
    companyName: '가나테크', industry: '제조',
};
const mentorProfile = {
    organization: '가나대', phone: '010-0000-0000', privacyConsent: true,
    expertise: '재료공학', careerYears: 10,
};

function signupRequest(body: unknown): NextRequest {
    return new NextRequest('http://localhost/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

beforeEach(() => {
    findUniqueUser.mockResolvedValue(null);
    findUniqueInvite.mockResolvedValue(null);
    txCreateUser.mockResolvedValue({ id: 'user_new', email: 'm@x.com', name: '새회원' });
    txCreateProfile.mockResolvedValue({});
    txUpdateInvite.mockResolvedValue({});
    transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
            user: { create: txCreateUser },
            memberProfile: { create: txCreateProfile },
            inviteCode: { update: txUpdateInvite },
        })
    );
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('초대 코드 없는 가입', () => {
    it('승인 대기 상태로 만들고 멘티 역할을 준다', async () => {
        const res = await POST(signupRequest({
            name: '새회원', email: 'm@x.com', password: 'password123', profile: menteeProfile,
        }));
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.pendingApproval).toBe(true);
        const created = txCreateUser.mock.calls[0][0].data;
        expect(created.status).toBe('PENDING');
        expect(created.role).toBe('MENTEE');
        expect(created.accessExpiresAt).toBeNull();
    });

    it('프로필이 없으면 막는다', async () => {
        const res = await POST(signupRequest({
            name: '새회원', email: 'm@x.com', password: 'password123',
        }));

        expect(res.status).toBe(400);
        expect(transaction).not.toHaveBeenCalled();
    });

    it('개인정보 동의가 없으면 막는다', async () => {
        const res = await POST(signupRequest({
            name: '새회원', email: 'm@x.com', password: 'password123',
            profile: { ...menteeProfile, privacyConsent: false },
        }));

        expect(res.status).toBe(400);
    });
});

describe('초대 코드 가입', () => {
    const validInvite = {
        id: 'inv_1', code: 'KSQF-ABCD-EFGH-JKMN', email: 'm@x.com', role: 'MENTOR',
        expiresAt: new Date(Date.now() + 86400000), accessDurationDays: 90, usedAt: null,
    };

    it('코드의 역할을 부여하고 자동 승인한다', async () => {
        // 관리자가 특정 이메일로 코드를 발급한 행위 자체가 승인이다.
        findUniqueInvite.mockResolvedValue(validInvite);

        const res = await POST(signupRequest({
            name: '새회원', email: 'm@x.com', password: 'password123',
            inviteCode: 'KSQF-ABCD-EFGH-JKMN', profile: mentorProfile,
        }));

        expect(res.status).toBe(200);
        const created = txCreateUser.mock.calls[0][0].data;
        expect(created.role).toBe('MENTOR');
        expect(created.status).toBe('APPROVED');
        expect(created.accessExpiresAt).toBeInstanceOf(Date);
    });

    it('코드를 사용 처리한다', async () => {
        findUniqueInvite.mockResolvedValue(validInvite);

        await POST(signupRequest({
            name: '새회원', email: 'm@x.com', password: 'password123',
            inviteCode: 'KSQF-ABCD-EFGH-JKMN', profile: mentorProfile,
        }));

        expect(txUpdateInvite).toHaveBeenCalled();
        expect(txUpdateInvite.mock.calls[0][0].data.usedAt).toBeInstanceOf(Date);
    });

    it('다른 이메일로는 쓸 수 없다', async () => {
        findUniqueInvite.mockResolvedValue(validInvite);

        const res = await POST(signupRequest({
            name: '새회원', email: 'other@x.com', password: 'password123',
            inviteCode: 'KSQF-ABCD-EFGH-JKMN', profile: mentorProfile,
        }));

        expect(res.status).toBe(400);
        expect(transaction).not.toHaveBeenCalled();
    });

    it('없는 코드를 막는다', async () => {
        findUniqueInvite.mockResolvedValue(null);

        const res = await POST(signupRequest({
            name: '새회원', email: 'm@x.com', password: 'password123',
            inviteCode: 'KSQF-ZZZZ-ZZZZ-ZZZZ', profile: mentorProfile,
        }));

        expect(res.status).toBe(400);
    });

    it('멘토 코드인데 멘티 항목만 보내면 막는다', async () => {
        // 역할이 코드로 정해지므로 그 역할에 맞는 항목을 요구한다.
        findUniqueInvite.mockResolvedValue(validInvite);

        const res = await POST(signupRequest({
            name: '새회원', email: 'm@x.com', password: 'password123',
            inviteCode: 'KSQF-ABCD-EFGH-JKMN', profile: menteeProfile,
        }));

        expect(res.status).toBe(400);
        expect(transaction).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

```bash
npx vitest run tests/api-signup-invite.test.ts
```

Expected: FAIL — 프로필과 초대 코드를 다루지 않는다.

- [ ] **Step 3: 구현한다**

`app/api/auth/signup/route.ts` 의 `signupSchema` 를 바꾼다.

```typescript
const signupSchema = z.object({
    name: z.string().min(1, '이름을 입력하세요'),
    email: z.string().email('유효한 이메일을 입력하세요'),
    password: z.string().min(8, '비밀번호는 최소 8자 이상이어야 합니다'),
    inviteCode: z.string().optional(),
    profile: z.record(z.unknown()),
});
```

기존 사용자 확인 뒤, 비밀번호 해시 앞에 초대 코드 처리와 프로필 검증을 넣는다.

```typescript
        // 초대 코드가 있으면 역할이 코드로 정해지고, 그 역할에 맞는 프로필을 받는다.
        let invite: { id: string; role: string; accessDurationDays: number } | null = null;
        let role: MemberRole = 'MENTEE';

        if (inviteCode) {
            const normalized = normalizeInviteCode(inviteCode);
            const record = await prisma.inviteCode.findUnique({ where: { code: normalized } });
            const rejection = checkInviteCode(record, email);
            if (rejection) {
                return NextResponse.json({ error: INVITE_CODE_MESSAGES[rejection] }, { status: 400 });
            }
            const inviteRole = parseInvitableRole(record!.role);
            if (!inviteRole) {
                return NextResponse.json({ error: INVITE_CODE_MESSAGES.NOT_FOUND }, { status: 400 });
            }
            invite = { id: record!.id, role: inviteRole, accessDurationDays: record!.accessDurationDays };
            role = inviteRole;
        }

        const profileResult = memberProfileSchemaFor(role).safeParse(profile);
        if (!profileResult.success) {
            return NextResponse.json(
                { error: profileResult.error.errors[0].message },
                { status: 400 }
            );
        }
        const profileData = profileResult.data as Record<string, unknown>;
```

`prisma.user.create` 를 트랜잭션으로 바꾼다.

```typescript
        const now = new Date();
        const newUser = await prisma.$transaction(async (tx) => {
            const user = await tx.user.create({
                data: {
                    id: generateId('user'),
                    name,
                    email,
                    passwordHash,
                    role,
                    // 코드를 발급한 행위 자체가 승인이다. 승인 대기로 두면
                    // 3개월 시계가 대기 중에 흘러가 버린다.
                    status: invite ? 'APPROVED' : 'PENDING',
                    accessExpiresAt: invite ? accessExpiryFrom(now, invite.accessDurationDays) : null,
                },
            });

            await tx.memberProfile.create({
                data: {
                    userId: user.id,
                    organization: profileData.organization as string,
                    jobTitle: (profileData.jobTitle as string) ?? null,
                    phone: profileData.phone as string,
                    expertise: (profileData.expertise as string) ?? null,
                    careerYears: (profileData.careerYears as number) ?? null,
                    careerSummary: (profileData.careerSummary as string) ?? null,
                    companyName: (profileData.companyName as string) ?? null,
                    industry: (profileData.industry as string) ?? null,
                    foundedYear: (profileData.foundedYear as number) ?? null,
                    privacyConsentAt: now,
                },
            });

            if (invite) {
                await tx.inviteCode.update({
                    where: { id: invite.id },
                    data: { usedAt: now, usedById: user.id },
                });
            }

            return user;
        });
```

응답을 바꾼다.

```typescript
        log.info('회원가입 완료', { userId: newUser.id, role, viaInvite: Boolean(invite) });
        return NextResponse.json({
            success: true,
            pendingApproval: !invite,
            message: invite
                ? '가입이 완료되었습니다. 바로 로그인할 수 있습니다.'
                : '가입이 접수되었습니다. 관리자 승인 후 로그인할 수 있습니다.',
            user: { id: newUser.id, name: newUser.name, email: newUser.email },
        });
```

import 를 추가한다.

```typescript
import { checkInviteCode, normalizeInviteCode, INVITE_CODE_MESSAGES } from '@/lib/invite-code';
import { accessExpiryFrom, parseInvitableRole, type MemberRole } from '@/lib/member-roles';
import { memberProfileSchemaFor } from '@/lib/member-profile';
```

구조 분해도 새 필드를 받게 고친다.

```typescript
        const { name, email, password, inviteCode, profile } = signupSchema.parse(body);
```

- [ ] **Step 4: 검증하고 커밋한다**

```bash
npx vitest run tests/api-signup-invite.test.ts && npm test && npx tsc --noEmit
git add app/api/auth/signup/route.ts tests/api-signup-invite.test.ts
git commit -m "feat: accept invite codes and registration profiles at signup

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 9: 멘토 배정 API

설계 5·2.1. 배정은 `ProjectMember.role = 'COACH'` 로 기록한다. COACH 는 이미 `WRITE_ROLES` 밖이라 읽기 전용이 보장된다. 새 프로젝트 역할을 만들지 않는다.

**Files:**
- Create: `app/api/projects/[id]/mentors/route.ts`
- Create: `tests/api-mentor-assign.test.ts`

**Interfaces:**
- Consumes: `canAssignMentor`, `parseMemberRole` (`lib/member-roles.ts`)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/api-mentor-assign.test.ts` 를 만든다.

```typescript
// 멘토 배정이 역할 게이트를 지키고 대상 역할을 검사하는지 확인한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const findUniqueUser = vi.fn();
const findUniqueProject = vi.fn();
const findUniqueMember = vi.fn();
const createMember = vi.fn();
const deleteMember = vi.fn();
const findManyMember = vi.fn();

vi.mock('../lib/prisma', () => ({
    prisma: {
        user: { findUnique: findUniqueUser },
        project: { findUnique: findUniqueProject },
        projectMember: {
            findUnique: findUniqueMember, create: createMember,
            delete: deleteMember, findMany: findManyMember,
        },
    },
}));

const requireAuth = vi.fn();
vi.mock('../lib/auth', () => ({
    requireAuth: (...args: unknown[]) => requireAuth(...(args as [])),
}));

const { GET, POST, DELETE } = await import('../app/api/projects/[id]/mentors/route');

const params = { params: Promise.resolve({ id: 'proj_1' }) };

function authAs(role: string) {
    requireAuth.mockResolvedValue({
        userId: 'actor_1', email: 'a@x.com', name: '실행자',
        isAdmin: role === 'ADMIN', role, accessExpiresAt: null,
    });
}

function jsonRequest(method: string, body: unknown): NextRequest {
    return new NextRequest('http://localhost/api/projects/proj_1/mentors', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

beforeEach(() => {
    findUniqueProject.mockResolvedValue({ id: 'proj_1' });
    findUniqueUser.mockResolvedValue({ id: 'mentor_1', role: 'MENTOR', name: '멘토', email: 'm@x.com' });
    findUniqueMember.mockResolvedValue(null);
    createMember.mockResolvedValue({ id: 'pm_1' });
    deleteMember.mockResolvedValue({ id: 'pm_1' });
    findManyMember.mockResolvedValue([]);
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('멘토 배정 권한', () => {
    it('매니저는 배정할 수 있다', async () => {
        authAs('PROGRAM_MANAGER');

        const res = await POST(jsonRequest('POST', { userId: 'mentor_1' }), params);

        expect(res.status).toBe(200);
        expect(createMember).toHaveBeenCalled();
    });

    it('관리자는 배정할 수 있다', async () => {
        authAs('ADMIN');

        const res = await POST(jsonRequest('POST', { userId: 'mentor_1' }), params);

        expect(res.status).toBe(200);
    });

    it('멘토는 배정할 수 없다', async () => {
        authAs('MENTOR');

        const res = await POST(jsonRequest('POST', { userId: 'mentor_1' }), params);

        expect(res.status).toBe(403);
        expect(createMember).not.toHaveBeenCalled();
    });

    it('멘티는 배정할 수 없다', async () => {
        authAs('MENTEE');

        const res = await POST(jsonRequest('POST', { userId: 'mentor_1' }), params);

        expect(res.status).toBe(403);
    });
});

describe('배정 대상 역할', () => {
    beforeEach(() => authAs('ADMIN'));

    it('COACH 로 기록한다', async () => {
        // 새 프로젝트 역할을 만들지 않는다. COACH 는 이미 읽기 전용이다.
        await POST(jsonRequest('POST', { userId: 'mentor_1' }), params);

        expect(createMember.mock.calls[0][0].data.role).toBe('COACH');
    });

    it('매니저도 멘토로 배정할 수 있다', async () => {
        // 매니저는 멘토에서 승격되므로 겸직이 성립해야 한다.
        findUniqueUser.mockResolvedValue({ id: 'pm_2', role: 'PROGRAM_MANAGER', name: '매니저', email: 'p@x.com' });

        const res = await POST(jsonRequest('POST', { userId: 'pm_2' }), params);

        expect(res.status).toBe(200);
    });

    it('멘티는 멘토로 배정할 수 없다', async () => {
        findUniqueUser.mockResolvedValue({ id: 'mentee_1', role: 'MENTEE', name: '멘티', email: 'e@x.com' });

        const res = await POST(jsonRequest('POST', { userId: 'mentee_1' }), params);

        expect(res.status).toBe(400);
        expect(createMember).not.toHaveBeenCalled();
    });

    it('이미 배정된 사람은 중복 배정하지 않는다', async () => {
        findUniqueMember.mockResolvedValue({ id: 'pm_existing', role: 'COACH' });

        const res = await POST(jsonRequest('POST', { userId: 'mentor_1' }), params);

        expect(res.status).toBe(409);
        expect(createMember).not.toHaveBeenCalled();
    });
});

describe('배정 해제', () => {
    beforeEach(() => authAs('PROGRAM_MANAGER'));

    it('매니저가 해제할 수 있다', async () => {
        findUniqueMember.mockResolvedValue({ id: 'pm_1', role: 'COACH' });

        const res = await DELETE(jsonRequest('DELETE', { userId: 'mentor_1' }), params);

        expect(res.status).toBe(200);
        expect(deleteMember).toHaveBeenCalled();
    });

    it('소유자는 해제 대상이 아니다', async () => {
        // 해제는 배정된 멘토(COACH)만 대상으로 한다.
        findUniqueMember.mockResolvedValue({ id: 'pm_1', role: 'EDITOR' });

        const res = await DELETE(jsonRequest('DELETE', { userId: 'editor_1' }), params);

        expect(res.status).toBe(400);
        expect(deleteMember).not.toHaveBeenCalled();
    });
});

describe('배정 목록', () => {
    it('멘티는 목록을 볼 수 없다', async () => {
        authAs('MENTEE');

        const res = await GET(new NextRequest('http://localhost/api/projects/proj_1/mentors'), params);

        expect(res.status).toBe(403);
    });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

```bash
npx vitest run tests/api-mentor-assign.test.ts
```

Expected: FAIL — 모듈이 없다.

- [ ] **Step 3: 구현한다**

`app/api/projects/[id]/mentors/route.ts` 를 만든다.

```typescript
// 프로젝트에 멘토를 배정하고 해제하는 API.
//
// 배정은 ProjectMember.role = 'COACH' 로 기록한다. COACH 는 WRITE_ROLES 밖이라
// 읽기 전용이 보장되므로 새 프로젝트 역할을 만들지 않는다.
//
// 매니저도 배정하므로 requireAdmin 이 아니라 시스템 역할 게이트를 쓴다.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { generateId } from '@/lib/id';
import { createLogger } from '@/lib/logger';
import { toErrorResponse } from '@/lib/api-error';
import { canAssignMentor, parseMemberRole } from '@/lib/member-roles';

const log = createLogger('api/mentors');

const bodySchema = z.object({ userId: z.string().min(1) });

export async function GET(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const { id: projectId } = await props.params;
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    if (!canAssignMentor(authResult.role)) {
        return NextResponse.json({ error: '멘토 배정을 볼 권한이 없습니다.' }, { status: 403 });
    }

    try {
        const members = await prisma.projectMember.findMany({
            where: { projectId, role: 'COACH' },
            select: {
                id: true, userId: true, joinedAt: true,
                user: { select: { name: true, email: true, role: true } },
            },
        });

        return NextResponse.json({ mentors: members });
    } catch (error: unknown) {
        return toErrorResponse(error, { log, message: '멘토 목록을 불러오지 못했습니다.', context: { projectId } });
    }
}

export async function POST(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const { id: projectId } = await props.params;
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    if (!canAssignMentor(authResult.role)) {
        return NextResponse.json({ error: '멘토를 배정할 권한이 없습니다.' }, { status: 403 });
    }

    try {
        const parsed = bodySchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json({ error: 'userId 가 필요합니다.' }, { status: 400 });
        }

        const project = await prisma.project.findUnique({
            where: { id: projectId },
            select: { id: true },
        });
        if (!project) {
            return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
        }

        const target = await prisma.user.findUnique({
            where: { id: parsed.data.userId },
            select: { id: true, name: true, email: true, role: true },
        });
        if (!target) {
            return NextResponse.json({ error: '대상 회원을 찾을 수 없습니다.' }, { status: 404 });
        }

        // 매니저는 멘토에서 승격되므로 겸직 대상이다. 멘티·관리자는 배정하지 않는다.
        const targetRole = parseMemberRole(target.role);
        if (targetRole !== 'MENTOR' && targetRole !== 'PROGRAM_MANAGER') {
            return NextResponse.json(
                { error: '멘토 또는 프로그램 매니저만 배정할 수 있습니다.' },
                { status: 400 }
            );
        }

        const existing = await prisma.projectMember.findUnique({
            where: { projectId_userId: { projectId, userId: target.id } },
            select: { id: true, role: true },
        });
        if (existing) {
            return NextResponse.json({ error: '이미 이 프로젝트에 참여 중입니다.' }, { status: 409 });
        }

        await prisma.projectMember.create({
            data: {
                id: generateId('member'),
                projectId,
                userId: target.id,
                role: 'COACH',
                invitedBy: authResult.userId,
                joinedAt: new Date(),
            },
        });

        log.info('멘토 배정', { projectId, mentorUserId: target.id });
        return NextResponse.json({
            success: true,
            mentor: { userId: target.id, name: target.name, role: 'COACH' },
        });
    } catch (error: unknown) {
        return toErrorResponse(error, { log, message: '멘토 배정에 실패했습니다.', context: { projectId } });
    }
}

export async function DELETE(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const { id: projectId } = await props.params;
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    if (!canAssignMentor(authResult.role)) {
        return NextResponse.json({ error: '멘토 배정을 해제할 권한이 없습니다.' }, { status: 403 });
    }

    try {
        const parsed = bodySchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json({ error: 'userId 가 필요합니다.' }, { status: 400 });
        }

        const member = await prisma.projectMember.findUnique({
            where: { projectId_userId: { projectId, userId: parsed.data.userId } },
            select: { id: true, role: true },
        });
        if (!member) {
            return NextResponse.json({ error: '배정 기록을 찾을 수 없습니다.' }, { status: 404 });
        }
        // 해제는 배정된 멘토만 대상으로 한다. 편집자·소유자를 여기서 떼지 않는다.
        if (member.role !== 'COACH') {
            return NextResponse.json({ error: '멘토로 배정된 회원이 아닙니다.' }, { status: 400 });
        }

        await prisma.projectMember.delete({ where: { id: member.id } });

        log.info('멘토 배정 해제', { projectId, mentorUserId: parsed.data.userId });
        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        return toErrorResponse(error, { log, message: '멘토 배정 해제에 실패했습니다.', context: { projectId } });
    }
}
```

- [ ] **Step 4: 검증하고 커밋한다**

```bash
npx vitest run tests/api-mentor-assign.test.ts && npm test && npx tsc --noEmit && npm run lint
git add "app/api/projects/[id]/mentors/route.ts" tests/api-mentor-assign.test.ts
git commit -m "feat: add mentor assignment API for program managers

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 10: 관리자 회원 API — 생성·역할 변경·기간 연장

설계 5.2. `role` 이 단일 진실이고 `isAdmin` 은 동기화 대상이다. 마지막 관리자 강등을 막고, 권한이 줄어드는 변경은 `sessionVersion` 을 올려 발급된 세션을 끊는다.

**Files:**
- Modify: `app/api/admin/users/route.ts`
- Create: `tests/api-admin-user-role.test.ts`

**Interfaces:**
- Consumes: `canTransitionRole`, `parseMemberRole`, `parseInvitableRole`, `MEMBER_ROLE_LABELS`, `accessExpiryFrom` (`lib/member-roles.ts`); `buildTempPasswordEmail` (Task 6); `sendMail`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/api-admin-user-role.test.ts` 를 만든다.

```typescript
// 역할 변경·계정 생성·기간 연장이 규칙을 지키는지 확인한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const findUniqueUser = vi.fn();
const countUser = vi.fn();
const updateUser = vi.fn();
const transaction = vi.fn();
const txCreateUser = vi.fn();
const txCreateProfile = vi.fn();

vi.mock('../lib/prisma', () => ({
    prisma: {
        user: { findUnique: findUniqueUser, count: countUser, update: updateUser, findMany: vi.fn(async () => []) },
        project: { count: vi.fn(async () => 0) },
        $transaction: (fn: unknown) => transaction(fn),
    },
}));

const requireAdmin = vi.fn();
vi.mock('../lib/authorization', () => ({
    requireAdmin: (...args: unknown[]) => requireAdmin(...(args as [])),
}));

const sendMail = vi.fn();
vi.mock('../lib/email', () => ({
    sendMail: (...args: unknown[]) => sendMail(...(args as [])),
}));

const { PATCH, POST } = await import('../app/api/admin/users/route');

const ADMIN = { userId: 'admin_1', email: 'a@x.com', name: '관리자' };

function jsonRequest(method: string, body: unknown): NextRequest {
    return new NextRequest('http://localhost/api/admin/users', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

beforeEach(() => {
    requireAdmin.mockResolvedValue(ADMIN);
    findUniqueUser.mockResolvedValue({ id: 'user_2', email: 'u@x.com', role: 'MENTOR', isAdmin: false });
    countUser.mockResolvedValue(2);
    updateUser.mockResolvedValue({ id: 'user_2', email: 'u@x.com', role: 'PROGRAM_MANAGER' });
    txCreateUser.mockResolvedValue({ id: 'user_new', email: 'n@x.com', name: '새회원' });
    txCreateProfile.mockResolvedValue({});
    transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({ user: { create: txCreateUser }, memberProfile: { create: txCreateProfile } })
    );
    sendMail.mockResolvedValue(true);
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('역할 변경', () => {
    it('멘토를 매니저로 승격한다', async () => {
        const res = await PATCH(jsonRequest('PATCH', {
            userId: 'user_2', action: 'setRole', role: 'PROGRAM_MANAGER',
        }));

        expect(res.status).toBe(200);
        expect(updateUser).toHaveBeenCalled();
    });

    it('멘티를 바로 매니저로 올릴 수 없다', async () => {
        // 매니저는 멘토 중에서 선택한다. 두 단계를 강제한다.
        findUniqueUser.mockResolvedValue({ id: 'user_2', email: 'u@x.com', role: 'MENTEE', isAdmin: false });

        const res = await PATCH(jsonRequest('PATCH', {
            userId: 'user_2', action: 'setRole', role: 'PROGRAM_MANAGER',
        }));
        const body = await res.json();

        expect(res.status).toBe(400);
        expect(body.error).toContain('멘토');
        expect(updateUser).not.toHaveBeenCalled();
    });

    it('관리자로 올리면 isAdmin 도 함께 켠다', async () => {
        const res = await PATCH(jsonRequest('PATCH', {
            userId: 'user_2', action: 'setRole', role: 'ADMIN',
        }));

        expect(res.status).toBe(200);
        expect(updateUser.mock.calls[0][0].data.isAdmin).toBe(true);
    });

    it('마지막 관리자를 강등할 수 없다', async () => {
        findUniqueUser.mockResolvedValue({ id: 'user_2', email: 'u@x.com', role: 'ADMIN', isAdmin: true });
        countUser.mockResolvedValue(1);

        const res = await PATCH(jsonRequest('PATCH', {
            userId: 'user_2', action: 'setRole', role: 'MENTOR',
        }));

        expect(res.status).toBe(400);
        expect(updateUser).not.toHaveBeenCalled();
    });

    it('강등하면 발급된 세션을 끊는다', async () => {
        // 권한이 줄어드는 변경은 로그인 중인 사용자에게도 즉시 적용돼야 한다.
        findUniqueUser.mockResolvedValue({ id: 'user_2', email: 'u@x.com', role: 'ADMIN', isAdmin: true });
        countUser.mockResolvedValue(3);

        await PATCH(jsonRequest('PATCH', {
            userId: 'user_2', action: 'setRole', role: 'MENTOR',
        }));

        expect(updateUser.mock.calls[0][0].data.sessionVersion).toEqual({ increment: 1 });
    });
});

describe('기간 연장', () => {
    it('만료일을 지정한 일수만큼 미룬다', async () => {
        const res = await PATCH(jsonRequest('PATCH', {
            userId: 'user_2', action: 'extendAccess', days: 30,
        }));

        expect(res.status).toBe(200);
        expect(updateUser.mock.calls[0][0].data.accessExpiresAt).toBeInstanceOf(Date);
    });

    it('일수가 없으면 막는다', async () => {
        const res = await PATCH(jsonRequest('PATCH', { userId: 'user_2', action: 'extendAccess' }));

        expect(res.status).toBe(400);
    });
});

describe('계정 생성', () => {
    const profile = {
        organization: '가나대', phone: '010-0000-0000', privacyConsent: true,
        expertise: '재료공학', careerYears: 10,
    };

    it('멘토 계정을 만들고 임시 비밀번호를 보낸다', async () => {
        findUniqueUser.mockResolvedValue(null);

        const res = await POST(jsonRequest('POST', {
            name: '새회원', email: 'n@x.com', role: 'MENTOR', profile,
        }));

        expect(res.status).toBe(200);
        expect(txCreateUser.mock.calls[0][0].data.mustChangePassword).toBe(true);
        expect(sendMail).toHaveBeenCalled();
    });

    it('만든 계정은 바로 승인 상태다', async () => {
        findUniqueUser.mockResolvedValue(null);

        await POST(jsonRequest('POST', { name: '새회원', email: 'n@x.com', role: 'MENTOR', profile }));

        expect(txCreateUser.mock.calls[0][0].data.status).toBe('APPROVED');
    });

    it('매니저 역할로는 만들 수 없다', async () => {
        // 매니저는 멘토에서 승격으로만 생긴다.
        findUniqueUser.mockResolvedValue(null);

        const res = await POST(jsonRequest('POST', {
            name: '새회원', email: 'n@x.com', role: 'PROGRAM_MANAGER', profile,
        }));

        expect(res.status).toBe(400);
        expect(transaction).not.toHaveBeenCalled();
    });

    it('임시 비밀번호를 응답에 담지 않는다', async () => {
        // 평문은 본인 메일로만 간다. 관리자 화면에 남기지 않는다.
        findUniqueUser.mockResolvedValue(null);

        const res = await POST(jsonRequest('POST', { name: '새회원', email: 'n@x.com', role: 'MENTOR', profile }));
        const body = await res.json();

        expect(JSON.stringify(body)).not.toContain('tempPassword');
    });

    it('메일 발송이 실패하면 알린다', async () => {
        findUniqueUser.mockResolvedValue(null);
        sendMail.mockResolvedValue(false);

        const res = await POST(jsonRequest('POST', { name: '새회원', email: 'n@x.com', role: 'MENTOR', profile }));
        const body = await res.json();

        expect(body.emailSent).toBe(false);
    });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

```bash
npx vitest run tests/api-admin-user-role.test.ts
```

Expected: FAIL — `POST` 가 없고 `setRole` 액션도 없다.

- [ ] **Step 3: PATCH 에 액션을 추가한다**

`app/api/admin/users/route.ts` 의 PATCH 에서 action 검사를 넓힌다. 기존 `approve`/`revoke` 분기는 그대로 두고 아래를 추가한다.

```typescript
        if (action === 'setRole') {
            const nextRole = parseMemberRole(body?.role);
            if (!nextRole) {
                return NextResponse.json({ error: '알 수 없는 역할입니다.' }, { status: 400 });
            }
            const currentRole = parseMemberRole(target.role) ?? 'MENTEE';

            if (!canTransitionRole(currentRole, nextRole)) {
                return NextResponse.json(
                    {
                        error: nextRole === 'PROGRAM_MANAGER'
                            ? '프로그램 매니저는 멘토 중에서만 승격할 수 있습니다. 먼저 멘토로 바꾸세요.'
                            : '허용되지 않는 역할 변경입니다.',
                    },
                    { status: 400 }
                );
            }

            // 마지막 관리자를 강등하면 승인·관리 기능이 영구히 잠긴다.
            if (target.isAdmin && nextRole !== 'ADMIN') {
                const adminCount = await prisma.user.count({ where: { isAdmin: true } });
                if (adminCount <= 1) {
                    return NextResponse.json(
                        { error: '마지막 관리자 계정은 강등할 수 없습니다.' },
                        { status: 400 }
                    );
                }
            }

            // role 이 단일 진실이고 isAdmin 은 동기화 대상이다.
            const isAdmin = nextRole === 'ADMIN';
            // 권한이 줄어드는 변경은 발급된 세션을 끊어야 즉시 적용된다.
            const losesPower = target.isAdmin && !isAdmin;

            const updated = await prisma.user.update({
                where: { id: userId },
                data: {
                    role: nextRole,
                    isAdmin,
                    ...(losesPower ? { sessionVersion: { increment: 1 } } : {}),
                },
                select: { id: true, email: true, role: true, isAdmin: true },
            });

            log.info('역할 변경', { userId, role: nextRole });
            return NextResponse.json({ success: true, user: updated });
        }

        if (action === 'extendAccess') {
            const days = typeof body?.days === 'number' ? body.days : null;
            if (!days || days < 1 || days > 365) {
                return NextResponse.json({ error: '연장할 일수(1~365)를 지정하세요.' }, { status: 400 });
            }

            const updated = await prisma.user.update({
                where: { id: userId },
                data: { accessExpiresAt: accessExpiryFrom(new Date(), days) },
                select: { id: true, email: true, accessExpiresAt: true },
            });

            log.info('접근 기간 연장', { userId, days });
            return NextResponse.json({ success: true, user: updated });
        }
```

action 검증 조건도 새 값을 받게 고친다.

```typescript
        const allowedActions = ['approve', 'revoke', 'setRole', 'extendAccess'];
        if (!userId || !allowedActions.includes(action ?? '')) {
            return NextResponse.json(
                { error: 'userId 와 action(approve|revoke|setRole|extendAccess)이 필요합니다.' },
                { status: 400 }
            );
        }
```

- [ ] **Step 4: POST(계정 생성)를 추가한다**

같은 파일에 추가한다.

```typescript
// ─── POST: 멘토·멘티 계정 생성 ────────────────────────────────────────
//
// 관리자가 평문 비밀번호를 다루지 않도록 서버가 임시 비밀번호를 만들어
// 본인에게만 메일로 보낸다. 받은 사람은 첫 로그인 때 반드시 바꾼다.

const createUserSchema = z.object({
    name: z.string().min(1, '이름을 입력하세요.'),
    email: z.string().email('유효한 이메일을 입력하세요.'),
    role: z.string(),
    accessDurationDays: z.number().int().min(1).max(365).optional(),
    profile: z.record(z.unknown()),
});

/** 사람이 옮겨 적을 임시 비밀번호. 헷갈리는 글자를 빼고 12자를 만든다. */
function generateTempPassword(): string {
    const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    const bytes = randomBytes(12);
    let out = '';
    for (let i = 0; i < 12; i++) out += alphabet[bytes[i] % alphabet.length];
    // 숫자와 기호를 하나씩 섞어 비밀번호 정책을 만족시킨다.
    return `${out}7!`;
}

export async function POST(request: NextRequest) {
    const adminResult = await requireAdmin(request);
    if (adminResult instanceof NextResponse) return adminResult;

    try {
        const parsed = createUserSchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
        }

        // 매니저는 멘토에서 승격으로만 생긴다. 관리자도 여기서 만들지 않는다.
        const role = parseInvitableRole(parsed.data.role);
        if (!role) {
            return NextResponse.json(
                { error: '멘토 또는 멘티 계정만 만들 수 있습니다.' },
                { status: 400 }
            );
        }

        const email = parsed.data.email.trim().toLowerCase();
        const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
        if (existing) {
            return NextResponse.json({ error: '이미 사용 중인 이메일입니다.' }, { status: 409 });
        }

        const profileResult = memberProfileSchemaFor(role).safeParse(parsed.data.profile);
        if (!profileResult.success) {
            return NextResponse.json({ error: profileResult.error.errors[0].message }, { status: 400 });
        }
        const profileData = profileResult.data as Record<string, unknown>;

        const tempPassword = generateTempPassword();
        const passwordHash = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS);
        const now = new Date();

        const created = await prisma.$transaction(async (tx) => {
            const user = await tx.user.create({
                data: {
                    id: generateId('user'),
                    name: parsed.data.name,
                    email,
                    passwordHash,
                    role,
                    status: 'APPROVED',
                    mustChangePassword: true,
                    accessExpiresAt: parsed.data.accessDurationDays
                        ? accessExpiryFrom(now, parsed.data.accessDurationDays)
                        : null,
                },
            });

            await tx.memberProfile.create({
                data: {
                    userId: user.id,
                    organization: profileData.organization as string,
                    jobTitle: (profileData.jobTitle as string) ?? null,
                    phone: profileData.phone as string,
                    expertise: (profileData.expertise as string) ?? null,
                    careerYears: (profileData.careerYears as number) ?? null,
                    careerSummary: (profileData.careerSummary as string) ?? null,
                    companyName: (profileData.companyName as string) ?? null,
                    industry: (profileData.industry as string) ?? null,
                    foundedYear: (profileData.foundedYear as number) ?? null,
                    privacyConsentAt: now,
                },
            });

            return user;
        });

        const origin = new URL(request.url).origin;
        const mail = buildTempPasswordEmail({
            tempPassword,
            roleLabel: MEMBER_ROLE_LABELS[role],
            loginUrl: `${origin}/login`,
            escapeHtml,
        });
        const emailSent = await sendMail({ to: email, subject: mail.subject, html: mail.html });

        log.info('계정 생성', { userId: created.id, role, emailSent });

        // 평문 비밀번호는 응답에 담지 않는다. 본인 메일로만 간다.
        return NextResponse.json({
            success: true,
            emailSent,
            user: { id: created.id, name: created.name, email: created.email, role },
        });
    } catch (error: unknown) {
        return toErrorResponse(error, { log, message: '계정 생성에 실패했습니다.' });
    }
}
```

파일 상단에 import 를 추가한다.

```typescript
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { BCRYPT_ROUNDS } from '@/lib/constants';
import { generateId } from '@/lib/id';
import { toErrorResponse } from '@/lib/api-error';
import { sendMail } from '@/lib/email';
import { escapeHtml } from '@/lib/html-escape';
import { buildTempPasswordEmail } from '@/lib/temp-password-email';
import { memberProfileSchemaFor } from '@/lib/member-profile';
import {
    accessExpiryFrom, canTransitionRole, parseInvitableRole,
    parseMemberRole, MEMBER_ROLE_LABELS,
} from '@/lib/member-roles';
```

- [ ] **Step 5: GET 응답에 역할과 만료를 추가한다**

같은 파일의 GET `select` 에 넣는다. 화면이 역할을 보여주려면 필요하다.

```typescript
                role: true,
                accessExpiresAt: true,
                mustChangePassword: true,
```

- [ ] **Step 6: 검증하고 커밋한다**

```bash
npx vitest run tests/api-admin-user-role.test.ts && npm test && npx tsc --noEmit && npm run lint
git add app/api/admin/users/route.ts tests/api-admin-user-role.test.ts
git commit -m "feat: add account creation, role change, and access extension for admins

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 11: 본인 프로필 API 와 첫 로그인 관문

설계 3.4·5. 프로필이 없는 회원과 임시 비밀번호를 받은 회원을 작성 화면으로 보낸다.

**Files:**
- Create: `app/api/me/profile/route.ts`
- Create: `tests/api-me-profile.test.ts`
- Modify: `app/api/auth/login/route.ts`

**Interfaces:**
- Consumes: `memberProfileSchemaFor` (Task 4)
- Produces: 로그인 응답에 `mustChangePassword: boolean`, `needsProfile: boolean`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/api-me-profile.test.ts` 를 만든다.

```typescript
// 본인 프로필 조회·수정이 역할에 맞는 항목을 요구하는지 확인한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const findUniqueProfile = vi.fn();
const upsertProfile = vi.fn();

vi.mock('../lib/prisma', () => ({
    prisma: { memberProfile: { findUnique: findUniqueProfile, upsert: upsertProfile } },
}));

const requireAuth = vi.fn();
vi.mock('../lib/auth', () => ({
    requireAuth: (...args: unknown[]) => requireAuth(...(args as [])),
}));

const { GET, PUT } = await import('../app/api/me/profile/route');

function authAs(role: string) {
    requireAuth.mockResolvedValue({
        userId: 'user_1', email: 'u@x.com', name: '사용자',
        isAdmin: false, role, accessExpiresAt: null,
    });
}

function putRequest(body: unknown): NextRequest {
    return new NextRequest('http://localhost/api/me/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

beforeEach(() => {
    findUniqueProfile.mockResolvedValue(null);
    upsertProfile.mockResolvedValue({ userId: 'user_1' });
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('프로필 조회', () => {
    it('없으면 needsProfile 을 알린다', async () => {
        authAs('MENTEE');

        const res = await GET(new NextRequest('http://localhost/api/me/profile'));
        const body = await res.json();

        expect(body.needsProfile).toBe(true);
        expect(body.profile).toBeNull();
    });

    it('있으면 그대로 돌려준다', async () => {
        authAs('MENTEE');
        findUniqueProfile.mockResolvedValue({ userId: 'user_1', organization: '가나대' });

        const res = await GET(new NextRequest('http://localhost/api/me/profile'));
        const body = await res.json();

        expect(body.needsProfile).toBe(false);
        expect(body.profile.organization).toBe('가나대');
    });
});

describe('프로필 저장', () => {
    it('멘티는 기업명과 업종을 내야 한다', async () => {
        authAs('MENTEE');

        const res = await PUT(putRequest({
            organization: '가나대', phone: '010-0000-0000', privacyConsent: true,
        }));

        expect(res.status).toBe(400);
        expect(upsertProfile).not.toHaveBeenCalled();
    });

    it('멘토는 전문분야와 경력을 내야 한다', async () => {
        authAs('MENTOR');

        const res = await PUT(putRequest({
            organization: '가나대', phone: '010-0000-0000', privacyConsent: true,
        }));

        expect(res.status).toBe(400);
    });

    it('역할에 맞으면 저장한다', async () => {
        authAs('MENTOR');

        const res = await PUT(putRequest({
            organization: '가나대', phone: '010-0000-0000', privacyConsent: true,
            expertise: '재료공학', careerYears: 10,
        }));

        expect(res.status).toBe(200);
        expect(upsertProfile).toHaveBeenCalled();
    });

    it('남의 프로필을 고칠 수 없다', async () => {
        // 경로에 userId 를 받지 않는다. 세션의 userId 만 쓴다.
        authAs('MENTOR');

        await PUT(putRequest({
            organization: '가나대', phone: '010-0000-0000', privacyConsent: true,
            expertise: '재료공학', careerYears: 10,
        }));

        expect(upsertProfile.mock.calls[0][0].where.userId).toBe('user_1');
    });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

```bash
npx vitest run tests/api-me-profile.test.ts
```

Expected: FAIL — 모듈이 없다.

- [ ] **Step 3: 구현한다**

`app/api/me/profile/route.ts` 를 만든다.

```typescript
// 본인 회원등록 정보를 조회·수정하는 API.
//
// 경로에 userId 를 받지 않는다. 세션의 userId 만 쓰므로 남의 프로필에
// 손댈 수 없다.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { createLogger } from '@/lib/logger';
import { toErrorResponse } from '@/lib/api-error';
import { memberProfileSchemaFor } from '@/lib/member-profile';

const log = createLogger('api/me/profile');

export async function GET(request: NextRequest) {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;

    try {
        const profile = await prisma.memberProfile.findUnique({
            where: { userId: authResult.userId },
        });

        return NextResponse.json({ profile, needsProfile: profile === null, role: authResult.role });
    } catch (error: unknown) {
        return toErrorResponse(error, { log, message: '프로필을 불러오지 못했습니다.' });
    }
}

export async function PUT(request: NextRequest) {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;

    try {
        const parsed = memberProfileSchemaFor(authResult.role).safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
        }
        const data = parsed.data as Record<string, unknown>;
        const now = new Date();

        const fields = {
            organization: data.organization as string,
            jobTitle: (data.jobTitle as string) ?? null,
            phone: data.phone as string,
            expertise: (data.expertise as string) ?? null,
            careerYears: (data.careerYears as number) ?? null,
            careerSummary: (data.careerSummary as string) ?? null,
            companyName: (data.companyName as string) ?? null,
            industry: (data.industry as string) ?? null,
            foundedYear: (data.foundedYear as number) ?? null,
        };

        await prisma.memberProfile.upsert({
            where: { userId: authResult.userId },
            create: { userId: authResult.userId, ...fields, privacyConsentAt: now },
            update: fields,
        });

        log.info('프로필 저장', { userId: authResult.userId });
        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        return toErrorResponse(error, { log, message: '프로필 저장에 실패했습니다.' });
    }
}
```

- [ ] **Step 4: 로그인 응답에 관문 정보를 넣는다**

`app/api/auth/login/route.ts` 에서 사용자 조회 뒤 프로필 유무를 함께 본다. 성공 응답에 두 값을 추가한다.

```typescript
        const hasProfile = await prisma.memberProfile.findUnique({
            where: { userId: user.id },
            select: { userId: true },
        });
```

성공 `NextResponse.json({...})` 에 추가한다.

```typescript
            mustChangePassword: user.mustChangePassword,
            needsProfile: hasProfile === null,
```

- [ ] **Step 5: 검증하고 커밋한다**

```bash
npx vitest run tests/api-me-profile.test.ts && npm test && npx tsc --noEmit && npm run lint
git add app/api/me/profile/route.ts tests/api-me-profile.test.ts app/api/auth/login/route.ts
git commit -m "feat: add self profile API and surface first-login gates

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 12: 가입·온보딩 화면

설계 6.2·6.3. 가입 화면은 초대 코드로 역할을 알아낸 뒤 그 역할에 맞는 항목만 보여준다. 멘토에게 기업명을 묻지 않기 위해서다.

**Files:**
- Create: `components/member/ProfileFields.tsx`
- Modify: `app/signup/page.tsx`
- Create: `app/onboarding/page.tsx`

**Interfaces:**
- Consumes: `POST /api/auth/signup`, `GET·PUT /api/me/profile`
- Produces: `<ProfileFields role={role} value={profile} onChange={setProfile} />`

- [ ] **Step 1: 공용 프로필 입력 컴포넌트를 만든다**

`components/member/ProfileFields.tsx` 를 만든다. 가입·온보딩·관리자 생성 세 화면이 공유한다.

```tsx
'use client';
// 역할에 맞는 회원등록 항목만 보여주는 공용 입력 폼.

import type { MemberRole } from '@/lib/member-roles';

export interface ProfileValue {
    organization: string;
    jobTitle: string;
    phone: string;
    expertise: string;
    careerYears: string;
    careerSummary: string;
    companyName: string;
    industry: string;
    foundedYear: string;
    privacyConsent: boolean;
}

export const EMPTY_PROFILE: ProfileValue = {
    organization: '', jobTitle: '', phone: '',
    expertise: '', careerYears: '', careerSummary: '',
    companyName: '', industry: '', foundedYear: '',
    privacyConsent: false,
};

/** 서버가 받는 형태로 바꾼다. 빈 값은 보내지 않아 선택 항목으로 남긴다. */
export function toProfilePayload(value: ProfileValue, role: MemberRole): Record<string, unknown> {
    const payload: Record<string, unknown> = {
        organization: value.organization,
        phone: value.phone,
        privacyConsent: value.privacyConsent,
    };
    if (value.jobTitle.trim()) payload.jobTitle = value.jobTitle;

    if (role === 'MENTOR' || role === 'PROGRAM_MANAGER') {
        payload.expertise = value.expertise;
        payload.careerYears = Number(value.careerYears);
        if (value.careerSummary.trim()) payload.careerSummary = value.careerSummary;
    } else if (role === 'MENTEE') {
        payload.companyName = value.companyName;
        payload.industry = value.industry;
        if (value.foundedYear.trim()) payload.foundedYear = Number(value.foundedYear);
    }
    return payload;
}

const inputClass = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm';

export default function ProfileFields({
    role,
    value,
    onChange,
    showConsent = true,
}: {
    role: MemberRole;
    value: ProfileValue;
    onChange: (next: ProfileValue) => void;
    showConsent?: boolean;
}) {
    const set = (key: keyof ProfileValue, v: string | boolean) => onChange({ ...value, [key]: v });
    const isMentorSide = role === 'MENTOR' || role === 'PROGRAM_MANAGER';

    return (
        <div className="space-y-3">
            <label className="block text-sm">
                소속기관명 <span className="text-red-500">*</span>
                <input className={inputClass} value={value.organization}
                    onChange={(e) => set('organization', e.target.value)} required />
            </label>

            <label className="block text-sm">
                직책·직위
                <input className={inputClass} value={value.jobTitle}
                    onChange={(e) => set('jobTitle', e.target.value)} />
            </label>

            <label className="block text-sm">
                휴대폰 <span className="text-red-500">*</span>
                <input className={inputClass} value={value.phone} placeholder="010-0000-0000"
                    onChange={(e) => set('phone', e.target.value)} required />
            </label>

            {isMentorSide && (
                <>
                    <label className="block text-sm">
                        전문분야 <span className="text-red-500">*</span>
                        <input className={inputClass} value={value.expertise}
                            onChange={(e) => set('expertise', e.target.value)} required />
                    </label>
                    <label className="block text-sm">
                        경력 연수 <span className="text-red-500">*</span>
                        <input type="number" min={0} className={inputClass} value={value.careerYears}
                            onChange={(e) => set('careerYears', e.target.value)} required />
                    </label>
                    <label className="block text-sm">
                        주요이력·보유자격
                        <textarea className={inputClass} rows={3} value={value.careerSummary}
                            onChange={(e) => set('careerSummary', e.target.value)} />
                    </label>
                </>
            )}

            {role === 'MENTEE' && (
                <>
                    <label className="block text-sm">
                        기업명 <span className="text-red-500">*</span>
                        <input className={inputClass} value={value.companyName}
                            onChange={(e) => set('companyName', e.target.value)} required />
                    </label>
                    <label className="block text-sm">
                        업종 <span className="text-red-500">*</span>
                        <input className={inputClass} value={value.industry}
                            onChange={(e) => set('industry', e.target.value)} required />
                    </label>
                    <label className="block text-sm">
                        창업 연차
                        <input type="number" min={0} className={inputClass} value={value.foundedYear}
                            onChange={(e) => set('foundedYear', e.target.value)} />
                    </label>
                </>
            )}

            {showConsent && (
                <label className="flex items-start gap-2 text-sm">
                    <input type="checkbox" className="mt-1" checked={value.privacyConsent}
                        onChange={(e) => set('privacyConsent', e.target.checked)} required />
                    <span>개인정보 수집·이용에 동의합니다. 소속·연락처는 프로그램 운영에만 씁니다.</span>
                </label>
            )}
        </div>
    );
}
```

- [ ] **Step 2: 가입 화면에 초대 코드와 프로필을 붙인다**

`app/signup/page.tsx` 를 읽고, 기존 폼 상태·제출 함수에 맞춰 다음을 넣는다. **기존 스타일과 상태 관리 방식을 그대로 따른다.**

- `inviteCode` 입력란(선택). 안내 문구는 `초대 코드가 있으면 입력하세요. 없으면 관리자 승인 후 이용할 수 있습니다.`
- 코드 입력에 따라 역할이 정해지므로, 코드가 비어 있으면 `MENTEE` 항목을, 코드가 있으면 사용자가 고른 역할이 아니라 **서버가 판단**하도록 두되 화면은 멘토·멘티 중 무엇을 받을지 알 수 없다. 그래서 코드가 있으면 공통 항목만 먼저 받고, 가입 실패 시 서버 메시지를 그대로 보여준다.

간단하게 가려면 화면에 역할 선택을 두지 말고 이렇게 처리한다.

```tsx
const [inviteCode, setInviteCode] = useState('');
const [profile, setProfile] = useState<ProfileValue>(EMPTY_PROFILE);
// 코드가 없으면 멘티로 가입한다. 멘토로 가입하려면 초대 코드가 있어야 하고,
// 그것이 의도한 동선이다.
const [assumedRole, setAssumedRole] = useState<MemberRole>('MENTEE');
```

제출 시 본문에 넣는다.

```tsx
body: JSON.stringify({
    name, email, password,
    ...(inviteCode.trim() ? { inviteCode: inviteCode.trim() } : {}),
    profile: toProfilePayload(profile, assumedRole),
}),
```

초대 코드를 입력하면 멘토 항목도 함께 보이도록 역할 선택을 노출한다.

```tsx
{inviteCode.trim() && (
    <label className="block text-sm">
        초대받은 역할
        <select className={inputClass} value={assumedRole}
            onChange={(e) => setAssumedRole(e.target.value as MemberRole)}>
            <option value="MENTEE">멘티</option>
            <option value="MENTOR">멘토</option>
        </select>
    </label>
)}
```

서버가 코드의 역할로 최종 판정하므로 화면 선택이 틀리면 400 이 오고 그 메시지를 보여준다.

- [ ] **Step 3: 온보딩 화면을 만든다**

`app/onboarding/page.tsx` 를 만든다. 임시 비밀번호 변경과 프로필 작성을 한 화면에서 처리한다.

```tsx
'use client';
// 첫 로그인 관문. 임시 비밀번호 변경과 프로필 작성을 한 화면에서 끝낸다.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ProfileFields, { EMPTY_PROFILE, toProfilePayload, type ProfileValue } from '@/components/member/ProfileFields';
import type { MemberRole } from '@/lib/member-roles';

export default function OnboardingPage() {
    const router = useRouter();
    const [role, setRole] = useState<MemberRole>('MENTEE');
    const [needsProfile, setNeedsProfile] = useState(false);
    const [profile, setProfile] = useState<ProfileValue>(EMPTY_PROFILE);
    const [message, setMessage] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        fetch('/api/me/profile')
            .then((res) => res.json())
            .then((data) => {
                setRole(data.role);
                setNeedsProfile(data.needsProfile);
                if (!data.needsProfile) router.replace('/dashboard');
            })
            .catch(() => setMessage('프로필 정보를 불러오지 못했습니다.'));
    }, [router]);

    const handleSave = async () => {
        setIsSaving(true);
        setMessage('');
        try {
            const res = await fetch('/api/me/profile', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(toProfilePayload(profile, role)),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error(data?.error || '저장에 실패했습니다.');
            router.replace('/dashboard');
        } catch (error) {
            setMessage(error instanceof Error ? error.message : '저장에 실패했습니다.');
        } finally {
            setIsSaving(false);
        }
    };

    if (!needsProfile) return null;

    return (
        <main className="mx-auto max-w-lg p-6">
            <h1 className="mb-2 text-xl font-bold">회원 정보를 입력해 주세요.</h1>
            <p className="mb-6 text-sm text-gray-500">
                프로그램 운영에 필요한 정보입니다. 입력해야 다음으로 넘어갈 수 있습니다.
            </p>

            <ProfileFields role={role} value={profile} onChange={setProfile} />

            {message && <p className="mt-4 text-sm text-red-600">{message}</p>}

            <button type="button" onClick={handleSave} disabled={isSaving}
                className="mt-6 w-full rounded-lg bg-indigo-600 py-2 text-white disabled:opacity-50">
                {isSaving ? '저장 중…' : '저장하고 시작하기'}
            </button>
        </main>
    );
}
```

- [ ] **Step 4: 검증하고 커밋한다**

```bash
npx tsc --noEmit && npm run lint && npm test
git add components/member/ProfileFields.tsx app/signup/page.tsx app/onboarding/page.tsx
git commit -m "feat: collect registration profiles at signup and first login

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 13: 관리자·매니저 화면

설계 6.1·6.2. **매니저는 초대·배정 권한이 있는데 `/admin` 은 관리자 전용이라 들어갈 화면이 없다.** 화면을 나눠 경계가 API 게이트와 맞게 한다.

**Files:**
- Create: `components/admin/MembersTab.tsx`
- Create: `components/admin/InvitesTab.tsx`
- Create: `components/admin/MentorAssign.tsx`
- Create: `app/manage/page.tsx`
- Modify: `app/admin/page.tsx`

**Interfaces:**
- Consumes: `/api/admin/users`(GET·POST·PATCH), `/api/invites`(GET·POST·DELETE), `/api/projects/[id]/mentors`, `/api/projects`

- [ ] **Step 1: 초대 탭을 만든다**

`components/admin/InvitesTab.tsx` 를 만든다. `/admin` 과 `/manage` 가 공유한다.

```tsx
'use client';
// 초대 코드 발행·목록·회수 화면. 관리자와 프로그램 매니저가 함께 쓴다.

import { useCallback, useEffect, useState } from 'react';

interface Invite {
    id: string;
    code: string;
    email: string;
    role: string;
    expiresAt: string;
    accessDurationDays: number;
    usedAt: string | null;
}

const ROLE_LABEL: Record<string, string> = { MENTOR: '멘토', MENTEE: '멘티' };

export default function InvitesTab() {
    const [invites, setInvites] = useState<Invite[]>([]);
    const [email, setEmail] = useState('');
    const [role, setRole] = useState<'MENTOR' | 'MENTEE'>('MENTEE');
    const [message, setMessage] = useState('');
    const [isBusy, setIsBusy] = useState(false);

    const load = useCallback(async () => {
        const res = await fetch('/api/invites');
        if (!res.ok) return;
        const data = await res.json();
        setInvites(data.invites);
    }, []);

    useEffect(() => { load(); }, [load]);

    const issue = async () => {
        setIsBusy(true);
        setMessage('');
        try {
            const res = await fetch('/api/invites', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, role }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error(data?.error || '발행에 실패했습니다.');

            // 메일이 나가지 않았으면 관리자가 직접 전달해야 하므로 코드를 보여준다.
            setMessage(data.emailSent
                ? '초대 메일을 보냈습니다.'
                : `메일 발송에 실패했습니다. 코드를 직접 전달하세요. ${data.code}`);
            setEmail('');
            await load();
        } catch (error) {
            setMessage(error instanceof Error ? error.message : '발행에 실패했습니다.');
        } finally {
            setIsBusy(false);
        }
    };

    const revoke = async (id: string) => {
        if (!window.confirm('이 코드를 회수하시겠습니까? 기록은 남습니다.')) return;
        const res = await fetch('/api/invites', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id }),
        });
        const data = await res.json().catch(() => null);
        setMessage(res.ok ? '회수했습니다.' : (data?.error ?? '회수에 실패했습니다.'));
        await load();
    };

    const isExpired = (invite: Invite) => new Date(invite.expiresAt).getTime() <= Date.now();

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end gap-2">
                <label className="text-sm">
                    이메일
                    <input className="ml-2 rounded border px-2 py-1" value={email}
                        onChange={(e) => setEmail(e.target.value)} />
                </label>
                <label className="text-sm">
                    역할
                    <select className="ml-2 rounded border px-2 py-1" value={role}
                        onChange={(e) => setRole(e.target.value as 'MENTOR' | 'MENTEE')}>
                        <option value="MENTEE">멘티</option>
                        <option value="MENTOR">멘토</option>
                    </select>
                </label>
                <button type="button" onClick={issue} disabled={isBusy || !email}
                    className="rounded bg-indigo-600 px-3 py-1 text-white disabled:opacity-50">
                    초대 코드 발행
                </button>
            </div>

            {message && <p className="text-sm text-gray-700">{message}</p>}

            <table className="w-full text-left text-sm">
                <thead>
                    <tr className="border-b">
                        <th className="py-2">이메일</th><th>역할</th><th>기한</th><th>상태</th><th></th>
                    </tr>
                </thead>
                <tbody>
                    {invites.map((invite) => (
                        <tr key={invite.id} className="border-b">
                            <td className="py-2">{invite.email}</td>
                            <td>{ROLE_LABEL[invite.role] ?? invite.role}</td>
                            <td>{invite.expiresAt.slice(0, 10)}</td>
                            <td>
                                {invite.usedAt ? '사용됨' : isExpired(invite) ? '만료' : '대기'}
                            </td>
                            <td>
                                {!invite.usedAt && !isExpired(invite) && (
                                    <button type="button" onClick={() => revoke(invite.id)}
                                        className="text-red-600">회수</button>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
```

- [ ] **Step 2: 멘토 배정 컴포넌트를 만든다**

`components/admin/MentorAssign.tsx` 를 만든다.

```tsx
'use client';
// 프로젝트별 멘토 배정·해제. 관리자와 프로그램 매니저가 함께 쓴다.

import { useCallback, useEffect, useState } from 'react';

interface Mentor {
    id: string;
    userId: string;
    user: { name: string | null; email: string; role: string };
}

interface Candidate {
    id: string;
    name: string | null;
    email: string;
    role: string;
}

export default function MentorAssign({ projectId }: { projectId: string }) {
    const [mentors, setMentors] = useState<Mentor[]>([]);
    const [candidates, setCandidates] = useState<Candidate[]>([]);
    const [selected, setSelected] = useState('');
    const [message, setMessage] = useState('');

    const load = useCallback(async () => {
        const [mentorRes, userRes] = await Promise.all([
            fetch(`/api/projects/${projectId}/mentors`),
            fetch('/api/admin/users'),
        ]);
        if (mentorRes.ok) setMentors((await mentorRes.json()).mentors);
        if (userRes.ok) {
            const users: Candidate[] = (await userRes.json()).users;
            // 매니저는 멘토에서 승격되므로 겸직 대상이다.
            setCandidates(users.filter((u) => u.role === 'MENTOR' || u.role === 'PROGRAM_MANAGER'));
        }
    }, [projectId]);

    useEffect(() => { load(); }, [load]);

    const assign = async () => {
        setMessage('');
        const res = await fetch(`/api/projects/${projectId}/mentors`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: selected }),
        });
        const data = await res.json().catch(() => null);
        setMessage(res.ok ? '배정했습니다.' : (data?.error ?? '배정에 실패했습니다.'));
        setSelected('');
        await load();
    };

    const unassign = async (userId: string) => {
        if (!window.confirm('배정을 해제하시겠습니까? 계정은 삭제되지 않습니다.')) return;
        const res = await fetch(`/api/projects/${projectId}/mentors`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId }),
        });
        const data = await res.json().catch(() => null);
        setMessage(res.ok ? '해제했습니다.' : (data?.error ?? '해제에 실패했습니다.'));
        await load();
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2">
                <select className="rounded border px-2 py-1 text-sm" value={selected}
                    onChange={(e) => setSelected(e.target.value)}>
                    <option value="">멘토 선택</option>
                    {candidates.map((c) => (
                        <option key={c.id} value={c.id}>{c.name ?? c.email}</option>
                    ))}
                </select>
                <button type="button" onClick={assign} disabled={!selected}
                    className="rounded bg-indigo-600 px-3 py-1 text-sm text-white disabled:opacity-50">
                    배정
                </button>
            </div>

            {message && <p className="text-sm text-gray-700">{message}</p>}

            <ul className="text-sm">
                {mentors.map((m) => (
                    <li key={m.id} className="flex items-center justify-between border-b py-1">
                        <span>{m.user.name ?? m.user.email}</span>
                        <button type="button" onClick={() => unassign(m.userId)}
                            className="text-red-600">해제</button>
                    </li>
                ))}
            </ul>
        </div>
    );
}
```

- [ ] **Step 3: 매니저 화면을 만든다**

`app/manage/page.tsx` 를 만든다. 관리자 화면을 매니저에게 열어 주지 않는다 — 삭제와 역할 변경이 같은 화면에 있어 탭을 숨기는 것만으로는 권한 경계가 화면 조건문에 의존하게 되기 때문이다.

```tsx
'use client';
// 프로그램 매니저 화면. 초대 코드 발행과 멘토 배정만 다룬다.
//
// /admin 은 회원 삭제·역할 변경이 있어 관리자 전용이다. 매니저에게 그 화면을
// 열어 주고 탭만 숨기면 권한 경계가 화면 조건문에 기대게 된다. 그래서 나눈다.

import { useCallback, useEffect, useState } from 'react';
import InvitesTab from '@/components/admin/InvitesTab';
import MentorAssign from '@/components/admin/MentorAssign';

interface ProjectRow {
    id: string;
    name: string;
    role: string;
}

export default function ManagePage() {
    const [tab, setTab] = useState<'invites' | 'assign'>('invites');
    const [projects, setProjects] = useState<ProjectRow[]>([]);
    const [selectedProject, setSelectedProject] = useState('');
    const [denied, setDenied] = useState(false);

    const load = useCallback(async () => {
        const res = await fetch('/api/invites');
        if (res.status === 403) { setDenied(true); return; }

        const projectRes = await fetch('/api/projects');
        if (projectRes.ok) setProjects((await projectRes.json()).projects);
    }, []);

    useEffect(() => { load(); }, [load]);

    if (denied) {
        return (
            <main className="mx-auto max-w-lg p-6">
                <p className="text-sm">이 화면은 관리자와 프로그램 매니저만 볼 수 있습니다.</p>
            </main>
        );
    }

    return (
        <main className="mx-auto max-w-4xl p-6">
            <h1 className="mb-4 text-xl font-bold">프로그램 관리</h1>

            <div className="mb-6 flex gap-2 border-b">
                <button type="button" onClick={() => setTab('invites')}
                    className={tab === 'invites' ? 'border-b-2 border-indigo-600 px-3 py-2' : 'px-3 py-2'}>
                    초대
                </button>
                <button type="button" onClick={() => setTab('assign')}
                    className={tab === 'assign' ? 'border-b-2 border-indigo-600 px-3 py-2' : 'px-3 py-2'}>
                    멘토 배정
                </button>
            </div>

            {tab === 'invites' && <InvitesTab />}

            {tab === 'assign' && (
                <div className="space-y-4">
                    <select className="rounded border px-2 py-1 text-sm" value={selectedProject}
                        onChange={(e) => setSelectedProject(e.target.value)}>
                        <option value="">프로젝트 선택</option>
                        {projects.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                    </select>
                    {selectedProject && <MentorAssign projectId={selectedProject} />}
                </div>
            )}
        </main>
    );
}
```

- [ ] **Step 4: 관리자 회원 탭을 만들고 연결한다**

`components/admin/MembersTab.tsx` 를 만든다. 역할 변경 칸에는 2.3 에서 허용한 대상만 띄운다 — 멘티를 고른 상태에서 `프로그램 매니저` 를 제시하고 400 을 받게 하면 관리자가 왜 막혔는지 알 수 없다.

```tsx
'use client';
// 회원 목록·역할 변경·승인·기간 연장·계정 생성. 관리자 전용이다.

import { useCallback, useEffect, useState } from 'react';
import ProfileFields, { EMPTY_PROFILE, toProfilePayload, type ProfileValue } from '@/components/member/ProfileFields';
import { MEMBER_ROLE_LABELS, type MemberRole } from '@/lib/member-roles';

interface MemberRow {
    id: string;
    name: string | null;
    email: string;
    status: string;
    role: MemberRole;
    isAdmin: boolean;
    accessExpiresAt: string | null;
}

/** 현재 역할에서 고를 수 있는 다음 역할. 서버의 canTransitionRole 과 같은 규칙이다. */
function allowedRoles(current: MemberRole): MemberRole[] {
    if (current === 'ADMIN') return ['ADMIN', 'PROGRAM_MANAGER', 'MENTOR', 'MENTEE'];
    if (current === 'PROGRAM_MANAGER') return ['PROGRAM_MANAGER', 'MENTOR', 'ADMIN'];
    if (current === 'MENTOR') return ['MENTOR', 'MENTEE', 'PROGRAM_MANAGER', 'ADMIN'];
    return ['MENTEE', 'MENTOR', 'ADMIN'];
}

export default function MembersTab() {
    const [members, setMembers] = useState<MemberRow[]>([]);
    const [message, setMessage] = useState('');
    const [showCreate, setShowCreate] = useState(false);
    const [newMember, setNewMember] = useState({ name: '', email: '', role: 'MENTEE' as 'MENTOR' | 'MENTEE' });
    const [newProfile, setNewProfile] = useState<ProfileValue>(EMPTY_PROFILE);

    const load = useCallback(async () => {
        const res = await fetch('/api/admin/users');
        if (res.ok) setMembers((await res.json()).users);
    }, []);

    useEffect(() => { load(); }, [load]);

    const patch = async (body: Record<string, unknown>, okMessage: string) => {
        const res = await fetch('/api/admin/users', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => null);
        setMessage(res.ok ? okMessage : (data?.error ?? '변경에 실패했습니다.'));
        await load();
    };

    const create = async () => {
        setMessage('');
        const res = await fetch('/api/admin/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...newMember,
                profile: toProfilePayload(newProfile, newMember.role),
            }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) { setMessage(data?.error ?? '계정 생성에 실패했습니다.'); return; }

        setMessage(data.emailSent
            ? '계정을 만들고 임시 비밀번호를 보냈습니다.'
            : '계정은 만들었으나 메일 발송에 실패했습니다. 비밀번호 재설정을 안내하세요.');
        setShowCreate(false);
        setNewProfile(EMPTY_PROFILE);
        await load();
    };

    return (
        <div className="space-y-4">
            <button type="button" onClick={() => setShowCreate((v) => !v)}
                className="rounded bg-indigo-600 px-3 py-1 text-sm text-white">
                {showCreate ? '닫기' : '계정 생성'}
            </button>

            {showCreate && (
                <div className="space-y-3 rounded border p-4">
                    <div className="flex flex-wrap gap-2">
                        <input className="rounded border px-2 py-1 text-sm" placeholder="이름"
                            value={newMember.name} onChange={(e) => setNewMember({ ...newMember, name: e.target.value })} />
                        <input className="rounded border px-2 py-1 text-sm" placeholder="이메일"
                            value={newMember.email} onChange={(e) => setNewMember({ ...newMember, email: e.target.value })} />
                        <select className="rounded border px-2 py-1 text-sm" value={newMember.role}
                            onChange={(e) => setNewMember({ ...newMember, role: e.target.value as 'MENTOR' | 'MENTEE' })}>
                            <option value="MENTEE">멘티</option>
                            <option value="MENTOR">멘토</option>
                        </select>
                    </div>
                    <ProfileFields role={newMember.role} value={newProfile} onChange={setNewProfile} showConsent={false} />
                    <button type="button" onClick={create}
                        className="rounded bg-indigo-600 px-3 py-1 text-sm text-white">만들기</button>
                </div>
            )}

            {message && <p className="text-sm text-gray-700">{message}</p>}

            <table className="w-full text-left text-sm">
                <thead>
                    <tr className="border-b">
                        <th className="py-2">이름</th><th>이메일</th><th>역할</th><th>상태</th><th>만료</th><th></th>
                    </tr>
                </thead>
                <tbody>
                    {members.map((m) => (
                        <tr key={m.id} className="border-b">
                            <td className="py-2">{m.name ?? '-'}</td>
                            <td>{m.email}</td>
                            <td>
                                <select className="rounded border px-1 py-0.5" value={m.role}
                                    onChange={(e) => patch(
                                        { userId: m.id, action: 'setRole', role: e.target.value },
                                        '역할을 바꿨습니다.'
                                    )}>
                                    {allowedRoles(m.role).map((r) => (
                                        <option key={r} value={r}>{MEMBER_ROLE_LABELS[r]}</option>
                                    ))}
                                </select>
                            </td>
                            <td>{m.status === 'APPROVED' ? '승인' : '대기'}</td>
                            <td>{m.accessExpiresAt ? m.accessExpiresAt.slice(0, 10) : '무기한'}</td>
                            <td className="space-x-2">
                                {m.status !== 'APPROVED' && (
                                    <button type="button" className="text-indigo-600"
                                        onClick={() => patch({ userId: m.id, action: 'approve' }, '승인했습니다.')}>
                                        승인
                                    </button>
                                )}
                                <button type="button" className="text-gray-600"
                                    onClick={() => patch({ userId: m.id, action: 'extendAccess', days: 90 }, '90일 연장했습니다.')}>
                                    90일 연장
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
```

`app/admin/page.tsx` 의 탭 목록에 `members` 와 `invites` 를 넣고, 기존 `users` 탭 자리에 `<MembersTab />` 을, 새 탭에 `<InvitesTab />` 을 렌더한다. 프로젝트 탭의 각 행에는 `<MentorAssign projectId={p.id} />` 를 붙인다. **기존 탭 전환 방식과 스타일을 그대로 따른다.**

- [ ] **Step 5: 검증하고 커밋한다**

```bash
npx tsc --noEmit && npm run lint && npm test
git add components/admin components/member app/manage/page.tsx app/admin/page.tsx
git commit -m "feat: add member, invite, and mentor assignment screens

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 14: 최종 검증

**Files:** 없음 (검증만)

- [ ] **Step 1: 전체 게이트를 통과시킨다**

```bash
npx prisma generate && npm run lint && npx tsc --noEmit && npm test && npm run build
```

Expected: 전부 성공. 테스트 수가 498 에서 크게 늘어 있다.

`npm run build` 가 `EBUSY: resource busy or locked, rmdir '.next/export'` 로 실패하면 Dropbox 동기화가 `.next` 를 잠근 것이다. 코드 문제가 아니다. Dropbox 를 잠시 멈추고 다시 빌드한다.

- [ ] **Step 2: 뮤테이션 점수를 확인한다**

```bash
npm run test:mutation
```

Expected: 전체 85% 이상. 새로 추가한 `member-profile.ts`·`temp-password-email.ts` 가 목록에 있다. 생존 뮤턴트가 많은 파일은 테스트를 보강한다.

- [ ] **Step 3: 매니저에게 삭제 경로가 없는지 확인한다**

설계 5.5 는 "삭제는 관리자 전용"이며 매니저용 새 라우트에 계정을 지우는 동작을 넣지 않는 것으로 지킨다고 정했다. 새로 만든 두 라우트를 직접 확인한다.

```bash
grep -n "user.delete\|user\.deleteMany" "app/api/invites/route.ts" "app/api/projects/[id]/mentors/route.ts"
```

Expected: 출력 없음. `mentors` 의 `DELETE` 는 `projectMember.delete` 만 부르고 계정에는 손대지 않아야 한다.

```bash
grep -n "prisma\.\w*\.delete" "app/api/projects/[id]/mentors/route.ts"
```

Expected: `prisma.projectMember.delete` 한 줄만 나온다.

- [ ] **Step 4: 설계와 대조한다**

`docs/superpowers/specs/2026-08-20-member-management-design.md` 의 2~6 절을 훑고 구현되지 않은 항목을 찾는다. 특히 아래를 확인한다.

- 2.1 매니저 겸직 — 승격해도 기존 `ProjectMember` 행이 남는가 (역할 변경은 `user` 만 건드려야 한다)
- 3.3 필수 항목 표 — 매니저가 멘토와 같게, 관리자가 공통만으로 판정되는가
- 4.2 목록의 `role` 이 4.1 판정과 같은 값인가
- 5.3 코드 회수가 삭제가 아니라 만료인가

빠진 것이 있으면 목록으로 보고한다.

- [ ] **Step 5: 커밋하고 푸시한다**

```bash
git push
```

---

## 이 계획에서 의도적으로 뺀 것

**만료 임박 배너** — 사용자가 전면 차단을 골랐고 배너는 고르지 않았다. 만료 시각은 관리자 화면에서 확인할 수 있다.

**멘토 자동 매칭** — 전문분야와 업종을 받아 두지만 배정은 사람이 고른다.

**기존 회원 프로필 일괄 수집** — 프로필 없는 계정을 로그인 시 작성 화면으로 보내는 것까지만 한다. 독촉 메일은 넣지 않는다.

**프로젝트 단위 역할 정리** — `EDITOR` 와 프로젝트 `ADMIN` 이 지금 어디서도 부여되지 않지만 이번 작업과 무관하다.

**임시 비밀번호 강제 변경 화면** — 로그인 응답에 `mustChangePassword` 를 실어 화면이 판단할 근거는 만들었다. 실제 강제 이동은 기존 비밀번호 변경 화면(`app/admin/password`)을 일반 사용자용으로 여는 별도 작업이라 분리했다. **이 상태로는 임시 비밀번호가 계속 유효하므로, 운영 전에 반드시 후속 작업으로 닫아야 한다.**
