-- 기존 매출의 2·3차년도 금액을 한 번 비우고 직접 입력할 수 있게 한다.
ALTER TABLE "funding_plans" ALTER COLUMN "year2" DROP NOT NULL;
ALTER TABLE "funding_plans" ALTER COLUMN "year3" DROP NOT NULL;
UPDATE "funding_plans" SET "year2" = NULL, "year3" = NULL
WHERE "category" = '매출액' OR "item" = '매출액';
