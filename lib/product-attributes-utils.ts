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

export interface AttributeSegmentValueRowLike {
    marketSegment: string;
    customerNeed: string;
    benefit: string;
}

export interface AttributeNameRowLike {
    attribute?: string | null;
    name?: string | null;
}

export interface AttributeMarketCustomerRowLike {
    marketSegment?: string | null;
    customerName?: string | null;
}

function uniqueJoined(values: string[]) {
    return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).join(', ');
}

function normalizeAttributeName(value: string) {
    return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function dedupeByAttributeName<T extends AttributeNameRowLike>(rows: T[]): T[] {
    const seen = new Set<string>();
    const deduped: T[] = [];

    for (const row of rows) {
        const rawName = row.attribute ?? row.name ?? '';
        const normalizedName = normalizeAttributeName(rawName);
        if (!normalizedName || seen.has(normalizedName)) continue;
        seen.add(normalizedName);
        deduped.push(row);
    }

    return deduped;
}

export function buildCustomerNamesByMarketSegment(rows: AttributeMarketCustomerRowLike[]): Record<string, string[]> {
    const grouped: Record<string, string[]> = {};
    const seenBySegment: Record<string, Set<string>> = {};

    for (const row of rows) {
        const marketSegment = row.marketSegment?.trim();
        const customerName = row.customerName?.trim();
        if (!marketSegment || !customerName) continue;

        grouped[marketSegment] ??= [];
        seenBySegment[marketSegment] ??= new Set<string>();
        if (seenBySegment[marketSegment].has(customerName)) continue;

        seenBySegment[marketSegment].add(customerName);
        grouped[marketSegment].push(customerName);
    }

    return grouped;
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

// 같은 세분시장 안에서 값이 연속으로 같으면 첫 행만 남기고 병합한다.
// 고객명이 달라도 값이 같으면 하나로 표기한다.
function getSegmentScopedSpan(
    rows: AttributeSegmentValueRowLike[],
    index: number,
    field: 'customerNeed' | 'benefit'
): number {
    const current = rows[index];
    if (!current) return 1;

    const segment = current.marketSegment.trim();
    const value = current[field].trim();
    if (!value) return 1;

    const previous = rows[index - 1];
    if (index > 0 && previous.marketSegment.trim() === segment && previous[field].trim() === value) {
        return 0;
    }

    let count = 1;
    for (let i = index + 1; i < rows.length; i++) {
        if (rows[i].marketSegment.trim() !== segment || rows[i][field].trim() !== value) break;
        count++;
    }
    return count;
}

export function getCustomerNeedSpan(rows: AttributeSegmentValueRowLike[], index: number): number {
    return getSegmentScopedSpan(rows, index, 'customerNeed');
}

export function getBenefitSpan(rows: AttributeSegmentValueRowLike[], index: number): number {
    return getSegmentScopedSpan(rows, index, 'benefit');
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
