-- AlterTable
ALTER TABLE "customer_requirements" ADD COLUMN "kanoNegativeQ" TEXT;
ALTER TABLE "customer_requirements" ADD COLUMN "kanoPositiveQ" TEXT;

-- CreateTable
CREATE TABLE "asset_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT,
    "content" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "asset_items_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "funding_plans" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "category" TEXT,
    "item" TEXT,
    "year1" REAL NOT NULL DEFAULT 0,
    "year2" REAL NOT NULL DEFAULT 0,
    "year3" REAL NOT NULL DEFAULT 0,
    "order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "funding_plans_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "funding_sources" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "category" TEXT,
    "year1" TEXT,
    "year2" TEXT,
    "year3" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "funding_sources_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "asset_items_projectId_idx" ON "asset_items"("projectId");

-- CreateIndex
CREATE INDEX "funding_plans_projectId_idx" ON "funding_plans"("projectId");

-- CreateIndex
CREATE INDEX "funding_sources_projectId_idx" ON "funding_sources"("projectId");
