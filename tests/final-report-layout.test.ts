// 긴 본문·표 분할의 누락과 출력일·페이지 경계 불일치를 검증한다.
import { expect, it } from 'vitest';
import JSZip from 'jszip';
import { layoutReportPages, reportOutputDate, withReportOutputDate, REPORT_PAPER } from '../lib/final-report-layout';
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

it('표 열 너비의 개수와 형식을 저장 시 검증한다', () => {
    const table: FinalReportBlock = { kind: 'dataTable', title: 'WS-2', headers: ['A', 'B'], rows: [['가', '나']], columnWidths: [1, 2] };
    expect(reportDocumentSchema.safeParse(model([cover, { kind: 'pageBreak' }, table])).success).toBe(true);
    expect(reportDocumentSchema.safeParse(model([{ ...table, columnWidths: [1] }])).success).toBe(false);
    expect(reportDocumentSchema.safeParse(model([{ ...table, columnWidths: [0, 2] }])).success).toBe(false);
});

it('Word는 미리보기와 같은 페이지 수·반복 머리글·행 내용을 출력한다', async () => {
    const document = model([cover, { kind: 'heading', text: 'Ⅰ. 제품 정의', level: 1 }, { kind: 'dataTable', headers: ['항목', '설명'], rows: Array.from({ length: 90 }, (_, i) => [`항목-${i}`, `설명-${i}`]) }]);
    const zip = await JSZip.loadAsync(await (await renderFinalReportDocx(document)).arrayBuffer());
    const xml = await zip.file('word/document.xml')!.async('string');
    expect(xml.match(/<w:sectPr>/g)).toHaveLength(layoutReportPages(document.blocks).length);
    expect(xml).toContain(reportOutputDate()); expect(xml).not.toContain('2020.01.01');
    expect(xml).toContain('기업명: 기업'); expect(xml).toContain('코치명: 멘토');
    expect(xml.match(/<w:tblHeader\/>/g)!.length).toBeGreaterThan(1);
    for (let i = 0; i < 90; i++) { expect(xml).toContain(`항목-${i}`); expect(xml).toContain(`설명-${i}`); }
});
