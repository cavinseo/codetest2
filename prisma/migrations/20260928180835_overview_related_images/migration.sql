-- 기존 단일 이미지를 보존하면서 개요의 관련이미지 목록을 저장한다.
-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "relatedImages" JSONB;
