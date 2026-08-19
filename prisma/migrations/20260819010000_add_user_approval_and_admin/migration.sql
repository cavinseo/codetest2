-- 계정 승인 절차 도입.
-- status: PENDING(승인 대기) / APPROVED(승인됨). 승인돼야 로그인할 수 있다.
ALTER TABLE "users" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE "users" ADD COLUMN "isAdmin" BOOLEAN NOT NULL DEFAULT false;

-- 이 마이그레이션 이전에 가입한 사용자는 전부 승인 상태로 옮긴다.
-- 그러지 않으면 배포 순간 기존 사용자 전원이 잠긴다.
UPDATE "users" SET "status" = 'APPROVED';

-- 관리자 계정 시드. 비밀번호는 bcrypt(10 rounds) 해시로,
-- 관리자 화면에서 추후 변경할 수 있다.
INSERT INTO "users" ("id", "email", "name", "passwordHash", "status", "isAdmin", "createdAt", "updatedAt")
VALUES (
    'user_admin_seed0001',
    'admin@ks-qfd.com',
    '관리자',
    '$2a$10$QH62JEIo9A1aBeOelaraHePPhzqqKIZFpjY2rkfRXI9yhVwKYKAum',
    'APPROVED',
    true,
    NOW(),
    NOW()
)
ON CONFLICT ("email") DO UPDATE SET "isAdmin" = true, "status" = 'APPROVED';
