// WS-10 기능기술체계도 행 생성과 AS-IS 스펙 선택 후보를 만든다.
export interface TechTreeSpecFunctionLike {
    id: string;
    level: 'CORE' | 'SUB' | 'DETAIL';
    parentId?: string | null;
    name: string;
    technology?: string | null;
    order?: number | null;
}

export interface TechTreeSourceRequirementLike {
    id: string;
    requirement: string;
}

export interface TechTreeGeneratedRow {
    id: string;
    customerVoice: string;
    coreSpec: string;
    subSpec: string;
    techCharacteristic: string;
    order: number;
}

export interface TechTreeSpecOption {
    sourceName?: string;
    id: string;
    coreId: string;
    parentId: string;
    depth: 0 | 1;
    coreSpec: string;
    subSpec: string;
    techCharacteristic: string;
}

export function buildTechTreeSpecOptions(sourceSpecs: TechTreeSpecFunctionLike[]): TechTreeSpecOption[] {
    const sorted = [...sourceSpecs].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const options: TechTreeSpecOption[] = [];
    const cores = sorted.filter((spec) => spec.level === 'CORE');

    for (const core of cores) {
        const subs = sorted.filter((spec) => spec.level === 'SUB' && spec.parentId === core.id);
        for (const sub of subs) {
            options.push({ id: sub.id, coreId: core.id, parentId: core.id, depth: 0, coreSpec: core.name, subSpec: sub.name, techCharacteristic: sub.technology || '' });
            for (const detail of sorted.filter((spec) => spec.level === 'DETAIL' && spec.parentId === sub.id)) {
                options.push({ id: detail.id, coreId: core.id, parentId: sub.id, depth: 1, coreSpec: core.name, subSpec: detail.name, techCharacteristic: detail.technology || '' });
            }
        }
    }

    const namedOptions = options.map((option) => {
        const duplicates = options.filter((other) => other.coreId === option.coreId && other.subSpec === option.subSpec);
        if (duplicates.length === 1) return option;
        const parent = sorted.find((spec) => spec.id === option.parentId);
        return { ...option, sourceName: option.subSpec, subSpec: option.depth === 1 ? parent?.name + ' > ' + option.subSpec : option.subSpec };
    });
    return namedOptions.map((option) => {
        const duplicates = namedOptions.filter((other) => other.coreId === option.coreId && other.subSpec === option.subSpec);
        if (duplicates.length === 1) return option;
        return { ...option, subSpec: option.subSpec + ' [' + (duplicates.findIndex((other) => other.id === option.id) + 1) + ']' };
    });
}

export function findTechTreeSpecOptions(options: TechTreeSpecOption[], coreSpec: string, value: string): TechTreeSpecOption[] {
    return options.filter((option) => option.coreSpec === coreSpec && (option.subSpec === value || option.sourceName === value));
}

/**
 * 한 행의 핵심스펙에 딸린 후보만 남긴다. 세부스펙은 반드시 어느 핵심스펙의 하위이므로
 * 다른 계통의 세부기능이 목록에 섞이면 계통이 어긋난 조합이 만들어진다. 핵심스펙이 비어
 * 있으면 좁힐 기준 자체가 없어 전부 보여준다 — WS-2 표의 세부기술 목록과 같은 규칙이다.
 */
export function filterTechTreeSpecOptionsByCore<T extends Pick<TechTreeSpecOption, 'coreSpec'>>(
    options: T[],
    coreSpec: string
): T[] {
    const target = coreSpec.trim();
    if (!target) return options;
    return options.filter((option) => option.coreSpec.trim() === target);
}

/**
 * 고른 세부스펙에 WS-2 가 적어 둔 기술적 특성을 돌려준다. 이름이 같은 세부스펙이 다른
 * 핵심스펙에도 있을 수 있어 그 행의 핵심스펙 범위 안에서 찾는다. 못 찾거나 적용기술이
 * 비어 있으면 빈 문자열이며, 호출부는 이때 기존 값을 덮어쓰지 않는다.
 */
export function findTechTreeTechCharacteristic(
    options: Pick<TechTreeSpecOption, 'coreSpec' | 'subSpec' | 'techCharacteristic'>[],
    coreSpec: string,
    subSpec: string
): string {
    const target = subSpec.trim();
    // 세부스펙을 지우는 중이면 불러올 기준이 없다. 이름이 빈 WS-2 항목과 우연히 맞아
    // 기술적 특성이 채워지는 일을 막는다.
    if (!target) return '';

    const matched = filterTechTreeSpecOptionsByCore(options, coreSpec)
        .find((option) => option.subSpec.trim() === target);
    return matched?.techCharacteristic.trim() ?? '';
}

export function buildBlankTechTreeRows(
    sourceRequirements: TechTreeSourceRequirementLike[],
    sourceSpecs: TechTreeSpecFunctionLike[],
    timestamp = Date.now()
): TechTreeGeneratedRow[] {
    const requirements = sourceRequirements.filter((req) => req.requirement.trim());
    if (requirements.length > 0) {
        return requirements.map((req, index) => ({
            id: `tt_${timestamp}_${req.id}_${index}`,
            customerVoice: req.requirement,
            coreSpec: '',
            subSpec: '',
            techCharacteristic: '',
            order: index,
        }));
    }

    const rowCount = Math.max(1, buildTechTreeSpecOptions(sourceSpecs).length);
    return Array.from({ length: rowCount }, (_, index) => ({
        id: `tt_${timestamp}_blank_${index}`,
        customerVoice: '',
        coreSpec: '',
        subSpec: '',
        techCharacteristic: '',
        order: index,
    }));
}

export function applyTechTreeSpecSelection<T extends TechTreeGeneratedRow>(rows: T[], rowIds: string[], option: TechTreeSpecOption): T[] {
    const ids = new Set(rowIds);
    return rows.map((row) => ids.has(row.id) ? {
        ...row,
        coreSpec: option.coreSpec,
        subSpec: option.subSpec,
        techCharacteristic: option.techCharacteristic,
    } : row);
}
