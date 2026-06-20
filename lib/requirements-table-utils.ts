export interface RequirementGroupingRowLike {
    category: string;
    subcategory: string;
    order: number;
}

export function sortRequirementsByWorksheetOrder<T extends RequirementGroupingRowLike>(rows: T[]): T[] {
    return [...rows].sort((a, b) => a.order - b.order);
}

function normalizeGroupValue(value: string): string {
    return value.trim();
}

export function shouldShowPrimaryGroup(rows: RequirementGroupingRowLike[], index: number): boolean {
    const row = rows[index];
    const previous = rows[index - 1];
    return !previous || normalizeGroupValue(previous.category) !== normalizeGroupValue(row.category);
}

export function shouldShowSecondaryGroup(rows: RequirementGroupingRowLike[], index: number): boolean {
    const row = rows[index];
    const previous = rows[index - 1];
    return !previous
        || normalizeGroupValue(previous.category) !== normalizeGroupValue(row.category)
        || normalizeGroupValue(previous.subcategory) !== normalizeGroupValue(row.subcategory);
}
