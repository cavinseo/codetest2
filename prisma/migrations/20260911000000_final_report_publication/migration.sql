-- 멘토의 결과보고서 초안과 완료본을 별도 보존하고 공개 Data API 접근을 차단한다.
-- CreateTable
CREATE TABLE "final_reports" (
    "projectId" TEXT NOT NULL,
    "draft" JSONB NOT NULL,
    "published" JSONB,
    "version" INTEGER NOT NULL DEFAULT 0,
    "publishedVersion" INTEGER,
    "updatedById" TEXT NOT NULL,
    "publishedById" TEXT,
    "publishedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "final_reports_pkey" PRIMARY KEY ("projectId")
);

-- AddForeignKey
ALTER TABLE "final_reports" ADD CONSTRAINT "final_reports_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "final_reports" ENABLE ROW LEVEL SECURITY;
