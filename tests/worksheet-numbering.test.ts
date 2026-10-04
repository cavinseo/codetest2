// 자산·자금 워크시트의 새 번호와 기존 보고서의 원문 보존을 검증한다.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import JSZip from 'jszip';
import { expect, it } from 'vitest';
import { WORKSHEET_LINKS } from '../lib/worksheet-pages';
import { WORKSHEET_EXCEL_SHEETS } from '../lib/worksheet-excel-sheets';
import { ANALYSIS_WORKSHEETS } from '../lib/mentor-worksheet-analysis';
import { normalizeReportLabels } from '../lib/final-report-labels';
import { renderFinalReportDocx } from '../lib/final-report-docx';
import type { FinalReportBlock } from '../lib/final-report-document';
import FinalReportPreview from '../components/project/FinalReportPreview';

const worksheets = [
    { id: 'assets', number: 14, title: '핵심자산 및 보완자산' },
    { id: 'funding-plan', number: 15, title: '자금소요계획' },
    { id: 'funding-source', number: 16, title: '자금조달계획' },
] as const;

it('메뉴·엑셀·멘토 분석의 번호가 동일하며 기존 데이터 식별자를 유지한다', () => {
    for (const worksheet of worksheets) {
        const prefix = `WS-${worksheet.number} ${worksheet.title}`;
        expect(WORKSHEET_LINKS.find(item => item.href === worksheet.id)?.label).toContain(prefix);
        expect(WORKSHEET_EXCEL_SHEETS.find(item => item.id === worksheet.id)?.name).toContain(prefix);
        expect(ANALYSIS_WORKSHEETS[worksheet.id]).toBe(prefix);
    }
});

it.each([false, true])('저장된 보고서의 화면·Word 번호만 갱신하고 반복 적용해도 본문·금액·순서를 보존한다 (표지 %s)', async withCover => {
    const blocks: FinalReportBlock[] = withCover ? [{ kind: 'cover', title: '보고서', projectName: '검증', companyName: '회사', coachName: '멘토', outputDate: '2026.10.04' }] : [];
    for (const worksheet of worksheets) blocks.push(
        { kind: 'heading', level: 2, text: `${worksheet.title} (WS-${worksheet.number + 1})` },
        { kind: 'paragraph', tone: 'analysis', text: `WS-${worksheet.number + 1} 멘토 분석(보고)` },
        { kind: 'paragraph', text: '직접 작성한 WS-17 참조 문장은 유지한다.' },
        { kind: 'dataTable', title: `WS-${worksheet.number + 1} ${worksheet.title}`, headers: ['항목', '금액'], rows: [['WS-16 직접 입력값', '1,234.5']] },
        { kind: 'pageBreak' },
    );
    const original = JSON.stringify(blocks);
    const normalized = normalizeReportLabels(blocks);
    expect(normalizeReportLabels(normalized)).toEqual(normalized);
    expect(normalized).toHaveLength(blocks.length);
    const html = renderToStaticMarkup(React.createElement(FinalReportPreview, { blocks, readOnly: true }));
    const zip = await JSZip.loadAsync(await (await renderFinalReportDocx({ title: '보고서', fileName: '보고서.docx', blocks })).arrayBuffer());
    const xml = await zip.file('word/document.xml')!.async('string');
    for (const worksheet of worksheets) {
        expect(normalized).toContainEqual(expect.objectContaining({ kind: 'heading', text: `${worksheet.title} (WS-${worksheet.number})` }));
        expect(normalized).toContainEqual(expect.objectContaining({ kind: 'dataTable', title: `WS-${worksheet.number} ${worksheet.title}` }));
        for (const output of [html, xml]) {
            expect(output).toContain(`${worksheet.title} (WS-${worksheet.number})`);
            expect(output).toContain(`WS-${worksheet.number} 멘토 분석(보고)`);
            expect(output).not.toContain(`${worksheet.title} (WS-${worksheet.number + 1})`);
            expect(output).toContain('직접 작성한 WS-17 참조 문장은 유지한다.');
            expect(output).toContain('WS-16 직접 입력값');
            expect(output).toContain('1,234.5');
        }
    }
    expect(JSON.stringify(blocks)).toBe(original);
});
