// 연차별 매출 성장률과 자금계획 기준 손익분기 교차점을 계산한다.
export interface FundingTrendInput {
    revenue: number | null;
    required: number;
}

export function buildFundingTrend(values: FundingTrendInput[]) {
    const years = values.map((value, index) => {
        const previousRevenue = values[index - 1]?.revenue;
        return {
            ...value,
            year: index + 1,
            label: `Y+${index + 1}년차`,
            balance: value.revenue === null ? null : value.revenue - value.required,
            growthPercent: value.revenue !== null && previousRevenue != null && previousRevenue > 0
                ? (value.revenue - previousRevenue) / previousRevenue * 100
                : null,
        };
    });
    const breakEvenPoints: Array<{ year: number; amount: number; estimated: boolean }> = [];
    for (const [index, current] of years.entries()) {
        if (current.balance === null) continue;
        if (current.balance === 0 && current.required !== 0) {
            breakEvenPoints.push({ year: current.year, amount: current.required, estimated: false });
        }
        const next = years[index + 1];
        if (!next || next.balance === null || current.balance * next.balance >= 0) continue;
        const fraction = current.balance / (current.balance - next.balance);
        breakEvenPoints.push({
            year: current.year + fraction,
            amount: current.required + (next.required - current.required) * fraction,
            estimated: true,
        });
    }
    return { years, breakEvenPoints };
}
