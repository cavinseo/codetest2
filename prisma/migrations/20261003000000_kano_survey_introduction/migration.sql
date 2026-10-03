-- 오프라인 설문 소개문의 빈칸 입력값을 프로젝트별로 보존한다.
ALTER TABLE "projects" ADD COLUMN "kanoSurveyIntroduction" JSONB;
