-- 회원등록 정보와 임시 비밀번호 플래그.
--
-- member_profiles 는 users 와 1:1 이다. 인증 경로(requireAuth)가 매 요청마다
-- users 를 읽으므로 등록 정보를 그 행에 섞지 않는다.

ALTER TABLE "users" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "member_profiles" (
    "userId" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "jobTitle" TEXT,
    "phone" TEXT NOT NULL,
    "expertise" TEXT,
    "careerYears" INTEGER,
    "careerSummary" TEXT,
    "companyName" TEXT,
    "industry" TEXT,
    "foundedYear" INTEGER,
    "privacyConsentAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_profiles_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "member_profiles" ADD CONSTRAINT "member_profiles_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
