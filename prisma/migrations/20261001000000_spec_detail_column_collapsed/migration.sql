-- WS-2 세세부기술 열의 프로젝트별 접기 선택을 저장한다.
ALTER TABLE "projects" ADD COLUMN "specDetailCollapsed" BOOLEAN NOT NULL DEFAULT false;
