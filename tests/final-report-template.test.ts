// 샘플 보고서의 표지 출처와 분석 선행 배치 및 빈 값 보존을 검증한다.
import { expect, it } from 'vitest';
import { buildFinalReportModel, type FinalReportWorksheetData } from '../lib/final-report-document';
import { EMPTY_REPORT_FREE_INPUT } from '../lib/final-report-payload';

const empty: FinalReportWorksheetData = {
    salesEstimates: [], specFunctions: [], productAttributes: [], requirements: [], kanoAggregation: [],
    competitiveAssessment: [], improvementNeeds: [], improvementFeatures: [], techTree: [], targetSpecs: [],
    improvementDirections: [], assets: [], fundingPlans: [], fundingSources: [],
};
const overview = { projectName: '분석 장비', companyName: '실제 회사', description: '요약', detailedDescription: '상세 제품 설명', coachName: '배정 멘토', generatedAt: '2026.09.29' };

it('표지에 프로젝트명과 회사명을 구분하고 담당 멘토 및 출력일을 넣는다', () => {
    const model = buildFinalReportModel(overview, empty, EMPTY_REPORT_FREE_INPUT, []);
    expect(model.blocks[0]).toMatchObject({ kind: 'cover', projectName: '분석 장비', companyName: '실제 회사', coachName: '배정 멘토', outputDate: '2026.09.29' });
    expect(JSON.stringify(model)).toContain('상세 제품 설명');
    expect(model.blocks.filter(b => b.kind === 'heading' && b.level === 1)).toHaveLength(5);
});

it('멘토 분석 원문을 해당 표보다 앞에 놓고 WS-3 제공혜택을 보존한다', () => {
    const worksheets = { ...empty,
        specFunctions: [{ id: 'core', level: 'CORE', parentId: null, name: '핵심', technology: null }, { id: 'sub', level: 'SUB', parentId: 'core', name: '수집', technology: '통신' }],
        productAttributes: [{ productName: '장비', marketSegment: '제조', customerName: '고객', customerNeed: '신속 대응', benefit: '시간 단축', attribute: '진단', techCapability: 'AI' }],
        fundingPlans: [{ category: '소요자금', item: '설비', year1: 0, year2: null, year3: null }],
    };
    const model = buildFinalReportModel(overview, worksheets, EMPTY_REPORT_FREE_INPUT, [], { spec: { analysis: '스펙 분석 원문' }, attributes: { analysis: '속성 분석 원문' } });
    for (const [analysis, header] of [['스펙 분석 원문', '핵심기술'], ['속성 분석 원문', '제공혜택']]) {
        const prose = model.blocks.findIndex(b => b.kind === 'paragraph' && b.text === analysis);
        const table = model.blocks.findIndex(b => b.kind === 'dataTable' && b.headers.includes(header));
        expect(prose).toBeGreaterThan(-1); expect(prose).toBeLessThan(table);
    }
    expect(JSON.stringify(model)).toContain('시간 단축');
    const funding = model.blocks.find(b => b.kind === 'dataTable' && b.headers.includes('1차년도(원)'));
    expect(funding).toMatchObject({ rows: [['소요자금', '설비', '0', '미입력', '미입력']] });
});

it('기업명이 없을 때 프로젝트명을 기업명으로 대체하거나 미작성 결과를 만들지 않는다', () => {
    const model = buildFinalReportModel({ ...overview, companyName: null }, empty, EMPTY_REPORT_FREE_INPUT, []);
    expect(model.blocks[0]).toMatchObject({ companyName: '미입력' });
    const text = JSON.stringify(model);
    expect(text).toContain('적합도'); expect(text).toContain('미작성');
    expect(model.blocks.some(b => b.kind === 'dataTable' && b.rows.some(r => r.includes('아니요')))).toBe(false);
});
