import { buildSpecTree } from './spec-tree';

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

export interface AttributeSegmentRowLike extends AttributeMarketCustomerRowLike {
    customerNeed?: string | null;
    benefit?: string | null;
    attribute?: string | null;
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

// 스키마를 바꾸지 않으려고 한 세분시장의 고객명 여러 개를 기존 customerName 칸 하나에 담는다.
// 엑셀 칸에서 사람이 그대로 읽고 고칠 수 있도록 쉼표 구분을 쓰고, 칸 안 줄바꿈도 구분자로 받아 준다.
// 앞뒤가 모두 숫자인 쉼표는 자릿수 표기(12,000)이므로 나누지 않는다. 나누면 저장할 때 "12, 000" 으로 값이 바뀐다.
const CUSTOMER_NAME_SEPARATOR = /(?<!\d)[,，]|[,，](?!\d)|[\r\n]/;

export function splitCustomerNames(value: string | null | undefined): string[] {
    const names = (value ?? '').split(CUSTOMER_NAME_SEPARATOR).map(name => name.trim()).filter(Boolean);
    return Array.from(new Set(names));
}

export function joinCustomerNames(names: Array<string | null | undefined>): string {
    return Array.from(new Set(names.flatMap(splitCustomerNames))).join(', ');
}

export function buildCustomerNamesByMarketSegment(rows: AttributeMarketCustomerRowLike[]): Record<string, string[]> {
    const grouped: Record<string, string[]> = {};

    for (const row of rows) {
        const marketSegment = row.marketSegment?.trim();
        const customerNames = splitCustomerNames(row.customerName);
        if (!marketSegment || customerNames.length === 0) continue;

        grouped[marketSegment] = Array.from(new Set([...(grouped[marketSegment] ?? []), ...customerNames]));
    }

    return grouped;
}

// 고객명은 세분시장의 속성이므로 같은 세분시장의 모든 행이 같은 고객명 목록을 갖게 한다.
// 세분시장이 비어 있는 행은 어느 시장에도 묶을 수 없어 자기 고객명만 유지한다.
export function mergeSegmentCustomerNames<T extends AttributeMarketCustomerRowLike>(rows: T[]): T[] {
    const namesBySegment = buildCustomerNamesByMarketSegment(rows);
    return rows.map(row => {
        const marketSegment = row.marketSegment?.trim();
        const names = marketSegment ? namesBySegment[marketSegment] ?? [] : splitCustomerNames(row.customerName);
        return { ...row, customerName: names.join(', ') };
    });
}

// 예전에는 고객명마다 행을 따로 두어 니즈·혜택·속성이 똑같은 행이 반복됐다. 고객명을 세분시장으로
// 옮기면 이 행들은 완전히 같아지므로 첫 행만 남긴다. 적합도 행렬은 속성명이 같은 행 중 첫 행의 id 를
// 쓰기 때문에(dedupeByAttributeName) 첫 행을 남겨야 저장된 평가가 끊기지 않는다.
export function collapseCustomerRowsToSegments<T extends AttributeSegmentRowLike>(rows: T[]): T[] {
    const seen = new Set<string>();
    return mergeSegmentCustomerNames(rows).filter(row => {
        const marketSegment = row.marketSegment?.trim();
        if (!marketSegment) return true;
        const key = JSON.stringify([marketSegment, row.customerNeed?.trim() ?? '', row.benefit?.trim() ?? '', row.attribute?.trim() ?? '']);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function detailTechnology(detail: AttributeSpecFunctionLike, fallbackTechnology = '') {
    return detail.technology?.trim() || fallbackTechnology.trim() || detail.name;
}

export function buildSpecPickerRows(
    specs: AttributeSpecFunctionLike[],
    field: 'attribute' | 'techCapability'
): SpecPickerRow[] {
    const rows: SpecPickerRow[] = [];
    let rowNo = 0;

    for (const { core, subs } of buildSpecTree(specs)) {
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

        for (const { sub, details } of subs) {
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

export function getAppliedTechnologiesForAttributes(
    specs: AttributeSpecFunctionLike[],
    attributes: string[]
): string[] {
    const technologies = new Set<string>();
    const sortedSpecs = [...specs].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    for (const attribute of attributes) {
        const selectedSpecs = sortedSpecs.filter(spec => spec.name.trim() === attribute.trim());
        for (const selected of selectedSpecs) {
            const relevantSpecs = selected.technology?.trim()
                ? [selected]
                : sortedSpecs.filter(spec => {
                    // 자기 자신이나 서로를 부모로 가리키는 스펙(가져오기·수동 편집으로 생길 수 있다)이
                    // 있으면 부모를 따라 오르는 반복이 끝나지 않아 화면이 멈췄다(2026-10-25 코드 리뷰
                    // B27). 이미 지나온 스펙을 다시 만나면 거기서 멈춘다.
                    const visited = new Set<string>();
                    let parentId = spec.parentId;
                    while (parentId && !visited.has(parentId)) {
                        if (parentId === selected.id) return true;
                        visited.add(parentId);
                        parentId = sortedSpecs.find(parent => parent.id === parentId)?.parentId;
                    }
                    return false;
                });
            for (const spec of relevantSpecs) {
                const technology = spec.technology?.trim();
                if (technology) technologies.add(technology);
            }
        }
    }

    return [...technologies];
}

export function getAdditionalTechnologies(saved: string, automatic: string[]): string {
    const automaticSet = new Set(automatic);
    return saved.split(/\r?\n/).filter(line => !automaticSet.has(line.trim())).join('\n').trim();
}

export function combineTechnologies(automatic: string[], additional: string): string {
    const additionalLines = getAdditionalTechnologies(additional, automatic);
    return [automatic.join('\n'), additionalLines].filter(Boolean).join('\n');
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

// 같은 세분시장 안에서 연속된 값을 병합하되, 제공혜택은 같은 고객니즈 안에서만 묶는다.
function getSegmentScopedSpan(
    rows: AttributeSegmentValueRowLike[],
    index: number,
    field: 'customerNeed' | 'benefit'
): number {
    const current = rows[index];
    if (!current) return 1;

    const segment = current.marketSegment.trim();
    const value = current[field].trim();
    const customerNeed = current.customerNeed.trim();
    if (!value || (field === 'benefit' && !customerNeed)) return 1;

    const matchesGroup = (row: AttributeSegmentValueRowLike) =>
        row.marketSegment.trim() === segment &&
        row[field].trim() === value &&
        (field !== 'benefit' || row.customerNeed.trim() === customerNeed);

    const previous = rows[index - 1];
    if (previous && matchesGroup(previous)) {
        return 0;
    }

    let count = 1;
    for (let i = index + 1; i < rows.length; i++) {
        if (!matchesGroup(rows[i])) break;
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
