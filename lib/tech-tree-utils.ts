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
