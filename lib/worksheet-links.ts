import type { TechTreeSpecFunctionLike } from './tech-tree-utils';

export interface QfdRequirementLinkInput {
    requirementId: string;
    requirement: string;
    importance?: number;
    improvementRate?: number;
    absoluteImportance?: number;
    qualityImportancePercent?: number;
    rank?: number | null;
}

export interface ImprovementSuggestion {
    id: string;
    customerNeed: string;
    improvementRate: string;
    devProportion: string;
    order: number;
}

export interface ImprovementLinkInput {
    id: string;
    type: string;
    content?: string | null;
    improvementRate?: string | null;
    devProportion?: string | null;
    priority?: string | null;
    order?: number | null;
}

export interface TechnicalCharacteristicLinkInput {
    id: string;
    name: string;
    unit?: string | null;
    targetValue?: string | null;
}

export interface TargetSpecSuggestion {
    performanceImprovement?: string;
    id: string;
    category: string;
    subCategory: string;
    specItem: string;
    unit: string;
    targetValue: string;
    note: string;
    order: number;
}

export interface FundingPlanLinkInput {
    id?: string;
    category?: string | null;
    item?: string | null;
    year1?: number | null;
    year2?: number | null;
    year3?: number | null;
    order: number;
}

export interface SalesEstimateLinkInput {
    period?: string | null;
    amount?: number | null;
    futureAmount?: number | null;
}

function formatFixed(value: number | undefined | null, digits: number): string {
    return Number.isFinite(value) ? Number(value).toFixed(digits) : Number(0).toFixed(digits);
}

function formatPercent(value: number | undefined | null): string {
    return `${formatFixed(value, 1)}%`;
}

export function buildImprovementSuggestionsFromQfd(requirements: QfdRequirementLinkInput[]): ImprovementSuggestion[] {
    return [...requirements]
        .filter((req) => req.requirement?.trim())
        .sort((a, b) => {
            const byRank = (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER);
            if (byRank !== 0) return byRank;
            return (b.absoluteImportance ?? 0) - (a.absoluteImportance ?? 0);
        })
        .slice(0, 5)
        .map((req, order) => ({
            id: `qfd_${req.requirementId}`,
            customerNeed: req.requirement,
            improvementRate: formatFixed(req.improvementRate, 2),
            devProportion: formatPercent(req.qualityImportancePercent),
            order,
        }));
}

export function buildTargetSpecSuggestions({
    improvements,
}: {
    improvements: ImprovementLinkInput[];
    technicalCharacteristics: TechnicalCharacteristicLinkInput[];
}): TargetSpecSuggestion[] {
    const features = improvements
        .filter((item) => !(item.priority?.trim() && !item.improvementRate?.trim() && !item.devProportion?.trim()))
        .filter((item) => item.type === 'feature' && item.improvementRate?.trim())
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    if (features.length === 0) return [];

    return features.map((feature, order) => {
        return {
            id: `target_${feature.id}`,
            performanceImprovement: feature.devProportion ?? '',
            category: '개선기능',
            subCategory: feature.improvementRate?.trim() || feature.content?.trim() || '',
            specItem: '',
            unit: '',
            targetValue: '',
            note: feature.content?.trim() ?? '',
            order,
        };
    });
}

export function buildFundingPlansWithSales({
    plans,
    salesEstimates,
}: {
    plans: FundingPlanLinkInput[];
    salesEstimates: SalesEstimateLinkInput[];
}): FundingPlanLinkInput[] {
    const futureRows = salesEstimates.filter((row) => row.period === 'Y_PLUS_1');
    const sourceRows = futureRows.length > 0 ? futureRows : salesEstimates;
    const revenue = sourceRows.reduce((sum, row) => sum + (Number(row.amount) || Number(row.futureAmount) || 0), 0);

    return plans.map((plan) => {
        const isRevenueRow = plan.category === '매출액' || plan.item === '매출액';
        if (!isRevenueRow) return plan;
        return {
            ...plan,
            category: plan.category || '매출액',
            item: plan.item || '매출액',
            year1: revenue,
            year2: plan.year2 ?? null,
            year3: plan.year3 ?? null,
        };
    });
}

export function buildTargetSpecsFromAsIs(specs: Array<Omit<TechTreeSpecFunctionLike, 'level'> & { level: string }>): TargetSpecSuggestion[] {
    const sorted = [...specs].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const result: TargetSpecSuggestion[] = [];
    const append = (spec: Omit<TechTreeSpecFunctionLike, 'level'>, category: string, subCategory: string) => {
        result.push({ id: 'asis_' + spec.id, category, subCategory, specItem: spec.technology ?? '', unit: '', targetValue: '', note: '유지', order: result.length });
    };
    for (const core of sorted.filter((spec) => spec.level === 'CORE')) {
        const subs = sorted.filter((spec) => spec.level === 'SUB' && spec.parentId === core.id);
        if (core.technology || subs.length === 0) append(core, core.name, '');
        for (const sub of subs) {
            const details = sorted.filter((spec) => spec.level === 'DETAIL' && spec.parentId === sub.id);
            if (sub.technology || details.length === 0) append(sub, core.name, sub.name);
            for (const detail of details) {
                append(detail, core.name, sub.name + ' > ' + detail.name);
            }
        }
    }
    return result;
}

export function getImprovementCustomerNeeds(items: ImprovementLinkInput[]): string[] {
    const byType = (type: string) => items.filter((item) => item.type === type).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const needs = byType('need');
    const features = byType('feature');
    return Array.from({ length: Math.max(needs.length, features.length) }, (_, index) =>
        needs[index]?.content ?? features[index]?.content ?? ''
    ).filter((value) => value.trim());
}

export interface RoadmapLinkRow {
    id: string;
    category: string;
    techItem: string;
    currentLevel: string;
    targetLevel: string;
    owner?: string | null;
    q1?: string | null;
    q2?: string | null;
    q3?: string | null;
    q4?: string | null;
    order: number;
    retained?: boolean;
}

export function mergeRoadmapWithCustomerNeeds(rows: RoadmapLinkRow[], needs: string[]): RoadmapLinkRow[] {
    const hasWork = (row: RoadmapLinkRow) => [row.techItem, row.currentLevel, row.targetLevel, row.owner, row.q1, row.q2, row.q3, row.q4].some((value) => value?.trim());
    const used = new Set<string>();
    const next = needs.map((category, index) => {
        const matches = rows.filter((row) => row.category.trim() === category.trim());
        const unique = needs.filter((need) => need.trim() === category.trim()).length === 1 && matches.length === 1;
        const saved = unique ? matches[0] : matches.find((row) => !hasWork(row) && !used.has(row.id));
        if (saved) {
            used.add(saved.id);
            return { ...saved, category, targetLevel: saved.targetLevel ?? saved.owner ?? '', retained: false, order: index };
        }
        return { id: 'need_' + index, category, techItem: '', currentLevel: '', targetLevel: '', order: index };
    });
    return [...next, ...rows.filter((row) => !used.has(row.id) && (row.category.trim() || hasWork(row)) && (hasWork(row) || !needs.some((need) => need.trim() === row.category.trim()))).map((row) => ({ ...row, targetLevel: row.targetLevel ?? row.owner ?? '', retained: true }))]
        .map((row, order) => ({ ...row, order }));
}
