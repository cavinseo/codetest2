-- 기술 비교값은 서버 Prisma 인가로만 제공하며 공개 Data API 접근을 차단한다.
ALTER TABLE "technical_benchmarks" ENABLE ROW LEVEL SECURITY;
