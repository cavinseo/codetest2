export interface RequirementGroupingRowLike {
    category: string;
    subcategory: string;
    order: number;
}

export function sortRequirementsByWorksheetOrder<T extends RequirementGroupingRowLike>(rows: T[]): T[] {
    return [...rows].sort((a, b) => a.order - b.order);
}

export function shouldShowPrimaryGroup(rows: RequirementGroupingRowLike[], index: number): boolean {
    const row = rows[index];
    const previous = rows[index - 1];
    return !previous || previous.category !== row.category;
}

export function shouldShowSecondaryGroup(rows: RequirementGroupingRowLike[], index: number): boolean {
    const row = rows[index];
    const previous = rows[index - 1];
    return !previous || previous.category !== row.category || previous.subcategory !== row.subcategory;
}
