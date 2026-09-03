# 멘티 계정 삭제 지침 구현 Implementation Plan

> **For agentic workers:** 이 계획서가 각 Task 의 정본이다. Step 은 체크박스(`- [ ]`)로 추적하고, 완료 시 `- [x]` 로 갱신해 코드와 함께 커밋한다.

**Goal:** 활동한 멘티도 지울 수 있게 만든다. 지금은 설문 발송·엑셀 가져오기 이력이 `Restrict` FK 로 삭제를 막아, 멘티의 본업을 한 번이라도 한 계정은 영구히 삭제할 수 없다. 이력은 남기되 주인만 비우고(`SetNull`), 지우기 전에 무엇이 벌어질지 보여 주고 사유를 받는다.

**Architecture:** 스키마에서 두 FK 를 `SetNull` 로 바꿔 DB 가 익명화를 맡는다. API 는 멘티 분기에 사전 점검(409 + `preview`)과 사유 검증을 넣고, 그 사람에게 발급된 초대 코드를 함께 지운다. 화면은 기존 확인창의 stage 2 를 재사용해 점검 결과와 사유 선택을 담는다. 판정과 문구는 `lib/account-deletion.ts` 로 빼서 API 와 화면이 같은 것을 쓴다.

**Tech Stack:** Next.js 15 App Router, Prisma 6, zod, vitest (Prisma 전부 mock)

**Spec:** `docs/superpowers/specs/2026-09-02-mentee-account-deletion-design.md` — 특히 2절(지침), 3절(데이터 처리표), 9절(확정 사항).

## Global Constraints

- **원격 DB 절대 금지**: `.env` 의 `POSTGRES_PRISMA_URL` 은 실데이터가 있는 원격 Supabase 다. `prisma migrate deploy`/`dev`/`db push`/`studio`, DB 에 쓰는 스크립트, dev 서버 기동 전부 금지. `npx prisma validate`/`npx prisma generate` 만 안전하다. **마이그레이션 적용은 사용자가 직접 한다.**
- `npx prisma generate` 가 `EPERM ... query_engine-windows.dll.node` 로 실패하면 dev 서버가 DLL 을 잠근 것이다. 직접 죽이지 말고 **중단하고 보고한다.**
- **이메일·비밀번호를 로그와 응답 본문에 남기지 않는다**(`lib/logger.ts` 규칙). 이 계획은 개인정보 파기를 다루므로 1순위 판정 기준이다.
- 들여쓰기 4칸, 주석은 한국어 "~다" 체이며 무엇이 아니라 **왜**를 적는다.
- 테스트는 `tests/` 평면 배치, Prisma 는 `vi.mock('../lib/prisma', ...)` 로 전부 mock.
- 커밋 메시지는 한국어, 본문에 "왜"를 적는다. 트레일러 `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- 각 Task 완료 기준: `npx tsc --noEmit` 통과 + `npx vitest run` 전체 통과 + `npx next lint` 통과.
- **뮤테이션 회귀 방지**(2026-09-03 CLAUDE.md 갱신): `stryker.crap.config.json` 의 `mutate` 목록에 이미 있는 파일을 고친 Task 는 그 파일에 stryker 를 재실행하고 점수를 보고한다. 게이트 3종은 뮤테이션 점수 하락을 잡지 못한다. 이 계획에서는 **Task 3 이 `lib/delete-confirmation.ts`** 를 건드리므로 해당된다(주석만 고쳐 점수는 그대로여야 하며, 그 사실을 확인해 보고하는 것이 요구사항이다).
- 신규 순수 모듈 `lib/account-deletion.ts`(Task 2)는 `mutate` 목록에 올리고 **mutation score 100%** 를 기준으로 삼는다. 등가 뮤턴트는 테스트를 비틀지 말고 이유를 적은 `// Stryker disable next-line` 으로 제외하며, disable 후 총 뮤턴트 수가 의도한 만큼만 줄었는지 세어 본다.

## 설계 요약 (모든 Task 의 공통 문맥)

- **경계:** 멘티 계정은 막는 것이 기본이고, 지우는 것은 개인정보를 파기해야 할 때만 한다. 접근 차단은 승인 취소가 담당한다.
- **삭제 사유 3종:** `self_request`(본인 요청), `misregistration`(오등록), `retention_expired`(보유기간 경과 — 자동 파기는 만들지 않고 항목만 열어 둔다).
- **데이터 처리:** 프로젝트는 프로그램 매니저에게 이전(현행), 설문 초대·가져오기 이력은 보존하고 발신자만 `null`, 그 사람 이메일로 발급된 초대 코드는 전부 삭제, 나머지 개인정보는 Cascade 로 삭제.
- **파일 지도:**
  - Task 1: `prisma/schema.prisma`, `prisma/migrations/20260902000000_anonymize_deleted_user_history/migration.sql`, `tests/db-migration-models.test.ts`
  - Task 2: `lib/account-deletion.ts`(신규·순수), `tests/account-deletion.test.ts`(신규), `app/api/admin/users/route.ts`, `tests/api-admin-user-delete.test.ts`
  - Task 3: `app/admin/page.tsx`, `lib/delete-confirmation.ts`(주석만)
  - Task 4: `docs/2026-09-02-mentee-account-deletion-guide.md`(신규)

---

### Task 1: 이력 FK 를 SetNull 로 바꾸는 스키마와 마이그레이션

**Files:**
- Modify: `prisma/schema.prisma` (`KanoSurveyInvitation`, `MigrationHistory`)
- Create: `prisma/migrations/20260902000000_anonymize_deleted_user_history/migration.sql`
- Modify: `tests/db-migration-models.test.ts`
- Modify: `app/api/projects/[id]/kano/form-responses/route.ts` (주석만 — 이 변경이 낡게 만든다)

**Interfaces:**
- Produces: `KanoSurveyInvitation.invitedBy: String?`, `MigrationHistory.userId: String?` — Task 2 의 `count({ where: { invitedBy: userId } })` 가 이 타입에 기댄다.

- [x] **Step 1: `KanoSurveyInvitation` 을 고친다**

`prisma/schema.prisma` 의 `invitedBy   String` 과 `inviter     User` 두 줄을 바꾼다.

```prisma
  /// 이 초대를 보낸 사람. 계정이 파기되면 비워진다(SetNull).
  /// 초대와 응답은 프로젝트의 자산이라 사람이 나가도 남아야 하고,
  /// "누가 보냈는가"는 그 사람의 개인정보라 함께 사라져야 한다.
  invitedBy   String?
  inviter     User?          @relation(fields: [invitedBy], references: [id], onDelete: SetNull)
```

- [x] **Step 2: `MigrationHistory` 를 고친다**

같은 이유로 `userId String` 과 `user User` 를 바꾼다.

```prisma
  /// 이 파일을 가져온 사람. 계정이 파기되면 비워진다(SetNull).
  /// 무엇을 언제 가져왔는지는 프로젝트의 이력이라 남긴다.
  userId         String?
  user           User?    @relation(fields: [userId], references: [id])
```

`user` 관계 줄에 `onDelete: SetNull` 을 명시한다.

```prisma
  user           User?    @relation(fields: [userId], references: [id], onDelete: SetNull)
```

`User` 쪽 목록 관계(`kanoInvitationsSent`, `migrations`)는 그대로 둔다. 목록 관계는 FK 의 nullable 여부와 무관하다.

`KanoResponse.invitationId`, `Program.managerId`, `Project.programId` 의 `Restrict` 는 **건드리지 않는다.** 응답이 초대 없이 남으면 안 되고, 프로그램이 담당자 없이 남으면 안 된다.

- [x] **Step 3: 마이그레이션 SQL 을 쓴다**

`prisma/migrations/20260902000000_anonymize_deleted_user_history/migration.sql` 을 만든다. 실제 제약 이름은 `npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma` 로 확인해도 되지만, 이 저장소의 기존 이름 규칙(`<table>_<column>_fkey`)을 따르면 아래가 맞다.

```sql
-- 계정을 파기해도 그 사람이 남긴 이력은 남긴다. 이력의 주인만 비운다.
-- 지금은 NOT NULL + Restrict 라, 설문을 한 번이라도 보냈거나 엑셀을 한 번이라도
-- 가져온 멘티는 영구히 삭제할 수 없다. 멘티의 본업이 그 둘이라 사실상 전부다.
-- 기존 행의 값은 바뀌지 않는다. 제약만 교체한다.

ALTER TABLE "kano_survey_invitations" ALTER COLUMN "invitedBy" DROP NOT NULL;
ALTER TABLE "kano_survey_invitations" DROP CONSTRAINT "kano_survey_invitations_invitedBy_fkey";
ALTER TABLE "kano_survey_invitations" ADD CONSTRAINT "kano_survey_invitations_invitedBy_fkey"
    FOREIGN KEY ("invitedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "migration_histories" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "migration_histories" DROP CONSTRAINT "migration_histories_userId_fkey";
ALTER TABLE "migration_histories" ADD CONSTRAINT "migration_histories_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [x] **Step 4: 스키마 테스트를 추가한다**

`tests/db-migration-models.test.ts` 는 이미 `prisma/schema.prisma` 를 문자열로 읽는다. 파일 끝에 describe 를 하나 더한다.

```ts
describe('계정 파기 시 이력 익명화', () => {
    // 모델 블록만 떼어 검사한다. 스키마 전체에 걸면 다른 모델의 같은 이름
    // 컬럼(예: ProjectMember.invitedBy)이 대신 통과시켜, 정작 이 두 FK 가
    // NOT NULL 로 되돌아가도 테스트가 초록으로 남는다.
    function modelBlock(name: string): string {
        const match = schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`));
        if (!match) throw new Error(`${name} 모델을 찾지 못했습니다`);
        return match[0];
    }

    it('KanoSurveyInvitation.invitedBy 가 nullable + SetNull 이다', () => {
        // 되돌아가면 설문을 한 번이라도 보낸 멘티를 다시 지울 수 없게 된다.
        const block = modelBlock('KanoSurveyInvitation');
        expect(block).toMatch(/invitedBy\s+String\?/);
        expect(block).toMatch(/inviter\s+User\?\s+@relation\([^)]*onDelete: SetNull/);
    });

    it('MigrationHistory.userId 가 nullable + SetNull 이다', () => {
        const block = modelBlock('MigrationHistory');
        expect(block).toMatch(/userId\s+String\?/);
        expect(block).toMatch(/user\s+User\?\s+@relation\([^)]*onDelete: SetNull/);
    });

    it('KanoResponse.invitationId 는 여전히 삭제를 막는다', () => {
        // 응답이 초대 없이 남으면 안 된다. 이쪽까지 SetNull 로 풀면 설문
        // 결과의 출처를 잃는다. 익명화 대상은 사람이지 데이터가 아니다.
        const block = modelBlock('KanoResponse');
        expect(block).toMatch(/invitationId\s+String\b/);
        expect(block).not.toMatch(/invitation\s+KanoSurveyInvitation[^\n]*onDelete/);
    });

    it('Program.managerId 는 여전히 담당자 이관을 먼저 요구한다', () => {
        // 사람 하나를 지우는 것으로 기관 단위 프로그램이 사라지면 안 된다.
        const block = modelBlock('Program');
        expect(block).toMatch(/manager\s+User\s+@relation\([^)]*onDelete: Restrict/);
    });
});
```

- [x] **Step 4b: `form-responses` 의 낡은 주석을 고친다**

`app/api/projects/[id]/kano/form-responses/route.ts:84` 의 주석이 `invitedBy` 를 "필수 FK" 라고 설명한다. 이 Task 가 그 전제를 깨므로 함께 고친다. 컬럼이 nullable 이 됐다고 새 초대에 `null` 을 넣으면 안 된다는 것도 못 박는다. 빈 값은 "계정이 파기된 사람"이라는 뜻이지 "발신자가 없다"는 뜻이 아니다.

- [x] **Step 5: 검증하고 커밋한다**

```sh
npx prisma validate
npx prisma generate
npx tsc --noEmit && npx vitest run && npx next lint
```

`npx prisma generate` 가 실패하면 Task 2 의 타입이 맞지 않으므로 여기서 멈추고 보고한다.

**2026-09-03 게이트 통과.** 원격 세션은 npm 레지스트리가 막혀 게이트를 돌리지 못한다. 사용자가 이 브랜치를 받은 트리에서 실행해 확인했다.

```
The schema at prisma\schema.prisma is valid
✔ Generated Prisma Client (v6.19.3)
Test Files  94 passed (94)
     Tests  1080 passed (1080)
✔ No ESLint warnings or errors
```

`tsc` 는 `&&` 체인이라 뒤가 돌았다는 사실이 통과를 뜻한다. `prisma generate` 가 `EPERM` 없이 끝나 dev 서버 잠금도 없었다.

한 번 헛짚었던 기록을 남긴다. 그 전에 보고된 통과(테스트 1055건)는 이 Task 의 커밋이 없는 트리의 결과였다. `migrate deploy` 가 마이그레이션을 10개만 찾은 것이 근거였고, 이 Task 의 것을 더하면 11개다. **다른 사람의 게이트 결과를 받을 때는 그 트리가 이 작업을 담고 있는지부터 확인해야 한다.**

커밋 후 **사용자에게 마이그레이션 적용을 요청한다.**

```sh
npx prisma migrate deploy
```

적용 결과를 확인한 뒤 Task 2 로 넘어간다. 적용 전에 Task 2 를 배포하면 활동한 멘티의 삭제는 여전히 막힌다.

**2026-09-03 적용 완료.** `migrate status` 의 "up to date" 는 `_prisma_migrations` 기록만 보므로 믿지 않고, `npm run check:history-fk` 로 실제 컬럼을 확인했다.

```
[정상] kano_survey_invitations.invitedBy   NULL 허용 : YES   삭제 규칙 : SET NULL
[정상] migration_histories.userId          NULL 허용 : YES   삭제 규칙 : SET NULL
마이그레이션 기록 : 20260902000000_anonymize_deleted_user_history
    적용 완료 : Thu Sep 03 2026 15:06:13 GMT+0900   되돌림 : 없음   실행 단계 : 1
```

기록 시각이 게이트 실행(15:06:28)보다 15초 앞선다. 앞서 "입력으로 빨려 들어가 실행되지 않았다"고 판단한 붙여넣기가 실제로는 실행됐고, 스크린샷이 출력 직전을 잡은 것이다. **터미널 화면에 출력이 없다는 것만으로 명령이 실행되지 않았다고 단정하면 안 된다.**

**Task 1 완료.**

---

### Task 2: 사전 점검·사유·초대 코드 정리를 담은 삭제 API

**Files:**
- Create: `lib/account-deletion.ts`
- Create: `tests/account-deletion.test.ts`
- Modify: `app/api/admin/users/route.ts` (DELETE 핸들러)
- Modify: `tests/api-admin-user-delete.test.ts`

**Interfaces:**
- Produces: `DELETION_REASONS`, `parseDeletionReason`, `DELETION_REASON_LABELS`, `describeMenteeDeletion`, `MenteeDeletionPreview` — Task 3 의 확인창이 그대로 가져다 쓴다.
- Produces: `DELETE /api/admin/users` 가 멘티에 대해 409 + `{ needsCascadeConfirm, preview }`, 확정 시 200 + `{ transferredProjects, anonymizedInvitations, anonymizedMigrations, deletedInviteCodes }`.

- [x] **Step 1: 순수 모듈 `lib/account-deletion.ts` 를 만든다**

```ts
// 계정 삭제의 사유와 사전 점검 안내를 정하는 규칙. API 와 화면이 같은 문구를
// 쓰도록 한 곳에 둔다. 문구가 두 곳에 흩어지면 화면이 약속한 것과 서버가 하는
// 일이 어긋나는데, 되돌릴 수 없는 조작에서 그 어긋남은 사고가 된다.

export const DELETION_REASONS = ['self_request', 'misregistration', 'retention_expired'] as const;
export type DeletionReason = (typeof DELETION_REASONS)[number];

export const DELETION_REASON_LABELS: Record<DeletionReason, string> = {
    self_request: '본인 요청',
    misregistration: '오등록',
    retention_expired: '보유기간 경과',
};

export function parseDeletionReason(value: unknown): DeletionReason | null {
    return DELETION_REASONS.includes(value as DeletionReason) ? (value as DeletionReason) : null;
}

export interface MenteeDeletionPreview {
    /** 소유권이 프로그램 매니저에게 넘어갈 프로젝트. */
    transferProjects: { id: string; name: string; managerName: string | null }[];
    /** 발신자가 비워질 설문 초대 건수. 초대와 응답 자체는 남는다. */
    invitations: number;
    /** 가져온 사람이 비워질 엑셀 이관 이력 건수. */
    migrations: number;
    /** 함께 삭제될 초대 코드 수. 그 사람의 이메일이 남는 유일한 자리다. */
    inviteCodes: number;
}

/**
 * 사전 점검 결과를 사람이 읽는 줄로 만든다. 화면이 이 줄을 그대로 띄운다.
 *
 * 지우기 전에 무엇이 벌어지는지 보여 주는 것이 이 기능의 핵심이라, 0건인
 * 항목은 빼서 실제로 일어나는 일만 남긴다. 아무 일도 없으면 빈 배열이다.
 */
export function describeMenteeDeletion(preview: MenteeDeletionPreview): string[] {
    const lines: string[] = [];

    for (const project of preview.transferProjects) {
        // User.name 은 nullable 이고 공백만 들어올 수도 있다. 어느 쪽이든 사람 이름
        // 자리가 비면 "소유자가  로 바뀝니다" 가 되므로 역할 이름으로 대신한다.
        const managerName = project.managerName?.trim() || '프로그램 매니저';
        lines.push(`프로젝트 "${project.name}" 의 소유자가 ${managerName} 로 바뀝니다.`);
    }
    if (preview.invitations > 0) {
        lines.push(`설문 초대 ${preview.invitations}건은 남고 발송자만 비워집니다.`);
    }
    if (preview.migrations > 0) {
        lines.push(`엑셀 가져오기 이력 ${preview.migrations}건은 남고 가져온 사람만 비워집니다.`);
    }
    if (preview.inviteCodes > 0) {
        lines.push(`이 사람에게 발급된 초대 코드 ${preview.inviteCodes}건은 함께 삭제됩니다.`);
    }

    return lines;
}
```

- [x] **Step 2: `tests/account-deletion.test.ts` 를 쓴다**

```ts
// 삭제 사유 판정과 사전 점검 문구가 규칙대로인지 확인하는 테스트입니다.
import { describe, expect, it } from 'vitest';
import {
    DELETION_REASONS,
    DELETION_REASON_LABELS,
    describeMenteeDeletion,
    parseDeletionReason,
    type MenteeDeletionPreview,
} from '../lib/account-deletion';

const EMPTY: MenteeDeletionPreview = { transferProjects: [], invitations: 0, migrations: 0, inviteCodes: 0 };

describe('parseDeletionReason', () => {
    it('정해진 세 사유만 받는다', () => {
        for (const reason of DELETION_REASONS) {
            expect(parseDeletionReason(reason)).toBe(reason);
        }
    });

    it('그 밖의 값은 전부 거부한다', () => {
        for (const value of ['', 'other', null, undefined, 0, {}]) {
            expect(parseDeletionReason(value)).toBeNull();
        }
    });

    it('모든 사유에 라벨이 있다', () => {
        for (const reason of DELETION_REASONS) {
            expect(DELETION_REASON_LABELS[reason]).toBeTruthy();
        }
    });
});

describe('describeMenteeDeletion', () => {
    it('아무 일도 없으면 빈 목록이다', () => {
        expect(describeMenteeDeletion(EMPTY)).toEqual([]);
    });

    it('이전될 프로젝트마다 받을 사람을 밝힌다', () => {
        const lines = describeMenteeDeletion({
            ...EMPTY,
            transferProjects: [{ id: 'p1', name: '스마트팜', managerName: '김매니저' }],
        });
        expect(lines).toHaveLength(1);
        expect(lines[0]).toContain('스마트팜');
        expect(lines[0]).toContain('김매니저');
    });

    it('매니저 이름이 없어도 문장이 깨지지 않는다', () => {
        const lines = describeMenteeDeletion({
            ...EMPTY,
            transferProjects: [{ id: 'p1', name: '스마트팜', managerName: null }],
        });
        expect(lines[0]).toContain('프로그램 매니저');
    });

    it('이력은 남고 주인만 비워진다고 알린다', () => {
        const lines = describeMenteeDeletion({ ...EMPTY, invitations: 3, migrations: 2 });
        expect(lines[0]).toContain('설문 초대 3건');
        expect(lines[0]).toContain('남고');
        expect(lines[1]).toContain('엑셀 가져오기 이력 2건');
    });

    it('초대 코드는 삭제된다고 알린다', () => {
        const [line] = describeMenteeDeletion({ ...EMPTY, inviteCodes: 1 });
        expect(line).toContain('초대 코드 1건');
        expect(line).toContain('삭제');
    });

    it('0건인 항목은 말하지 않는다', () => {
        const lines = describeMenteeDeletion({ ...EMPTY, invitations: 0, migrations: 5, inviteCodes: 0 });
        expect(lines).toHaveLength(1);
        expect(lines[0]).toContain('엑셀');
    });
});
```

- [x] **Step 3: 라우트의 멘티 분기를 바꾼다**

`app/api/admin/users/route.ts` 상단 import 에 더한다.

```ts
import { describeMenteeDeletion, parseDeletionReason } from '@/lib/account-deletion';
```

기존 멘티 분기(`if (parseMemberRole(target.role) === 'MENTEE') { ... }`) 전체를 아래로 바꾼다.

```ts
        // 멘티는 다르게 다룬다: 소유한 프로젝트가 사라지는 게 아니라 그 프로그램의
        // 매니저에게 넘어간다. 프로그램은 "참여 멘티들의 프로젝트로 구성"되므로,
        // 멘티 계정이 없어졌다고 그 프로젝트까지 함께 없어지면 안 된다.
        if (parseMemberRole(target.role) === 'MENTEE') {
            const ownedProjects = await prisma.project.findMany({
                where: { ownerId: userId },
                select: {
                    id: true,
                    name: true,
                    program: { select: { managerId: true, manager: { select: { name: true } } } },
                },
            });

            // 이력은 남기되 주인만 비운다(스키마의 SetNull). 몇 건이 그렇게 되는지는
            // 확인창에도 보여 주고 로그에도 남겨야 하므로 두 갈래 모두에서 미리 센다.
            const [invitations, migrations, inviteCodes] = await Promise.all([
                prisma.kanoSurveyInvitation.count({ where: { invitedBy: userId } }),
                prisma.migrationHistory.count({ where: { userId } }),
                // 가입 때 저장된 주소와 코드 발급 때 입력한 주소의 대소문자가 다를 수 있다.
                prisma.inviteCode.count({ where: { email: { equals: target.email, mode: 'insensitive' } } }),
            ]);

            const preview = {
                transferProjects: ownedProjects.map((p) => ({
                    id: p.id,
                    name: p.name,
                    managerName: p.program.manager.name,
                })),
                invitations,
                migrations,
                inviteCodes,
            };

            // 지우기 전에 무엇이 벌어지는지 보여 주고 사유를 받는다. 예전에는 멘티만
            // 확인 없이 지웠는데, 개인정보 파기가 끼는 순간 "파괴적이지 않다"는
            // 근거가 성립하지 않는다.
            if (body?.confirmCascade !== true) {
                return NextResponse.json(
                    {
                        error: describeMenteeDeletion(preview).join(' ') || '되돌릴 수 없습니다.',
                        needsCascadeConfirm: true,
                        preview,
                    },
                    { status: 409 }
                );
            }

            // 사유는 파기의 증빙이다. 없이 지우면 나중에 왜 지웠는지 답할 수 없다.
            const reason = parseDeletionReason(body?.reason);
            if (!reason) {
                return NextResponse.json({ error: '삭제 사유를 고르세요.' }, { status: 400 });
            }

            await prisma.$transaction([
                ...ownedProjects.map((p) => prisma.project.update({
                    where: { id: p.id },
                    data: { ownerId: p.program.managerId },
                })),
                // 이 사람에게 발급된 초대 코드는 목적을 다했다. 계정을 지워도
                // email 이 남는 유일한 자리라, 사용 여부와 무관하게 함께 지운다.
                prisma.inviteCode.deleteMany({
                    where: { email: { equals: target.email, mode: 'insensitive' } },
                }),
                prisma.user.delete({ where: { id: userId } }),
            ]);

            // 이메일은 남기지 않는다. 파기의 증빙은 지워진 정보가 아니라 이 기록이다.
            log.info('멘티 삭제', {
                userId,
                reason,
                transferredProjects: ownedProjects.length,
                anonymizedInvitations: invitations,
                anonymizedMigrations: migrations,
                deletedInviteCodes: inviteCodes,
            });
            return NextResponse.json({
                success: true,
                transferredProjects: ownedProjects.length,
                anonymizedInvitations: invitations,
                anonymizedMigrations: migrations,
                deletedInviteCodes: inviteCodes,
            });
        }
```

- [x] **Step 4: `P2003` 문구를 원인별로 나눈다**

catch 절의 `P2003` 처리를 바꾼다.

```ts
        // 삭제를 막는 FK 가 아직 남아 있는 경우다. 설문·가져오기 이력은
        // 마이그레이션으로 SetNull 이 됐으니 여기 걸리지 않는다. 남은 것은
        // 프로그램 담당자이고, 그건 사람을 지우는 게 아니라 옮겨야 풀린다.
        if (typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2003') {
            const field = (error as { meta?: { field_name?: string } }).meta?.field_name ?? '';
            log.warn('사용자 삭제가 FK 제약에 막혔다', { field });

            const blockedByProgram = field.includes('managerId') || field.includes('programs');
            return NextResponse.json(
                {
                    error: blockedByProgram
                        ? '담당 중인 프로그램이 있어 삭제할 수 없습니다. 프로그램 담당자를 먼저 다른 사람으로 옮기세요.'
                        : '삭제를 막는 연결이 남아 있습니다. 승인을 취소해 접근만 막고 개발자에게 알려 주세요.',
                },
                { status: 409 }
            );
        }
```

- [x] **Step 5: 테스트를 갱신한다**

`tests/api-admin-user-delete.test.ts` 를 고친다.

먼저 mock 에 새 delegate 세 개를 더한다.

```ts
const countInvitation = vi.fn();
const countMigration = vi.fn();
const countInviteCode = vi.fn();
const deleteManyInviteCode = vi.fn();

vi.mock('../lib/prisma', () => ({
    prisma: {
        user: { findUnique: findUser, count: countUser, delete: deleteUser },
        project: { count: countProject, findMany: findManyProject, update: updateProject },
        kanoSurveyInvitation: { count: countInvitation },
        migrationHistory: { count: countMigration },
        inviteCode: { count: countInviteCode, deleteMany: deleteManyInviteCode },
        $transaction: (arg: unknown) => transaction(arg),
    },
}));
```

`beforeEach` 에 기본값을 더한다.

```ts
    countInvitation.mockResolvedValue(0);
    countMigration.mockResolvedValue(0);
    countInviteCode.mockResolvedValue(0);
    deleteManyInviteCode.mockResolvedValue({ count: 0 });
```

기존 `describe('멘티 삭제: ...')` 블록을 아래로 교체한다. `findManyProject` 가 이제 `name` 과 `manager.name` 까지 돌려주므로 mock 값을 바꿔야 한다.

```ts
describe('멘티 삭제: 지우기 전에 무엇이 벌어지는지 보여 준다', () => {
    const CONFIRMED = { userId: 'user_2', confirmCascade: true, reason: 'self_request' };

    beforeEach(() => {
        findUser.mockResolvedValue({ id: 'user_2', email: 'Mentee@x.com', isAdmin: false, role: 'MENTEE' });
        findManyProject.mockResolvedValue([
            { id: 'proj_a', name: '스마트팜', program: { managerId: 'pm_a', manager: { name: '김매니저' } } },
        ]);
    });

    it('확인 없이는 지우지 않고 사전 점검 결과를 돌려준다', async () => {
        countInvitation.mockResolvedValue(3);
        countMigration.mockResolvedValue(2);
        countInviteCode.mockResolvedValue(1);

        const res = await DELETE(deleteRequest({ userId: 'user_2' }));
        const body = await res.json();

        expect(res.status).toBe(409);
        expect(body.needsCascadeConfirm).toBe(true);
        expect(body.preview.transferProjects).toEqual([
            { id: 'proj_a', name: '스마트팜', managerName: '김매니저' },
        ]);
        expect(body.preview.invitations).toBe(3);
        expect(body.preview.migrations).toBe(2);
        expect(body.preview.inviteCodes).toBe(1);
        expect(deleteUser).not.toHaveBeenCalled();
        expect(updateProject).not.toHaveBeenCalled();
    });

    it('사유가 없으면 확인했더라도 지우지 않는다', async () => {
        const res = await DELETE(deleteRequest({ userId: 'user_2', confirmCascade: true }));

        expect(res.status).toBe(400);
        expect(deleteUser).not.toHaveBeenCalled();
    });

    it('알 수 없는 사유도 거부한다', async () => {
        const res = await DELETE(deleteRequest({ userId: 'user_2', confirmCascade: true, reason: '그냥' }));

        expect(res.status).toBe(400);
        expect(deleteUser).not.toHaveBeenCalled();
    });

    it('확인과 사유가 있으면 프로젝트를 넘기고 초대 코드를 지운 뒤 삭제한다', async () => {
        const res = await DELETE(deleteRequest(CONFIRMED));
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.transferredProjects).toBe(1);
        expect(updateProject).toHaveBeenCalledWith({ where: { id: 'proj_a' }, data: { ownerId: 'pm_a' } });
        expect(deleteManyInviteCode).toHaveBeenCalledWith({
            where: { email: { equals: 'Mentee@x.com', mode: 'insensitive' } },
        });
        expect(deleteUser).toHaveBeenCalledWith({ where: { id: 'user_2' } });
    });

    it('초대 코드 삭제가 사용자 삭제보다 먼저다', async () => {
        // 순서가 뒤집히면 usedById 가 먼저 SetNull 이 돼 어느 코드가 그 사람의
        // 것이었는지 알 수 없게 된다. 트랜잭션 배열의 순서로 고정한다.
        await DELETE(deleteRequest(CONFIRMED));

        const ops = transaction.mock.calls[0][0] as unknown[];
        expect(ops).toHaveLength(3);
        const order = [updateProject, deleteManyInviteCode, deleteUser].map((m) => m.mock.invocationCallOrder[0]);
        expect(order[0]).toBeLessThan(order[1]);
        expect(order[1]).toBeLessThan(order[2]);
    });

    it('소유한 프로젝트가 없어도 삭제한다', async () => {
        findManyProject.mockResolvedValue([]);

        const res = await DELETE(deleteRequest(CONFIRMED));
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.transferredProjects).toBe(0);
        expect(updateProject).not.toHaveBeenCalled();
        expect(deleteUser).toHaveBeenCalled();
    });

    it('로그와 응답에 이메일을 담지 않는다', async () => {
        const res = await DELETE(deleteRequest(CONFIRMED));
        const text = await res.text();

        expect(text).not.toContain('Mentee@x.com');
    });

    it('멘티가 아닌 역할은 이 경로를 타지 않는다', async () => {
        // 회귀 확인: 소유 프로젝트가 있는 멘토는 여전히 기존 cascade-confirm
        // 흐름(409)을 거쳐야 한다. 멘티 분기가 다른 역할까지 삼키면 안 된다.
        findUser.mockResolvedValue({ id: 'user_2', email: 'mentor@x.com', isAdmin: false, role: 'MENTOR' });
        countProject.mockResolvedValue(2);

        const res = await DELETE(deleteRequest({ userId: 'user_2' }));
        const body = await res.json();

        expect(res.status).toBe(409);
        expect(body.needsCascadeConfirm).toBe(true);
        expect(body.preview).toBeUndefined();
        expect(deleteUser).not.toHaveBeenCalled();
    });
});
```

`P2003` 을 확인하는 기존 테스트(`'FK 제약에 걸리면 500 이 아니라 409 로 이유를 알려준다'`)는 `body.error` 에 `'설문 발송'` 이 들어 있길 기대한다. **이 단언을 반드시 고친다.**

```ts
    it('담당 프로그램 때문에 막히면 담당자 이관을 안내한다', async () => {
        deleteUser.mockRejectedValue(Object.assign(new Error('FK'), {
            code: 'P2003',
            meta: { field_name: 'programs_managerId_fkey (index)' },
        }));

        const res = await DELETE(deleteRequest({ userId: 'user_2' }));
        const body = await res.json();

        expect(res.status).toBe(409);
        expect(body.error).toContain('담당자');
    });

    it('그 밖의 FK 제약은 500 이 아니라 409 로 알린다', async () => {
        deleteUser.mockRejectedValue(Object.assign(new Error('FK'), { code: 'P2003' }));

        const res = await DELETE(deleteRequest({ userId: 'user_2' }));
        const body = await res.json();

        expect(res.status).toBe(409);
        expect(body.error).toContain('승인을 취소');
    });
```

- [x] **Step 6: 검증하고 커밋한다**

```sh
npx tsc --noEmit && npx vitest run && npx next lint
```

`lib/account-deletion.ts` 를 `stryker.crap.config.json` 의 `mutate` 목록에 추가하고 100% 를 확인한다. 목록에 올려야 이후 다른 Task 가 이 파일을 고칠 때 회귀 방지 규칙이 걸린다.

```sh
npx stryker run stryker.crap.config.json --mutate lib/account-deletion.ts
```

**2026-09-03 결과.** 게이트는 사용자가 로컬에서 돌려 통과했다.

```
Test Files  95 passed (95)
     Tests  1099 passed (1099)
✔ No ESLint warnings or errors

File                | % Mutation score | # killed | # survived | # no cov
account-deletion.ts |           100.00 |       33 |          0 |        0
```

---

### Task 3: 사전 점검 결과와 사유를 받는 확인창

**Files:**
- Modify: `app/admin/page.tsx`
- Modify: `lib/delete-confirmation.ts` (주석만)

**Interfaces:**
- Consumes: Task 2 의 409 응답 `preview`, `DELETION_REASONS`, `DELETION_REASON_LABELS`, `describeMenteeDeletion`.

- [x] **Step 1: 확인창 상태에 점검 결과와 사유를 담는다**

`app/admin/page.tsx` 의 import 에 더한다.

```ts
import {
    DELETION_REASONS, DELETION_REASON_LABELS, describeMenteeDeletion,
    type DeletionReason, type MenteeDeletionPreview,
} from '@/lib/account-deletion';
```

`confirmDelete` 상태를 넓힌다.

```tsx
    const [confirmDelete, setConfirmDelete] = useState<{
        type: 'user' | 'project';
        id: string;
        name: string;
        stage: DeleteStage;
        // 멘티 삭제는 서버가 사전 점검 결과를 실어 409 로 되돌려 준다.
        // 그 결과를 stage 2 에서 보여 주고 사유를 받는다.
        preview?: MenteeDeletionPreview;
        reason?: DeletionReason;
    } | null>(null);
```

- [x] **Step 2: `handleDeleteUser` 가 사유를 싣고 점검 결과를 받는다**

```tsx
    const handleDeleteUser = async (
        userId: string,
        options: { confirmCascade?: boolean; reason?: DeletionReason } = {}
    ) => {
        const res = await fetch('/api/admin/users', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId,
                ...(options.confirmCascade ? { confirmCascade: true } : {}),
                ...(options.reason ? { reason: options.reason } : {}),
            }),
        });
        const data = await res.json().catch(() => null);

        if (res.status === 409 && data?.needsCascadeConfirm) {
            // 멘티는 점검 결과를 확인창 안에서 보여 주고 사유까지 받는다.
            // 다른 역할은 예전대로 브라우저 확인창으로 한 번 더 묻는다.
            if (data.preview) {
                setConfirmDelete((prev) => (prev ? { ...prev, stage: 2, preview: data.preview } : prev));
                return;
            }
            setConfirmDelete(null);
            if (window.confirm(`${data.error}\n\n그래도 삭제하시겠습니까?`)) {
                await handleDeleteUser(userId, { confirmCascade: true });
            }
            return;
        }

        if (res.ok) {
            setUsers((prev) => prev.filter((u) => u.id !== userId));
            showMsg('success', '사용자가 삭제되었습니다.');
        } else {
            showMsg('error', data?.error || '삭제 실패');
        }
        setConfirmDelete(null);
    };
```

- [x] **Step 3: 확인창 stage 2 에 점검 결과와 사유 선택을 넣는다**

기존 `{confirmDelete.stage === 2 ? ( ... )}` 의 참 갈래에서, `deleteTargetProject` 블록 아래에 사용자용 블록을 더한다.

```tsx
                                {confirmDelete.preview && (
                                    <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3 mb-4">
                                        <p className="text-[11px] text-amber-300/80 mb-2">삭제하면 이렇게 됩니다</p>
                                        <ul className="space-y-1 text-xs text-gray-300">
                                            {describeMenteeDeletion(confirmDelete.preview).map((line) => (
                                                <li key={line}>{line}</li>
                                            ))}
                                            <li>이름·연락처·소속 등 개인정보는 파기됩니다.</li>
                                        </ul>
                                        <p className="text-[11px] text-gray-500 mt-2">
                                            접근만 막으려면 삭제 대신 승인 취소를 쓰세요.
                                        </p>
                                    </div>
                                )}

                                {confirmDelete.preview && (
                                    <div className="mb-4">
                                        <p className="text-[11px] text-gray-400 mb-2">삭제 사유</p>
                                        <div className="space-y-1.5">
                                            {DELETION_REASONS.map((reason) => (
                                                <label key={reason} className="flex items-center gap-2 text-xs text-gray-300">
                                                    <input
                                                        type="radio"
                                                        name="deletion-reason"
                                                        value={reason}
                                                        checked={confirmDelete.reason === reason}
                                                        onChange={() => setConfirmDelete({ ...confirmDelete, reason })}
                                                    />
                                                    {DELETION_REASON_LABELS[reason]}
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                )}
```

- [x] **Step 4: 확정 버튼이 사유를 넘기고, 사유가 없으면 눌리지 않게 한다**

확정 버튼의 `onClick` 에서 사용자 갈래를 바꾼다.

```tsx
                                    if (confirmDelete.type === 'user') {
                                        // 확정은 점검 결과를 보고 있는 stage 2 에서만 한다. preview 만
                                        // 보고 판단하면, "뒤로"로 stage 1 에 돌아온 뒤 다시 누를 때
                                        // 마지막 확인을 건너뛰고 지워진다 — preview 는 남아 있으므로.
                                        handleDeleteUser(confirmDelete.id, confirmDelete.stage === 2 && confirmDelete.preview
                                            ? { confirmCascade: true, reason: confirmDelete.reason }
                                            : {});
                                        return;
                                    }
```

같은 버튼에 `disabled` 를 더한다. 여기도 stage 를 함께 본다.

```tsx
                                disabled={confirmDelete.stage === 2 && Boolean(confirmDelete.preview) && !confirmDelete.reason}
```

`disabled` 상태가 보이도록 className 끝에 `disabled:opacity-50 disabled:cursor-not-allowed` 를 더한다.

- [x] **Step 5: `lib/delete-confirmation.ts` 의 주석을 사실에 맞춘다**

판정 함수는 바꾸지 않는다. 사용자 삭제는 여전히 stage 1 에서 요청을 보내고, 서버 409 가 stage 2 를 연다. 주석만 지금 동작에 맞게 고친다.

```ts
// 사용자 삭제는 서버가 409(needsCascadeConfirm)로 되물어보는 자체 2단계가
// 있으므로 여기서 또 막지 않는다. 멘티는 그 409 에 사전 점검 결과가 실려
// 오고, 화면이 그것을 stage 2 확인창에 담아 사유까지 받는다. 두 번 묻는
// 자리가 갈리면 어느 쪽이 진짜 마지막인지 알 수 없게 된다.
```

`app/admin/page.tsx` 의 `confirmDelete` 선언 위 주석도 같은 취지로 고친다.

- [ ] **Step 6: 검증하고 커밋한다**

```sh
npx tsc --noEmit && npx vitest run && npx next lint
```

화면 실기동 검증은 **감리자가 실계정으로 수행한다.** dev 서버를 띄우지 않는다. 확인할 것은 네 가지다. 멘티 삭제 시 점검 결과가 보이는지, 사유를 고르기 전에는 확정 버튼이 눌리지 않는지, "뒤로" 로 돌아간 뒤 다시 눌러도 마지막 확인을 거치는지, 멘토·매니저 삭제가 예전대로 동작하는지.

**2026-09-03 뮤테이션 확인.** 주석만 고쳤으므로 점수가 그대로여야 한다는 요구를 만족했다.

```
File                     | % Mutation score | # killed | # survived
delete-confirmation.ts   |           100.00 |       20 |          0
```

---

### Task 4: 운영 지침 문서

**Files:**
- Create: `docs/2026-09-02-mentee-account-deletion-guide.md`

- [x] **Step 1: 운영자용 지침을 쓴다**

설계 문서(`docs/superpowers/specs/2026-09-02-mentee-account-deletion-design.md`)의 2절과 4절을 관리자가 읽을 분량으로 옮긴다. `docs/2026-09-02-admin-account-recovery.md` 와 같은 톤이다. 담을 것은 다음과 같다.

- **경계 한 줄:** 막는 것이 기본, 지우는 것은 개인정보 파기가 필요할 때만.
- **승인 취소로 끝낼 상황과 삭제할 상황**의 구분.
- **화면 절차:** 삭제 클릭 → 점검 결과 확인 → 사유 선택 → 확정. 각 단계에서 시스템이 하는 일.
- **삭제해도 남는 것과 사라지는 것**(설계 3절의 표를 줄인 것).
- **재가입해도 이전 프로젝트는 돌아오지 않는다**는 안내.
- **덤프 파일은 사용 즉시 삭제**하는 규칙과 **Supabase 자동 백업 보존 주기**. 보존 주기는 사용자가 콘솔에서 확인해 알려 준 값을 적는다. 아직 없으면 "확인 필요"로 두고 Task 를 닫지 않는다.
- **본인 요청 삭제에 답하는 문장 예시:** 운영 DB 에서 파기했고 백업본은 N일 후 자동 소멸한다.

- [ ] **Step 2: 커밋한다**

문서만 바뀌므로 게이트는 `npx next lint` 만 돌려도 된다. 다만 습관대로 셋 다 돌린다.

---

## 완료 후 남는 것

이번 범위에서 뺀 넷이다(설계 9.1). 자리는 남겨 두었다.

- 보유기간 경과 계정의 일괄 조회·파기. 사유 `retention_expired` 가 그 자리다.
- 프로젝트 목록의 "이전받음" 표시.
- `AccountDeletionLog` 감사 테이블.
- 설문 응답자 정보의 보유기간 정책.

법률 검토(설계 9절 확정 7)는 구현과 병행한다. 결과는 문구와 보존 항목에만 반영하므로 이 계획의 구조는 바뀌지 않는다.
