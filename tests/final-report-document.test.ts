// 각 절의 열 의미와 순서를 고정하여 같은 이름의 원본 필드가 잘못 섞이지 않게 한다.
import { expect, it } from 'vitest';
import { buildFinalReportModel, finalReportFileName, hasProductOverviewSource, type FinalReportWorksheetData, type FinalReportFreeInput } from '../lib/final-report-document';
import type { WorksheetAnalysis } from '../lib/mentor-worksheet-analysis';

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

const build = (analysis: WorksheetAnalysis = {}) => buildFinalReportModel(overview, data, free, [], analysis);
const tables = () => build().blocks.filter(block => block.kind === 'dataTable');

it('기간별 매출과 스펙 계층, WS-11의 서로 다른 열 의미를 보존한다', () => {
    const before = JSON.stringify({ overview, data, free });
    const result = tables();
    expect(result.find(t => t.title === 'WS-1 현재 매출현황')?.rows).toEqual([['1', '현재 고객', '1,234', '현재 경쟁사']]);
    expect(result.find(t => t.title === 'WS-1 향후 1년 목표매출액')?.rows).toEqual([['1', '미래 고객', '2,345', '미래 경쟁사']]);
    expect(result.find(t => t.title === 'WS-2 AS-IS 스펙표')?.rows).toEqual([
        ['1', '핵심', '', '', '핵심 기술'], ['2', '핵심', '세부', '', '세부 기술'], ['3', '핵심', '세부', '상세', '상세 기술'],
    ]);
    expect(result.find(t => t.title === 'WS-11 고객니즈 우선순위')?.rows).toEqual([['1', '우선 니즈', '1.8', '30%']]);
    expect(result.find(t => t.title === 'WS-11 개선 기능/성능')?.rows).toEqual([['1', '추가 니즈', '신규 기능', '성능 개선']]);
    expect(JSON.stringify({ overview, data, free })).toBe(before);
});

it('속성의 혜택, 최종 스펙의 목표값·단위, 자산·자금의 원문을 누락하지 않는다', () => {
    const result = tables();
    expect(result.find(t => t.title === 'WS-3 제품속성서')?.rows).toEqual([['1', '시장', '고객', '니즈', '혜택', '속성']]);
    expect(result.find(t => t.title === 'WS-3 기술 역량')?.rows).toEqual([['역량']]);
    expect(result.find(t => t.title?.startsWith('WS-12'))?.rows).toEqual([['분류', '항목', '특성', '숨긴 단위', '숨긴 목표', '신규']]);
    expect(result.find(t => t.title?.startsWith('WS-15'))?.rows).toEqual([['핵심자산', '숨긴 분류', '특허'], ['보완자산', '인력', '채용']]);
    expect(result.find(t => t.title?.startsWith('WS-16'))?.rows).toEqual([['자금', '개발비', '1,234.5', '0', '미입력']]);
    expect(result.find(t => t.title?.startsWith('WS-17'))?.rows).toEqual([['정부', '지원\n1,234.5', '출자\n2,000', '미입력']]);
});

it('빈 워크시트도 해당 장과 미작성 안내를 남기며 진단을 임의로 채우지 않는다', () => {
    const empty = Object.fromEntries(Object.keys(data).map(key => [key, []])) as unknown as FinalReportWorksheetData;
    const result = buildFinalReportModel(overview, empty, free, []);
    expect(result.blocks[0]).toMatchObject({ kind: 'cover', title: result.title, companyName: '미입력', outputDate: overview.generatedAt });
    const text = JSON.stringify(result);
    for (const worksheet of ['WS-2', 'WS-3', 'WS-4', 'WS-5', 'WS-7', 'WS-9', 'WS-10', 'WS-11', 'WS-12', 'WS-13', 'WS-15', 'WS-16', 'WS-17']) expect(text).toContain(worksheet);
    expect(text).toContain('미작성'); expect(text).not.toContain('아니요');
});

it('Kano 요구사항 연결 실패와 순위 0을 구분한다', () => {
    const result = buildFinalReportModel(overview, { ...data, requirements: [], competitiveAssessment: data.competitiveAssessment.map(r => ({ ...r, rank: 0 })) }, free, []);
    expect(JSON.stringify(result)).toContain('요구사항 미확인');
    expect(result.blocks.find(b => b.kind === 'dataTable' && b.title === 'WS-9 경쟁적 우위요인 평가')).toMatchObject({ rows: [expect.arrayContaining(['0'])] });
});

it('8종 멘토 분석의 원문을 결과보다 앞에 배치하고 분석 입력을 변경하지 않는다', () => {
    const analysis: WorksheetAnalysis = { spec: { analysis: '기능 구성 검토' }, attributes: { analysis: '혜택과 속성 검토' }, fitness: { analysis: '적합도 검토' },
        'target-spec': { items: [{ label: '분류 / 항목', explanation: '목표 근거' }] }, 'tech-roadmap': { productName: '개선 서비스명', description: '개선 서비스 설명' },
        assets: { core: '핵심자산 검토', complementary: '보완자산 검토' }, 'funding-plan': { analysis: '소요자금 검토' }, 'funding-source': { analysis: '조달자금 검토' } };
    const before = JSON.stringify(analysis), blocks = build(analysis).blocks;
    for (const [text, title] of [['기능 구성 검토', 'WS-2 AS-IS 스펙표'], ['혜택과 속성 검토', 'WS-3 제품속성서'], ['목표 근거', 'WS-12 최종 제품/서비스 제공 스펙'], ['개선 서비스 설명', 'WS-13 향후 목표고객'], ['보완자산 검토', 'WS-15 핵심자산 및 보완자산'], ['소요자금 검토', 'WS-16 자금소요계획'], ['조달자금 검토', 'WS-17 자금조달계획']]) {
        const index = blocks.findIndex(b => b.kind === 'paragraph' && b.text.includes(text));
        expect(index).toBeGreaterThan(-1); expect(index).toBeLessThan(blocks.findIndex(b => b.kind === 'dataTable' && b.title === title));
    }
    expect(JSON.stringify(analysis)).toBe(before);
});

it('적합도 분석은 출력하지 않고 실제 워크시트 그림 원본을 보존한다', () => {
    const blocks = buildFinalReportModel(overview, data, free, [{ worksheetId: 'fitness', title: '적합도 이미지', pngDataUrl: 'fitness-image', widthPx: 100, heightPx: 100 }], { fitness: { analysis: '적합도 분석 원문' } }).blocks;
    const image = blocks.findIndex(b => b.kind === 'image' && b.pngDataUrl === 'fitness-image');
    expect(blocks.findIndex(b => b.kind === 'paragraph' && b.text === '적합도 분석 원문')).toBe(-1);
    expect(image).toBeGreaterThan(-1);
});

it('명시적으로 지운 분석은 과거 자유입력으로 복원하지 않는다', () => {
    const legacy = { ...free, finalSpecExplanation: '지운 설명', improvedProductName: '지운 이름', improvedProductDescription: '지운 제품설명' };
    const result = buildFinalReportModel(overview, data, legacy, [], { 'target-spec': { items: [] }, 'tech-roadmap': { productName: '', description: '' } });
    expect(JSON.stringify(result)).not.toContain('지운');
    const targetOnly = JSON.stringify(buildFinalReportModel(overview, data, legacy, [], { 'target-spec': { items: [] } }));
    expect(targetOnly).toContain('지운 이름'); expect(targetOnly).not.toContain('지운 설명');
});

it('최신 개요의 빈 값은 미입력으로 표시하고 구형 응답만 자유입력을 사용한다', () => {
    const legacy = { ...free, productImageDataUrl: 'stale-photo', marketDefinition: '이전 시장', targetCustomer: '이전 고객' };
    expect(hasProductOverviewSource({})).toBe(false);
    expect(hasProductOverviewSource({ productName: null })).toBe(true);
    expect(JSON.stringify(buildFinalReportModel(overview, data, legacy, []))).toContain('이전 시장');
    const model = buildFinalReportModel({ ...overview, productName: null, marketDefinition: null, targetCustomer: '현재 고객' }, data, legacy, []);
    expect(JSON.stringify(model)).toContain('현재 고객'); expect(JSON.stringify(model)).toContain('미입력');
    expect(JSON.stringify(model)).not.toContain('이전 시장'); expect(JSON.stringify(model)).not.toContain('stale-photo');
});

it.each([{ productName: '' }, { marketDefinition: '' }, { targetCustomer: '' }, { productImageDataUrl: null }, { productImageWidthPx: 96 }, { productImageHeightPx: 96 }])('개요의 명시적인 빈 항목도 원본으로 판단한다: %j', partial => {
    expect(hasProductOverviewSource(partial)).toBe(true);
});

it.each([[1920, 960, 170, 85], [960, 1920, 128.5, 257], [96, 192, 25.4, 50.8]])('제품 사진 %i × %i의 비율을 유지한다', (width, height, widthMm, heightMm) => {
    const blocks = buildFinalReportModel({ ...overview, productImageDataUrl: 'photo', productImageWidthPx: width, productImageHeightPx: height }, data, free, []).blocks;
    expect(blocks).toContainEqual({ kind: 'image', title: '제품/서비스 이미지', pngDataUrl: 'photo', landscape: false, widthMm: expect.closeTo(widthMm, 10), heightMm: expect.closeTo(heightMm, 10) });
});

it.each([[null, null], [960, null], [null, 960]])('치수 없는 사진도 유지한다: %s, %s', (width, height) => {
    expect(buildFinalReportModel(overview, data, { ...free, productImageDataUrl: 'photo', productImageWidthPx: width, productImageHeightPx: height }, []).blocks).toContainEqual({ kind: 'image', title: '제품/서비스 이미지', pngDataUrl: 'photo', landscape: false, widthMm: 120, heightMm: 80 });
});

it('파일명 금지 문자를 정리하고 길이를 제한한다', () => {
    expect(finalReportFileName('A/B\\C:D*E?F"G<H>I|J')).toBe('결과보고서_A_B_C_D_E_F_G_H_I_J.docx');
    expect(finalReportFileName('  A  B  ')).toBe('결과보고서_A B.docx');
    expect(finalReportFileName('')).toBe('결과보고서_프로젝트.docx');
    expect(finalReportFileName('X'.repeat(1000))).toBe('결과보고서_' + 'X'.repeat(60) + '.docx');
});
