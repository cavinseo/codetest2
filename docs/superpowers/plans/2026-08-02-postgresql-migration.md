# PostgreSQL 마이그레이션 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** kano-qfd-webapp의 데이터베이스를 로컬 SQLite에서 **이 PC에 이미 설치돼 실행 중인 PostgreSQL 16.14** 로 전환하고, 기존 `prisma/dev.db` 의 전체 데이터를 유실 없이 이관한다.

**Architecture:** Prisma 스키마가 방언 고유 문법(enum, `@db.*`, Json 타입, raw SQL)을 전혀 쓰지 않으므로 모델 정의는 그대로 두고 `datasource` 블록만 교체한다. 기존 마이그레이션 10개는 SQLite 방언(`PRAGMA`, 테이블 재생성 패턴)이라 Postgres에서 재생이 불가능하므로 baseline 하나로 재생성한다. 데이터는 **provider를 바꾸기 전에** 현재 SQLite 클라이언트로 JSON에 덤프해 두고, 전환 후 FK 의존 순서대로 다시 적재하는 2단계 방식을 쓴다. 이 방식은 새 의존성이 필요 없고 중간 산출물(JSON)이 남아 재시도가 가능하다.

**Tech Stack:** PostgreSQL 16.14 (기존 Windows 서비스 `postgresql-x64-16`), Prisma 6.19.2, Next.js 15, Node.js 24 (로컬) / 20 (CI), Vitest 4

**환경 실측값 (2026-08-03 확인):** 서비스 `postgresql-x64-16` Running, 5432 리스닝, `psql` 은 `C:\Program Files\PostgreSQL\16\bin\psql.exe`, `pg_hba.conf` 의 local/host 인증 방식은 전부 `scram-sha-256` (모든 접속에 비밀번호 필요). Docker는 설치돼 있지 않으며 **필요하지 않다** — 이미 5432를 쓰고 있어 컨테이너를 띄우면 포트가 충돌한다.

## Global Constraints

- Prisma delegate 이름은 모델명의 camelCase이며, `QFDMatrix` 의 delegate는 **`qFDMatrix`** 이다 (기존 [lib/import-json-plan.ts:22](../../../lib/import-json-plan.ts) 에서 확인된 표기).
- 이관 대상 모델은 24개다. `AnalyticsInsight` 는 이번에 삭제하므로 제외한다.
- 실행 가능한 스크립트는 `.mjs` 로 작성한다 (기존 `scripts/check-text-encoding.mjs` 선례. 저장소의 `.ts` 스크립트들은 실행 경로가 없다).
- `tsconfig.json` 이 `scripts` 를 `exclude` 하므로 `scripts/` 아래 파일은 `npx tsc --noEmit` 에 잡히지 않는다. 검증은 실제 실행으로 한다.
- 새 소스 파일 첫 줄에는 파일 역할을 설명하는 한국어 한 줄 주석을 둔다 (AGENTS.md 규칙). `*.config.*` 파일은 예외.
- 데이터 덤프 JSON은 실제 사업 데이터를 담으므로 **절대 커밋하지 않는다**. `.gitignore` 등록이 Task 3에 포함된다.
- 각 Task는 `npm test` 가 통과한 상태로 끝난다. 기존 125개 테스트는 Prisma를 mock하므로 DB 전환과 무관하게 계속 green이어야 한다. 만약 깨진다면 그것 자체가 회귀 신호다.

## 범위 외 (의도적으로 제외)

**동시 저장 보호 로직은 이번 계획에 포함하지 않는다.** 사용자가 범위에서 제외했다. 다만 리스크는 남으므로 기록해 둔다: 워크시트 저장 API 18곳이 `deleteMany` → `createMany` 전체 교체 방식인데, SQLite의 DB 단일 쓰기 락이 사라지고 Postgres MVCC로 바뀌면 두 사용자의 동시 저장이 교차해 한쪽 데이터가 통째로 사라질 수 있다. 마이그레이션 완료 후 별도 작업으로 다루기를 권한다. `.agents/deferred-work.md` 의 "프로젝트 개요 동시 편집 낙관적 잠금" 항목과 같은 계열이다.

**`scripts/seed-kano.ts` 삭제**와 **CI에 Postgres 서비스 컨테이너 추가**도 제외했다. 단, CI가 **깨지지 않도록** 하는 최소 조치(`DATABASE_URL` 더미 값)는 Task 6에 포함한다 — 이건 선택 항목이 아니라 provider 전환의 필수 후속 조치다. `prisma generate` 는 `env("DATABASE_URL")` 이 해석되지 않으면 실패한다.

## File Structure

| 파일 | 책임 | 상태 |
|---|---|---|
| `.env` | `DATABASE_URL` 로컬 값 (gitignored, 비밀번호 포함이라 사람이 직접 작성) | 생성 |
| `scripts/db-migration-models.mjs` | 이관 대상 모델 목록 + FK 의존 관계 + 청크 유틸 | 생성 |
| `tests/db-migration-models.test.ts` | 모델 목록 누락/FK 순서 오류를 사전 검출 | 생성 |
| `scripts/export-sqlite-data.mjs` | SQLite → `prisma/backup/sqlite-export.json` 덤프 | 생성 |
| `scripts/import-postgres-data.mjs` | JSON → Postgres 적재 + 행 수 대조 | 생성 |
| `prisma/schema.prisma` | datasource provider 교체, `AnalyticsInsight` 제거 | 수정 |
| `prisma/migrations/` | SQLite 이력 폐기 후 baseline 재생성 | 재생성 |
| `.gitignore` | `prisma/backup/` 추가 | 수정 |
| `.env.example` | DATABASE_URL 항목 복원 | 수정 |
| `README.md` | SQLite 전제 문장 및 셋업 절차 갱신 | 수정 |
| `.github/workflows/ci.yml` | `DATABASE_URL` 더미 값 추가 | 수정 |

---

### Task 1: PostgreSQL 접속 준비 (사람이 수행 — 완료됨)

**실제 수행 결과 (2026-08-03):** 사용자가 superuser 비밀번호를 분실해 `pg_hba.conf` 를 일시적으로 `trust` 로 바꿔 재설정한 뒤 `scram-sha-256` 으로 되돌렸다 (파일 수정 시각 13:46, 원복 확인함). 전용 역할 `kano` 는 만들지 않고 **기존 `postgres` superuser를 그대로 쓰기로 했다** — 사용자가 비전문가여서 단계를 줄이는 편이 낫다고 판단했다. 데이터베이스 `kano_qfd` 는 미리 만들지 않고 `prisma migrate dev` 가 자동 생성하게 둔다.

`.env` 는 생성 완료되었고 다음 형태다 (비밀번호의 `#` 는 `%23` 으로 URL 인코딩됨).

```
DATABASE_URL="postgresql://postgres:<URL인코딩된비밀번호>@localhost:5432/kano_qfd?schema=public"
```

- [x] PostgreSQL 16.14 서비스 `postgresql-x64-16` Running
- [x] `pg_hba.conf` 인증 `scram-sha-256` 로 원복 확인
- [x] `.env` 생성 및 `.gitignore:33` 로 커밋 차단 확인
- [ ] 실제 접속 성공 여부 — **Task 4 Step 5에서 처음 검증한다**

**보안 메모:** 전용 역할 대신 superuser를 쓰므로 이 접속 정보는 해당 PostgreSQL 서버의 **모든** 데이터베이스에 대한 권한을 갖는다. 로컬 개발 한정이므로 수용했으나, 이 앱을 배포할 때는 반드시 권한이 제한된 전용 역할을 따로 만들어야 한다.

---

### Task 2: 이관 모델 순서 모듈 (TDD)

FK 의존 순서를 틀리면 1,313행을 적재하는 도중에 외래키 위반으로 실패한다. 순서 오류를 **DB에 닿기 전에** 잡기 위해 순서 정의를 모듈로 분리하고 테스트한다.

**Files:**
- Create: `scripts/db-migration-models.mjs`
- Test: `tests/db-migration-models.test.ts`

**Interfaces:**
- Produces:
  - `MIGRATION_MODEL_ORDER: string[]` — 삽입 순서대로 나열된 24개 delegate 이름
  - `MODEL_DEPENDENCIES: Record<string, string[]>` — 각 모델이 FK로 참조하는 부모 delegate 목록
  - `chunk<T>(items: T[], size: number): T[][]` — 배열 분할 유틸
- Task 3의 `export-sqlite-data.mjs` 와 Task 5의 `import-postgres-data.mjs` 가 이 모듈을 공유한다. 모델 목록을 한 곳에만 두기 위해 덤프 스크립트보다 먼저 만든다.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/db-migration-models.test.ts`:

```typescript
// 데이터 이관 모델 순서 정의가 FK 의존 관계와 일치하는지 검증하는 테스트입니다.
import { describe, expect, it } from 'vitest';
import {
    MIGRATION_MODEL_ORDER,
    MODEL_DEPENDENCIES,
    chunk,
} from '../scripts/db-migration-models.mjs';

describe('MIGRATION_MODEL_ORDER', () => {
    it('이관 대상 24개 모델을 중복 없이 담는다', () => {
        expect(MIGRATION_MODEL_ORDER).toHaveLength(24);
        expect(new Set(MIGRATION_MODEL_ORDER).size).toBe(24);
    });

    it('폐기 대상인 analyticsInsight 를 포함하지 않는다', () => {
        expect(MIGRATION_MODEL_ORDER).not.toContain('analyticsInsight');
    });

    it('모든 모델의 FK 부모가 자기보다 먼저 등장한다', () => {
        const seen = new Set<string>();

        for (const model of MIGRATION_MODEL_ORDER) {
            for (const parent of MODEL_DEPENDENCIES[model] ?? []) {
                expect(
                    seen.has(parent),
                    `${model} 이 아직 삽입되지 않은 ${parent} 를 참조합니다`
                ).toBe(true);
            }
            seen.add(model);
        }
    });

    it('의존 관계 표의 키와 값이 모두 이관 목록 안에 있다', () => {
        const known = new Set(MIGRATION_MODEL_ORDER);

        for (const [model, parents] of Object.entries(MODEL_DEPENDENCIES)) {
            expect(known.has(model), `${model} 이 이관 목록에 없습니다`).toBe(true);
            for (const parent of parents as string[]) {
                expect(known.has(parent), `${parent} 가 이관 목록에 없습니다`).toBe(true);
            }
        }
    });
});

describe('chunk', () => {
    it('지정한 크기로 배열을 나눈다', () => {
        expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    });

    it('빈 배열은 빈 결과를 낸다', () => {
        expect(chunk([], 10)).toEqual([]);
    });

    it('크기보다 짧은 배열은 한 덩어리로 둔다', () => {
        expect(chunk([1, 2], 10)).toEqual([[1, 2]]);
    });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/db-migration-models.test.ts`
Expected: FAIL — `Failed to resolve import "../scripts/db-migration-models.mjs"`

- [ ] **Step 3: 모듈 구현**

`scripts/db-migration-models.mjs`:

```javascript
// PostgreSQL 이관 시 FK 제약을 만족하는 모델 삽입 순서와 의존 관계를 정의합니다.

/** 각 모델이 FK 로 참조하는 부모 delegate 목록. 참조가 없는 모델은 생략한다. */
export const MODEL_DEPENDENCIES = {
    project: ['user'],
    projectMember: ['project', 'user'],
    customerRequirement: ['project'],
    technicalCharacteristic: ['project'],
    productAttribute: ['project'],
    specFunction: ['project'],
    kanoSurveyInvitation: ['project', 'user'],
    kanoResponse: ['project', 'customerRequirement', 'kanoSurveyInvitation'],
    qFDMatrix: ['project', 'customerRequirement', 'technicalCharacteristic'],
    techCorrelation: ['project', 'technicalCharacteristic'],
    benchmark: ['project', 'customerRequirement'],
    attributeFitness: ['project', 'productAttribute'],
    fitnessMatrix: ['project'],
    migrationHistory: ['project', 'user'],
    techTreeEntry: ['project'],
    improvementItem: ['project'],
    targetSpec: ['project'],
    techRoadmap: ['project'],
    devPlan: ['project'],
    salesEstimate: ['project'],
    assetItem: ['project'],
    fundingPlan: ['project'],
    fundingSource: ['project'],
};

/** 삽입 순서. 부모가 항상 자식보다 앞에 온다. */
export const MIGRATION_MODEL_ORDER = [
    'user',
    'project',
    'projectMember',
    'customerRequirement',
    'technicalCharacteristic',
    'productAttribute',
    'specFunction',
    'kanoSurveyInvitation',
    'kanoResponse',
    'qFDMatrix',
    'techCorrelation',
    'benchmark',
    'attributeFitness',
    'fitnessMatrix',
    'migrationHistory',
    'techTreeEntry',
    'improvementItem',
    'targetSpec',
    'techRoadmap',
    'devPlan',
    'salesEstimate',
    'assetItem',
    'fundingPlan',
    'fundingSource',
];

/** 배열을 size 개씩 잘라 2차원 배열로 만든다. */
export function chunk(items, size) {
    const result = [];
    for (let i = 0; i < items.length; i += size) {
        result.push(items.slice(i, i + size));
    }
    return result;
}
```

`SpecFunction.parentId` 는 자기참조지만 스키마에 `@relation` 이 없어 FK 제약이 걸리지 않는다. 따라서 의존 관계에 넣지 않는다.

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/db-migration-models.test.ts`
Expected: PASS — `Test Files 1 passed`, `Tests 7 passed`

- [ ] **Step 5: 전체 테스트가 여전히 통과하는지 확인**

Run: `npm test`
Expected: `Test Files 28 passed (28)`, `Tests 132 passed (132)` (기존 27파일 125건 + 신규 1파일 7건)

- [ ] **Step 6: 타입체크 통과 확인**

`.ts` 테스트가 타입 선언이 없는 `.mjs` 모듈을 import하므로 `strict` 모드에서 암묵적 any 오류가 날 수 있다. `tsconfig.json` 의 `allowJs: true` 로 해결되는 것이 정상이지만 반드시 확인한다.

Run: `npx tsc --noEmit`
Expected: 출력 없음 (성공)

실패할 경우(`TS7016` 등)의 처리: `scripts/db-migration-models.mjs` 옆에 타입 선언 파일 `scripts/db-migration-models.d.mts` 를 만든다.

```typescript
// db-migration-models.mjs 의 타입 선언입니다.
export declare const MIGRATION_MODEL_ORDER: string[];
export declare const MODEL_DEPENDENCIES: Record<string, string[]>;
export declare function chunk<T>(items: T[], size: number): T[][];
```

- [ ] **Step 7: 커밋**

저장소에 이번 마이그레이션과 무관한 정리 작업 변경분이 이미 워킹 트리에 있다. **`git add -A` 나 `git add .` 를 쓰지 말고 아래처럼 파일을 명시해 스테이징한다.** (Step 6에서 `.d.mts` 를 만들었다면 그 파일도 함께 넣는다.)

```bash
git add scripts/db-migration-models.mjs tests/db-migration-models.test.ts
git commit -m "feat: define FK-safe model order for PostgreSQL data migration"
```

---

### Task 3: SQLite 데이터 덤프

**이 Task는 반드시 Task 4(provider 전환)보다 먼저 끝나야 한다.** provider를 바꾸는 순간 SQLite를 읽을 수 있는 Prisma 클라이언트가 사라진다.

**Files:**
- Create: `scripts/export-sqlite-data.mjs`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `MIGRATION_MODEL_ORDER` (Task 2)
- Produces: `prisma/backup/sqlite-export.json` — `{ "<delegate명>": [행...] }` 형태의 객체. Task 5가 이 파일을 읽는다.

- [ ] **Step 1: `.gitignore` 에 백업 경로 추가**

`.gitignore` 의 "Local development databases can contain private test/business data." 블록 안, `prisma/dev.db.before-restore-*` 줄 바로 아래에 다음을 넣는다.

```gitignore
prisma/backup/
```

- [ ] **Step 2: 덤프 스크립트 작성**

`scripts/export-sqlite-data.mjs`:

```javascript
// 현재 SQLite 데이터베이스의 전체 행을 JSON 파일로 덤프하는 1회성 마이그레이션 스크립트입니다.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { MIGRATION_MODEL_ORDER } from './db-migration-models.mjs';

const OUT_PATH = path.join(process.cwd(), 'prisma', 'backup', 'sqlite-export.json');

async function main() {
    const prisma = new PrismaClient();
    const dump = {};
    let total = 0;

    try {
        // 읽기만 하므로 순서는 무관하지만, 적재 스크립트와 목록을 공유해 누락을 막는다.
        for (const model of MIGRATION_MODEL_ORDER) {
            const rows = await prisma[model].findMany();
            dump[model] = rows;
            total += rows.length;
            console.log(`${model.padEnd(28)} ${String(rows.length).padStart(6)}`);
        }
    } finally {
        await prisma.$disconnect();
    }

    await mkdir(path.dirname(OUT_PATH), { recursive: true });
    await writeFile(OUT_PATH, JSON.stringify(dump, null, 2), 'utf8');
    console.log(`\n총 ${total}행을 ${OUT_PATH} 에 저장했습니다.`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
```

- [ ] **Step 3: 덤프 실행**

Run: `node scripts/export-sqlite-data.mjs`
Expected: 24줄의 `모델명  행수` 목록과 마지막에 `총 NNNN행을 ... 에 저장했습니다.` 확인된 기준값 일부 — `user 8`, `project 8`, `customerRequirement 61`, `kanoResponse 1313`, `specFunction 300`, `productAttribute 60`, `kanoSurveyInvitation 118`. 이 값들이 크게 다르면 잘못된 DB를 읽고 있는 것이므로 중단한다.

- [ ] **Step 4: 덤프 파일이 git에 잡히지 않는지 확인**

Run: `git status --short`
Expected: 출력에 `prisma/backup/` 이 **없어야** 한다. `.gitignore` 변경(` M .gitignore`)과 새 스크립트(`?? scripts/export-sqlite-data.mjs`)만 보여야 한다.

- [ ] **Step 5: 커밋**

`.gitignore` 에는 이번 마이그레이션과 무관한 정리 작업의 미커밋 변경분이 이미 들어 있다. 함께 커밋하면 관련 없는 작업물이 섞이므로 **`.gitignore` 는 스테이징하지 않고 워킹 트리에 남겨 둔다.** `.gitignore` 는 HEAD가 아니라 워킹 트리 내용으로 동작하므로, 커밋하지 않아도 `prisma/backup/` 무시는 이미 유효하다 (Step 4에서 확인한 그대로다).

```bash
git add scripts/export-sqlite-data.mjs
git commit -m "feat: add SQLite data export script for PostgreSQL migration"
```

---

### Task 4: Prisma provider 전환 및 마이그레이션 baseline 재생성

**Task 2의 덤프 파일이 존재하는지 먼저 확인하고 시작한다.** 이 Task 이후로는 SQLite를 읽을 수 없다.

**Files:**
- Modify: `prisma/schema.prisma` (datasource 블록, `AnalyticsInsight` 모델 제거)
- Delete: `prisma/migrations/` 전체 후 재생성

**Interfaces:**
- Produces: Postgres에 생성된 24개 테이블. Task 5가 여기에 데이터를 적재한다.

- [ ] **Step 1: 덤프 파일 존재 확인 (안전장치)**

Run: `node -e "const d=require('./prisma/backup/sqlite-export.json'); console.log('models:', Object.keys(d).length, 'rows:', Object.values(d).reduce((a,b)=>a+b.length,0))"`
Expected: `models: 24 rows: NNNN` (0이 아닌 값). 파일이 없다면 Task 2로 돌아간다.

- [ ] **Step 2: datasource 블록 교체**

[prisma/schema.prisma:5-8](../../../prisma/schema.prisma) 을 다음으로 바꾼다.

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

- [ ] **Step 3: `AnalyticsInsight` 모델 제거**

`prisma/schema.prisma` 에서 다음 블록을 통째로 삭제한다.

```prisma
model AnalyticsInsight {
  id           String   @id @default(cuid())
  insightType  String
  category     String?
  data         String
  projectCount Int
  lastUpdated  DateTime @default(now())

  @@map("analytics_insights")
}
```

이 모델은 코드 참조가 0건이고 `projectId` 조차 없는 고아 모델이다. 어차피 마이그레이션을 재생성하므로 지금 지우면 Postgres에는 처음부터 만들어지지 않는다.

- [ ] **Step 4: 스키마 유효성 검사**

Run: `npx prisma validate`
Expected: `The schema at prisma\schema.prisma is valid 🚀`

- [ ] **Step 5: 파괴적 단계 전에 접속을 먼저 증명한다**

접속이 안 되는 상태에서 마이그레이션 이력부터 지우면 되돌릴 것도 없이 중간에 멈춘다. 반드시 이 단계를 통과한 뒤 Step 6으로 간다.

`DATABASE_URL` 은 `.env` 에 있고 **비밀번호가 들어 있으므로 절대 출력하지 않는다.** 접속은 Prisma CLI가 `.env` 를 직접 읽게 해서 확인한다.

Run: `npx prisma db execute --schema prisma/schema.prisma --stdin` 에 표준입력으로 `SELECT 1;` 을 넣는다. bash에서는 `echo "SELECT 1;" | npx prisma db execute --schema prisma/schema.prisma --stdin`
Expected: `Script executed successfully.`

결과별 대응:
- **성공** → Step 6으로 진행한다.
- `database "kano_qfd" does not exist` → 데이터베이스가 아직 없는 것이다. **정상이며 문제가 아니다.** Step 6의 `prisma migrate dev` 가 자동으로 생성하므로 그대로 진행한다.
- `password authentication failed` / `role ... does not exist` → `.env` 의 사용자·비밀번호가 틀렸다. **여기서 멈추고 BLOCKED로 보고한다.** 마이그레이션 이력을 지우면 안 된다.
- `Can't reach database server` → PostgreSQL 서비스가 내려갔다. 멈추고 보고한다.

- [ ] **Step 6: SQLite 마이그레이션 이력 폐기**

기존 10개 마이그레이션은 `PRAGMA defer_foreign_keys`, `DATETIME`, 테이블 재생성 패턴을 담은 SQLite 전용 SQL이라 Postgres에서 재생이 불가능하다. 이 파일들은 모두 git에 커밋돼 있어 `git checkout -- prisma/migrations` 로 복원할 수 있다.

```bash
rm -rf prisma/migrations
```

- [ ] **Step 7: Postgres baseline 마이그레이션 생성 및 적용**

Run: `npx prisma migrate dev --name init_postgresql`
Expected: `Applying migration '<timestamp>_init_postgresql'` 에 이어 `Your database is now in sync with your schema.` 와 `Generated Prisma Client`. 새 파일 `prisma/migrations/<timestamp>_init_postgresql/migration.sql` 이 생기고, 내용에 `PRAGMA` 가 없고 `TIMESTAMP(3)` / `DOUBLE PRECISION` 이 보여야 한다.

- [ ] **Step 8: 테이블 생성 확인**

`psql` 은 비밀번호를 명령줄에 넣어야 하므로 쓰지 않는다. 생성된 Prisma 클라이언트로 확인한다.

```bash
node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.\$queryRawUnsafe(\"select tablename from pg_tables where schemaname='public' order by tablename\").then(r=>{console.log('테이블 수:',r.length);console.log(r.map(x=>x.tablename).join(' '));}).finally(()=>p.\$disconnect());"
```

Expected: `테이블 수: 25` (모델 24개 + `_prisma_migrations`). 목록에 **`analytics_insights` 가 없어야 한다.**

- [ ] **Step 9: 타입체크와 테스트가 통과하는지 확인**

Run: `npx tsc --noEmit`
Expected: 출력 없음 (성공)

Run: `npm test`
Expected: `Test Files 28 passed (28)`, `Tests 132 passed (132)` — 테스트는 Prisma를 mock하므로 DB 전환에 영향받지 않아야 한다.

- [ ] **Step 10: 커밋**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat!: switch Prisma datasource from SQLite to PostgreSQL

기존 SQLite 방언 마이그레이션 10개는 Postgres 에서 재생할 수 없어 baseline 하나로 재생성했다.
미사용 고아 모델 AnalyticsInsight 를 함께 제거했다."
```

---

### Task 5: 데이터 적재 및 행 수 대조

**Files:**
- Create: `scripts/import-postgres-data.mjs`

**Interfaces:**
- Consumes: `MIGRATION_MODEL_ORDER` / `chunk` (Task 2), `prisma/backup/sqlite-export.json` (Task 3)
- Produces: 원본과 행 수가 일치하는 Postgres 데이터베이스

- [ ] **Step 1: 적재 스크립트 작성**

`scripts/import-postgres-data.mjs`:

```javascript
// SQLite 덤프 JSON 을 PostgreSQL 에 FK 순서대로 적재하고 행 수를 대조하는 1회성 마이그레이션 스크립트입니다.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { MIGRATION_MODEL_ORDER, chunk } from './db-migration-models.mjs';

const IN_PATH = path.join(process.cwd(), 'prisma', 'backup', 'sqlite-export.json');
const BATCH_SIZE = 500;

async function main() {
    const dump = JSON.parse(await readFile(IN_PATH, 'utf8'));
    const prisma = new PrismaClient();
    const mismatches = [];

    try {
        for (const model of MIGRATION_MODEL_ORDER) {
            const rows = dump[model] ?? [];

            for (const batch of chunk(rows, BATCH_SIZE)) {
                await prisma[model].createMany({ data: batch });
            }

            const actual = await prisma[model].count();
            const status = actual === rows.length ? 'OK' : 'MISMATCH';
            if (status === 'MISMATCH') {
                mismatches.push(`${model}: 기대 ${rows.length}, 실제 ${actual}`);
            }
            console.log(`${model.padEnd(28)} ${String(rows.length).padStart(6)} -> ${String(actual).padStart(6)}  ${status}`);
        }
    } finally {
        await prisma.$disconnect();
    }

    if (mismatches.length > 0) {
        console.error('\n행 수가 일치하지 않습니다:');
        for (const line of mismatches) console.error(`  - ${line}`);
        process.exitCode = 1;
        return;
    }

    console.log('\n모든 모델의 행 수가 원본과 일치합니다.');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
```

- [ ] **Step 2: 적재 실행**

Run: `node scripts/import-postgres-data.mjs`
Expected: 24줄 모두 `OK` 로 끝나고 마지막에 `모든 모델의 행 수가 원본과 일치합니다.` 종료 코드는 0.

실패했을 때의 처리: FK 위반이라면 `MODEL_DEPENDENCIES` 에 빠진 관계가 있다는 뜻이므로 Task 3의 정의를 고치고, 아래 명령으로 DB를 비운 뒤 다시 실행한다.

```bash
npx prisma migrate reset --force
```

- [ ] **Step 3: 실제 데이터를 눈으로 확인**

`psql` 은 비밀번호를 명령줄에 넣어야 하므로 쓰지 않는다. Prisma 클라이언트로 확인한다.

```bash
node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();(async()=>{console.log('kanoResponse',await p.kanoResponse.count());console.log('project',await p.project.count());console.log((await p.project.findMany({take:3,select:{name:true}})).map(x=>x.name).join(' | '));await p.\$disconnect();})();"
```

Expected: `1313`, `8`, 그리고 한글 프로젝트명 3건이 깨지지 않고 출력. 한글이 깨져 보이면 psql 클라이언트 인코딩 문제이므로 `PGCLIENTENCODING=UTF8` 을 붙여 재확인한다.

- [ ] **Step 4: `updatedAt` 보존 여부 확인**

Prisma의 `@updatedAt` 필드에 명시값을 넘겼을 때 그대로 저장되는지는 버전에 따라 다르다. 값이 덮어써졌더라도 데이터 손실은 아니지만 확인은 해 둔다.

```bash
node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.project.aggregate({_min:{createdAt:true},_max:{updatedAt:true}}).then(r=>console.log(r)).finally(()=>p.\$disconnect());"
```

Expected: `createdAt` 이 원본 프로젝트 생성 시점(2026년 상반기)으로 나오면 정상. `updatedAt` 이 전부 오늘 날짜라면 Prisma가 덮어쓴 것이므로 보고만 하고 진행한다.

- [ ] **Step 5: 커밋**

```bash
git add scripts/import-postgres-data.mjs
git commit -m "feat: add PostgreSQL data import script with row-count verification"
```

---

### Task 6: 앱 검증 및 문서·CI 갱신

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: `.env.example` 에 DATABASE_URL 복원**

파일 맨 앞 3줄이 현재 "DATABASE_URL 환경 변수는 사용하지 않는다"고 적혀 있다. 이제 사실이 아니므로 다음으로 교체한다.

```bash
# 환경 변수 설정

# PostgreSQL 접속 문자열. 로컬 개발은 이 PC에 설치된 PostgreSQL 16 서비스를 사용한다.
# 실제 비밀번호는 각자 .env 에 넣고, 이 예제 파일에는 자리표시자만 둔다.
DATABASE_URL="postgresql://kano:CHANGE_ME@localhost:5432/kano_qfd?schema=public"
```

나머지 항목(`SESSION_SECRET`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `ADMIN_EMAILS`, `ALLOW_DEV_ADMIN`)은 그대로 둔다.

- [ ] **Step 2: `README.md` 갱신**

세 곳을 고친다.

1. 첫 문단의 `Prisma and SQLite for local development` → `Prisma and PostgreSQL`
2. Tech Stack 목록의 `- SQLite for local development` → `- PostgreSQL 16`
3. "Prepare the local database" 코드 블록을 다음으로 교체한다.

기존에 설치된 PostgreSQL 서비스에 역할과 DB를 만든 뒤 `.env` 에 `DATABASE_URL` 을 넣었다는 전제로 적는다.

```bash
npx prisma migrate deploy
npx prisma generate
```

"Local Data Handling" 절의 `prisma/dev.db` 관련 설명은 남겨 둔다 — 파일이 디스크에 아직 있고 비공개 데이터를 담고 있어 경고가 여전히 유효하다. 다만 첫 문장만 다음으로 바꿔 현재 상태를 정확히 적는다.

> `prisma/dev.db` is the pre-migration local SQLite database. It is no longer used by the app but still contains private test data, so it stays untracked.

- [ ] **Step 3: CI가 깨지지 않도록 DATABASE_URL 추가**

`prisma generate` 는 `env("DATABASE_URL")` 이 해석되지 않으면 실패한다. `.github/workflows/ci.yml` 의 `env:` 블록에 한 줄 추가한다.

```yaml
    env:
      NODE_ENV: test
      SESSION_SECRET: ci-dummy-secret-32-chars-minimum!
      ALLOW_DEV_ADMIN: "false"
      DATABASE_URL: postgresql://ci:ci@localhost:5432/ci?schema=public
```

이 값은 실제로 접속하지 않는 더미다. CI의 테스트는 Prisma를 mock하고 빌드는 쿼리를 실행하지 않으므로 연결 가능한 DB가 필요 없다. 실제 Postgres에 대고 도는 CI 테스트는 이번 범위 밖이다.

- [ ] **Step 4: 전체 품질 검사**

Run: `npm run lint`
Expected: 출력 없음

Run: `npx tsc --noEmit`
Expected: 출력 없음

Run: `npm test`
Expected: `Test Files 28 passed (28)`, `Tests 132 passed (132)`

Run: `npm run build`
Expected: 라우트 목록이 출력되고 에러 없이 종료

- [ ] **Step 5: 실제 화면에서 데이터 확인**

개발 서버를 띄우고 실제로 Postgres에서 데이터를 읽어오는지 확인한다. 이것이 마이그레이션 성공의 최종 판정 기준이다.

Run: `npm run dev`

브라우저에서 확인할 항목:
1. `/login` 으로 로그인 — 기존 사용자 계정이 그대로 동작해야 한다 (비밀번호 해시가 이관되었으므로)
2. `/dashboard` — 프로젝트 8개가 보여야 한다
3. 아무 프로젝트나 열어 `WS-5 고객요구사항도출표` — 요구사항 행이 보이고 한글이 깨지지 않아야 한다
4. 프로젝트 홈의 `WS-7 Kano 분석 집계표` — 응답 집계 수치가 나와야 한다 (Kano 응답 1,313건이 이관된 결과)
5. `WS-9 QFD` — 매트릭스 셀이 채워져 있어야 한다

한 항목이라도 비어 있으면 해당 모델의 이관을 다시 확인한다.

**정렬 순서 차이는 버그가 아니다.** `orderBy: { name: 'asc' }` 를 쓰는 기술특성 목록 3곳(`qfd/analysis`, `qfd/technical`, `spec/generate`)은 SQLite가 UTF-8 바이트 순, Postgres가 로케일 콜레이션을 따르므로 한글 항목의 표시 순서가 바뀔 수 있다. 데이터 누락과 혼동하지 않도록 개수로 판단한다.

- [ ] **Step 6: 커밋**

```bash
git add .env.example README.md .github/workflows/ci.yml
git commit -m "docs: update setup docs and CI for PostgreSQL migration"
```

---

## 롤백 절차

Task 4 이후 문제가 생기면 다음으로 SQLite 상태로 되돌린다. `prisma/dev.db` 는 삭제하지 않으므로 원본이 그대로 남아 있다.

```bash
git checkout main -- prisma/schema.prisma prisma/migrations
npx prisma generate
```

`.env` 의 `DATABASE_URL` 은 SQLite provider에서 무시되므로 지우지 않아도 된다.

## 완료 기준

- [ ] `echo "SELECT 1;" | npx prisma db execute --schema prisma/schema.prisma --stdin` 가 `Script executed successfully.` 를 낸다
- [ ] `prisma/migrations/` 에 Postgres baseline 하나만 있고 `PRAGMA` 가 없다
- [ ] `node scripts/import-postgres-data.mjs` 가 24개 모델 전부 `OK` 로 종료한다
- [ ] `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build` 가 모두 통과한다
- [ ] 개발 서버에서 로그인 후 프로젝트 8개와 Kano 집계가 정상 표시된다
- [ ] `analytics_insights` 테이블이 존재하지 않는다
- [ ] `git status` 에 `prisma/backup/` 이 나타나지 않는다
