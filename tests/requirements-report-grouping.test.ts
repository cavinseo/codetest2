// WS-5 그룹 순서와 병합이 보고서 미리보기·Word에 반영되며 원본 항목을 보존하는지 검증한다.
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
import { refreshWorksheetTables } from '../lib/final-report-table-refresh';

vi.stubGlobal('Blob', Blob);

it.each(['공통 상위', null])('2차 그룹(%s) 아래 1차 그룹을 병합하고 미리보기와 Word에 항목을 모두 출력한다', async secondary => {
    const worksheets: FinalReportWorksheetData = {
        salesEstimates: [], specFunctions: [], productAttributes: [],
        requirements: [
            { id: 'a1', category: '정비', subcategory: secondary, requirement: '항목하나' },
            { id: 'c1', category: '품질', subcategory: '다른 상위', requirement: '항목둘' },
            { id: 'b1', category: '운용', subcategory: secondary, requirement: '항목셋' },
            { id: 'a2', category: '정비', subcategory: secondary, requirement: '항목넷' },
            { id: 'b2', category: '운용', subcategory: secondary, requirement: '항목다섯' },
            { id: 'a3', category: '정비', subcategory: '다른 상위', requirement: '항목여섯' },
        ],
        kanoAggregation: [], competitiveAssessment: [], improvementNeeds: [], improvementFeatures: [], techTree: [],
        targetSpecs: [], improvementDirections: [], assets: [], fundingPlans: [], fundingSources: [],
    };
    const original = structuredClone(worksheets);
    const model = buildFinalReportModel({ projectName: '제품', description: null, coachName: null, generatedAt: '2026.10.11' }, worksheets, EMPTY_REPORT_FREE_INPUT, []);
    const table = model.blocks.find((block): block is Extract<FinalReportBlock, { kind: 'dataTable' }> => block.kind === 'dataTable' && block.title === 'WS-5 고객요구사항')!;
    expect(table.mergeColumns).toEqual([3, 2]);
    expect(table.rows.map(row => row[1])).toEqual(['항목하나', '항목넷', '항목셋', '항목다섯', '항목둘', '항목여섯']);
    const blocks = [model.blocks[0], table];
    const html = renderToStaticMarkup(createElement(FinalReportPages, { blocks }));
    const document = new DOMParser().parseFromString(html, 'text/html');
    const rows = [...document.querySelectorAll('tbody tr')];
    expect(rows).toHaveLength(6);
    const cells = [...rows[0].querySelectorAll<HTMLTableCellElement>('td')];
    expect(cells[2].rowSpan).toBe(2);
    expect(cells[3].rowSpan).toBe(4);
    expect(cells[2].style.verticalAlign).toBe('middle');
    expect(cells[3].style.textAlign).toBe('center');
    expect(document.body.textContent!.match(/정비/g)).toHaveLength(2);
    expect(document.body.textContent!.match(/운용/g)).toHaveLength(1);
    const blob = await renderFinalReportDocx({ ...model, blocks });
    const zip = await JSZip.loadAsync(Buffer.from(await blob.arrayBuffer()));
    const xml = await zip.file('word/document.xml')!.async('string');
    expect(xml.match(/정비/g)).toHaveLength(2);
    expect(xml.match(/운용/g)).toHaveLength(1);
    expect(xml.match(/<w:vMerge w:val="restart"\/>/g)).toHaveLength(4);
    if (secondary) {
        expect(document.body.textContent!.match(/공통 상위/g)).toHaveLength(1);
        expect(xml.match(/공통 상위/g)).toHaveLength(1);
    }
    expect(document.body.textContent!.match(/다른 상위/g)).toHaveLength(1);
    expect(xml.match(/다른 상위/g)).toHaveLength(1);
    for (const row of original.requirements) {
        expect(document.body.textContent).toContain(row.requirement);
        expect(xml).toContain(row.requirement);
    }
    const oldTable = { ...table, rows: original.requirements.map((row, index) => [String(index + 1), row.requirement, row.category, row.subcategory ?? '']), mergeColumns: [2, 3] };
    expect(refreshWorksheetTables({ ...model, blocks: [oldTable] }, model).blocks).toEqual([table]);
    expect(worksheets).toEqual(original);
});
