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
}

export interface CascadeCounter {
    kanoResponse: { count: (args: { where: { projectId: string } }) => Promise<number> };
    benchmark: { count: (args: { where: { projectId: string } }) => Promise<number> };
    qFDMatrix: { count: (args: { where: { projectId: string } }) => Promise<number> };
}

export const EMPTY_CASCADE_IMPACT: CascadeImpact = {
    kanoResponses: 0,
    benchmarks: 0,
    qfdMatrices: 0,
};

export function hasCascadeImpact(impact: CascadeImpact): boolean {
    return impact.kanoResponses > 0 || impact.benchmarks > 0 || impact.qfdMatrices > 0;
}

/**
 * 고객요구사항을 replace 로 덮어쓸 때 함께 사라질 데이터의 건수를 센다.
 * 고객요구사항을 건드리지 않는 import 라면 셀 필요가 없으므로 0 을 돌려준다.
 */
export async function countCascadeImpact(
    db: CascadeCounter,
    projectId: string,
    options: { replacesCustomerRequirements: boolean }
): Promise<CascadeImpact> {
    if (!options.replacesCustomerRequirements) return { ...EMPTY_CASCADE_IMPACT };

    const [kanoResponses, benchmarks, qfdMatrices] = await Promise.all([
        db.kanoResponse.count({ where: { projectId } }),
        db.benchmark.count({ where: { projectId } }),
        db.qFDMatrix.count({ where: { projectId } }),
    ]);

    return { kanoResponses, benchmarks, qfdMatrices };
}

/** 사용자에게 보여줄 한국어 경고 문구. 0 인 항목은 빼고 적는다. */
export function describeCascadeImpact(impact: CascadeImpact): string {
    const parts: string[] = [];
    if (impact.kanoResponses > 0) parts.push(`Kano 설문 응답 ${impact.kanoResponses}건`);
    if (impact.benchmarks > 0) parts.push(`벤치마크 ${impact.benchmarks}건`);
    if (impact.qfdMatrices > 0) parts.push(`QFD 관계 ${impact.qfdMatrices}건`);
    if (parts.length === 0) return '';

    return `고객요구사항을 덮어쓰면 ${parts.join(', ')}이 함께 삭제됩니다. `
        + '설문 응답은 다시 모을 수 없습니다.';
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
    attributeFitness: {
        count: (args: {
            where: { projectId: string; attributeId?: { notIn: string[] } };
        }) => Promise<number>;
    };
}

/**
 * 제품 속성을 덮어쓸 때 캐스케이드로 함께 사라질 적합도의 건수를 센다.
 *
 * `survivingAttributeIds` 는 이번 저장에서 살아남을 속성 id 다. 그 속성에 달린
 * 적합도는 지워지지 않으므로 세지 않는다. 예전에는 이 인자가 없어 프로젝트의 모든
 * 적합도를 셌고, 그래서 오타 한 글자를 고치는 저장에도 "적합도 N건이 삭제됩니다"가
 * 떴다. 늘 뜨는 경고는 읽히지 않는다 — 사용자가 확인을 습관적으로 누르게 되어,
 * 손실을 막으라고 만든 장치가 오히려 손실을 훈련시켰다.
 *
 * 인자를 주지 않거나 빈 배열이면 전량 삭제로 본다. import 계열처럼 실제로 전부
 * 지우는 경로가 그렇고, 빈 제출("전부 지워라") 또한 그렇다.
 */
export async function countAttributeCascadeImpact(
    db: AttributeCascadeCounter,
    projectId: string,
    survivingAttributeIds?: string[]
): Promise<AttributeCascadeImpact> {
    // notIn: [] 은 "아무것도 제외하지 않음"이 아니라 전체 일치다. 빈 배열을 그대로
    // 넘기면 우연히 맞는 결과가 나오지만 의도가 드러나지 않으므로 갈라 둔다.
    const where = survivingAttributeIds && survivingAttributeIds.length > 0
        ? { projectId, attributeId: { notIn: survivingAttributeIds } }
        : { projectId };

    const fitnesses = await db.attributeFitness.count({ where });
    return { fitnesses };
}

export function describeAttributeCascadeImpact(impact: AttributeCascadeImpact): string {
    if (impact.fitnesses === 0) return '';
    return `제품 속성을 모두 지우면 적합도 ${impact.fitnesses}건이 함께 삭제됩니다.`;
}
