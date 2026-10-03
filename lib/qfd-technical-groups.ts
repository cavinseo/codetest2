// 저장된 WS-9 그룹을 구성하고 세부기능에 연결된 핵심기능명을 중복 없이 모은다.
import { dedupeNonBlank, normalizeTechnicalName } from './qfd-technical-sync';

interface GroupedTechnical { id: string; name: string; groupIndex?: number; columnOrder?: number; }
export interface CoreFunctionLink { subSpec?: string | null; coreSpec?: string | null; }

function coreSpecFunctions(entries: CoreFunctionLink[]) {
    const functions = new Map<string, string>();
    for (const entry of entries) {
        const name = normalizeTechnicalName(entry.subSpec);
        const core = normalizeTechnicalName(entry.coreSpec);
        if (name && (!functions.has(name) || !functions.get(name))) functions.set(name, core);
    }
    return functions;
}

/** WS-10 저장 순서로 핵심스펙 그룹을 정하되 연결되지 않은 기존 기능도 보존한다. */
export function assignTechnicalCoreGroups<T extends GroupedTechnical>(technicals: T[], entries: CoreFunctionLink[]): T[] {
    const functions = coreSpecFunctions(entries);
    const coreIndexes = new Map(dedupeNonBlank([...functions.values()]).map((core, index) => [core, index]));
    if (!coreIndexes.size || !technicals.some(tech => functions.get(normalizeTechnicalName(tech.name)))) return technicals;
    const functionOrder = new Map([...functions.keys()].map((name, index) => [name, index]));
    const unlinkedGroups = [...new Set(technicals.filter(tech => !functions.get(normalizeTechnicalName(tech.name)))
        .map(tech => tech.groupIndex ?? 0))].sort((a, b) => a - b);
    return technicals.map(tech => {
        const name = normalizeTechnicalName(tech.name);
        const core = functions.get(name);
        return {
            ...tech,
            groupIndex: core ? coreIndexes.get(core)! : coreIndexes.size + unlinkedGroups.indexOf(tech.groupIndex ?? 0),
            columnOrder: core ? functionOrder.get(name)! : tech.columnOrder ?? 0,
        };
    });
}

export function buildTechnicalGroups<T extends GroupedTechnical>(technicals: T[], entries: CoreFunctionLink[]) {
    const functions = coreSpecFunctions(entries);
    const grouped = new Map<number, T[]>();
    technicals.forEach((tech, index) => {
        if (!tech.name.trim()) return;
        const groupIndex = tech.groupIndex ?? Math.floor(index / 3);
        grouped.set(groupIndex, [...(grouped.get(groupIndex) ?? []), tech]);
    });
    return [...grouped].sort(([a], [b]) => a - b).map(([groupIndex, columns]) => {
        const technicals = [...columns].sort((a, b) => (a.columnOrder ?? 0) - (b.columnOrder ?? 0) || a.id.localeCompare(b.id));
        const names = new Set(technicals.map(tech => normalizeTechnicalName(tech.name)));
        return { groupIndex, technicals, coreNames: dedupeNonBlank([...names].map(name => functions.get(name))) };
    });
}
