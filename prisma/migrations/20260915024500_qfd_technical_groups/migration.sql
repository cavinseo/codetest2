-- WS-9 그룹과 열 순서를 저장하고 사용자가 삭제한 세부기능의 자동 재생성을 막는다.
ALTER TABLE "projects" ADD COLUMN "qfdTechnicalInitialized" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "technical_characteristics" ADD COLUMN "groupIndex" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "columnOrder" INTEGER NOT NULL DEFAULT 0;

-- 기존 표시 순서와 3열 단위 그룹을 보존하며 세부기능 ID와 관계 데이터는 변경하지 않는다.
WITH ranked AS (
    SELECT "id", ROW_NUMBER() OVER (PARTITION BY "projectId" ORDER BY "id") - 1 AS position
    FROM "technical_characteristics"
)
UPDATE "technical_characteristics" AS tech
SET "groupIndex" = (ranked.position / 3)::INTEGER, "columnOrder" = ranked.position::INTEGER
FROM ranked WHERE tech."id" = ranked."id";

UPDATE "projects" AS project SET "qfdTechnicalInitialized" = true
WHERE EXISTS (SELECT 1 FROM "technical_characteristics" AS tech WHERE tech."projectId" = project."id");
