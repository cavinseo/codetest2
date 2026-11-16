// 보고서 생성에 쓰이는 프로젝트와 워크시트 행의 변경 여부를 비교한다.
import { createHash } from 'node:crypto';

export const REPORT_SOURCE_INCLUDE = {
    specFunctions: true, productAttributes: true, attributeFitnesses: true,
    requirements: true, technicalCharacteristics: true, qfdMatrices: true,
    kanoResponses: true, techCorrelations: true, benchmarks: true,
    technicalBenchmarks: true, techTreeEntries: true, improvementItems: true,
    targetSpecs: true, techRoadmaps: true, devPlans: true, salesEstimates: true,
    assetItems: true, fundingPlans: true, fundingSources: true, fitnessMatrix: true,
} as const;

function canonical(value: unknown): unknown {
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) {
        const items = value.map(canonical);
        return items.every(item => item && typeof item === 'object' && !Array.isArray(item) && 'id' in item && typeof item.id === 'string')
            ? items.sort((left, right) => String((left as { id: string }).id).localeCompare(String((right as { id: string }).id)))
            : items;
    }
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
            .map(([key, item]) => [key, canonical(item)]));
    }
    return value;
}

export function finalReportSourceRevision(project: unknown): string {
    return createHash('sha256').update(JSON.stringify(canonical(project))).digest('hex');
}
