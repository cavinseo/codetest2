-- 개요에서 수정한 기업명(창업자)을 프로젝트별로 보존한다.
ALTER TABLE "projects" ADD COLUMN "companyName" TEXT;
