// Import 의 replace 정책이 "지우겠다고 말하지 않은 데이터"까지 없애는 것을 막는다.
//
// 스키마상 CustomerRequirement 삭제는 다음을 캐스케이드로 함께 지운다.
//   KanoResponse  (schema.prisma: onDelete: Cascade)
//   Benchmark     (동일)
//   QFDMatrix     (동일)
//
// 즉 "고객요구사항 시트가 든 엑셀"을 replace 로 올리면, 수십~수백 명에게서 받은
// Kano 설문 응답이 통째로 사라진다. 재수집이 불가능한 데이터인데 응답에도 화면에도
// 그 사실이 드러나지 않았다.
//
// 여기서는 지워질 부수 데이터의 건수만 세어 돌려준다. 실제 차단 여부는 라우트가
// 사용자 확인(confirmCascade) 여부를 보고 결정한다.

export interface CascadeImpact {
    kanoResponses: number;
    benchmarks: number;
    qfdMatrices: number;
    attributeFitnesses: number;
    techCorrelations: number;
    technicalBenchmarks: number;
}

export interface CascadeCounter {
    kanoResponse: { count: (args: { where: { projectId: string } }) => Promise<number> };
    benchmark: { count: (args: { where: { projectId: string } }) => Promise<number> };
    qFDMatrix: { count: (args: { where: { projectId: string } }) => Promise<number> };
    attributeFitness: { count: (args: { where: { projectId: string } }) => Promise<number> };
    techCorrelation: { count: (args: { where: { projectId: string } }) => Promise<number> };
    technicalBenchmark: { count: (args: { where: { projectId: string } }) => Promise<number> };
}

export const EMPTY_CASCADE_IMPACT: CascadeImpact = {
    kanoResponses: 0,
    benchmarks: 0,
    qfdMatrices: 0,
    attributeFitnesses: 0,
    techCorrelations: 0,
    technicalBenchmarks: 0,
};

export function hasCascadeImpact(impact: CascadeImpact): boolean {
    return Object.values(impact).some(count => count > 0);
}

/**
 * 덮어쓰는 요구사항·제품 속성·기술특성에 연결된 데이터의 삭제 건수를 센다.
 */
export async function countCascadeImpact(
    db: CascadeCounter,
    projectId: string,
    options: {
        replacesCustomerRequirements: boolean;
        replacesProductAttributes?: boolean;
        replacesTechnicalCharacteristics?: boolean;
    }
): Promise<CascadeImpact> {
    const { replacesCustomerRequirements: requirements, replacesProductAttributes: attributes, replacesTechnicalCharacteristics: technicals } = options;
    const where = { projectId };
    const [kanoResponses, benchmarks, qfdMatrices, attributeFitnesses, techCorrelations, technicalBenchmarks] = await Promise.all([
        requirements ? db.kanoResponse.count({ where }) : 0,
        requirements ? db.benchmark.count({ where }) : 0,
        requirements || technicals ? db.qFDMatrix.count({ where }) : 0,
        attributes ? db.attributeFitness.count({ where }) : 0,
        technicals ? db.techCorrelation.count({ where }) : 0,
        technicals ? db.technicalBenchmark.count({ where }) : 0,
    ]);

    return { kanoResponses, benchmarks, qfdMatrices, attributeFitnesses, techCorrelations, technicalBenchmarks };
}

/** 사용자에게 보여줄 한국어 경고 문구. 0 인 항목은 빼고 적는다. */
export function describeCascadeImpact(impact: CascadeImpact): string {
    const parts: string[] = [];
    if (impact.kanoResponses > 0) parts.push(`Kano 설문 응답 ${impact.kanoResponses}건`);
    if (impact.benchmarks > 0) parts.push(`벤치마크 ${impact.benchmarks}건`);
    if (impact.qfdMatrices > 0) parts.push(`QFD 관계 ${impact.qfdMatrices}건`);
    if (impact.attributeFitnesses > 0) parts.push(`적합도 ${impact.attributeFitnesses}건`);
    if (impact.techCorrelations > 0) parts.push(`기술 상관관계 ${impact.techCorrelations}건`);
    if (impact.technicalBenchmarks > 0) parts.push(`기술 벤치마크 ${impact.technicalBenchmarks}건`);
    if (parts.length === 0) return '';

    return `데이터를 덮어쓰면 ${parts.join(', ')}이 함께 삭제됩니다.`
        + (impact.kanoResponses > 0 ? ' 설문 응답은 다시 모을 수 없습니다.' : '');
}

// ─── 제품 속성 ──────────────────────────────────────────────────
//
// ProductAttribute 삭제는 AttributeFitness 를 캐스케이드로 함께 지운다
// (schema.prisma: onDelete: Cascade). 속성 시트를 비우면 적합도 시트가
// 통째로 사라지는데, 응답에도 화면에도 그 사실이 드러나지 않았다.

export interface AttributeCascadeImpact {
    fitnesses: number;
}

export interface AttributeCascadeCounter {
    attributeFitness: { count: (args: { where: { projectId: string } }) => Promise<number> };
}

export async function countAttributeCascadeImpact(
    db: AttributeCascadeCounter,
    projectId: string
): Promise<AttributeCascadeImpact> {
    const fitnesses = await db.attributeFitness.count({ where: { projectId } });
    return { fitnesses };
}

export function describeAttributeCascadeImpact(impact: AttributeCascadeImpact): string {
    if (impact.fitnesses === 0) return '';
    return `제품 속성을 모두 지우면 적합도 ${impact.fitnesses}건이 함께 삭제됩니다.`;
}
