/*
  Warnings:

  - A unique constraint covering the columns `[projectId,requirementId,company]` on the table `benchmarks` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[projectId,email]` on the table `kano_survey_invitations` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[projectId,techId1,techId2]` on the table `tech_correlations` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "benchmarks_requirementId_idx";

-- DropIndex
DROP INDEX "benchmarks_projectId_idx";

-- DropIndex
DROP INDEX "kano_survey_invitations_projectId_idx";

-- DropIndex
DROP INDEX "tech_correlations_techId2_idx";

-- DropIndex
DROP INDEX "tech_correlations_techId1_idx";

-- DropIndex
DROP INDEX "tech_correlations_projectId_idx";

-- CreateIndex
CREATE UNIQUE INDEX "benchmarks_projectId_requirementId_company_key" ON "benchmarks"("projectId", "requirementId", "company");

-- CreateIndex
CREATE UNIQUE INDEX "kano_survey_invitations_projectId_email_key" ON "kano_survey_invitations"("projectId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "tech_correlations_projectId_techId1_techId2_key" ON "tech_correlations"("projectId", "techId1", "techId2");
