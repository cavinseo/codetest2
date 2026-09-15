-- 멘티별 단일 배정과 일회성 승인 및 원문과 분리된 코멘트를 보존한다.
-- CreateTable
CREATE TABLE "mentor_assignments" (
    "menteeId" TEXT NOT NULL,
    "mentorId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mentor_assignments_pkey" PRIMARY KEY ("menteeId")
);

-- CreateTable
CREATE TABLE "project_creation_requests" (
    "id" TEXT NOT NULL,
    "menteeId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_creation_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worksheet_comments" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "worksheetId" TEXT NOT NULL,
    "authorId" TEXT,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "worksheet_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mentor_assignments_mentorId_idx" ON "mentor_assignments"("mentorId");

-- CreateIndex
CREATE INDEX "project_creation_requests_menteeId_status_idx" ON "project_creation_requests"("menteeId", "status");

-- CreateIndex
CREATE INDEX "project_creation_requests_programId_status_idx" ON "project_creation_requests"("programId", "status");

-- CreateIndex
CREATE INDEX "worksheet_comments_projectId_worksheetId_createdAt_idx" ON "worksheet_comments"("projectId", "worksheetId", "createdAt");

-- AddForeignKey
ALTER TABLE "mentor_assignments" ADD CONSTRAINT "mentor_assignments_menteeId_fkey" FOREIGN KEY ("menteeId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentor_assignments" ADD CONSTRAINT "mentor_assignments_mentorId_fkey" FOREIGN KEY ("mentorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_creation_requests" ADD CONSTRAINT "project_creation_requests_menteeId_fkey" FOREIGN KEY ("menteeId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_creation_requests" ADD CONSTRAINT "project_creation_requests_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_creation_requests" ADD CONSTRAINT "project_creation_requests_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worksheet_comments" ADD CONSTRAINT "worksheet_comments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worksheet_comments" ADD CONSTRAINT "worksheet_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- 동시에 여러 미결 신청이 생기는 것을 데이터베이스에서도 막는다.
CREATE UNIQUE INDEX "project_creation_requests_pending_key" ON "project_creation_requests"("menteeId") WHERE "status" = 'PENDING';
ALTER TABLE "project_creation_requests" ADD CONSTRAINT "project_creation_requests_status_check" CHECK ("status" IN ('PENDING', 'APPROVED', 'REJECTED'));
ALTER TABLE "mentor_assignments" ADD CONSTRAINT "mentor_assignments_distinct_users" CHECK ("menteeId" <> "mentorId");

-- 기존 COACH가 멘티의 전체 프로젝트에서 단일 후보일 때만 승계한다.
INSERT INTO "mentor_assignments" ("menteeId", "mentorId")
SELECT p."ownerId", MIN(pm."userId")
FROM "projects" p
JOIN "users" mentee ON mentee."id" = p."ownerId" AND mentee."role" = 'MENTEE'
JOIN "project_members" pm ON pm."projectId" = p."id" AND pm."role" = 'COACH'
JOIN "users" mentor ON mentor."id" = pm."userId" AND mentor."role" IN ('MENTOR', 'PROGRAM_MANAGER')
WHERE p."ownerId" <> pm."userId"
GROUP BY p."ownerId"
HAVING COUNT(DISTINCT pm."userId") = 1;

-- 이 앱은 서버 세션과 Prisma로 접근하므로 공개 Data API 권한을 열지 않는다.
ALTER TABLE "mentor_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "project_creation_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "worksheet_comments" ENABLE ROW LEVEL SECURITY;
