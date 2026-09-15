-- 기존·신규 멘토의 프로젝트 대리 개설을 기본 비활성으로 저장한다.
ALTER TABLE "users" ADD COLUMN     "mentorProjectCreationEnabled" BOOLEAN NOT NULL DEFAULT false;
