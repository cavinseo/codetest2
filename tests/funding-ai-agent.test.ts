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
