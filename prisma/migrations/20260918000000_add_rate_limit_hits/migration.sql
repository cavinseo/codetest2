-- 인증 요청 제한을 서버 인스턴스 사이에서도 공유하되 원본 이메일과 IP는 저장하지 않는다.
CREATE TABLE "rate_limit_hits" (
    "id" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "attemptedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_limit_hits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "rate_limit_hits_keyHash_attemptedAt_idx" ON "rate_limit_hits"("keyHash", "attemptedAt");
CREATE INDEX "rate_limit_hits_expiresAt_idx" ON "rate_limit_hits"("expiresAt");
