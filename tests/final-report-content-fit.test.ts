// 보고서의 긴 행·병합 셀·워크시트 사이 공백과 내용 보존을 검증한다.
import { expect, it } from 'vitest';
import { layoutReportPages, REPORT_PAPER } from '../lib/final-report-layout';
import { getTableMergeSpans } from '../lib/final-report-table-merge';
import type { FinalReportBlock } from '../lib/final-report-document';
import JSZip from 'jszip';
import { renderTemplateReportDocx } from '../lib/final-report-template-docx';

const tables = (blocks: FinalReportBlock[]) => layoutReportPages(blocks).flatMap(page => page.items).filter(item => item.kind === 'table');

it('긴 다음 행도 현재 페이지에 남은 공간부터 사용하고 원문을 보존한다', () => {
    const rows = [['첫 행', Array(28).fill('첫 설명').join('\n')], ['둘째 행', Array(38).fill('둘째 설명').join('\n')]];
    const result = tables([{ kind: 'dataTable', headers: ['항목', '설명'], rows }]);
    expect(result[0].rows.map(row => row.index)).toContain(1);
    expect(REPORT_PAPER.bottom - result[0].top - result[0].height).toBeLessThan(30);
    rows.forEach((cells, index) => cells.forEach((cell, col) => {
        expect(result.flatMap(table => table.rows.filter(row => row.index === index).flatMap(row => row.lines[col])).join('\n')).toBe(cell);
    }));
});

it('긴 공통 분류는 병합 셀 높이에 한 번만 반영하고 모든 세부 항목을 보존한다', () => {
    const category = '자동화 설비의 판재를 검사하고 가공 상태를 확인하는 핵심 기능 '.repeat(5);
    const block: FinalReportBlock = { kind: 'dataTable', headers: ['분류', '세부 항목'], columnWidths: [1, 3], mergeColumns: [0], rows: Array.from({ length: 8 }, (_, index) => [category, `세부 기능 ${index + 1}`]) };
    const result = tables([block]);
    expect(result).toHaveLength(1);
    expect(result[0].height).toBeLessThan(350);
    expect(getTableMergeSpans(result[0], block)[0][0]).toBe(8);
    expect(result[0].rows[0].lines[0].join('')).toBe(category);
    expect(result[0].rows.flatMap(row => row.lines[1])).toEqual(block.rows.map(row => row[1]));
    const spanHeight = result[0].rows.reduce((height, row) => height + row.height, 0);
    expect(spanHeight).toBeGreaterThanOrEqual(result[0].rows[0].lines[0].length * result[0].lineHeight + 13);
});

it('저장된 보고서의 워크시트 사이 강제 나눔은 남은 공간을 쓰되 장 구분은 유지한다', () => {
    const pages = layoutReportPages([
        { kind: 'heading', level: 1, text: 'Ⅱ. 제품 진단' },
        { kind: 'paragraph', text: '첫 워크시트 내용' },
        { kind: 'pageBreak' }, { kind: 'heading', level: 2, text: '제품속성표 (WS-3)' },
        { kind: 'paragraph', text: '두 번째 워크시트 내용' },
        { kind: 'pageBreak' }, { kind: 'heading', level: 1, text: 'Ⅲ. 제품 스펙' },
    ]);
    expect(pages).toHaveLength(2);
    expect(pages[0].items.some(item => item.blockIndex === 4)).toBe(true);
    expect(pages[1].items[0].blockIndex).toBe(6);
});

it('페이지를 넘긴 병합 분류도 줄바꿈을 유지하고 모든 세부 설명을 이어 표시한다', async () => {
    const category = '여러 단계에 걸쳐 투입 판재의 상태를 확인하는 핵심 분류 '.repeat(4);
    const block: FinalReportBlock = { kind: 'dataTable', headers: ['분류', '설명'], columnWidths: [1, 3], mergeColumns: [0], rows: Array.from({ length: 12 }, (_, index) => [category, `기능 ${index + 1}의 세부 설명 `.repeat(50)]) };
    const result = tables([block]);
    expect(result.length).toBeGreaterThan(2);
    for (const table of result) {
        expect(table.rows.length).toBeGreaterThan(0);
        expect(table.rows[0].lines[0].join('')).toBe(category);
        expect(table.rows[0].lines[0].length).toBeGreaterThan(1);
        expect(table.top + table.height).toBeLessThanOrEqual(REPORT_PAPER.bottom + .01);
        const spans = getTableMergeSpans(table, block);
        table.rows.forEach((row, index) => row.lines.forEach((lines, column) => {
            const cellHeight = table.rows.slice(index, index + spans[index][column]).reduce((sum, part) => sum + part.height, 0);
            if (spans[index][column]) expect(cellHeight + .01).toBeGreaterThanOrEqual(lines.length * table.lineHeight + 13);
        }));
    }
    block.rows.forEach((row, index) => expect(result.flatMap(table => table.rows.filter(part => part.index === index).flatMap(part => part.lines[1])).join('')).toBe(row[1]));
    const zip = await JSZip.loadAsync(await (await renderTemplateReportDocx({ title: '표 분할', fileName: '표.docx', blocks: [block] })).arrayBuffer());
    const xml = await zip.file('word/document.xml')!.async('string');
    expect(xml).toContain('w:hRule="atLeast"');
    expect(xml).not.toContain(category);
});

it('한 페이지보다 긴 일반 표 머리글과 병합 분류도 멈추거나 잘리지 않는다', () => {
    const heading = '긴 머리글 '.repeat(1400);
    const category = '긴 분류 '.repeat(1200);
    const result = tables([{ kind: 'dataTable', headers: [heading, '설명'], columnWidths: [1, 2], mergeColumns: [0], rows: [[category, '첫 내용'], [category, '둘째 내용']] }]);
    expect(result.flatMap(table => table.rows.filter(row => row.index === -1).flatMap(row => row.lines[0])).join('')).toBe(heading);
    for (const index of [0, 1]) expect(result.flatMap(table => table.rows.filter(row => row.index === index).flatMap(row => row.lines[0])).join('')).toBe(category);
    for (const table of result) expect(table.top + table.height).toBeLessThanOrEqual(REPORT_PAPER.bottom + .01);
});
