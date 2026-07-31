/**
 * Import (JSON) replace-plan helper.
 *
 * The import-json endpoint replaces a project's collections with the contents
 * of an exported file. The dangerous prior behavior: it UNCONDITIONALLY deleted
 * every collection before inserting, so a partial payload (e.g. only
 * `specFunctions`) wiped unrelated data (customer requirements, kano responses,
 * benchmarks, ...).
 *
 * This helper makes the delete step conditional: a collection is cleared only
 * when its array is actually present in the payload. Collections absent from
 * the payload are left untouched.
 */

// payload key -> prisma model delegate to clear (in FK-safe delete order)
export const IMPORT_COLLECTION_MODELS: ReadonlyArray<readonly [string, string]> = [
    ['customerRequirements', 'customerRequirement'],
    ['technicalCharacteristics', 'technicalCharacteristic'],
    ['specFunctions', 'specFunction'],
    ['productAttributes', 'productAttribute'],
    ['attributeFitnesses', 'attributeFitness'],
    ['qfdRelationships', 'qFDMatrix'],
    ['kanoResponses', 'kanoResponse'],
];

/**
 * Returns the list of prisma model delegate names whose rows should be deleted,
 * based on which collection arrays are present in the import payload.
 */
export function importDeletionPlan(data: Record<string, unknown>): string[] {
    return IMPORT_COLLECTION_MODELS
        .filter(([key]) => Array.isArray(data[key]))
        .map(([, model]) => model);
}

/** True when the payload carries at least one non-empty collection to import. */
export function importHasAnyData(data: Record<string, unknown>): boolean {
    return IMPORT_COLLECTION_MODELS.some(([key]) => {
        const value = data[key];
        return Array.isArray(value) && value.length > 0;
    });
}
