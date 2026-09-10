// 각 절의 열 의미와 순서를 고정하여 같은 이름의 원본 필드가 잘못 섞이지 않게 한다.
import { expect, it } from 'vitest';
import { buildFinalReportModel, finalReportFileName, type FinalReportWorksheetData, type FinalReportBlock, type FinalReportFreeInput } from '../lib/final-report-document';

const overview = { projectName: '제품 A', description: '제품 설명', coachName: '코치', generatedAt: '2026-09-09T02:00:00Z' };
const free: FinalReportFreeInput = { productImageDataUrl: null, productImageWidthPx: null, productImageHeightPx: null, marketDefinition: '', targetCustomer: '', finalSpecExplanation: '', improvedProductName: '', improvedProductDescription: '' };
const data: FinalReportWorksheetData = {
    salesEstimates: [
        { period: 'Y_PLUS_1', customer: '미래 고객', amount: 2345, futureAmount: 999, competitor: '미래 경쟁사' },
        { period: 'Y', customer: '현재 고객', amount: 1234, futureAmount: 888, competitor: '현재 경쟁사' },
        { period: 'OTHER', customer: '제외', amount: 77, futureAmount: 66, competitor: '제외' },
    ],
    specFunctions: [
        { id: 'c', level: 'CORE', parentId: null, name: '핵심', technology: '핵심 기술' },
        { id: 's', level: 'SUB', parentId: 'c', name: '세부', technology: '세부 기술' },
        { id: 'd', level: 'DETAIL', parentId: 's', name: '상세', technology: '상세 기술' },
    ],
    productAttributes: [{ productName: '제품', customerName: '고객', marketSegment: '시장', customerNeed: '니즈', benefit: '혜택', attribute: '속성', techCapability: '역량' }],
    requirements: [{ id: 'r', category: '1차', subcategory: '2차', requirement: '고객 요구' }],
    kanoAggregation: [{ requirementId: 'r', responseCount: 8, better: 0.7, worse: -0.3, kanoWeight: 4, autoKanoWeight: 2, timkoCategory: '매력', quadrant: 'A' }],
    competitiveAssessment: [{ requirementId: 'r', requirement: '경쟁 평가 요구', weight: 4, weightPercent: 12, selfScore: 2, competitorScore: 3, planQuality: 5, improvementRate: 1.5, absoluteImportance: 6, qualityImportancePercent: 25, rank: 1 }],
    improvementNeeds: [{ content: '우선 니즈', improvementRate: '1.8', devProportion: '30%' }],
    improvementFeatures: [{ content: '추가 니즈', improvementRate: '신규 기능', devProportion: '성능 개선' }],
    techTree: [{ customerVoice: '목소리', coreSpec: '핵심 기능', subSpec: '세부 기능', techCharacteristic: '기술' }],
    targetSpecs: [{ category: '분류', subCategory: '항목', specItem: '특성', unit: '숨긴 단위', targetValue: '숨긴 목표', note: '신규' }],
    improvementDirections: [{ category: '차별화', techItem: '개선 기능', currentLevel: '구현 가능', targetLevel: '목표 고객' }],
    assets: [{ type: 'CORE', category: '숨긴 분류', content: '특허' }, { type: 'COMPLEMENTARY', category: '인력', content: '채용' }, { type: 'OTHER', category: '제외', content: '제외' }],
    fundingPlans: [{ category: '자금', item: '개발비', year1: 1234.5, year2: 0, year3: null }],
    fundingSources: [{ category: '정부', year1: '지원:1234.5', year2: '{"source":"출자","amount":"2000"}', year3: null }],
};
const heading = (text: string, level: 1 | 2 = 2): FinalReportBlock => ({ kind: 'heading', text, level });
const table = (headers: string[], rows: string[][]): FinalReportBlock => ({ kind: 'dataTable', headers, rows });
const missing: FinalReportBlock = { kind: 'paragraph', text: '그림을 캡처하지 못했습니다' };
const expected: FinalReportBlock[] = [
    heading('KS-QFD 결과보고서', 1), { kind: 'keyValueTable', rows: [{ label: '기업명', value: '제품 A' }, { label: '작성일', value: overview.generatedAt }, { label: '코치명', value: '코치' }] },
    heading('Ⅰ. 제품/서비스 개요', 1), { kind: 'keyValueTable', rows: [{ label: '제품명', value: '제품 A' }, { label: '제품설명', value: '제품 설명' }] },
    heading('매출처별 매출 현황'), table(['매출처', '매출액', '경쟁사명'], [['현재 고객', '1,234', '현재 경쟁사']]),
    heading('향후 1년 목표매출액'), table(['매출처', '매출액', '경쟁사명'], [['미래 고객', '2,345', '미래 경쟁사']]),
    heading('Ⅱ. 제품/서비스 속성 분석', 1),
    heading('(AS-IS) 스펙표'), table(['핵심스펙', '세부스펙', '기술적특성'], [['핵심', '', '핵심 기술'], ['핵심', '세부', '세부 기술'], ['핵심', '세부 > 상세', '상세 기술']]),
    heading('제품속성서'), table(['제품명', '고객명', '세분시장', '니즈', '혜택', '속성', '기술역량'], [['제품', '고객', '시장', '니즈', '혜택', '속성', '역량']]),
    heading('제품/서비스 속성 적합도'), missing,
    heading('Ⅲ. 고객수요 및 기술 분석', 1),
    heading('고객요구사항 도출표'), table(['번호', '1차 그룹', '2차 그룹', '항목'], [['1', '1차', '2차', '고객 요구']]),
    heading('Kano 집계표'), table(['항목', '만족계수', '불만족계수', '품질', '가중치'], [['고객 요구', '0.7', '-0.3', '매력', '4']]),
    heading('Kano 2D 산점도'), missing,
    heading('Competitive Assessment'), table(['항목', '가중치', '가중치 백분율', '자사', '경쟁사', '기획품질', '수준향상율', '절대중요도', '요구품질중요도%', 'RANK'], [['경쟁 평가 요구', '4', '12', '2', '3', '5', '1.5', '6', '25', '1']]),
    heading('개선포인트점수 기반 고객니즈 우선순위'), table(['고객니즈', '경쟁사대비 수준향상율', '개발향상비중'], [['우선 니즈', '1.8', '30%']]),
    heading('Engineering Metrics: 기술요구사항 도출'), table(['고객의소리', '핵심스펙', '세부스펙', '기술적특성'], [['목소리', '핵심 기능', '세부 기능', '기술']]),
    heading('고객수요기반 기술스펙 관계도'), missing,
    heading('개선포인트기반 개선 기능/성능 List'), table(['개선포인트 우선순위(고객니즈)', '추가 기능', '성능향상'], [['추가 니즈', '신규 기능', '성능 개선']]),
    heading('Ⅳ. 최종 개선 방향', 1),
    heading('최종 제품/서비스 제공 스펙 List'), table(['스펙분류', '세부항목', '기술적특성', '개선여부'], [['분류', '항목', '특성', '신규']]),
    heading('핵심자산 도출표'), table(['핵심자산'], [['특허']]),
    heading('보완자산 도출표'), table(['필요항목', '해결방안'], [['인력', '채용']]),
    heading('KS-QFD 개선 방향성'), table(['순위', '개선 방향(차별화)', '개선기능 및 성능향상', '구현가능성', '목표 고객'], [['1', '차별화', '개선 기능', '구현 가능', '목표 고객']]),
    heading('Ⅴ. 자금 계획', 1),
    heading('자금소요계획표'), table(['구분', '항목', '1차년도', '2차년도', '3차년도'], [['자금', '개발비', '1,234.5', '0', '']]),
    heading('자금조달계획표'), table(['구분', '1차년도 출처', '1차년도 금액', '2차년도 출처', '2차년도 금액', '3차년도 출처', '3차년도 금액'], [['정부', '지원', '1,234.5', '출자', '2,000', '', '']]),
];

it('maps every DB section, original field meaning, row order and caller time exactly', () => {
    const before = JSON.stringify({ overview, data, free });
    expect(buildFinalReportModel(overview, data, free, [])).toEqual({ title: 'KS-QFD 결과보고서', fileName: '결과보고서_제품 A.docx', blocks: expected });
    expect(JSON.stringify({ overview, data, free })).toBe(before);
});

it('puts the report title in the first visible heading', () => {
    const report = buildFinalReportModel(overview, data, free, []);
    expect(report.blocks[0]).toEqual({ kind: 'heading', level: 1, text: report.title });
    expect(report.blocks[0]).not.toEqual({ kind: 'heading', level: 1, text: '표지' });
});

it('keeps every empty section and missing capture placeholder', () => {
    const empty = Object.fromEntries(Object.keys(data).map(key => [key, []])) as unknown as FinalReportWorksheetData;
    const model = buildFinalReportModel({ ...overview, description: null, coachName: null }, empty, free, []);
    const blocks = expected.map(block => block.kind === 'dataTable' ? { kind: 'paragraph', text: '입력된 데이터가 없습니다' } : block);
    blocks[1] = { kind: 'keyValueTable', rows: [{ label: '기업명', value: '제품 A' }, { label: '작성일', value: overview.generatedAt }, { label: '코치명', value: '미배정' }] };
    blocks[3] = { kind: 'keyValueTable', rows: [{ label: '제품명', value: '제품 A' }, { label: '제품설명', value: '' }] };
    expect(model.blocks).toEqual(blocks);
});

it('uses a visible fallback when a Kano requirement cannot be joined and preserves zero rank', () => {
    const model = buildFinalReportModel(overview, { ...data, requirements: [{ id: 'other', category: '다른 그룹', subcategory: null, requirement: '다른 요구사항' }], competitiveAssessment: data.competitiveAssessment.map(r => ({ ...r, rank: 0 })) }, free, []);
    expect(model.blocks).toContainEqual(table(['항목', '만족계수', '불만족계수', '품질', '가중치'], [['요구사항 미확인', '0.7', '-0.3', '매력', '4']]));
    const tables = model.blocks.filter(b => b.kind === 'dataTable');
    expect(tables.find(t => t.headers.includes('RANK'))?.rows[0].at(-1)).toBe('0');
});

it('leaves nullable cells blank without interpreting target values as improvement status', () => {
    const nullable = { ...data,
        productAttributes: [{ productName: null, customerName: null, marketSegment: null, customerNeed: null, benefit: null, attribute: null, techCapability: null }],
        targetSpecs: [{ category: null, subCategory: null, specItem: null, unit: 'unit', targetValue: 'target', note: null }],
        competitiveAssessment: data.competitiveAssessment.map(r => ({ ...r, rank: null })),
    };
    const tables = buildFinalReportModel(overview, nullable, free, []).blocks.filter(b => b.kind === 'dataTable');
    expect(tables.find(t => t.headers.includes('기술역량'))?.rows).toEqual([['', '', '', '', '', '', '']]);
    expect(tables.find(t => t.headers.includes('개선여부'))?.rows).toEqual([['', '', '', '']]);
    expect(tables.find(t => t.headers.includes('RANK'))?.rows[0].at(-1)).toBe('');
});

it('inserts free prose only where supplied and retains capture dimensions and titles', () => {
    const input = { productImageWidthPx: null, productImageHeightPx: null, productImageDataUrl: 'data:image/png;base64,photo', marketDefinition: '시장 설명', targetCustomer: '고객 설명', finalSpecExplanation: '최종 설명', improvedProductName: '새 이름', improvedProductDescription: '새 설명' };
    const images = [
        { worksheetId: 'qfd' as const, title: 'QFD 그림', pngDataUrl: 'qfd-png', widthPx: 1920, heightPx: 960 },
        { worksheetId: 'fitness' as const, title: '적합도 그림', pngDataUrl: 'fitness-png', widthPx: 96, heightPx: 192 },
        { worksheetId: 'kano-aggregation' as const, title: 'Kano 그림', pngDataUrl: 'kano-png', widthPx: 960, heightPx: 960 },
    ];
    const blocks = buildFinalReportModel(overview, data, input, images).blocks;
    const expanded = [...expected];
    expanded.splice(4, 0, heading('제품/서비스 이미지'), { kind: 'image', title: '제품/서비스 이미지', pngDataUrl: input.productImageDataUrl, widthMm: 120, heightMm: 80, landscape: false }, heading('시장정의'), { kind: 'paragraph', text: '시장 설명' }, heading('목표고객'), { kind: 'paragraph', text: '고객 설명' });
    let index = expanded.findIndex(b => b.kind === 'heading' && b.text === '최종 제품/서비스 제공 스펙 List');
    expanded.splice(index, 0, heading('최종 목표 스펙 항목별 설명'), { kind: 'paragraph', text: '최종 설명' });
    index = expanded.findIndex(b => b.kind === 'heading' && b.text === 'KS-QFD 개선 방향성');
    expanded.splice(index, 0, heading('개선 제품명'), { kind: 'paragraph', text: '새 이름' }, heading('개선 제품설명'), { kind: 'paragraph', text: '새 설명' });
    const captureBlocks = [
        { kind: 'image', title: '적합도 그림', pngDataUrl: 'fitness-png', widthMm: expect.closeTo(25.4, 10), heightMm: expect.closeTo(50.8, 10), landscape: false },
        { kind: 'image', title: 'Kano 그림', pngDataUrl: 'kano-png', widthMm: 170, heightMm: 170, landscape: false },
        { kind: 'image', title: 'QFD 그림', pngDataUrl: 'qfd-png', widthMm: 257, heightMm: 128.5, landscape: true },
    ];
    expect(blocks).toEqual(expanded.map(b => b === missing ? captureBlocks.shift() : b));
});

it('omits whitespace-only free text and preserves a deliberately blank coach name', () => {
    const model = buildFinalReportModel({ ...overview, coachName: '' }, data, { ...free, marketDefinition: '   ', targetCustomer: '\n', finalSpecExplanation: '\t', improvedProductName: '', improvedProductDescription: ' ' }, []);
    expect(model.blocks.filter(b => b.kind === 'paragraph')).toEqual([missing, missing, missing]);
    expect(model.blocks[1]).toEqual({ kind: 'keyValueTable', rows: [{ label: '기업명', value: '제품 A' }, { label: '작성일', value: overview.generatedAt }, { label: '코치명', value: '' }] });
});

it('cleans filenames with the survey stem policy', () => {
    expect(finalReportFileName('A/B\\C:D*E?F"G<H>I|J')).toBe('결과보고서_A_B_C_D_E_F_G_H_I_J.docx');
    expect(finalReportFileName('  A  B  ')).toBe('결과보고서_A B.docx');
    expect(finalReportFileName('')).toBe('결과보고서_프로젝트.docx');
    expect(finalReportFileName(' '.repeat(3))).toBe('결과보고서_프로젝트.docx');
    expect(finalReportFileName('X'.repeat(1000))).toBe('결과보고서_' + 'X'.repeat(60) + '.docx');
});

it.each([
    [1920, 960, 170, 85],
    [960, 1920, 128.5, 257],
    [96, 192, 25.4, 50.8],
])('preserves product image aspect ratio for %i by %i pixels', (width, height, widthMm, heightMm) => {
    const input = { ...free, productImageDataUrl: 'photo', productImageWidthPx: width, productImageHeightPx: height };
    expect(buildFinalReportModel(overview, data, input, []).blocks).toContainEqual({
        kind: 'image', title: '제품/서비스 이미지', pngDataUrl: 'photo', landscape: false,
        widthMm: expect.closeTo(widthMm, 10), heightMm: expect.closeTo(heightMm, 10),
    });
});

it.each([[null, null], [960, null], [null, 960]])('uses the product image fallback for dimensions %s, %s', (width, height) => {
    const input = { ...free, productImageDataUrl: 'photo', productImageWidthPx: width, productImageHeightPx: height };
    expect(buildFinalReportModel(overview, data, input, []).blocks).toContainEqual({
        kind: 'image', title: '제품/서비스 이미지', pngDataUrl: 'photo', landscape: false, widthMm: 120, heightMm: 80,
    });
});
