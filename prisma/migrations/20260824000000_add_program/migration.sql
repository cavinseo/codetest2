-- 기관(기업) 단위 프로그램을 도입한다.
--
-- projects 와 invite_codes 에 programId 를 NOT NULL 로 붙이는데, 두 테이블에는
-- 이미 행이 있다. prisma migrate diff 가 뽑아주는 SQL 은 기본값 없이 NOT NULL
-- 컬럼을 추가해 그대로 실패한다. 그래서 순서를 손으로 짰다:
--
--   1) programs 생성
--   2) 기존 행을 담을 「미분류」 프로그램 한 개 삽입
--   3) projects.programId, invite_codes.programId 를 nullable 로 추가 →
--      백필 → NOT NULL 로 조인
--   4) users.programId (nullable, 백필 없음)
--   5) 외래키·인덱스
--
-- 3) 을 nullable 추가 → 백필 → NOT NULL 세 단계로 나누지 않으면 기존
-- 데이터가 있는 DB 에서 반드시 깨진다.

-- ─── 1) programs ────────────────────────────────────────────────────────────

CREATE TABLE "programs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "managerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "programs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "programs_managerId_idx" ON "programs"("managerId");

ALTER TABLE "programs" ADD CONSTRAINT "programs_managerId_fkey"
    FOREIGN KEY ("managerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── 2) 기존 행을 담을 「미분류」 프로그램 ──────────────────────────────────
--
-- 담당자는 관리자를 우선 고르고, 관리자가 없으면 가장 오래된 계정을 쓴다.
-- 계정이 아예 없으면 아무 행도 안 들어가는데, 그 경우 projects 와 invite_codes
-- 도 비어 있다(둘 다 users 를 참조하는 NOT NULL 외래키를 갖는다). 그래서
-- 3) 의 백필이 0건이 되고 NOT NULL 조인도 통과한다.
--
-- 기간은 백필용 자리이므로 넉넉히 잡는다. 실제 프로그램은 화면에서 만든다.
INSERT INTO "programs" ("id", "name", "organization", "startsAt", "endsAt", "managerId", "createdAt", "updatedAt")
SELECT * FROM (
    SELECT
        'prog_unclassified'                          AS "id",
        '미분류'                                      AS "name",
        '미지정'                                      AS "organization",
        CURRENT_TIMESTAMP                            AS "startsAt",
        CURRENT_TIMESTAMP + INTERVAL '10 years'      AS "endsAt",
        u."id"                                       AS "managerId",
        CURRENT_TIMESTAMP                            AS "createdAt",
        CURRENT_TIMESTAMP                            AS "updatedAt"
    FROM "users" u
    -- 관리자를 우선 고른다. false 가 true 보다 앞에 정렬되므로 isAdmin=true 가 먼저 온다.
    ORDER BY (u."isAdmin" = false), u."createdAt"
    LIMIT 1
) AS seed
ON CONFLICT ("id") DO NOTHING;

-- ─── 3) projects.programId ──────────────────────────────────────────────────

ALTER TABLE "projects" ADD COLUMN "programId" TEXT;

UPDATE "projects" SET "programId" = 'prog_unclassified' WHERE "programId" IS NULL;

ALTER TABLE "projects" ALTER COLUMN "programId" SET NOT NULL;

-- ─── 3) invite_codes.programId ──────────────────────────────────────────────

ALTER TABLE "invite_codes" ADD COLUMN "programId" TEXT;

UPDATE "invite_codes" SET "programId" = 'prog_unclassified' WHERE "programId" IS NULL;

ALTER TABLE "invite_codes" ALTER COLUMN "programId" SET NOT NULL;

-- ─── 4) users.programId ──────────────────────────────────────────────────────
--
-- 멘티가 속한 프로그램. nullable 이라 백필이 필요 없다 — 기존 계정은 전부
-- null 로 남고, 프로그램 전용 초대 코드로 새로 가입하는 멘티부터 채워진다.

ALTER TABLE "users" ADD COLUMN "programId" TEXT;

ALTER TABLE "users" ADD CONSTRAINT "users_programId_fkey"
    FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── 5) 외래키·인덱스 ──────────────────────────────────────────────────────

CREATE INDEX "projects_programId_idx" ON "projects"("programId");

CREATE INDEX "invite_codes_programId_idx" ON "invite_codes"("programId");

ALTER TABLE "projects" ADD CONSTRAINT "projects_programId_fkey"
    FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "invite_codes" ADD CONSTRAINT "invite_codes_programId_fkey"
    FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
