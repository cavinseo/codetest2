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
    const sorted = [...specs].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const sortedCores = sorted.filter((spec) => spec.level === 'CORE');

    for (const core of sortedCores) {
        const subs = sorted.filter((spec) => spec.parentId === core.id && spec.level === 'SUB');
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

        for (const sub of subs) {
            const details = sorted.filter((spec) => spec.parentId === sub.id && spec.level === 'DETAIL');
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
