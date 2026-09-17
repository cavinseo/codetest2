-- 기존 초대 조건을 보존하면서 명시한 가입·로그인 공통 기한을 저장한다.
ALTER TABLE "invite_codes" ADD COLUMN "accessExpiresAt" TIMESTAMP(3);
