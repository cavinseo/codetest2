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

// 같은 그룹을 하나의 셀로 묶되 편집 중인 행에는 입력칸이 남도록 병합 범위를 끊는다.
export function getRequirementGroupSpans<T extends RequirementGroupingRowLike & { id: string }>(rows: T[], editingId: string | null) {
    const spans = rows.map(() => ({ primary: 0, secondary: 0 }));
    for (let index = 0; index < rows.length; index++) {
        const row = rows[index];
        if (row.id === editingId) {
            spans[index] = { primary: 1, secondary: 1 };
            continue;
        }
        const previous = rows[index - 1];
        const primary = normalizeGroupValue(row.category);
        const secondary = normalizeGroupValue(row.subcategory);
        const primaryStarts = !previous || previous.id === editingId || normalizeGroupValue(previous.category) !== primary;
        const secondaryStarts = primaryStarts || normalizeGroupValue(previous.subcategory) !== secondary;
        if (primaryStarts) {
            let end = index + 1;
            while (end < rows.length && rows[end].id !== editingId && normalizeGroupValue(rows[end].category) === primary) end++;
            spans[index].primary = end - index;
        }
        if (secondaryStarts) {
            let end = index + 1;
            while (end < rows.length && rows[end].id !== editingId
                && normalizeGroupValue(rows[end].category) === primary
                && normalizeGroupValue(rows[end].subcategory) === secondary) end++;
            spans[index].secondary = end - index;
        }
    }
    return spans;
}
