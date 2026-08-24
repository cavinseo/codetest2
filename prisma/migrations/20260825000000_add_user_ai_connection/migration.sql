-- 회원 개인 AI 키 보관함. 새 테이블만 추가하므로 기존 행에 영향이 없다.
CREATE TABLE "user_ai_connections" (
    "userId" TEXT NOT NULL,
    "vendor" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_ai_connections_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "user_ai_connections" ADD CONSTRAINT "user_ai_connections_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
