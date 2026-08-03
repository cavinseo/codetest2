-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "businessPlanFile" TEXT,
    "detailedDescription" TEXT,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_items" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT,
    "content" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "asset_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "funding_plans" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "category" TEXT,
    "item" TEXT,
    "year1" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "year2" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "year3" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "funding_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "funding_sources" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "category" TEXT,
    "year1" TEXT,
    "year2" TEXT,
    "year3" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "funding_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_members" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "invitedBy" TEXT,
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "joinedAt" TIMESTAMP(3),

    CONSTRAINT "project_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spec_functions" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "technology" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "spec_functions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_requirements" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subcategory" TEXT,
    "requirement" TEXT NOT NULL,
    "kanoPositiveQ" TEXT,
    "kanoNegativeQ" TEXT,
    "kanoWeight" DOUBLE PRECISION,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "technical_characteristics" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT,
    "targetValue" TEXT,

    CONSTRAINT "technical_characteristics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kano_survey_invitations" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "invitedBy" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "isUsed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kano_survey_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kano_responses" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "invitationId" TEXT NOT NULL,
    "respondentEmail" TEXT NOT NULL,
    "positiveAnswer" INTEGER NOT NULL,
    "negativeAnswer" INTEGER NOT NULL,
    "kanoCategory" TEXT NOT NULL,
    "respondedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kano_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qfd_matrices" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "technicalCharId" TEXT NOT NULL,
    "strength" TEXT NOT NULL,
    "currentScore" DOUBLE PRECISION,
    "competitorScore" DOUBLE PRECISION,

    CONSTRAINT "qfd_matrices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_attributes" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "productName" TEXT,
    "customerName" TEXT,
    "marketSegment" TEXT,
    "customerNeed" TEXT,
    "benefit" TEXT,
    "attribute" TEXT,
    "techCapability" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_attributes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attribute_fitnesses" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "attributeId" TEXT NOT NULL,
    "importance" INTEGER NOT NULL DEFAULT 0,
    "currentLevel" INTEGER NOT NULL DEFAULT 0,
    "targetLevel" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,

    CONSTRAINT "attribute_fitnesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tech_correlations" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "techId1" TEXT NOT NULL,
    "techId2" TEXT NOT NULL,
    "correlation" TEXT NOT NULL,

    CONSTRAINT "tech_correlations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "benchmarks" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "benchmarks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "migration_histories" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "sheetsMigrated" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "errorLog" TEXT,
    "migratedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "migration_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fitness_matrices" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "marketsJson" TEXT NOT NULL,
    "matrixJson" TEXT NOT NULL,
    "managerComment" TEXT,
    "consultantNote" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fitness_matrices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tech_tree_entries" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "customerVoice" TEXT,
    "coreSpec" TEXT,
    "subSpec" TEXT,
    "techCharacteristic" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tech_tree_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "improvement_items" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "content" TEXT,
    "improvementRate" TEXT,
    "devProportion" TEXT,
    "priority" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "improvement_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "target_specs" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "category" TEXT,
    "subCategory" TEXT,
    "specItem" TEXT,
    "unit" TEXT,
    "currentValue" TEXT,
    "competitorValue" TEXT,
    "targetValue" TEXT,
    "note" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "target_specs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tech_roadmaps" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "category" TEXT,
    "techItem" TEXT,
    "currentLevel" TEXT,
    "q1" TEXT,
    "q2" TEXT,
    "q3" TEXT,
    "q4" TEXT,
    "targetLevel" TEXT,
    "owner" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tech_roadmaps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dev_plans" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "phase" TEXT,
    "task" TEXT,
    "description" TEXT,
    "startDate" TEXT,
    "endDate" TEXT,
    "owner" TEXT,
    "status" TEXT NOT NULL DEFAULT '미시작',
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "dev_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_estimates" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "period" TEXT NOT NULL DEFAULT 'Y',
    "customer" TEXT,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "futureAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "competitor" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "sales_estimates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "projects_ownerId_idx" ON "projects"("ownerId");

-- CreateIndex
CREATE INDEX "asset_items_projectId_idx" ON "asset_items"("projectId");

-- CreateIndex
CREATE INDEX "funding_plans_projectId_idx" ON "funding_plans"("projectId");

-- CreateIndex
CREATE INDEX "funding_sources_projectId_idx" ON "funding_sources"("projectId");

-- CreateIndex
CREATE INDEX "project_members_projectId_idx" ON "project_members"("projectId");

-- CreateIndex
CREATE INDEX "project_members_userId_idx" ON "project_members"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "project_members_projectId_userId_key" ON "project_members"("projectId", "userId");

-- CreateIndex
CREATE INDEX "spec_functions_projectId_idx" ON "spec_functions"("projectId");

-- CreateIndex
CREATE INDEX "customer_requirements_projectId_idx" ON "customer_requirements"("projectId");

-- CreateIndex
CREATE INDEX "technical_characteristics_projectId_idx" ON "technical_characteristics"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "kano_survey_invitations_token_key" ON "kano_survey_invitations"("token");

-- CreateIndex
CREATE INDEX "kano_survey_invitations_token_idx" ON "kano_survey_invitations"("token");

-- CreateIndex
CREATE UNIQUE INDEX "kano_survey_invitations_projectId_email_key" ON "kano_survey_invitations"("projectId", "email");

-- CreateIndex
CREATE INDEX "kano_responses_projectId_idx" ON "kano_responses"("projectId");

-- CreateIndex
CREATE INDEX "kano_responses_requirementId_idx" ON "kano_responses"("requirementId");

-- CreateIndex
CREATE INDEX "kano_responses_invitationId_idx" ON "kano_responses"("invitationId");

-- CreateIndex
CREATE UNIQUE INDEX "qfd_matrices_projectId_requirementId_technicalCharId_key" ON "qfd_matrices"("projectId", "requirementId", "technicalCharId");

-- CreateIndex
CREATE INDEX "product_attributes_projectId_idx" ON "product_attributes"("projectId");

-- CreateIndex
CREATE INDEX "attribute_fitnesses_projectId_idx" ON "attribute_fitnesses"("projectId");

-- CreateIndex
CREATE INDEX "attribute_fitnesses_attributeId_idx" ON "attribute_fitnesses"("attributeId");

-- CreateIndex
CREATE UNIQUE INDEX "tech_correlations_projectId_techId1_techId2_key" ON "tech_correlations"("projectId", "techId1", "techId2");

-- CreateIndex
CREATE UNIQUE INDEX "benchmarks_projectId_requirementId_company_key" ON "benchmarks"("projectId", "requirementId", "company");

-- CreateIndex
CREATE INDEX "migration_histories_projectId_idx" ON "migration_histories"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "fitness_matrices_projectId_key" ON "fitness_matrices"("projectId");

-- CreateIndex
CREATE INDEX "tech_tree_entries_projectId_idx" ON "tech_tree_entries"("projectId");

-- CreateIndex
CREATE INDEX "improvement_items_projectId_idx" ON "improvement_items"("projectId");

-- CreateIndex
CREATE INDEX "target_specs_projectId_idx" ON "target_specs"("projectId");

-- CreateIndex
CREATE INDEX "tech_roadmaps_projectId_idx" ON "tech_roadmaps"("projectId");

-- CreateIndex
CREATE INDEX "dev_plans_projectId_idx" ON "dev_plans"("projectId");

-- CreateIndex
CREATE INDEX "sales_estimates_projectId_idx" ON "sales_estimates"("projectId");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_items" ADD CONSTRAINT "asset_items_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "funding_plans" ADD CONSTRAINT "funding_plans_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "funding_sources" ADD CONSTRAINT "funding_sources_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spec_functions" ADD CONSTRAINT "spec_functions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_requirements" ADD CONSTRAINT "customer_requirements_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technical_characteristics" ADD CONSTRAINT "technical_characteristics_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kano_survey_invitations" ADD CONSTRAINT "kano_survey_invitations_invitedBy_fkey" FOREIGN KEY ("invitedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kano_survey_invitations" ADD CONSTRAINT "kano_survey_invitations_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kano_responses" ADD CONSTRAINT "kano_responses_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "kano_survey_invitations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kano_responses" ADD CONSTRAINT "kano_responses_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "customer_requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kano_responses" ADD CONSTRAINT "kano_responses_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qfd_matrices" ADD CONSTRAINT "qfd_matrices_technicalCharId_fkey" FOREIGN KEY ("technicalCharId") REFERENCES "technical_characteristics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qfd_matrices" ADD CONSTRAINT "qfd_matrices_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "customer_requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qfd_matrices" ADD CONSTRAINT "qfd_matrices_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_attributes" ADD CONSTRAINT "product_attributes_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attribute_fitnesses" ADD CONSTRAINT "attribute_fitnesses_attributeId_fkey" FOREIGN KEY ("attributeId") REFERENCES "product_attributes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attribute_fitnesses" ADD CONSTRAINT "attribute_fitnesses_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tech_correlations" ADD CONSTRAINT "tech_correlations_techId2_fkey" FOREIGN KEY ("techId2") REFERENCES "technical_characteristics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tech_correlations" ADD CONSTRAINT "tech_correlations_techId1_fkey" FOREIGN KEY ("techId1") REFERENCES "technical_characteristics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tech_correlations" ADD CONSTRAINT "tech_correlations_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benchmarks" ADD CONSTRAINT "benchmarks_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "customer_requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benchmarks" ADD CONSTRAINT "benchmarks_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "migration_histories" ADD CONSTRAINT "migration_histories_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "migration_histories" ADD CONSTRAINT "migration_histories_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fitness_matrices" ADD CONSTRAINT "fitness_matrices_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tech_tree_entries" ADD CONSTRAINT "tech_tree_entries_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "improvement_items" ADD CONSTRAINT "improvement_items_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "target_specs" ADD CONSTRAINT "target_specs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tech_roadmaps" ADD CONSTRAINT "tech_roadmaps_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dev_plans" ADD CONSTRAINT "dev_plans_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_estimates" ADD CONSTRAINT "sales_estimates_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
