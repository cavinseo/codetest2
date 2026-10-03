// 개요의 추가 시장 자료가 보고서 끝의 박스와 Word·PDF 페이지에 보존되는지 검증한다.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import JSZip from 'jszip';
import { expect, it } from 'vitest';
import FinalReportPages from '../components/project/FinalReportPages';
import { buildFinalReportModel, type FinalReportWorksheetData } from '../lib/final-report-document';
import { EMPTY_REPORT_FREE_INPUT } from '../lib/final-report-payload';
import { renderFinalReportDocx } from '../lib/final-report-docx';
import { layoutReportPages, REPORT_PAPER } from '../lib/final-report-layout';
import { importJsonSchema } from '../lib/import-json-schema';

const worksheets: FinalReportWorksheetData = { salesEstimates: [], specFunctions: [], productAttributes: [], requirements: [], kanoAggregation: [], competitiveAssessment: [], improvementNeeds: [], improvementFeatures: [], techTree: [], targetSpecs: [], improvementDirections: [], assets: [], fundingPlans: [], fundingSources: [] };
const model = (additionalMarketData?: string | null) => buildFinalReportModel({ projectName: '프로젝트', description: '기존 설명', coachName: null, generatedAt: '2026.10.04', additionalMarketData }, worksheets, EMPTY_REPORT_FREE_INPUT, []);

it('추가 자료를 기존 개요 다음과 WS-1 이전의 별도 박스에 배치한다', async () => {
    const text = '시장 규모 120억원\n출처: 시장 보고서';
    const report = model(text);
    const index = report.blocks.findIndex(block => block.kind === 'dataTable' && block.title === '추가 시장 자료');
    expect(index).toBeGreaterThan(0);
    expect(report.blocks[index]).toMatchObject({ headers: ['추가 시장 자료'], rows: [[text]] });
    expect(report.blocks[index - 1]).toMatchObject({ kind: 'paragraph', text: expect.stringContaining('목표고객') });
    expect(report.blocks[index + 1]).toMatchObject({ kind: 'heading', text: expect.stringContaining('WS-1') });
    const html = renderToStaticMarkup(React.createElement(FinalReportPages, { blocks: report.blocks, readOnly: true }));
    expect(html).toMatch(/<table\b[^>]*>[\s\S]*?추가 시장 자료[\s\S]*?시장 규모 120억원[\s\S]*?출처: 시장 보고서[\s\S]*?<\/table>/);
    const blob = await renderFinalReportDocx(report);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = await zip.file('word/document.xml')!.async('string');
    expect(xml).toMatch(/<w:tbl>[\s\S]*?추가 시장 자료[\s\S]*?시장 규모 120억원[\s\S]*?출처: 시장 보고서[\s\S]*?<\/w:tbl>/);
});

it.each([undefined, null, '', '  \n '])('자료가 없으면 보고서에 빈 박스를 추가하지 않는다 (%s)', value => {
    expect(model(value).blocks.some(block => block.kind === 'dataTable' && block.title === '추가 시장 자료')).toBe(false);
});

it('긴 시장 자료를 여러 페이지로 나누어 마지막 줄까지 보존한다', () => {
    const lines = Array.from({ length: 400 }, (_, index) => `시장자료 ${index + 1}번의 상세 정보`);
    const report = model(lines.join('\n'));
    const blockIndex = report.blocks.findIndex(block => block.kind === 'dataTable' && block.title === '추가 시장 자료');
    const tables = layoutReportPages(report.blocks).flatMap(page => page.items).filter(item => item.kind === 'table' && item.blockIndex === blockIndex);
    expect(tables.length).toBeGreaterThan(1);
    const rendered = tables.flatMap(table => table.kind === 'table' ? table.rows.flatMap(row => row.lines[0]) : []);
    expect(rendered).toEqual(lines);
    expect(tables.every(table => table.top + table.height <= REPORT_PAPER.bottom)).toBe(true);
});

it('JSON 복원에서 추가 시장 자료와 명시적인 빈 값을 받아들인다', () => {
    for (const additionalMarketData of ['자료\n출처', '', null]) {
        expect(importJsonSchema.parse({ project: { name: '프로젝트', additionalMarketData } }).project?.additionalMarketData).toBe(additionalMarketData);
    }
    expect(() => importJsonSchema.parse({ project: { additionalMarketData: '가'.repeat(20_001) } })).toThrow();
});
