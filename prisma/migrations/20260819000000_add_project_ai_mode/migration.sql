-- 프로젝트별 AI 에이전트 연결 방식.
-- "rule"(규칙 기반만) | "local"(로컬 LLM 우선, 실패 시 브라우저 경유 → 규칙 기반 폴백)
-- 기본값이 있는 컬럼 추가라 기존 행은 그대로 규칙 기반으로 동작한다.
ALTER TABLE "projects" ADD COLUMN "aiMode" TEXT NOT NULL DEFAULT 'rule';
