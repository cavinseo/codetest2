export interface RequirementGroupingRowLike {
    // 엑셀 업로드로 들어온 행은 2차 분류가 비어 있으면 null 로 저장되므로 빈 값도 받아야 한다.
    category: string | null | undefined;
    subcategory: string | null | undefined;
    order: number;
}

export function sortRequirementsByWorksheetOrder<T extends RequirementGroupingRowLike>(rows: T[]): T[] {
    return [...rows].sort((a, b) => a.order - b.order);
}

function normalizeGroupValue(value: string | null | undefined): string {
    return value?.trim() ?? '';
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
