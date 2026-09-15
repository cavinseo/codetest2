// 저장된 WS-9 그룹을 구성하고 세부기능에 연결된 핵심기능명을 중복 없이 모은다.
import { dedupeNonBlank } from './qfd-technical-sync';

interface GroupedTechnical { id: string; name: string; groupIndex?: number; columnOrder?: number; }
interface CoreFunctionLink { subSpec?: string | null; coreSpec?: string | null; }

export function buildTechnicalGroups<T extends GroupedTechnical>(technicals: T[], entries: CoreFunctionLink[]) {
    const grouped = new Map<number, T[]>();
    technicals.forEach((tech, index) => {
        if (!tech.name.trim()) return;
        const groupIndex = tech.groupIndex ?? Math.floor(index / 3);
        grouped.set(groupIndex, [...(grouped.get(groupIndex) ?? []), tech]);
    });
    return [...grouped].sort(([a], [b]) => a - b).map(([groupIndex, columns]) => {
        const technicals = [...columns].sort((a, b) => (a.columnOrder ?? 0) - (b.columnOrder ?? 0) || a.id.localeCompare(b.id));
        const names = new Set(technicals.map(tech => tech.name.trim()));
        return { groupIndex, technicals, coreNames: dedupeNonBlank(entries.filter(entry => names.has(entry.subSpec?.trim() ?? '')).map(entry => entry.coreSpec)) };
    });
}
