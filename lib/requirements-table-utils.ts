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

// 처음 등장한 1차·2차 그룹 순서로 항목을 모으고 저장할 행 순서를 다시 매긴다.
export function groupRequirementsByCategory<T extends RequirementGroupingRowLike>(rows: T[]): T[] {
    const primaryGroups = new Map<string, Map<string, T[]>>();
    for (const row of sortRequirementsByWorksheetOrder(rows)) {
        const primary = normalizeGroupValue(row.category);
        const secondary = normalizeGroupValue(row.subcategory);
        let secondaryGroups = primaryGroups.get(primary);
        if (!secondaryGroups) {
            secondaryGroups = new Map<string, T[]>();
            primaryGroups.set(primary, secondaryGroups);
        }
        const group = secondaryGroups.get(secondary);
        if (group) group.push(row);
        else secondaryGroups.set(secondary, [row]);
    }
    return [...primaryGroups.values()]
        .flatMap(secondaryGroups => [...secondaryGroups.values()].flat())
        .map((row, order) => ({ ...row, order }));
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
