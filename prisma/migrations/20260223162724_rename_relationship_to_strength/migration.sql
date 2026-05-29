/*
  Warnings:

  - You are about to drop the column `relationship` on the `qfd_matrices` table. All the data in the column will be lost.
  - Added the required column `strength` to the `qfd_matrices` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_qfd_matrices" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "technicalCharId" TEXT NOT NULL,
    "strength" TEXT NOT NULL,
    "currentScore" REAL,
    "competitorScore" REAL,
    CONSTRAINT "qfd_matrices_technicalCharId_fkey" FOREIGN KEY ("technicalCharId") REFERENCES "technical_characteristics" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "qfd_matrices_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "customer_requirements" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "qfd_matrices_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_qfd_matrices" ("competitorScore", "currentScore", "id", "projectId", "requirementId", "technicalCharId") SELECT "competitorScore", "currentScore", "id", "projectId", "requirementId", "technicalCharId" FROM "qfd_matrices";
DROP TABLE "qfd_matrices";
ALTER TABLE "new_qfd_matrices" RENAME TO "qfd_matrices";
CREATE UNIQUE INDEX "qfd_matrices_projectId_requirementId_technicalCharId_key" ON "qfd_matrices"("projectId", "requirementId", "technicalCharId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
