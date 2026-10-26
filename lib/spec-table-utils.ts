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
