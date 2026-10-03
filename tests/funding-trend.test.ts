// 자금계획의 성장률과 손익분기 계산에서 미입력·영 매출·교차 방향을 검증한다.
import { describe, expect, it } from 'vitest';
import { buildFundingTrend } from '../lib/funding-trend';

const trend = (revenues: Array<number | null>, costs: number[]) => buildFundingTrend(revenues.map((revenue, index) => ({ revenue, required: costs[index] })));

describe('WS-15 성장과 손익분기 계산', () => {
    it('첨부 양식의 연차별 금액과 매출 성장률을 계산한다', () => {
        const result = trend([250, 1000, 2000], [235, 835, 1770]);
        expect(result.years.map(year => year.balance)).toEqual([15, 165, 230]);
        expect(result.years.map(year => year.growthPercent)).toEqual([null, 300, 100]);
        expect(result.breakEvenPoints).toEqual([]);
    });

    it('매출이 소요자금을 따라잡는 연도 사이 교차점을 보간한다', () => {
        const result = trend([100, 300, 500], [200, 200, 300]);
        expect(result.breakEvenPoints).toEqual([{ year: 1.5, amount: 200, estimated: true }]);
    });

    it('두 번 교차하면 손실 전환 지점까지 모두 표시한다', () => {
        expect(trend([100, 300, 100], [200, 200, 200]).breakEvenPoints).toEqual([
            { year: 1.5, amount: 200, estimated: true },
            { year: 2.5, amount: 200, estimated: true },
        ]);
    });

    it('입력된 연도의 손익분기는 추정하지 않고 한 번만 표시한다', () => {
        expect(trend([100, 200, 400], [200, 200, 200]).breakEvenPoints).toEqual([{ year: 2, amount: 200, estimated: false }]);
    });

    it('중간 연도 매출이 미입력이면 연결하거나 분기점을 만들지 않는다', () => {
        const result = trend([100, null, 400], [200, 200, 200]);
        expect(result.breakEvenPoints).toEqual([]);
        expect(result.years[1]).toMatchObject({ revenue: null, balance: null, growthPercent: null });
        expect(result.years[2].growthPercent).toBeNull();
    });

    it('입력한 매출 0은 미입력과 구분하고 전년 매출 0으로 나누지 않는다', () => {
        const result = trend([100, 0, 300], [200, 200, 200]);
        expect(result.years[1]).toMatchObject({ revenue: 0, balance: -200, growthPercent: -100 });
        expect(result.years[2].growthPercent).toBeNull();
        expect(result.breakEvenPoints[0].year).toBeCloseTo(2 + 2 / 3);
    });

    it('초기 금액이 모두 0이면 손익분기 달성으로 표시하지 않는다', () => {
        expect(trend([0, 0, 0], [0, 0, 0]).breakEvenPoints).toEqual([]);
    });

    it('계산에 소수 금액을 보존하고 입력 데이터를 변경하지 않는다', () => {
        const input = [{ revenue: 0.25, required: 0.35 }, { revenue: 0.55, required: 0.45 }];
        const before = structuredClone(input);
        const result = buildFundingTrend(input);
        expect(result.breakEvenPoints[0].amount).toBeCloseTo(0.4);
        expect(result.breakEvenPoints[0].year).toBeCloseTo(1.5);
        expect(input).toEqual(before);
    });
});
