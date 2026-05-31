export interface QfdRequirementRankInput {
    requirementId?: string;
    id?: string;
    requirement?: string | null;
    rank?: number | null;
    absoluteImportance?: number | null;
    qualityImportancePercent?: number | null;
}

export interface RankedTechTreeRequirement {
    id: string;
    requirement: string;
    rank: number;
}

export function getTopRankedQfdRequirements(
    requirements: QfdRequirementRankInput[],
    limit = 5
): RankedTechTreeRequirement[] {
    return requirements
        .filter((item) => typeof item.rank === 'number' && item.rank > 0 && item.requirement?.trim())
        .sort((a, b) => {
            const rankDiff = (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER);
            if (rankDiff !== 0) return rankDiff;
            return (b.absoluteImportance ?? 0) - (a.absoluteImportance ?? 0);
        })
        .slice(0, limit)
        .map((item, index) => ({
            id: item.requirementId || item.id || `qfd_rank_${index + 1}`,
            requirement: item.requirement!.trim(),
            rank: item.rank!,
        }));
}
