-- 발급된 세션을 한꺼번에 무효화하기 위한 값.
-- 비밀번호 변경, 승인 취소 때 1 올리면 그 전에 발급된 쿠키는 전부 거부된다.
ALTER TABLE "users" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
