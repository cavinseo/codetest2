import { z } from 'zod';

/**
 * Shared validation schemas for "bulk replace" save endpoints.
 *
 * These endpoints follow a delete-all-then-recreate pattern. The critical
 * safety property enforced here:
 *
 *   - The collection field MUST be present and an array.
 *     A missing / non-array body (e.g. `{}` or `{ attributes: undefined }`)
 *     is rejected with a validation error, so an accidental/malformed request
 *     can no longer silently wipe a project's data.
 *   - An explicit EMPTY array is allowed. Several tables expose an intentional
 *     "reset" action (e.g. SalesTable.handleReset) that saves `{ rows: [] }`;
 *     rejecting empty arrays outright would break that feature.
 *   - Each row is whitelisted. zod strips unknown keys by default, which blocks
 *     mass-assignment (client-supplied `projectId`, arbitrary columns, etc.).
 */

const optionalText = z.string().trim().optional().nullable();

// ── target-spec ───────────────────────────────────────────────
export const targetSpecRowSchema = z.object({
    category: optionalText,
    subCategory: optionalText,
    specItem: optionalText,
    unit: optionalText,
    currentValue: optionalText,
    competitorValue: optionalText,
    targetValue: optionalText,
    note: optionalText,
    order: z.coerce.number(),
});
export const targetSpecBodySchema = z.object({ rows: z.array(targetSpecRowSchema) });

// ── sales ─────────────────────────────────────────────────────
export const salesRowSchema = z.object({
    period: optionalText,
    customer: optionalText,
    amount: z.coerce.number().default(0),
    futureAmount: z.coerce.number().optional(),
    competitor: optionalText,
    order: z.coerce.number(),
});
export const salesBodySchema = z.object({ rows: z.array(salesRowSchema) });

// ── tech-roadmap ──────────────────────────────────────────────
export const techRoadmapRowSchema = z.object({
    category: optionalText,
    techItem: optionalText,
    currentLevel: optionalText,
    q1: optionalText,
    q2: optionalText,
    q3: optionalText,
    q4: optionalText,
    targetLevel: optionalText,
    owner: optionalText,
    order: z.coerce.number(),
});
export const techRoadmapBodySchema = z.object({ rows: z.array(techRoadmapRowSchema) });

// ── dev-plan ──────────────────────────────────────────────────
export const devPlanRowSchema = z.object({
    phase: optionalText,
    task: optionalText,
    description: optionalText,
    startDate: optionalText,
    endDate: optionalText,
    owner: optionalText,
    status: z.string().trim().optional(),
    order: z.coerce.number(),
});
export const devPlanBodySchema = z.object({ rows: z.array(devPlanRowSchema) });

// ── tech-tree ─────────────────────────────────────────────────
export const techTreeRowSchema = z.object({
    customerVoice: optionalText,
    coreSpec: optionalText,
    subSpec: optionalText,
    techCharacteristic: optionalText,
    order: z.coerce.number(),
});
export const techTreeBodySchema = z.object({ entries: z.array(techTreeRowSchema) });

// ── product attributes ────────────────────────────────────────
// `id` is preserved because attribute fitnesses reference it (attributeId).
export const attributeRowSchema = z.object({
    id: z.string().optional(),
    productName: optionalText,
    customerName: optionalText,
    marketSegment: optionalText,
    customerNeed: optionalText,
    benefit: optionalText,
    attribute: optionalText,
    techCapability: optionalText,
    order: z.coerce.number().default(0),
});
export const attributesBodySchema = z.object({ attributes: z.array(attributeRowSchema) });

// ── attribute fitnesses ───────────────────────────────────────
export const fitnessRowSchema = z.object({
    id: z.string().optional(),
    attributeId: z.string(),
    importance: z.coerce.number().default(0),
    currentLevel: z.coerce.number().default(0),
    targetLevel: z.coerce.number().default(0),
    note: optionalText,
});
export const fitnessBodySchema = z.object({ fitnesses: z.array(fitnessRowSchema) });

// ── improvements ──────────────────────────────────────────────
// type 은 화면이 need/feature 두 갈래로만 렌더링하므로 화이트리스트로 고정한다.
export const improvementRowSchema = z.object({
    type: z.enum(['need', 'feature']),
    content: optionalText,
    improvementRate: optionalText,
    devProportion: optionalText,
    priority: optionalText,
    order: z.coerce.number().default(0),
});
export const improvementsBodySchema = z.object({ items: z.array(improvementRowSchema) });

// ── assets ────────────────────────────────────────────────────
export const assetRowSchema = z.object({
    type: z.enum(['CORE', 'COMPLEMENTARY']),
    category: optionalText,
    content: optionalText,
    order: z.coerce.number().default(0),
});
export const assetsBodySchema = z.object({ assets: z.array(assetRowSchema) });

// ── funding ───────────────────────────────────────────────────
// plans/sources 는 각각 독립적으로 저장할 수 있어야 해서 둘 다 optional 이다.
// 다만 "키가 없으면 그 컬렉션은 건드리지 않는다"는 규칙을 라우트가 지켜야 한다.
export const fundingPlanRowSchema = z.object({
    category: optionalText,
    item: optionalText,
    year1: z.coerce.number().default(0),
    year2: z.coerce.number().default(0),
    year3: z.coerce.number().default(0),
    order: z.coerce.number().default(0),
});
export const fundingSourceRowSchema = z.object({
    category: optionalText,
    year1: optionalText,
    year2: optionalText,
    year3: optionalText,
    order: z.coerce.number().default(0),
});
export const fundingBodySchema = z.object({
    plans: z.array(fundingPlanRowSchema).optional(),
    sources: z.array(fundingSourceRowSchema).optional(),
});

// ── spec functions (WS-2) ─────────────────────────────────────
// level 은 화면이 CORE/SUB/DETAIL 세 갈래로만 렌더링하므로 화이트리스트로 고정한다.
//
// id 와 parentId 는 저장하지 않는다. SpecTable.serializeSpecs 가 매 저장마다 새로
// 만드는 임시 id(core_0, sub_1)이고, 라우트는 그것을 실제 cuid 로 재매핑하는 데만
// 쓴다. SpecFunction 에는 이 id 를 참조하는 FK 가 없어 보존할 이유도 없다.
//
// name 에 min(1) 을 걸어도 안전하다. serializeSpecs 는 빈 이름을 만들지 않는다 —
// core 가 빈 행은 건너뛰고, 빈 sub·detail 은 아예 push 하지 않는다.
export const specFunctionRowSchema = z.object({
    id: z.string().optional(),
    level: z.enum(['CORE', 'SUB', 'DETAIL']),
    name: z.string().trim().min(1).max(200),
    parentId: z.string().optional(),
    technology: optionalText,
    order: z.coerce.number(),
});
// 상한이 없으면 잘못된 요청 하나가 트랜잭션 안에서 create 를 무한정 돌린다.
export const specBodySchema = z.object({
    specFunctions: z.array(specFunctionRowSchema).max(2000),
});

export type TargetSpecRow = z.infer<typeof targetSpecRowSchema>;
export type SalesRow = z.infer<typeof salesRowSchema>;
export type TechRoadmapRow = z.infer<typeof techRoadmapRowSchema>;
export type DevPlanRow = z.infer<typeof devPlanRowSchema>;
export type TechTreeRow = z.infer<typeof techTreeRowSchema>;
export type AttributeRow = z.infer<typeof attributeRowSchema>;
export type FitnessRow = z.infer<typeof fitnessRowSchema>;
export type ImprovementRow = z.infer<typeof improvementRowSchema>;
export type AssetRow = z.infer<typeof assetRowSchema>;
export type FundingPlanRow = z.infer<typeof fundingPlanRowSchema>;
export type FundingSourceRow = z.infer<typeof fundingSourceRowSchema>;
export type SpecFunctionRow = z.infer<typeof specFunctionRowSchema>;
