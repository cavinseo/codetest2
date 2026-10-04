// 작성용 표의 열·병합·집계가 편집 가능한 보고서와 Word에서도 유지되는지 검증한다.
// @vitest-environment jsdom
import React from 'react';
import { Blob } from 'node:buffer';
import { renderToStaticMarkup } from 'react-dom/server';
import JSZip from 'jszip';
import { expect, it, vi } from 'vitest';
import { worksheetExcelProject } from './fixtures/worksheet-excel-project';
import { buildWorksheetData } from '../lib/final-report-inputs';
import { buildFinalReportModel, hasWorksheetImageSlot, type FinalReportBlock } from '../lib/final-report-document';
import { EMPTY_REPORT_FREE_INPUT, reportDocumentSchema } from '../lib/final-report-payload';
import { calculateQfdWorksheet } from '../lib/qfd-worksheet';
import { applyBlockEdit } from '../lib/final-report-edit';
import { refreshWorksheetTables } from '../lib/final-report-table-refresh';
import { layoutReportPages, REPORT_PAPER } from '../lib/final-report-layout';
import { renderFinalReportDocx } from '../lib/final-report-docx';
import FinalReportPages from '../components/project/FinalReportPages';

vi.stubGlobal('Blob', Blob);
function fixture() {
    const project = worksheetExcelProject();
    const qfd = calculateQfdWorksheet({ requirements: project.requirements.map(row => ({ ...row, importance: row.kanoWeight ?? 0 })), technicals: project.technicalCharacteristics, relationships: project.qfdMatrices, benchmarks: project.benchmarks });
    const worksheets = buildWorksheetData({ exportData: { ...project, customerRequirements: project.requirements, qfdRelationships: project.qfdMatrices }, sales: { rows: project.salesEstimates },
        kanoAnalysis: { requirements: [{ requirementId: 'requirement', better: 0.7, worse: -0.3, responseCount: 10, kanoWeight: 1.73, timkoCategory: '일원적', aggregated: { A: 1, O: 2, M: 3, R: 1, I: 2, Q: 1, total: 10, dominantCategory: 'M' } }] },
        qfdAnalysis: qfd, improvements: { items: project.improvementItems }, techTree: { entries: project.techTreeEntries }, targetSpec: { rows: project.targetSpecs }, techRoadmap: { rows: project.techRoadmaps }, assets: { assets: project.assetItems }, funding: { plans: project.fundingPlans, sources: project.fundingSources } });
    const model = buildFinalReportModel({ projectName: '양식 검증', description: '', coachName: null, generatedAt: '2026.10.04' }, worksheets, EMPTY_REPORT_FREE_INPUT, []);
    return { project, worksheets, model, tables: model.blocks.filter((block): block is Extract<FinalReportBlock, { kind: 'dataTable' }> => block.kind === 'dataTable') };
}

it('각 표가 작성 화면의 열 순서와 단위·합계·자산 구분을 따른다', () => {
    const { model, tables, worksheets } = fixture();
    const find = (title: string) => tables.find(table => table.title === title)!;
    expect(find('WS-1 현재 매출현황').headers).toEqual(['No.', '매출처', '매출액', '경쟁사명']);
    expect(find('WS-1 향후 1년 목표매출액').rows.at(-1)).toEqual(['합계', '', '1,000', '']);
    expect(find('WS-10 기능기술체계도').headers).toEqual(['고객의 소리', '핵심스펙(기능)', '세부스펙(기능)', '기술적 특성']);
    expect(find('WS-10 기능기술체계도').mergeColumns).toEqual([0, 1, 2, 3]);
    expect(find('WS-12 최종 제품/서비스 제공 스펙').headers).toEqual(['스펙분류', '세부항목', '기술적 특성', '개선여부']);
    expect(find('WS-12 최종 제품/서비스 제공 스펙').highlightRows).toEqual([2]);
    expect(worksheets.targetSpecs[0].targetValue).toBe('0.05');
    expect(find('WS-14 핵심자산 도출표').rows).toEqual([['1', '핵심 기술']]);
    expect(find('WS-14 보완자산 도출표').rows).toEqual([['설비', '임대']]);
    expect(find('WS-15 자금소요계획').rows.map(row => row[1])).toEqual(['매출액', '생산비']);
    expect(find('WS-15 자금소요계획').headers).toEqual(['구분', '항목', '1차년도(Y+1)', '2차년도(Y+2)', '3차년도(Y+3)']);
    const source = find('WS-16 자금조달계획');
    expect(source.rows[0]).toEqual(['정부자금', '1', '지원사업', '1,200', '투자자', '0', '', '']);
    expect(source.rows.at(-1)).toEqual(['자금조달 합계', '', '', '1,200', '', '0', '', '0']);
    expect(source.headerGroups).toEqual([null, null, '1차년도(Y+1)', '1차년도(Y+1)', '2차년도(Y+2)', '2차년도(Y+2)', '3차년도(Y+3)', '3차년도(Y+3)']);
    expect(JSON.stringify(model)).toContain('단위: 백만원');
    expect(JSON.stringify(model)).not.toContain('차년도(원)');
    expect(reportDocumentSchema.safeParse(model).success).toBe(true);
});

it('WS-4와 Kano 표의 다단 머리글·집계 및 QFD의 실제 기술명과 비교값을 출력한다', () => {
    const { tables } = fixture();
    const fitness = tables.find(table => table.title === 'WS-4 제품속성적합도')!;
    expect(fitness.headerGroups).toEqual([null, '제조업']);
    expect(fitness.rows).toContainEqual(['L*', '1']);
    expect(fitness.rows.at(-1)).toEqual(['세분시장 순위', '부적합']);
    const kano = tables.find(table => table.title === 'WS-7 Kano 집계')!;
    expect(kano.rows[0].slice(2, 11)).toEqual(['1', '2', '3', '1', '2', '1', '10', '0.70', '-0.30']);
    const qfd = tables.find(table => table.title === 'WS-9 QFD 관계 행렬')!;
    expect(qfd.headers).toEqual(['2차 그룹', '1차 그룹', '항목', '위치 제어', '가중치', '가중치 백분율', '자사', '경쟁기업', '기획품질', '수준향상률', '절대중요도', '요구품질 중요도', 'RANK']);
    expect(qfd.rows[0].slice(0, 4)).toEqual(['정밀도', '품질', '정확하게 가공', '9']);
    expect(qfd.rows.some(row => row.includes('측정단위') && row.includes('mm'))).toBe(true);
    expect(qfd.rows.some(row => row.includes('설계 목표치') && row.includes('0.05'))).toBe(true);
    const competitive = tables.find(table => table.title === 'WS-9 경쟁적 우위요인 평가')!;
    expect(competitive.headers).toEqual(qfd.headers.filter((_, index) => index !== 3));
    expect(competitive.rows).toEqual(qfd.rows.map(row => row.filter((_, index) => index !== 3)));
});

it('다단 머리글과 가로·세로 병합을 편집하고 저장하여 Word에도 같은 셀 구조로 출력한다', async () => {
    const { model, tables } = fixture();
    const source = tables.find(table => table.title === 'WS-16 자금조달계획')!;
    let blocks: FinalReportBlock[] = [model.blocks[0], source];
    blocks = applyBlockEdit(blocks, { kind: 'tableGroup', blockIndex: 1, col: 2, value: '첫해 계획' });
    blocks = applyBlockEdit(blocks, { kind: 'tableCell', blockIndex: 1, row: 0, col: 2, value: '교정한 지원사업' });
    expect(reportDocumentSchema.safeParse({ ...model, blocks }).success).toBe(true);
    const html = new DOMParser().parseFromString(renderToStaticMarkup(React.createElement(FinalReportPages, { blocks })), 'text/html');
    expect(html.querySelector('th[colspan="2"]')?.textContent).toBe('첫해 계획');
    expect(html.querySelectorAll('th[rowspan="2"]')).toHaveLength(2);
    expect(html.querySelector('td[colspan="2"]')?.textContent).toContain('자금조달 합계');
    expect(html.body.textContent).toContain('교정한 지원사업');
    const zip = await JSZip.loadAsync(Buffer.from(await (await renderFinalReportDocx({ ...model, blocks })).arrayBuffer()));
    const xml = await zip.file('word/document.xml')!.async('string');
    expect(xml).toContain('<w:gridSpan w:val="2"/>');
    expect(xml).toContain('첫해 계획');
    expect(xml).toContain('교정한 지원사업');
    expect(xml).toContain('<w:vMerge w:val="restart"/>');
});

it('표 반영은 기존 설명·개요·이미지를 유지하며 구형 자산표를 두 표로 바꾼다', () => {
    const { model } = fixture();
    const paragraph: FinalReportBlock = { kind: 'paragraph', text: '교정한 멘토 분석 원문' };
    const current = { ...model, blocks: [model.blocks[0], paragraph, { kind: 'dataTable' as const, title: 'WS-15 핵심자산 및 보완자산', headers: ['구분', '필요 항목', '핵심자산·해결방안'], rows: [['핵심자산', '', '이전 값']] }, { kind: 'dataTable' as const, title: '추가 시장 자료', headers: ['추가 시장 자료'], rows: [['교정한 시장 자료']] }] };
    const original = JSON.stringify(current);
    const updated = refreshWorksheetTables(current, model);
    expect(updated.blocks.filter(block => block.kind === 'dataTable' && block.title?.startsWith('WS-14'))).toHaveLength(2);
    expect(updated.blocks).toContain(paragraph);
    expect(updated.blocks.at(-1)).toEqual(current.blocks.at(-1));
    expect(refreshWorksheetTables(updated, model)).toEqual(updated);
    expect(JSON.stringify(current)).toBe(original);
});

it('긴 병합 표도 페이지 밖으로 벗어나지 않고 머리글을 반복한다', () => {
    const { model, tables } = fixture();
    const table = tables.find(row => row.title === 'WS-16 자금조달계획')!;
    const large = { ...table, rows: Array.from({ length: 120 }, (_, index) => ['정부자금', `${index + 1}`, '긴 지원사업 설명 '.repeat(12), `${index}`, '', '', '', '']), columnSpans: [] };
    const pages = layoutReportPages([model.blocks[0], large]);
    expect(pages.length).toBeGreaterThan(3);
    for (const page of pages) for (const item of page.items) {
        expect(item.top + item.height).toBeLessThanOrEqual(REPORT_PAPER.bottom + 0.1);
        if (item.kind === 'table') expect(item.structuredHeaders).toHaveLength(2);
    }
});

it('표를 다시 반영해도 WS-11과 자산표가 각 제목 아래의 원래 위치에 남는다', () => {
    const { model } = fixture();
    expect(refreshWorksheetTables(model, model)).toEqual(model);
    expect(hasWorksheetImageSlot(model, 'fitness')).toBe(false);
});

it('구형 QFD 그림과 미작성 안내를 편집 가능한 최신 표로 바꾼다', () => {
    const { model } = fixture();
    const empty: FinalReportBlock = { kind: 'paragraph', tone: 'notice', text: 'QFD 관계도에 필요한 기술특성 또는 고객요구사항이 없습니다.' };
    const image: FinalReportBlock = { kind: 'image', title: '고객수요기반 기술스펙 관계도', pngDataUrl: '', widthMm: 100, heightMm: 100, landscape: false };
    for (const block of [empty, image]) {
        const current = { ...model, blocks: [block] };
        const refreshed = refreshWorksheetTables(current, model);
        expect(refreshed.blocks).toEqual(model.blocks.filter(block => block.kind === 'dataTable' && block.title === 'WS-9 QFD 관계 행렬'));
        expect(refreshWorksheetTables(refreshed, { ...model, blocks: [empty] }).blocks).toEqual([empty]);
    }
});

it('표 범위를 벗어나거나 다른 값을 덮는 병합은 저장을 거부한다', () => {
    const { model, tables } = fixture();
    const table = tables.find(row => row.title === 'WS-16 자금조달계획')!;
    for (const invalid of [{ ...table, headerGroups: ['한 칸'] }, { ...table, columnSpans: [{ row: 0, column: 1, span: 2 }] }, { ...table, columnSpans: [{ row: 999, column: 0, span: 2 }] }]) expect(reportDocumentSchema.safeParse({ ...model, blocks: [invalid] }).success).toBe(false);
});
