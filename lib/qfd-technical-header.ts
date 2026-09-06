export interface QfdSpecFunctionLike {
    id: string;
    level: 'CORE' | 'SUB' | 'DETAIL';
    parentId?: string | null;
    name: string;
    order?: number | null;
}

export function getQfdCoreOptions(specs: QfdSpecFunctionLike[]) {
    return [...specs]
        .filter((spec) => spec.level === 'CORE')
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function getQfdSubOptions(specs: QfdSpecFunctionLike[], coreId?: string) {
    return [...specs]
        .filter((spec) => spec.level === 'SUB' && (!coreId || spec.parentId === coreId))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function findCoreIdForSubName(specs: QfdSpecFunctionLike[], subName?: string | null) {
    if (!subName) return '';
    const matchedSub = specs.find((spec) => spec.level === 'SUB' && spec.name === subName);
    return matchedSub?.parentId ?? '';
}

export function chunkTechnicalIndexes(totalColumns: number, groupSize = 3) {
    return Array.from({ length: Math.ceil(totalColumns / groupSize) }, (_, groupIndex) => {
        const start = groupIndex * groupSize;
        const size = Math.min(groupSize, totalColumns - start);
        return { groupIndex, start, size };
    });
}

// 접힌 그룹 목록에서 하나만 뒤집는다 — 펼칠 때는 키를 지워서 "전체 펼치기"(빈 객체)와
// 표현이 어긋나지 않게 한다.
export function toggleGroupVisibility(
    collapsedGroups: Record<number, boolean>,
    groupIndex: number,
): Record<number, boolean> {
    if (collapsedGroups[groupIndex]) {
        return Object.entries(collapsedGroups).reduce<Record<number, boolean>>((result, [key, value]) => {
            if (Number(key) !== groupIndex) result[Number(key)] = value;
            return result;
        }, {});
    }
    return { ...collapsedGroups, [groupIndex]: true };
}

// 접힘 상태는 프로젝트별로 브라우저에 남긴다 — 다른 화면에 다녀와도 접어 둔 그룹이
// 그대로 있어야 하기 때문이다. 값은 접힌 그룹 인덱스 배열(JSON)로 둔다.
export function qfdCollapsedGroupsStorageKey(projectId: string) {
    return `qfd-collapsed-groups:${projectId}`;
}

export function serializeCollapsedGroups(collapsedGroups: Record<number, boolean>): string {
    const indexes = Object.entries(collapsedGroups)
        .filter(([, collapsed]) => collapsed)
        .map(([key]) => Number(key))
        .sort((a, b) => a - b);
    return JSON.stringify(indexes);
}

// 저장값이 깨졌거나(수동 편집·버전 차이) 형식이 다르면 아무것도 접지 않은 상태로 돌아간다.
export function parseCollapsedGroups(raw: string | null): Record<number, boolean> {
    if (!raw) return {};
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return {};
    }
    if (!Array.isArray(parsed)) return {};
    return parsed.reduce<Record<number, boolean>>((result, value) => {
        if (Number.isInteger(value) && value >= 0) result[value] = true;
        return result;
    }, {});
}
