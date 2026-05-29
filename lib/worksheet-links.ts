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
            const byAbsoluteImportance = (b.absoluteImportance ?? 0) - (a.absoluteImportance ?? 0);
            if (byAbsoluteImportance !== 0) return byAbsoluteImportance;
            return (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER);
        })
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
    technicalCharacteristics,
}: {
    improvements: ImprovementLinkInput[];
    technicalCharacteristics: TechnicalCharacteristicLinkInput[];
}): TargetSpecSuggestion[] {
    const features = improvements
        .filter((item) => item.type === 'feature' && item.content?.trim())
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    if (features.length === 0) return [];

    return features.map((feature, order) => {
        const tech = technicalCharacteristics[order] ?? technicalCharacteristics[technicalCharacteristics.length - 1];
        return {
            id: `target_${feature.id}`,
            category: '개선기능',
            subCategory: feature.content?.trim() ?? '',
            specItem: tech?.name ?? '',
            unit: tech?.unit ?? '',
            targetValue: tech?.targetValue ?? '',
            note: feature.priority ? `우선순위 ${feature.priority}` : '',
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
            year2: revenue,
            year3: revenue,
        };
    });
}
