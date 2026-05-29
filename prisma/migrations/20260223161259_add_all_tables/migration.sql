/*
  Warnings:

  - You are about to drop the column `technicalFeature` on the `qfd_matrices` table. All the data in the column will be lost.
  - Added the required column `technicalCharId` to the `qfd_matrices` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "projects" ADD COLUMN "businessPlanFile" TEXT;
ALTER TABLE "projects" ADD COLUMN "detailedDescription" TEXT;

-- CreateTable
CREATE TABLE "spec_functions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "technology" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "spec_functions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "technical_characteristics" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT,
    "targetValue" TEXT,
    CONSTRAINT "technical_characteristics_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "product_attributes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "productName" TEXT,
    "customerName" TEXT,
    "marketSegment" TEXT,
    "customerNeed" TEXT,
    "benefit" TEXT,
    "attribute" TEXT,
    "techCapability" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "product_attributes_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "attribute_fitnesses" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "attributeId" TEXT NOT NULL,
    "importance" INTEGER NOT NULL DEFAULT 0,
    "currentLevel" INTEGER NOT NULL DEFAULT 0,
    "targetLevel" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    CONSTRAINT "attribute_fitnesses_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "attribute_fitnesses_attributeId_fkey" FOREIGN KEY ("attributeId") REFERENCES "product_attributes" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "tech_correlations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "techId1" TEXT NOT NULL,
    "techId2" TEXT NOT NULL,
    "correlation" TEXT NOT NULL,
    CONSTRAINT "tech_correlations_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "tech_correlations_techId1_fkey" FOREIGN KEY ("techId1") REFERENCES "technical_characteristics" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "tech_correlations_techId2_fkey" FOREIGN KEY ("techId2") REFERENCES "technical_characteristics" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "benchmarks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "benchmarks_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "benchmarks_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "customer_requirements" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_qfd_matrices" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "technicalCharId" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "currentScore" REAL,
    "competitorScore" REAL,
    CONSTRAINT "qfd_matrices_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "qfd_matrices_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "customer_requirements" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "qfd_matrices_technicalCharId_fkey" FOREIGN KEY ("technicalCharId") REFERENCES "technical_characteristics" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_qfd_matrices" ("competitorScore", "currentScore", "id", "projectId", "relationship", "requirementId") SELECT "competitorScore", "currentScore", "id", "projectId", "relationship", "requirementId" FROM "qfd_matrices";
DROP TABLE "qfd_matrices";
ALTER TABLE "new_qfd_matrices" RENAME TO "qfd_matrices";
CREATE INDEX "qfd_matrices_projectId_idx" ON "qfd_matrices"("projectId");
CREATE INDEX "qfd_matrices_requirementId_idx" ON "qfd_matrices"("requirementId");
CREATE INDEX "qfd_matrices_technicalCharId_idx" ON "qfd_matrices"("technicalCharId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "spec_functions_projectId_idx" ON "spec_functions"("projectId");

-- CreateIndex
CREATE INDEX "technical_characteristics_projectId_idx" ON "technical_characteristics"("projectId");

-- CreateIndex
CREATE INDEX "product_attributes_projectId_idx" ON "product_attributes"("projectId");

-- CreateIndex
CREATE INDEX "attribute_fitnesses_projectId_idx" ON "attribute_fitnesses"("projectId");

-- CreateIndex
CREATE INDEX "attribute_fitnesses_attributeId_idx" ON "attribute_fitnesses"("attributeId");

-- CreateIndex
CREATE INDEX "tech_correlations_projectId_idx" ON "tech_correlations"("projectId");

-- CreateIndex
CREATE INDEX "tech_correlations_techId1_idx" ON "tech_correlations"("techId1");

-- CreateIndex
CREATE INDEX "tech_correlations_techId2_idx" ON "tech_correlations"("techId2");

-- CreateIndex
CREATE INDEX "benchmarks_projectId_idx" ON "benchmarks"("projectId");

-- CreateIndex
CREATE INDEX "benchmarks_requirementId_idx" ON "benchmarks"("requirementId");
