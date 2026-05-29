export interface AttributeSpecFunctionLike {
    id: string;
    level: 'CORE' | 'SUB' | 'DETAIL';
    parentId?: string | null;
    name: string;
    technology?: string | null;
    order?: number | null;
}

export interface SpecPickerRow {
    rowNo: number;
    core: string;
    sub: string;
    detail: string;
    technology: string;
    pickValue: string;
    pickTech: string;
}

export interface AttributeGroupingRowLike {
    marketSegment: string;
    customerName: string;
}

function uniqueJoined(values: string[]) {
    return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).join(', ');
}

function detailTechnology(detail: AttributeSpecFunctionLike, fallbackTechnology = '') {
    return detail.technology?.trim() || fallbackTechnology.trim() || detail.name;
}

export function buildSpecPickerRows(
    specs: AttributeSpecFunctionLike[],
    field: 'attribute' | 'techCapability'
): SpecPickerRow[] {
    const sorted = [...specs].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const cores = sorted.filter((spec) => spec.level === 'CORE');
    const rows: SpecPickerRow[] = [];
    let rowNo = 0;

    for (const core of cores) {
        const subs = sorted.filter((spec) => spec.level === 'SUB' && spec.parentId === core.id);
        if (subs.length === 0) {
            const technology = core.technology?.trim() || '';
            rows.push({
                rowNo: ++rowNo,
                core: core.name,
                sub: '',
                detail: '',
                technology,
                pickValue: field === 'attribute' ? core.name : technology || core.name,
                pickTech: technology,
            });
            continue;
        }

        for (const sub of subs) {
            const details = sorted.filter((spec) => spec.level === 'DETAIL' && spec.parentId === sub.id);
            if (details.length === 0) {
                const technology = sub.technology?.trim() || '';
                rows.push({
                    rowNo: ++rowNo,
                    core: core.name,
                    sub: sub.name,
                    detail: '',
                    technology,
                    pickValue: field === 'attribute' ? sub.name : technology || sub.name,
                    pickTech: technology,
                });
                continue;
            }

            for (const detail of details) {
                const technology = detailTechnology(detail, sub.technology || '');
                rows.push({
                    rowNo: ++rowNo,
                    core: core.name,
                    sub: sub.name,
                    detail: detail.name,
                    technology,
                    pickValue: field === 'attribute' ? detail.name : technology,
                    pickTech: technology,
                });
            }
        }
    }

    return rows;
}

export function resolveRelatedTechnology(
    specs: AttributeSpecFunctionLike[],
    specName: string,
    pickedTechnology = ''
): string {
    if (pickedTechnology.trim()) return pickedTechnology.trim();

    const matched = specs.find((spec) => spec.name === specName);
    if (!matched) return '';
    if (matched.technology?.trim()) return matched.technology.trim();
    if (matched.level === 'DETAIL') return matched.name;

    if (matched.level === 'SUB') {
        const childTechnologies = specs
            .filter((spec) => spec.level === 'DETAIL' && spec.parentId === matched.id)
            .map((detail) => detailTechnology(detail, matched.technology || ''));
        return uniqueJoined(childTechnologies);
    }

    if (matched.level === 'CORE') {
        const subIds = specs
            .filter((spec) => spec.level === 'SUB' && spec.parentId === matched.id)
            .map((spec) => spec.id);
        const childTechnologies = specs
            .filter((spec) => spec.level === 'DETAIL' && subIds.includes(spec.parentId ?? ''))
            .map((detail) => detailTechnology(detail));
        return uniqueJoined(childTechnologies);
    }

    return '';
}

export function getMarketSegmentSpan(rows: AttributeGroupingRowLike[], index: number): number {
    const segment = rows[index]?.marketSegment.trim();
    if (!segment) return 1;
    if (index > 0 && rows[index - 1].marketSegment.trim() === segment) return 0;

    let count = 1;
    for (let i = index + 1; i < rows.length; i++) {
        if (rows[i].marketSegment.trim() !== segment) break;
        count++;
    }
    return count;
}

export function getCustomerNameSpan(rows: AttributeGroupingRowLike[], index: number): number {
    const segment = rows[index]?.marketSegment.trim();
    const customerName = rows[index]?.customerName.trim();
    if (!customerName) return 1;
    if (
        index > 0 &&
        rows[index - 1].marketSegment.trim() === segment &&
        rows[index - 1].customerName.trim() === customerName
    ) {
        return 0;
    }

    let count = 1;
    for (let i = index + 1; i < rows.length; i++) {
        if (rows[i].marketSegment.trim() !== segment || rows[i].customerName.trim() !== customerName) break;
        count++;
    }
    return count;
}
