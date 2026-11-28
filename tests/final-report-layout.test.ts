// 긴 본문·표 분할의 누락과 출력일·페이지 경계 불일치를 검증한다.
import { expect, it } from 'vitest';
import JSZip from 'jszip';
import { layoutReportPages, reportOutputDate, withReportOutputDate, REPORT_PAPER } from '../lib/final-report-layout';
import { getTableMergeSpans } from '../lib/final-report-table-merge';
import { renderFinalReportDocx } from '../lib/final-report-docx';
import { reportDocumentSchema } from '../lib/final-report-payload';
import type { FinalReportBlock, FinalReportModel } from '../lib/final-report-document';

const cover: FinalReportBlock = { kind: 'cover', title: '보고서', projectName: '분석 장비', companyName: '기업', coachName: '멘토', outputDate: '2020.01.01' };
const model = (blocks: FinalReportBlock[]): FinalReportModel => ({ title: '보고서', fileName: '보고서.docx', blocks });

it('작성일은 한국 날짜 기준으로 출력할 때 갱신하고 저장 모델을 바꾸지 않는다', () => {
    expect(reportOutputDate(new Date('2026-09-28T15:00:00Z'))).toBe('2026.09.29');
    expect(reportOutputDate(new Date('2026-09-28T14:59:59Z'))).toBe('2026.09.28');
    const saved = model([cover]);
    expect(withReportOutputDate(saved, new Date('2026-09-28T15:00:00Z')).blocks[0]).toMatchObject({ outputDate: '2026.09.29' });
    expect(saved.blocks[0]).toEqual(cover);
});

it('긴 표는 머리글을 반복하고 행과 본문을 빠짐없이 분할한다', () => {
    const prose = '한글 설명 및 기술 분석. '.repeat(1000);
    const rows = Array.from({ length: 65 }, (_, i) => [`항목 ${i + 1}`, `고객니즈 ${i + 1}의 세부 설명. `.repeat(i === 17 ? 400 : 4)]);
    const pages = layoutReportPages([cover, { kind: 'paragraph', text: prose }, { kind: 'dataTable', headers: ['항목', '설명'], rows, columnWidths: [80, 431] }]);
    expect(pages[0].cover).toEqual(cover);
    const items = pages.flatMap(page => page.items);
    expect(items.filter(item => item.kind === 'text').flatMap(item => item.lines).join('')).toBe(prose);
    const tables = items.filter(item => item.kind === 'table');
    expect(tables.length).toBeGreaterThan(2);
    expect(tables.every(table => table.headers[0].join('') === '항목')).toBe(true);
    for (const [index, row] of rows.entries()) {
        for (let col = 0; col < row.length; col++) expect(tables.flatMap(t => t.rows.filter(r => r.index === index)).flatMap(r => r.lines[col]).join('')).toBe(row[col]);
    }
    for (const page of pages) {
        let bottom = REPORT_PAPER.top;
        for (const item of page.items) {
            expect(item.top).toBeGreaterThanOrEqual(bottom);
            bottom = item.top + item.height;
            expect(bottom).toBeLessThanOrEqual(REPORT_PAPER.bottom + .01);
        }
    }
});

it('그룹 열의 연속 중복값만 페이지 안에서 병합하고 상위 그룹 경계를 지킨다', () => {
    const block: FinalReportBlock = { kind: 'dataTable', headers: ['No', '항목', '1차 그룹', '2차 그룹'], mergeColumns: [2, 3], rows: [
        ['1', '첫째', '가', '공통'], ['2', '둘째', '가', '공통'], ['3', '셋째', '나', '공통'],
        ['4', '넷째', '나', '공통'], ['5', '다섯째', '나', ''], ['6', '여섯째', '나', ''],
    ] };
    const table = layoutReportPages([block])[0].items.find(item => item.kind === 'table');
    expect(table?.kind).toBe('table');
    if (!table || table.kind !== 'table') return;
    expect(getTableMergeSpans(table, block)).toEqual([
        [1, 1, 2, 2], [1, 1, 0, 0], [1, 1, 4, 2], [1, 1, 0, 0],
        [1, 1, 0, 1], [1, 1, 0, 1],
    ]);
});

it('여러 페이지에 걸친 그룹은 각 페이지의 표 안에서만 병합한다', () => {
    const block: FinalReportBlock = { kind: 'dataTable', headers: ['No', '1차 그룹'], mergeColumns: [1], rows:
        Array.from({ length: 45 }, (_, index) => [String(index + 1), '같은 그룹']) };
    const tables = layoutReportPages([block]).flatMap(page => page.items).filter(item => item.kind === 'table');
    expect(tables.length).toBeGreaterThan(1);
    for (const table of tables) {
        const spans = getTableMergeSpans(table, block);
        expect(spans[0][1]).toBe(table.rows.length);
        expect(spans.slice(1).every(row => row[1] === 0)).toBe(true);
    }
});

it('Word 병합 셀은 한 번만 표시하고 수직·수평 가운데 정렬한다', async () => {
    const table: FinalReportBlock = { kind: 'dataTable', headers: ['항목', '1차 그룹'], mergeColumns: [1], rows: [
        ['첫째', '공통'], ['둘째', '공통'], ['셋째', '다름'],
    ] };
    const zip = await JSZip.loadAsync(await (await renderFinalReportDocx(model([cover, table]))).arrayBuffer());
    const xml = await zip.file('word/document.xml')!.async('string');
    expect(xml.match(/<w:vMerge w:val="restart"\/>/g)).toHaveLength(1);
    expect(xml.match(/<w:vMerge w:val="continue"\/>/g)).toHaveLength(1);
    expect(xml.match(/공통/g)).toHaveLength(1);
    expect(xml).toContain('<w:vAlign w:val="center"/>');
});

it('표 열 너비의 개수와 형식을 저장 시 검증한다', () => {
    const table: FinalReportBlock = { kind: 'dataTable', title: 'WS-2', headers: ['A', 'B'], rows: [['가', '나']], columnWidths: [1, 2] };
    expect(reportDocumentSchema.safeParse(model([cover, { kind: 'pageBreak' }, table])).success).toBe(true);
    expect(reportDocumentSchema.safeParse(model([{ ...table, mergeColumns: [1] }])).success).toBe(true);
    expect(reportDocumentSchema.safeParse(model([{ ...table, mergeColumns: [2] }])).success).toBe(false);
    expect(reportDocumentSchema.safeParse(model([{ ...table, columnWidths: [1] }])).success).toBe(false);
    expect(reportDocumentSchema.safeParse(model([{ ...table, columnWidths: [0, 2] }])).success).toBe(false);
});

it('Word는 워크시트 표를 하나의 연속된 표로 출력하고 반복 머리글과 모든 행을 보존한다', async () => {
    const document = model([cover, { kind: 'heading', text: 'Ⅰ. 제품 정의', level: 1 }, { kind: 'dataTable', headers: ['항목', '설명'], rows: Array.from({ length: 90 }, (_, i) => [`항목-${i}`, `설명-${i}`]) }]);
    const zip = await JSZip.loadAsync(await (await renderFinalReportDocx(document)).arrayBuffer());
    const xml = await zip.file('word/document.xml')!.async('string');
    expect(xml.match(/<w:tbl>/g)).toHaveLength(2); // 장 제목 박스 하나와 연속 워크시트 표 하나.
    expect(xml).toContain(reportOutputDate()); expect(xml).not.toContain('2020.01.01');
    expect(xml).toContain('기업명: 기업'); expect(xml).toContain('코치명: 멘토');
    expect(xml.match(/<w:tblHeader\/>/g)).toHaveLength(1);
    for (let i = 0; i < 90; i++) { expect(xml).toContain(`항목-${i}`); expect(xml).toContain(`설명-${i}`); }
});
