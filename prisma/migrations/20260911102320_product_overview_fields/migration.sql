-- 기존 개요와 보고서를 보존하며 제품 정보를 선택 항목으로 추가한다.
-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "marketDefinition" TEXT,
ADD COLUMN     "productImageDataUrl" TEXT,
ADD COLUMN     "productImageHeightPx" INTEGER,
ADD COLUMN     "productImageWidthPx" INTEGER,
ADD COLUMN     "productName" TEXT,
ADD COLUMN     "targetCustomer" TEXT;
