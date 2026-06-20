// WS-16 자금계획 초안을 규칙 기반으로 생성하는 유틸리티
export interface FundingAiPlan {
    id: string;
    category: string;
    item: string;
    year1: number;
    year2: number;
    year3: number;
    order: number;
}

export interface FundingAiSource {
    id: string;
    category: string;
    year1: string;
    year2: string;
    year3: string;
    order: number;
}

export interface FundingAiSourceYear {
    source: string;
    amount: string;
}

export interface FundingAiIssue {
    severity: 'info' | 'warning';
    message: string;
}

const YEAR_FIELDS = ['year1', 'year2', 'year3'] as const;
type YearField = (typeof YEAR_FIELDS)[number];

export interface FundingAiDraftResult {
    plans: FundingAiPlan[];
    sources: FundingAiSource[];
    issues: FundingAiIssue[];
    summary: {
        filledPlanCells: number;
        filledSourceCells: number;
        requiredByYear: Record<YearField, number>;
        sourcedByYear: Record<YearField, number>;
    };
}

const DEFAULT_PLAN_AMOUNTS: Array<{ keywords: string[]; amounts: Record<YearField, number> }> = [
    { keywords: ['생산'], amounts: { year1: 30, year2: 45, year3: 60 } },
    { keywords: ['운영', '관리'], amounts: { year1: 20, year2: 25, year3: 30 } },
    { keywords: ['설비', '투자'], amounts: { year1: 50, year2: 30, year3: 20 } },
    { keywords: ['연구', '개발', '기술이전'], amounts: { year1: 80, year2: 60, year3: 40 } },
    { keywords: ['기타'], amounts: { year1: 10, year2: 10, year3: 10 } },
];

const SOURCE_RULES: Array<{ keywords: string[]; label: string; weight: number }> = [
    { keywords: ['정부'], label: '창업지원사업', weight: 0.25 },
    { keywords: ['엔젤'], label: '엔젤투자', weight: 0.12 },
    { keywords: ['r&d', '연구개발'], label: 'R&D 과제', weight: 0.25 },
    { keywords: ['tips'], label: 'TIPS 프로그램', weight: 0.18 },
    { keywords: ['vc', '벤처'], label: 'VC 투자', weight: 0.15 },
    { keywords: ['기타'], label: '자체 조달', weight: 0.05 },
];

export function generateFundingAiDraft({
    plans,
    sources,
}: {
    plans: FundingAiPlan[];
    sources: FundingAiSource[];
}): FundingAiDraftResult {
    const issues: FundingAiIssue[] = [];
    let filledPlanCells = 0;

    const nextPlans = plans.map((plan) => {
        if (!isCostPlan(plan)) return { ...plan };

        const defaults = defaultPlanAmounts(plan);
        const next = { ...plan };

        for (const field of YEAR_FIELDS) {
            if (Number(next[field]) <= 0) {
                next[field] = defaults[field];
                filledPlanCells += 1;
            }
        }

        return next;
    });

    const requiredByYear = buildRequiredByYear(nextPlans);
    for (const plan of nextPlans) {
        if (!isTotalPlan(plan)) continue;
        for (const field of YEAR_FIELDS) {
            plan[field] = requiredByYear[field];
        }
    }

    let filledSourceCells = 0;
    const nextSources = sources.map((source) => ({ ...source }));

    for (const field of YEAR_FIELDS) {
        const currentTotal = nextSources.reduce((sum, source) => sum + parseSourceYear(source[field]).amountNumber, 0);
        const remaining = Math.max(0, requiredByYear[field] - currentTotal);
        if (remaining <= 0) continue;

        const emptySources = nextSources.filter((source) => parseSourceYear(source[field]).amountNumber <= 0);
        const weightTotal = emptySources.reduce((sum, source) => sum + sourceWeight(source), 0);

        if (emptySources.length === 0 || weightTotal <= 0) {
            issues.push({ severity: 'warning', message: `${yearLabel(field)} 조달금액을 배분할 비어 있는 항목이 없습니다.` });
            continue;
        }

        let allocated = 0;
        emptySources.forEach((source, index) => {
            const amount = index === emptySources.length - 1
                ? Math.max(0, remaining - allocated)
                : roundAmount(remaining * (sourceWeight(source) / weightTotal));

            allocated += amount;
            source[field] = encodeSourceYear({
                source: parseSourceYear(source[field]).source || sourceLabel(source),
                amount: String(amount),
            });
            filledSourceCells += 1;
        });
    }

    const sourcedByYear = buildSourcedByYear(nextSources);

    if (filledPlanCells === 0 && filledSourceCells === 0) {
        issues.push({ severity: 'info', message: '채울 빈 항목이 없어 기존 자금계획을 그대로 유지했습니다.' });
    }

    return {
        plans: nextPlans,
        sources: nextSources,
        issues,
        summary: {
            filledPlanCells,
            filledSourceCells,
            requiredByYear,
            sourcedByYear,
        },
    };
}

export function parseSourceYear(value?: string | null) {
    if (!value) return { source: '', amount: '', amountNumber: 0 };

    try {
        const parsed = JSON.parse(value) as Partial<FundingAiSourceYear>;
        const amount = parsed.amount ?? '';
        return { source: parsed.source ?? '', amount, amountNumber: Number(amount) || 0 };
    } catch {
        const [source = '', amount = ''] = value.split(':');
        return { source, amount, amountNumber: Number(amount) || 0 };
    }
}

function encodeSourceYear(value: FundingAiSourceYear) {
    return JSON.stringify(value);
}

function isRevenuePlan(plan: FundingAiPlan) {
    return normalize(`${plan.category ?? ''} ${plan.item ?? ''}`).includes('매출');
}

function isTotalPlan(plan: FundingAiPlan) {
    return normalize(`${plan.category ?? ''} ${plan.item ?? ''}`).includes('합계');
}

function isCostPlan(plan: FundingAiPlan) {
    return !isRevenuePlan(plan) && !isTotalPlan(plan);
}

function defaultPlanAmounts(plan: FundingAiPlan) {
    const text = normalize(`${plan.category ?? ''} ${plan.item ?? ''}`);
    return DEFAULT_PLAN_AMOUNTS.find((rule) => rule.keywords.some((keyword) => text.includes(normalize(keyword))))?.amounts
        ?? { year1: 10, year2: 10, year3: 10 };
}

function buildRequiredByYear(plans: FundingAiPlan[]) {
    return YEAR_FIELDS.reduce((result, field) => ({
        ...result,
        [field]: plans
            .filter(isCostPlan)
            .reduce((sum, plan) => sum + (Number(plan[field]) || 0), 0),
    }), {} as Record<YearField, number>);
}

function buildSourcedByYear(sources: FundingAiSource[]) {
    return YEAR_FIELDS.reduce((result, field) => ({
        ...result,
        [field]: sources.reduce((sum, source) => sum + parseSourceYear(source[field]).amountNumber, 0),
    }), {} as Record<YearField, number>);
}

function sourceWeight(source: FundingAiSource) {
    const text = normalize(source.category ?? '');
    return SOURCE_RULES.find((rule) => rule.keywords.some((keyword) => text.includes(normalize(keyword))))?.weight ?? 0.05;
}

function sourceLabel(source: FundingAiSource) {
    const text = normalize(source.category ?? '');
    return SOURCE_RULES.find((rule) => rule.keywords.some((keyword) => text.includes(normalize(keyword))))?.label
        ?? `${source.category ?? '조달'} 계획`;
}

function yearLabel(field: YearField) {
    return field === 'year1' ? '1차년도' : field === 'year2' ? '2차년도' : '3차년도';
}

function roundAmount(value: number) {
    return Math.round(value);
}

function normalize(value: string) {
    return value.replace(/\s+/g, '').toLowerCase();
}
