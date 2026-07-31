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

export type TargetSpecRow = z.infer<typeof targetSpecRowSchema>;
export type SalesRow = z.infer<typeof salesRowSchema>;
export type TechRoadmapRow = z.infer<typeof techRoadmapRowSchema>;
export type DevPlanRow = z.infer<typeof devPlanRowSchema>;
export type TechTreeRow = z.infer<typeof techTreeRowSchema>;
export type AttributeRow = z.infer<typeof attributeRowSchema>;
export type FitnessRow = z.infer<typeof fitnessRowSchema>;
