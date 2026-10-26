import { buildSpecTree } from './spec-tree';

export interface SpecFunctionLike {
    id: string;
    level: 'CORE' | 'SUB' | 'DETAIL';
    parentId?: string | null;
    name: string;
    technology?: string | null;
    order?: number | null;
}

export interface FlatSpecRowLike {
    id: string;
    core: string;
    sub: string;
    detail: string;
    technology: string;
}

export function buildFlatSpecRowsFromFunctions(specs: SpecFunctionLike[]): FlatSpecRowLike[] {
    const newRows: FlatSpecRowLike[] = [];
    for (const { core, subs } of buildSpecTree(specs)) {
        if (subs.length === 0) {
            newRows.push({
                id: Math.random().toString(36).slice(2),
                core: core.name,
                sub: '',
                detail: '',
                technology: core.technology || '',
            });
            continue;
        }

        for (const { sub, details } of subs) {
            if (details.length === 0) {
                newRows.push({
                    id: Math.random().toString(36).slice(2),
                    core: core.name,
                    sub: sub.name,
                    detail: '',
                    technology: sub.technology || '',
                });
                continue;
            }

            for (const detail of details) {
                newRows.push({
                    id: Math.random().toString(36).slice(2),
                    core: core.name,
                    sub: sub.name,
                    detail: detail.name,
                    technology: detail.technology || sub.technology || detail.name,
                });
            }
        }
    }

    return newRows;
}

export type GroupedFlatSpecRow<T extends FlatSpecRowLike> = T & { coreRowSpan: number; subRowSpan: number };

/**
 * 같은 핵심·세부가 이어지는 행을 한 칸으로 합쳐 보이도록 rowSpan 을 붙인다. 이어지는 묶음의 첫 행만
 * 0 보다 큰 값을 갖는다. 핵심이 빈 행은 묶지 않는다.
 *
 * AS-IS 스펙표와 FAST 작성 지원 창이 같은 계산을 각자 들고 있었다(2026-10-25 코드 리뷰 L3).
 */
export function groupSpecRows<T extends FlatSpecRowLike>(rows: T[]): GroupedFlatSpecRow<T>[] {
    return rows.map((row, index) => {
        const core = row.core.trim();
        const sub = row.sub.trim();
        const previous = rows[index - 1];
        const isFirstCore = !core || !previous || previous.core.trim() !== core;
        const isFirstSub = !sub || isFirstCore || previous.sub.trim() !== sub;

        let coreRowSpan = 0;
        if (isFirstCore) {
            coreRowSpan = 1;
            while (index + coreRowSpan < rows.length && core && rows[index + coreRowSpan].core.trim() === core) {
                coreRowSpan++;
            }
        }

        let subRowSpan = 0;
        if (isFirstSub) {
            subRowSpan = 1;
            // 핵심이 빈 행은 세부도 묶지 않는다. 예전 스펙표는 여기서 묶어, 다음 행이 자기 세부 칸을
            // 또 그려 칸이 겹쳤다.
            while (
                index + subRowSpan < rows.length &&
                core &&
                sub &&
                rows[index + subRowSpan].core.trim() === core &&
                rows[index + subRowSpan].sub.trim() === sub
            ) {
                subRowSpan++;
            }
        }

        return { ...row, coreRowSpan, subRowSpan };
    });
}

/**
 * 합쳐 보이는 핵심(또는 세부) 칸을 고치면 그 묶음의 모든 행 값을 함께 바꾼다. 세부 묶음은 같은
 * 핵심 안에서만 이어진다. 원래 칸이 비어 있으면 묶음이 없으므로 그 행만 바꾼다.
 */
export function renameSpecGroup<T extends FlatSpecRowLike>(rows: T[], index: number, field: 'core' | 'sub', value: string): T[] {
    const target = rows[index];
    const sameGroup = (row: T) => row.core.trim() === target.core.trim()
        && (field === 'core' || row.sub.trim() === target.sub.trim());
    if (!target[field].trim()) {
        return rows.map((row, rowIndex) => (rowIndex === index ? { ...row, [field]: value } : row));
    }

    let start = index;
    while (start > 0 && sameGroup(rows[start - 1])) start--;
    let end = index;
    while (end + 1 < rows.length && sameGroup(rows[end + 1])) end++;

    return rows.map((row, rowIndex) => (rowIndex >= start && rowIndex <= end ? { ...row, [field]: value } : row));
}
