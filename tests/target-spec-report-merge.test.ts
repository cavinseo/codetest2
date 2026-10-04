// WS-12 그룹 병합이 결과보고서 미리보기와 Word 출력에서 같은 행 내용을 보존하는지 검증한다.
// @vitest-environment jsdom
import { Blob } from 'node:buffer';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import JSZip from 'jszip';
import { expect, it, vi } from 'vitest';
import FinalReportPages from '../components/project/FinalReportPages';
import { buildFinalReportModel, type FinalReportBlock, type FinalReportWorksheetData } from '../lib/final-report-document';
import { EMPTY_REPORT_FREE_INPUT } from '../lib/final-report-payload';
import { renderFinalReportDocx } from '../lib/final-report-docx';

vi.stubGlobal('Blob', Blob);

it('스펙분류와 세부항목을 한 번씩 병합해 출력하고 작성 화면의 기술적 특성·개선여부를 보존한다', async () => {
    const worksheets: FinalReportWorksheetData = {
        salesEstimates: [], specFunctions: [], productAttributes: [], requirements: [], kanoAggregation: [],
        competitiveAssessment: [], improvementNeeds: [], improvementFeatures: [], techTree: [],
        targetSpecs: [
            { category: '구동분류', subCategory: '공통세부', specItem: '기술하나', unit: 'ms', targetValue: '10', note: '유지' },
            { category: '구동분류', subCategory: '공통세부', specItem: '기술둘', unit: 'ms', targetValue: '20', note: '신규' },
            { category: '구동분류', subCategory: '다른세부', specItem: '기술셋', unit: null, targetValue: null, note: '개선' },
            { category: '측정분류', subCategory: '공통세부', specItem: '기술넷', unit: null, targetValue: null, note: '유지' },
        ],
        improvementDirections: [], assets: [], fundingPlans: [], fundingSources: [],
    };
    const original = structuredClone(worksheets);
    const model = buildFinalReportModel({ projectName: '제품', description: null, coachName: null, generatedAt: '2026.10.03' }, worksheets, EMPTY_REPORT_FREE_INPUT, []);
    const table = model.blocks.find((block): block is Extract<FinalReportBlock, { kind: 'dataTable' }> => block.kind === 'dataTable' && block.title?.startsWith('WS-12') === true)!;
    expect(table.mergeColumns).toEqual([0, 1]);
    expect(table.headers).toEqual(['스펙분류', '세부항목', '기술적 특성', '개선여부']);
    expect(table.rows).toHaveLength(4);
    const blocks = [model.blocks[0], table];
    const html = renderToStaticMarkup(createElement(FinalReportPages, { blocks }));
    const document = new DOMParser().parseFromString(html, 'text/html');
    const rows = [...document.querySelectorAll('tbody tr')];
    expect(rows[0].querySelectorAll<HTMLTableCellElement>('td[rowspan]')[0].rowSpan).toBe(3);
    expect(rows[0].querySelectorAll<HTMLTableCellElement>('td[rowspan]')[1].rowSpan).toBe(2);
    expect(document.body.textContent!.match(/구동분류/g)).toHaveLength(1);
    expect(document.body.textContent!.match(/공통세부/g)).toHaveLength(2);
    const blob = await renderFinalReportDocx({ ...model, blocks });
    const zip = await JSZip.loadAsync(Buffer.from(await blob.arrayBuffer()));
    const xml = await zip.file('word/document.xml')!.async('string');
    expect(xml.match(/구동분류/g)).toHaveLength(1);
    expect(xml.match(/공통세부/g)).toHaveLength(2);
    expect(xml.match(/<w:vMerge w:val="restart"\/>/g)).toHaveLength(2);
    for (const text of ['기술하나', '기술둘', '기술셋', '기술넷', '신규']) {
        expect(document.body.textContent).toContain(text);
        expect(xml).toContain(text);
    }
    expect(worksheets).toEqual(original);
});
