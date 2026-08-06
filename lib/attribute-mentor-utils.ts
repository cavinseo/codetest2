// 멘토링 위저드가 쓰는 순수 로직. UI 없이 단위 테스트할 수 있도록 분리한다.
import { resolveRelatedTechnology, type AttributeSpecFunctionLike } from './product-attributes-utils';

export interface MentorDraftRow {
    id: string;
    marketSegment: string;
    customerName: string;
    customerNeed: string;
    benefit: string;
}

export interface MentorAppliedRow {
    marketSegment: string;
    customerName: string;
    customerNeed: string;
    benefit: string;
    attribute: string;
}

export interface SpecFunctionOption {
    id: string;
    name: string;
    level: 'SUB' | 'DETAIL';
    parentName: string;
    technology: string;
}

// 문진 질문 id 를 초안 생성 API 의 답변 키로 잇는다.
export const MENTOR_ANSWER_KEY_BY_QUESTION_ID: Record<string, string> = {
    'segmentation-basis': 'segmentationBasis',
    'market-segments': 'marketSegments',
    'customer-names': 'customerNames',
    'customer-problems': 'customerProblems',
    'expected-benefits': 'expectedBenefits',
};

// WS-2 에서 제품속성 후보로 고를 수 있는 것은 세부기능(SUB)과 세세부기능(DETAIL)이다.
export function buildSpecFunctionOptions(specs: AttributeSpecFunctionLike[]): SpecFunctionOption[] {
    const sorted = [...specs].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const nameById = new Map(sorted.map((spec) => [spec.id, spec.name]));
    const options: SpecFunctionOption[] = [];

    for (const spec of sorted) {
        if (spec.level !== 'SUB' && spec.level !== 'DETAIL') continue;
        if (!spec.name?.trim()) continue;

        options.push({
            id: spec.id,
            name: spec.name,
            level: spec.level,
            parentName: (spec.parentId && nameById.get(spec.parentId)) || '',
            technology: resolveRelatedTechnology(sorted, spec.name),
        });
    }

    return options;
}

// 선택한 기능마다 행을 하나씩 만든다.
// 같은 세분시장의 니즈·혜택은 값이 그대로 반복되므로 표에서는 병합되어 한 번만 보인다.
export function buildAppliedRows(
    draftRows: MentorDraftRow[],
    selectedIds: Set<string>,
    attributesByRow: Record<string, string[]>
): MentorAppliedRow[] {
    const applied: MentorAppliedRow[] = [];

    for (const row of draftRows) {
        if (!selectedIds.has(row.id)) continue;

        const base = {
            marketSegment: row.marketSegment,
            customerName: row.customerName,
            customerNeed: row.customerNeed,
            benefit: row.benefit,
        };

        const attributes = (attributesByRow[row.id] ?? []).filter((name) => name.trim());
        if (attributes.length === 0) {
            applied.push({ ...base, attribute: '' });
            continue;
        }

        for (const attribute of attributes) {
            applied.push({ ...base, attribute });
        }
    }

    return applied;
}

// 선택한 기능에 연결된 적용기술을 중복 없이 모은다. 기술 역량 칸에 그대로 채워 넣는다.
export function collectTechnologies(
    specs: AttributeSpecFunctionLike[],
    attributesByRow: Record<string, string[]>,
    selectedIds: Set<string>
): string[] {
    const seen = new Set<string>();
    const technologies: string[] = [];

    for (const [rowId, names] of Object.entries(attributesByRow)) {
        if (!selectedIds.has(rowId)) continue;

        for (const name of names) {
            const technology = resolveRelatedTechnology(specs, name);
            if (!technology.trim()) continue;

            // 여러 기술이 쉼표로 묶여 오는 경우가 있어 하나씩 풀어 담는다.
            for (const item of technology.split(',').map((value) => value.trim()).filter(Boolean)) {
                const key = item.toLowerCase();
                if (seen.has(key)) continue;
                seen.add(key);
                technologies.push(item);
            }
        }
    }

    return technologies;
}
