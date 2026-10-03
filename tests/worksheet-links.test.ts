import { describe, expect, it } from 'vitest';
import {
    buildFundingPlansWithSales,
    buildImprovementSuggestionsFromQfd,
    buildTargetSpecSuggestions,
    buildTargetSpecsFromAsIs,
    buildTargetSpecAdditionsFromTechTree,
    getImprovementCustomerNeeds,
    mergeRoadmapWithCustomerNeeds,
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

    it('limits improvement suggestions to QFD top five requirements', () => {
        const suggestions = buildImprovementSuggestionsFromQfd(
            Array.from({ length: 6 }, (_, index) => ({
                requirementId: `r-${index + 1}`,
                requirement: `Need ${index + 1}`,
                improvementRate: index + 1,
                absoluteImportance: index + 1,
                qualityImportancePercent: (index + 1) * 10,
            }))
        );

        expect(suggestions).toHaveLength(5);
        expect(suggestions.map((suggestion) => suggestion.customerNeed)).toEqual([
            'Need 6',
            'Need 5',
            'Need 4',
            'Need 3',
            'Need 2',
        ]);
    });

    it('links improvement features and technical characteristics to target spec suggestions', () => {
        const suggestions = buildTargetSpecSuggestions({
            improvements: [
                { id: 'feature-1', type: 'feature', content: 'High need', improvementRate: 'Improve response speed', devProportion: 'Faster response', order: 0 },
            ],
            technicalCharacteristics: [
                { id: 'tech-1', name: 'Response time', unit: 'ms', targetValue: '< 100' },
            ],
        });

        expect(suggestions).toEqual([
            {
                id: 'target_feature-1',
                performanceImprovement: 'Faster response',
                category: '개선기능',
                subCategory: 'Improve response speed',
                specItem: '',
                unit: '',
                targetValue: '',
                note: 'High need',
                order: 0,
            },
        ]);
    });

    it('ignores legacy WS-11 feature rows that only have the removed priority field', () => {
        const suggestions = buildTargetSpecSuggestions({
            improvements: [
                { id: 'legacy-1', type: 'feature', content: 'Broken legacy feature', priority: '1', order: 0 },
            ],
            technicalCharacteristics: [
                { id: 'tech-1', name: 'Response time', unit: 'ms', targetValue: '< 100' },
            ],
        });

        expect(suggestions).toEqual([]);
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
            year2: 0,
            year3: 0,
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
            year2: 0,
            year3: 0,
        });
    });
});

it('seeds each AS-IS hierarchy node without dropping core technology', () => {
    const rows = buildTargetSpecsFromAsIs([
    {id:'c',level:'CORE',name:'핵심',technology:'핵심 기술'},
    {id:'s',level:'SUB',parentId:'c',name:'세부',technology:'세부 기술'},
    {id:'d',level:'DETAIL',parentId:'s',name:'세세부',technology:'상세 기술'},
    ]);
    expect(rows.map(r => [r.category,r.subCategory,r.specItem])).toEqual([['핵심','','핵심 기술'],['핵심','세부','세부 기술'],['핵심','세부 > 세세부','상세 기술']]);
});

it('adds only WS-10 sub-specs missing from WS-2 under their existing core for WS-12', () => {
    const specs = [
        { id: 'core', level: 'CORE', name: '구동', order: 0 },
        { id: 'sub', level: 'SUB', parentId: 'core', name: '속도 제어', technology: '기존 제어', order: 1 },
        { id: 'detail', level: 'DETAIL', parentId: 'sub', name: '미세 제어', technology: '기존 기술', order: 2 },
    ];
    const saved = [{ id: 'target', category: '구동', subCategory: '속도 제어', specItem: '수정한 기술', unit: 'ms', targetValue: '10', note: '개선', order: 3 }];
    const entries = [
        { coreSpec: '구동', subSpec: '속도 제어', techCharacteristic: '기존 제어' },
        { coreSpec: '구동', subSpec: '미세 제어', techCharacteristic: '기존 기술' },
        { coreSpec: '구동', subSpec: '신규 센서', techCharacteristic: '광학 측정' },
        { coreSpec: '구동', subSpec: '신규 센서', techCharacteristic: '광학 측정' },
        { coreSpec: '없는 핵심', subSpec: '신규 기능', techCharacteristic: '기술' },
    ];
    expect(buildTargetSpecAdditionsFromTechTree(entries, specs, saved)).toEqual([
        { category: '구동', subCategory: '신규 센서', specItem: '광학 측정', unit: '', targetValue: '', note: '신규', order: 4 },
    ]);
});

it('seeds AS-IS rows before a new WS-10 sub-spec when WS-12 has never been saved', () => {
    const specs = [
        { id: 'core', level: 'CORE', name: '구동', order: 0 },
        { id: 'sub', level: 'SUB', parentId: 'core', name: '기존 기능', technology: '기존 기술', order: 1 },
    ];
    const rows = buildTargetSpecAdditionsFromTechTree([{ coreSpec: '구동', subSpec: '신규 기능', techCharacteristic: '새 기술' }], specs, []);
    expect(rows.map((row) => [row.category, row.subCategory, row.note])).toEqual([
        ['구동', '기존 기능', '유지'],
        ['구동', '신규 기능', '신규'],
    ]);
    expect(buildTargetSpecAdditionsFromTechTree([{ coreSpec: '구동', subSpec: '기존 기능' }], specs, [])).toEqual([]);
});

it('uses WS-11 displayed need order including feature fallback', () => {
    expect(getImprovementCustomerNeeds([{id:'f',type:'feature',content:'old',order:0},{id:'f2',type:'feature',content:'fallback',order:1},{id:'n',type:'need',content:'first',order:0}])).toEqual(['first','fallback']);
});
it('reorders exact unique needs and preserves renamed and ambiguous authored rows', () => {
    const row = (id: string, category: string, techItem: string) => ({id,category,techItem,currentLevel:'',targetLevel:'',order:0});
    const result = mergeRoadmapWithCustomerNeeds([row('a','A','a work'),row('b','B','b work'),row('old','Old','keep'),row('dup','Dup','ambiguous')],['B','A','New','Dup','Dup']);
    expect(result.slice(0,5).map(r => r.category)).toEqual(['B','A','New','Dup','Dup']);
    expect(result.slice(0,2).map(r => r.techItem)).toEqual(['b work','a work']);
    expect(result.slice(3,5).every(r => !r.techItem)).toBe(true);
    expect(result.slice(5).map(r => r.techItem)).toEqual(['keep','ambiguous']);
    expect(mergeRoadmapWithCustomerNeeds(result,['B','A','New','Dup','Dup'])).toHaveLength(result.length);
});

it('keeps parent paths without adding empty parent rows', () => {
    expect(buildTargetSpecsFromAsIs([{id:'c',level:'CORE',name:'C'},{id:'s',level:'SUB',parentId:'c',name:'S'},{id:'d',level:'DETAIL',parentId:'s',name:'D',technology:'tech'}]).map(row => [row.category,row.subCategory,row.specItem])).toEqual([['C','S > D','tech']]);
});

it('preserves blank, zero and manual future revenue on repeated sales linking', () => {
    for (const value of [null, 0, 1234.56789]) {
        const plans = [{category:'매출액',item:'매출액',year1:0,year2:value,year3:value,order:0}];
        const first = buildFundingPlansWithSales({plans,salesEstimates:[{amount:100}]});
        expect(buildFundingPlansWithSales({plans:first,salesEstimates:[{amount:200}]})[0]).toMatchObject({year1:200,year2:value,year3:value});
    }
});

it('does not restore a cleared target customer from legacy owner', () => {
    const row = { id: 'old', category: 'Need', techItem: '', currentLevel: '', targetLevel: '', owner: 'legacy customer', order: 0 };
    expect(mergeRoadmapWithCustomerNeeds([row], ['Need'])[0].targetLevel).toBe('');
});
