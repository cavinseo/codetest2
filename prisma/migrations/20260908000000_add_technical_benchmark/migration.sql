-- WS-9 표 아래 「자사」·경쟁사 줄에 적는 기술특성별 실측값.
--
-- 기존 benchmarks 테이블과 축이 달라 재사용할 수 없다 — 그쪽은
-- (요구사항 × 회사)의 5점 만족도이고, 이쪽은 (기술특성 × 회사)의 스펙값이다.
-- 단위가 열마다 다르므로(ms·%·건) 숫자가 아니라 문자열로 둔다.
--
-- 프로젝트나 기술특성이 사라지면 이 값도 남을 이유가 없어 둘 다 CASCADE 로 건다.

CREATE TABLE "technical_benchmarks" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "technicalCharId" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "technical_benchmarks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "technical_benchmarks_projectId_technicalCharId_company_key"
    ON "technical_benchmarks"("projectId", "technicalCharId", "company");

CREATE INDEX "technical_benchmarks_projectId_idx" ON "technical_benchmarks"("projectId");

ALTER TABLE "technical_benchmarks" ADD CONSTRAINT "technical_benchmarks_technicalCharId_fkey"
    FOREIGN KEY ("technicalCharId") REFERENCES "technical_characteristics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "technical_benchmarks" ADD CONSTRAINT "technical_benchmarks_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
