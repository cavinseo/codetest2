// 세분시장 단위 고객명이 WS-4 적합도·보고서·엑셀 업로드·AI 초안으로 이어져도 값이 보존되는지 검증한다.
// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import FitnessMatrix from '../components/project/FitnessMatrix';
import { buildAttributeDraftPrompts } from '../lib/ai/prompts';
import { buildFinalReportModel, type FinalReportWorksheetData } from '../lib/final-report-document';
import { EMPTY_REPORT_FREE_INPUT } from '../lib/final-report-payload';
import { parseWorkbookImport } from '../lib/workbook-importer';

const attribute = { id: 'a1', attribute: '정확도', marketSegment: '제조', customerName: '갑, 을', order: 0 };

async function subSegmentNames(attributes: unknown[], subSegments: Array<{ id: string; name: string }> | null) {
    const fitnessMatrix = subSegments && {
        marketsJson: JSON.stringify([{ id: 'm1', name: '제조', subSegments }]),
        matrixJson: JSON.stringify({ a1: { m1: { s1: 'H' } } }),
        managerComment: '', consultantNote: '',
    };
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(
        url.endsWith('/attributes') ? { attributes } : { fitnessMatrix }
    ))));
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(createElement(FitnessMatrix, { projectId: 'project' })));
    const names = [...container.querySelectorAll<HTMLInputElement>('thead input')].map(input => input.value);
    await act(async () => root.unmount());
    container.remove();
    return names;
}

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

it('WS-4 는 합쳐 저장된 고객명을 고객별 세분화 열로 나눈다', async () => {
    const names = await subSegmentNames([attribute], null);
    expect(names).toEqual(expect.arrayContaining(['갑', '을']));
    expect(names).not.toContain('갑, 을');
});

it('WS-4 에 평가가 저장된 고객명 열은 유지하고 새 고객명만 추가한다', async () => {
    const names = await subSegmentNames([attribute], [{ id: 's1', name: '갑' }]);
    expect(names).toEqual(expect.arrayContaining(['갑', '을']));
    expect(names.filter(name => name === '갑')).toHaveLength(1);
});

it('WS-4 에 "갑, 을" 한 칸으로 평가된 기존 열이 있으면 빈 열을 새로 만들지 않는다', async () => {
    const names = await subSegmentNames([attribute], [{ id: 's1', name: '갑, 을' }]);
    expect(names).toContain('갑, 을');
    expect(names).not.toContain('갑');
    expect(names).not.toContain('을');
});

it('보고서는 아직 저장 전인 고객명별 행도 WS-3 화면과 같이 세분시장 단위로 표기한다', () => {
    const empty: FinalReportWorksheetData = {
        salesEstimates: [], specFunctions: [], productAttributes: [], requirements: [], kanoAggregation: [],
        competitiveAssessment: [], improvementNeeds: [], improvementFeatures: [], techTree: [], targetSpecs: [],
        improvementDirections: [], assets: [], fundingPlans: [], fundingSources: [],
    };
    const base = { productName: '장비', marketSegment: '제조', techCapability: null };
    const model = buildFinalReportModel(
        { projectName: '장비', companyName: '회사', description: '', detailedDescription: '', coachName: '', generatedAt: '2026.11.07' },
        { ...empty, productAttributes: [
            { ...base, customerName: '갑', customerNeed: '니즈1', benefit: '혜택1', attribute: '속성1' },
            { ...base, customerName: '을', customerNeed: '니즈1', benefit: '혜택1', attribute: '속성1' },
            { ...base, customerName: '을', customerNeed: '니즈2', benefit: '혜택2', attribute: '속성2' },
        ] },
        EMPTY_REPORT_FREE_INPUT,
        [],
    );
    expect(model.blocks.find(block => block.kind === 'dataTable' && block.title === 'WS-3 제품속성서')).toMatchObject({
        rows: [
            ['1', '제조', '갑, 을', '니즈1', '혜택1', '속성1'],
            ['2', '제조', '갑, 을', '니즈2', '혜택2', '속성2'],
        ],
    });
});

it('엑셀 업로드는 한 칸의 여러 고객명과 예전 형식의 고객명별 행을 그대로 받는다', () => {
    const data = [
        ['제품명', '고객명', '세분시장', '고객 니즈', '제공혜택', '제품속성', '기술 역량'],
        ['제품', '갑, 을', '제조', '니즈1', '혜택1', '속성1', ''],
        ['제품', '병', '제조', '니즈2', '혜택2', '속성2', ''],
    ];
    const result = parseWorkbookImport({
        fileName: 'upload.xlsx', fileSize: 1, parseErrors: [],
        sheets: [{ name: '제품속성표', data, rowCount: data.length, colCount: 7 }],
    }, { sheetNames: ['제품속성표'] });
    expect(result.records.productAttributes.map(row => row.customerName)).toEqual(['갑, 을', '병']);
});

it('AI 초안 프롬프트는 고객마다 행을 나누지 말고 세분시장 단위로 쓰라고 지시한다', () => {
    const { system } = buildAttributeDraftPrompts({ project: { name: '제품' }, answers: {} } as never);
    expect(system).toContain('고객마다 행을 나누지 말고');
    expect(system).toContain('세분시장 단위');
});
