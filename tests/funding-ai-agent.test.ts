import { describe, expect, it } from 'vitest';
import { generateFundingAiDraft, parseSourceYear } from '../lib/funding-ai-agent';

describe('funding AI agent', () => {
    it('fills empty funding plan cells and updates the required total row', () => {
        const result = generateFundingAiDraft({
            plans: [
                { id: 'revenue', category: '매출액', item: '매출액', year1: 100, year2: 120, year3: 140, order: 0 },
                { id: 'production', category: '소요자금', item: '생산비용', year1: 0, year2: 0, year3: 0, order: 1 },
                { id: 'rd', category: '소요자금', item: '연구개발 및 기술이전 등', year1: 10, year2: 0, year3: 0, order: 2 },
                { id: 'total', category: '소요자금', item: '소요자금 합계', year1: 0, year2: 0, year3: 0, order: 3 },
            ],
            sources: [],
        });

        expect(result.plans.find((plan) => plan.id === 'production')).toMatchObject({
            year1: 30,
            year2: 45,
            year3: 60,
        });
        expect(result.plans.find((plan) => plan.id === 'rd')).toMatchObject({
            year1: 10,
            year2: 60,
            year3: 40,
        });
        expect(result.plans.find((plan) => plan.id === 'total')).toMatchObject({
            year1: 40,
            year2: 105,
            year3: 100,
        });
    });

    it('allocates missing source amounts to match required funding totals', () => {
        const result = generateFundingAiDraft({
            plans: [
                { id: 'production', category: '소요자금', item: '생산비용', year1: 30, year2: 45, year3: 60, order: 0 },
                { id: 'operation', category: '소요자금', item: '운영관리비', year1: 20, year2: 25, year3: 30, order: 1 },
            ],
            sources: [
                { id: 'gov', category: '정부자금', year1: '', year2: '', year3: '', order: 0 },
                { id: 'rd', category: '연구개발 지원금(R&D)', year1: '', year2: '', year3: '', order: 1 },
                { id: 'etc', category: '기타', year1: '', year2: '', year3: '', order: 2 },
            ],
        });

        const totalYear1 = result.sources.reduce((sum, source) => sum + parseSourceYear(source.year1).amountNumber, 0);
        const totalYear2 = result.sources.reduce((sum, source) => sum + parseSourceYear(source.year2).amountNumber, 0);
        const totalYear3 = result.sources.reduce((sum, source) => sum + parseSourceYear(source.year3).amountNumber, 0);

        expect(totalYear1).toBe(50);
        expect(totalYear2).toBe(70);
        expect(totalYear3).toBe(90);
        expect(result.summary.filledSourceCells).toBe(9);
    });
});

it('parses commas and decimals in legacy and JSON amounts equally', () => {
    expect(parseSourceYear('정부:1,234.56789').amountNumber).toBe(1234.56789);
    expect(parseSourceYear(JSON.stringify({source:'정부',amount:'1,234.56789'})).amountNumber).toBe(1234.56789);
});

// 임포터는 [출처, 금액] 중 빈 칸을 버리고 ':' 로 이어 붙이므로(workbook-importer
// 의 filter(Boolean).join), 출처 칸이 비면 "5000" 같은 토큰 하나만 남는다.
// JSON.parse("5000") 이 예외 없이 숫자를 돌려주는 탓에 예전에는 이것이 객체로
// 취급돼 금액이 0 으로 사라졌다.
it('reads a lone numeric token as the amount, not the source', () => {
    expect(parseSourceYear('5000')).toEqual({ source: '', amount: '5000', amountNumber: 5000 });
    expect(parseSourceYear('1,234.5')).toEqual({ source: '', amount: '1,234.5', amountNumber: 1234.5 });
});

it('still reads a lone non-numeric token as the source', () => {
    expect(parseSourceYear('정부자금')).toEqual({ source: '정부자금', amount: '', amountNumber: 0 });
});

it.each([null, 0, 1234.56789])('AI leaves future revenue %s untouched', (value) => {
    const plans = [{ id: 'revenue', category: '매출액', item: '매출액', year1: 100, year2: value, year3: value, order: 0 }];
    expect(generateFundingAiDraft({ plans, sources: [] }).plans).toEqual(plans);
});
