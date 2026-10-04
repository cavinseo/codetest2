// 샘플 보고서의 표지 출처와 분석 선행 배치 및 빈 값 보존을 검증한다.
import { expect, it } from 'vitest';
import { buildFinalReportModel, type FinalReportWorksheetData } from '../lib/final-report-document';
import { EMPTY_REPORT_FREE_INPUT } from '../lib/final-report-payload';
import { layoutReportPages } from '../lib/final-report-layout';

const empty: FinalReportWorksheetData = {
    salesEstimates: [], specFunctions: [], productAttributes: [], requirements: [], kanoAggregation: [],
    competitiveAssessment: [], improvementNeeds: [], improvementFeatures: [], techTree: [], targetSpecs: [],
    improvementDirections: [], assets: [], fundingPlans: [], fundingSources: [],
};
const overview = { projectName: '분석 장비', companyName: '실제 회사', description: '요약', detailedDescription: '상세 제품 설명', coachName: '배정 멘토', generatedAt: '2026.09.29' };

it('반복되는 그룹 열만 보고서에서 병합하도록 지정한다', () => {
    const worksheets = { ...empty, requirements: [
        { id: 'r1', category: '품질', subcategory: '신뢰', requirement: '첫째' },
        { id: 'r2', category: '품질', subcategory: '신뢰', requirement: '둘째' },
    ] };
    const model = buildFinalReportModel(overview, worksheets, EMPTY_REPORT_FREE_INPUT, []);
    expect(model.blocks.find(block => block.kind === 'dataTable' && block.title === 'WS-5 고객요구사항'))
        .toMatchObject({ mergeColumns: [2, 3], rows: [['1', '첫째', '품질', '신뢰'], ['2', '둘째', '품질', '신뢰']] });
});

it.each(['', ' \t\n '])('WS-2 세세부기술이 비어 있으면 열만 제외하고 적용기술과 모든 행을 보존한다 (%j)', detail => {
    const worksheets = { ...empty, specDetailCollapsed: true, specFunctions: [
        { id: 'core', level: 'CORE', parentId: null, name: '핵심', technology: '핵심 기술' },
        { id: 'sub', level: 'SUB', parentId: 'core', name: '수집', technology: '통신' },
        { id: 'detail', level: 'DETAIL', parentId: 'sub', name: detail, technology: '기록 장치' },
    ] };
    const before = JSON.stringify(worksheets);
    const model = buildFinalReportModel(overview, worksheets, EMPTY_REPORT_FREE_INPUT, []);
    const index = model.blocks.findIndex(block => block.kind === 'dataTable' && block.title === 'WS-2 AS-IS 스펙표');
    expect(model.blocks[index]).toMatchObject({
        headers: ['No', '핵심기술', '세부기술', '적용기술'],
        rows: [['1', '핵심', '', '핵심 기술'], ['2', '핵심', '수집', '통신'], ['3', '핵심', '수집', '기록 장치']],
    });
    const tables = layoutReportPages(model.blocks).flatMap(page => page.items).filter(item => item.kind === 'table').filter(item => item.blockIndex === index);
    expect(tables.every(table => table.widths.length === 4 && table.rows.every(row => row.lines.length === 4))).toBe(true);
    expect(JSON.stringify(worksheets)).toBe(before);
});

it('세세부기술 값이 없어도 펼친 선택을 보고서에 유지한다', () => {
    const model = buildFinalReportModel(overview, { ...empty, specDetailCollapsed: false, specFunctions: [
        { id: 'core', level: 'CORE', parentId: null, name: '핵심', technology: null },
        { id: 'sub', level: 'SUB', parentId: 'core', name: '수집', technology: '통신' },
    ] }, EMPTY_REPORT_FREE_INPUT, []);
    expect(model.blocks.find(block => block.kind === 'dataTable' && block.title === 'WS-2 AS-IS 스펙표')).toMatchObject({
        headers: ['No', '핵심기술', '세부기술', '세세부기술', '적용기술'],
    });
});

it('WS-2 세세부기술이 하나라도 있으면 빈 행과 함께 전체 열을 표시한다', () => {
    const model = buildFinalReportModel(overview, { ...empty, specFunctions: [
        { id: 'core', level: 'CORE', parentId: null, name: '핵심', technology: null },
        { id: 'sub', level: 'SUB', parentId: 'core', name: '수집', technology: '통신' },
        { id: 'detail', level: 'DETAIL', parentId: 'sub', name: '기록', technology: '기록 장치' },
    ] }, EMPTY_REPORT_FREE_INPUT, []);
    expect(model.blocks.find(block => block.kind === 'dataTable' && block.title === 'WS-2 AS-IS 스펙표')).toMatchObject({
        headers: ['No', '핵심기술', '세부기술', '세세부기술', '적용기술'],
        rows: [['1', '핵심', '수집', '', '통신'], ['2', '핵심', '수집', '기록', '기록 장치']],
    });
});

it('상세 제품설명의 첫 글머리도 제목과 분리하여 원문 전체에 단계 서식을 적용한다', () => {
    const detailedDescription = '• 첫 기능\n  - 세부 내용\n• 다음 기능';
    const model = buildFinalReportModel({ ...overview, detailedDescription }, empty, EMPTY_REPORT_FREE_INPUT, []);
    const index = model.blocks.findIndex(block => block.kind === 'paragraph' && block.text === detailedDescription);
    expect(index).toBeGreaterThan(-1);
    expect(model.blocks[index - 1]).toMatchObject({ text: '상세 제품설명', tone: 'analysis' });
    const lines = layoutReportPages(model.blocks).flatMap(page => page.items).filter(item => item.kind === 'text').filter(item => item.blockIndex === index);
    expect(lines.map(item => item.fontSize)).toEqual([11, 10, 11]);
});

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
    const funding = model.blocks.find(b => b.kind === 'dataTable' && b.headers.includes('1차년도(Y+1)'));
    expect(funding).toMatchObject({ rows: [['소요자금', '설비', '0', '', '']] });
});

it('기업명이 없을 때 프로젝트명을 기업명으로 대체하거나 미작성 결과를 만들지 않는다', () => {
    const model = buildFinalReportModel({ ...overview, companyName: null }, empty, EMPTY_REPORT_FREE_INPUT, []);
    expect(model.blocks[0]).toMatchObject({ companyName: '미입력' });
    const text = JSON.stringify(model);
    expect(text).toContain('적합도'); expect(text).toContain('미작성');
    expect(model.blocks.some(b => b.kind === 'dataTable' && b.rows.some(r => r.includes('아니요')))).toBe(false);
});

it('개요의 관련이미지 세 장을 순서대로 보고서에 넣고 기존 첫 이미지를 중복하지 않는다', () => {
    const relatedImages = [1, 2, 3].map(index => ({ dataUrl: `image-${index}`, widthPx: 800, heightPx: 600 }));
    const model = buildFinalReportModel({ ...overview, relatedImages, productImageDataUrl: 'image-1' }, empty, EMPTY_REPORT_FREE_INPUT, []);
    expect(model.blocks.filter(block => block.kind === 'image')).toMatchObject(relatedImages.map((image, index) => ({ title: `관련이미지 ${index + 1}`, pngDataUrl: image.dataUrl })));
    const cleared = buildFinalReportModel({ ...overview, relatedImages: [], productImageDataUrl: 'legacy-image' }, empty, EMPTY_REPORT_FREE_INPUT, []);
    expect(cleared.blocks.some(block => block.kind === 'image')).toBe(false);
});
