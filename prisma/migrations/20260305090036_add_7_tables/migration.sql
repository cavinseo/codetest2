-- CreateTable
CREATE TABLE "fitness_matrices" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "marketsJson" TEXT NOT NULL,
    "matrixJson" TEXT NOT NULL,
    "managerComment" TEXT,
    "consultantNote" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "fitness_matrices_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "tech_tree_entries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "customerVoice" TEXT,
    "coreSpec" TEXT,
    "subSpec" TEXT,
    "techCharacteristic" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "tech_tree_entries_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "improvement_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "content" TEXT,
    "improvementRate" TEXT,
    "devProportion" TEXT,
    "priority" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "improvement_items_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "target_specs" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    CONSTRAINT "target_specs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "tech_roadmaps" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    CONSTRAINT "tech_roadmaps_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "dev_plans" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "phase" TEXT,
    "task" TEXT,
    "description" TEXT,
    "startDate" TEXT,
    "endDate" TEXT,
    "owner" TEXT,
    "status" TEXT NOT NULL DEFAULT '미시작',
    "order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "dev_plans_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "sales_estimates" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "customer" TEXT,
    "amount" REAL NOT NULL DEFAULT 0,
    "competitor" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "sales_estimates_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

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
