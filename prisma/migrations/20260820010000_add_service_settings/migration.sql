-- 서비스 전역 설정(Google OAuth, SMTP, AI 엔진) 저장소.
-- 예전에는 globalThis 메모리에만 있어 서버리스 콜드스타트마다 사라졌다.
-- value 는 애플리케이션에서 암호화한 문자열이다.
CREATE TABLE "service_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_settings_pkey" PRIMARY KEY ("key")
);
