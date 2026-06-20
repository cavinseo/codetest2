export type QfdRelationshipStrength = 'STRONG' | 'MEDIUM' | 'WEAK' | 'NONE' | string;

export { calculateSatisfactionGraphWeight } from './kano-algorithm';

export interface QfdRequirementInput {
    id: string;
    category: string;
    subcategory?: string | null;
    requirement: string;
    importance: number;
    kanoCategory?: string;
    better?: number;
    worse?: number;
    responseCount?: number;
}

export interface QfdTechnicalInput {
    id: string;
    name: string;
    unit?: string | null;
    targetValue?: string | null;
}

export interface QfdRelationshipInput {
    requirementId: string;
    technicalCharId: string;
    strength: QfdRelationshipStrength;
}

export interface QfdBenchmarkInput {
    requirementId: string;
    company: string;
    score: number;
}

export interface QfdWorksheetInput {
    requirements: QfdRequirementInput[];
    technicals: QfdTechnicalInput[];
    relationships: QfdRelationshipInput[];
    benchmarks: QfdBenchmarkInput[];
}

export interface QfdRequirementWorksheetRow extends QfdRequirementInput {
    requirementId: string;
    weight: number;
    weightPercent: number;
    selfScore: number;
    competitorScore: number;
    planQuality: number;
    improvementRate: number;
    absoluteImportance: number;
    qualityImportancePercent: number;
    rank: number | null;
}

export interface QfdTechnicalWorksheetRow extends QfdTechnicalInput {
    technicalCharId: string;
    totalScore: number;
    rank: number | null;
    importancePercent: number;
}

export interface QfdWorksheetResult {
    requirements: QfdRequirementWorksheetRow[];
    technicals: QfdTechnicalWorksheetRow[];
    totals: {
        weight: number;
        absoluteImportance: number;
        technicalScore: number;
    };
}

const RELATIONSHIP_WEIGHTS: Record<string, number> = {
    STRONG: 9,
    MEDIUM: 3,
    WEAK: 1,
    NONE: 0,
};

export function relationshipWeight(strength: QfdRelationshipStrength): number {
    return RELATIONSHIP_WEIGHTS[strength] ?? 0;
}

function round(value: number, digits = 2): number {
    const factor = 10 ** digits;
    return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function excelRankDescending(values: number[]): Array<number | null> {
    return values.map((value) => {
        if (value <= 0 || !Number.isFinite(value)) return null;
        return values.filter((candidate) => candidate > value).length + 1;
    });
}

function getBenchmarkScore(benchmarks: QfdBenchmarkInput[], requirementId: string, company: string): number {
    return benchmarks.find((item) => item.requirementId === requirementId && item.company === company)?.score ?? 0;
}

function getMaxCompetitorBenchmarkScore(benchmarks: QfdBenchmarkInput[], requirementId: string): number {
    return benchmarks
        .filter((item) => item.requirementId === requirementId && item.company !== 'self')
        .reduce((max, item) => Math.max(max, item.score || 0), 0);
}

export function calculateQfdWorksheet(input: QfdWorksheetInput): QfdWorksheetResult {
    const totalWeight = input.requirements.reduce((sum, req) => sum + (req.importance || 0), 0);

    const requirementBaseRows = input.requirements.map((req) => {
        const weight = req.importance || 0;
        const selfScore = getBenchmarkScore(input.benchmarks, req.id, 'self');
        const competitorScore = getMaxCompetitorBenchmarkScore(input.benchmarks, req.id);
        const planQuality = Math.max(selfScore, competitorScore);
        const improvementRate = selfScore > 0 ? planQuality / selfScore : 0;
        const absoluteImportance = weight * improvementRate;

        return {
            ...req,
            requirementId: req.id,
            weight,
            weightPercent: totalWeight > 0 ? round((weight / totalWeight) * 100) : 0,
            selfScore,
            competitorScore,
            planQuality,
            improvementRate: round(improvementRate),
            absoluteImportance: round(absoluteImportance),
            qualityImportancePercent: 0,
            rank: null as number | null,
        };
    });

    const totalAbsoluteImportance = requirementBaseRows.reduce((sum, row) => sum + row.absoluteImportance, 0);
    const requirementRanks = excelRankDescending(requirementBaseRows.map((row) => row.absoluteImportance));

    const requirements = requirementBaseRows.map((row, index) => ({
        ...row,
        qualityImportancePercent: totalAbsoluteImportance > 0
            ? round((row.absoluteImportance * 100) / totalAbsoluteImportance)
            : 0,
        rank: requirementRanks[index],
    }));

    const technicalBaseRows = input.technicals.map((tech) => {
        const totalScore = input.requirements.reduce((sum, req) => {
            const relationship = input.relationships.find(
                (rel) => rel.requirementId === req.id && rel.technicalCharId === tech.id
            );
            return sum + relationshipWeight(relationship?.strength ?? 'NONE') * (req.importance || 0);
        }, 0);

        return {
            ...tech,
            technicalCharId: tech.id,
            totalScore: round(totalScore),
            rank: null as number | null,
            importancePercent: 0,
        };
    });

    const totalTechnicalScore = technicalBaseRows.reduce((sum, row) => sum + row.totalScore, 0);
    const technicalRanks = excelRankDescending(technicalBaseRows.map((row) => row.totalScore));

    const technicals = technicalBaseRows.map((row, index) => ({
        ...row,
        rank: technicalRanks[index],
        importancePercent: totalWeight > 0 ? round((row.totalScore / totalWeight) * 10) : 0,
    }));

    return {
        requirements,
        technicals,
        totals: {
            weight: round(totalWeight),
            absoluteImportance: round(totalAbsoluteImportance),
            technicalScore: round(totalTechnicalScore),
        },
    };
}
