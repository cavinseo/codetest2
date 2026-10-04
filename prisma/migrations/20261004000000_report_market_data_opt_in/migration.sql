-- 추가 시장 자료의 결과보고서 반영 선택 상태를 프로젝트에 저장한다.
ALTER TABLE "Project"
ADD COLUMN "includeAdditionalMarketDataInReport" BOOLEAN NOT NULL DEFAULT false;
