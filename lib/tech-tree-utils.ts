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
        if (subs.length === 0) {
            options.push({ coreSpec: core.name, subSpec: core.name, techCharacteristic: core.technology || '' });
            continue;
        }

        for (const sub of subs) {
            const details = sorted.filter((spec) => spec.level === 'DETAIL' && spec.parentId === sub.id);
            if (details.length === 0) {
                options.push({ coreSpec: core.name, subSpec: sub.name, techCharacteristic: sub.technology || core.technology || '' });
                continue;
            }

            for (const detail of details) {
                options.push({
                    coreSpec: core.name,
                    subSpec: detail.name,
                    techCharacteristic: detail.technology || sub.technology || core.technology || '',
                });
            }
        }
    }

    return options;
}

/**
 * 한 행의 핵심스펙에 딸린 후보만 남긴다. 세부스펙은 반드시 어느 핵심스펙의 하위이므로
 * 다른 계통의 세부기능이 목록에 섞이면 계통이 어긋난 조합이 만들어진다. 핵심스펙이 비어
 * 있으면 좁힐 기준 자체가 없어 전부 보여준다 — WS-2 표의 세부기술 목록과 같은 규칙이다.
 */
export function filterTechTreeSpecOptionsByCore(
    options: TechTreeSpecOption[],
    coreSpec: string
): TechTreeSpecOption[] {
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
    options: TechTreeSpecOption[],
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
