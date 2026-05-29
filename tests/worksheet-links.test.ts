import { describe, expect, it } from 'vitest';
import {
    buildFundingPlansWithSales,
    buildImprovementSuggestionsFromQfd,
    buildTargetSpecSuggestions,
} from '../lib/worksheet-links';

describe('worksheet links', () => {
    it('links QFD requirement analysis to improvement suggestions by absolute importance', () => {
        const suggestions = buildImprovementSuggestionsFromQfd([
            {
                requirementId: 'r-low',
                requirement: 'Low need',
                importance: 5,
                improvementRate: 1,
                absoluteImportance: 5,
                qualityImportancePercent: 25,
                rank: 2,
            },
            {
                requirementId: 'r-high',
                requirement: 'High need',
                importance: 3,
                improvementRate: 3,
                absoluteImportance: 9,
                qualityImportancePercent: 75,
                rank: 1,
            },
        ]);

        expect(suggestions).toEqual([
            {
                id: 'qfd_r-high',
                customerNeed: 'High need',
                improvementRate: '3.00',
                devProportion: '75.0%',
                order: 0,
            },
            {
                id: 'qfd_r-low',
                customerNeed: 'Low need',
                improvementRate: '1.00',
                devProportion: '25.0%',
                order: 1,
            },
        ]);
    });

    it('links improvement features and technical characteristics to target spec suggestions', () => {
        const suggestions = buildTargetSpecSuggestions({
            improvements: [
                { id: 'feature-1', type: 'feature', content: 'Improve response speed', priority: '1', order: 0 },
            ],
            technicalCharacteristics: [
                { id: 'tech-1', name: 'Response time', unit: 'ms', targetValue: '< 100' },
            ],
        });

        expect(suggestions).toEqual([
            {
                id: 'target_feature-1',
                category: '개선기능',
                subCategory: 'Improve response speed',
                specItem: 'Response time',
                unit: 'ms',
                targetValue: '< 100',
                note: '우선순위 1',
                order: 0,
            },
        ]);
    });

    it('links sales estimates to the funding revenue row', () => {
        const plans = buildFundingPlansWithSales({
            plans: [
                { id: 'p1', category: '매출액', item: '매출액', year1: 0, year2: 0, year3: 0, order: 0 },
                { id: 'p2', category: '소요자금', item: '생산비용', year1: 10, year2: 20, year3: 30, order: 1 },
            ],
            salesEstimates: [
                { amount: 100 },
                { amount: 50 },
            ],
        });

        expect(plans[0]).toMatchObject({
            category: '매출액',
            item: '매출액',
            year1: 150,
            year2: 150,
            year3: 150,
        });
        expect(plans[1]).toMatchObject({ year1: 10, year2: 20, year3: 30 });
    });

    it('uses Y+1 sales totals for funding revenue when future sales are present', () => {
        const plans = buildFundingPlansWithSales({
            plans: [
                { id: 'p1', category: '매출액', item: '매출액', year1: 0, year2: 0, year3: 0, order: 0 },
            ],
            salesEstimates: [
                { period: 'Y', amount: 100 },
                { period: 'Y', amount: 50 },
                { period: 'Y_PLUS_1', amount: 200 },
                { period: 'Y_PLUS_1', amount: 75 },
            ],
        });

        expect(plans[0]).toMatchObject({
            year1: 275,
            year2: 275,
            year3: 275,
        });
    });
});
