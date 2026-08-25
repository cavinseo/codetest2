-- 회원 AI 연결을 4모드로 확장한다. 기존 행은 전부 벤더 키 등록분이므로
-- mode='api' 로 백필하고, 새 행의 기본은 'rule' 이다.
ALTER TABLE "user_ai_connections" ALTER COLUMN "vendor" DROP NOT NULL;
ALTER TABLE "user_ai_connections" ALTER COLUMN "apiKey" DROP NOT NULL;

ALTER TABLE "user_ai_connections" ADD COLUMN "mode" TEXT;
UPDATE "user_ai_connections" SET "mode" = 'api';
ALTER TABLE "user_ai_connections" ALTER COLUMN "mode" SET NOT NULL;
ALTER TABLE "user_ai_connections" ALTER COLUMN "mode" SET DEFAULT 'rule';

ALTER TABLE "user_ai_connections" ADD COLUMN "mcpBaseUrl" TEXT;
ALTER TABLE "user_ai_connections" ADD COLUMN "mcpModel" TEXT;
ALTER TABLE "user_ai_connections" ADD COLUMN "localBaseUrl" TEXT;
ALTER TABLE "user_ai_connections" ADD COLUMN "localModel" TEXT;
