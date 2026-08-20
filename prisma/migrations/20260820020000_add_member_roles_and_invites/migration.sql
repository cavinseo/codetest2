-- 회원 역할 체계와 초대 코드.
--
-- role 은 시스템 역할(ADMIN | PROGRAM_MANAGER | MENTOR | MENTEE)이다.
-- 프로젝트 단위 역할(project_members.role)과는 별개다.
ALTER TABLE "users" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'MENTEE';

-- 초대 코드로 가입한 계정의 접근 만료 시각. NULL 이면 만료 없음.
ALTER TABLE "users" ADD COLUMN "accessExpiresAt" TIMESTAMP(3);

-- 기존 관리자 계정은 ADMIN 으로 맞춘다. 나머지는 기본값(MENTEE)을 그대로 둔다.
UPDATE "users" SET "role" = 'ADMIN' WHERE "isAdmin" = true;

CREATE TABLE "invite_codes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "accessDurationDays" INTEGER NOT NULL DEFAULT 90,
    "issuedById" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "usedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invite_codes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "invite_codes_code_key" ON "invite_codes"("code");
CREATE UNIQUE INDEX "invite_codes_usedById_key" ON "invite_codes"("usedById");
CREATE INDEX "invite_codes_email_idx" ON "invite_codes"("email");
CREATE INDEX "invite_codes_issuedById_idx" ON "invite_codes"("issuedById");

ALTER TABLE "invite_codes" ADD CONSTRAINT "invite_codes_issuedById_fkey"
    FOREIGN KEY ("issuedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invite_codes" ADD CONSTRAINT "invite_codes_usedById_fkey"
    FOREIGN KEY ("usedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
