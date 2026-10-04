// 결과보고서에는 WS-4 적합도 표만 담고 원본 워크시트의 의견·진단은 보존하는지 검증한다.
// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { Blob } from 'node:buffer';
import { renderToStaticMarkup } from 'react-dom/server';
import JSZip from 'jszip';
import FinalReportCaptureStage from '../components/project/FinalReportCaptureStage';
import FitnessWrapper from '../components/project/FitnessWrapper';
import { buildFinalReportModel, type FinalReportWorksheetData } from '../lib/final-report-document';
import { EMPTY_REPORT_FREE_INPUT } from '../lib/final-report-payload';
import FinalReportPreview from '../components/project/FinalReportPreview';
import { renderFinalReportDocx } from '../lib/final-report-docx';
import type { FinalReportBlock } from '../lib/final-report-document';
import { layoutReportPages } from '../lib/final-report-layout';

vi.mock('../components/project/QFDMatrix', () => ({ default: () => null }));
vi.mock('../components/project/KanoSatisfactionGraph', () => ({ default: () => null }));
afterEach(() => vi.unstubAllGlobals());

const worksheets: FinalReportWorksheetData = { salesEstimates: [], specFunctions: [], productAttributes: [], requirements: [], kanoAggregation: [], competitiveAssessment: [], improvementNeeds: [], improvementFeatures: [], techTree: [], targetSpecs: [], improvementDirections: [], assets: [], fundingPlans: [], fundingSources: [] };

it('새 보고서의 WS-4 절에는 제목과 실제 워크시트 그림만 넣는다', () => {
    const report = buildFinalReportModel({ projectName: '제품', description: null, coachName: null, generatedAt: '2026.10.04' }, worksheets, EMPTY_REPORT_FREE_INPUT,
        [{ worksheetId: 'fitness', title: '제품/서비스 속성 적합도', pngDataUrl: 'data:image/png;base64,AA==', widthPx: 1280, heightPx: 500 }], { fitness: { analysis: '원본 멘토 분석을 보존합니다.' } });
    const start = report.blocks.findIndex(block => block.kind === 'heading' && block.text.includes('(WS-4)'));
    const end = report.blocks.findIndex((block, index) => index > start && block.kind === 'pageBreak');
    expect(report.blocks.slice(start, end)).toEqual([
        { kind: 'heading', level: 2, text: '제품/서비스 속성 적합도 (WS-4)' },
        expect.objectContaining({ kind: 'image', title: '제품/서비스 속성 적합도' }),
    ]);
});

it.each([true, false])('기존 보고서의 WS-4 부가 내용만 화면·Word에서 제외하고 원문과 다른 절을 보존한다 (표지 %s)', async withCover => {
    vi.stubGlobal('Blob', Blob);
    const blocks: FinalReportBlock[] = [
        ...(withCover ? [{ kind: 'cover' as const, title: '보고서', projectName: '제품', companyName: '기업', coachName: '멘토', outputDate: '2026.10.04' }] : []),
        { kind: 'heading', level: 2, text: '제품속성표 (WS-3)' }, { kind: 'paragraph', text: 'WS-3 분석 유지' },
        { kind: 'heading', level: 2, text: '제품/서비스 속성 적합도 (WS-4)' },
        { kind: 'paragraph', text: 'WS-4 멘토 분석(보고)', tone: 'analysis' },
        { kind: 'paragraph', text: '작성한 적합도 분석 원문' },
        { kind: 'image', title: '제품/서비스 속성 적합도', pngDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', widthMm: 160, heightMm: 90, landscape: false },
        { kind: 'heading', level: 2, text: '제품/서비스 진단표' },
        { kind: 'dataTable', title: '제품/서비스 진단표', headers: ['진단항목', '응답'], rows: [['5배 매출 경쟁자', '교정한 진단 답변']] },
        { kind: 'heading', level: 2, text: '제품/서비스 개선 방향' }, { kind: 'paragraph', text: '작성한 WS-4 개선 의견' },
        { kind: 'heading', level: 2, text: '최종 목표 스펙 (WS-12)' }, { kind: 'paragraph', text: '다음 절의 개선 의견 유지' },
    ];
    const before = JSON.stringify(blocks);
    const html = renderToStaticMarkup(createElement(FinalReportPreview, { blocks, readOnly: true }));
    const zip = await JSZip.loadAsync(Buffer.from(await (await renderFinalReportDocx({ title: '보고서', fileName: '보고서.docx', blocks })).arrayBuffer()));
    const xml = await zip.file('word/document.xml')!.async('string');
    for (const value of ['WS-4 멘토 분석', '작성한 적합도 분석 원문', '제품/서비스 진단표', '교정한 진단 답변', '작성한 WS-4 개선 의견']) {
        expect(html).not.toContain(value); expect(xml).not.toContain(value);
    }
    for (const value of ['제품/서비스 속성 적합도', 'WS-3 분석 유지', '다음 절의 개선 의견 유지']) {
        expect(html).toContain(value); expect(xml).toContain(value);
    }
    const nextIndex = blocks.findIndex(block => block.kind === 'paragraph' && block.text === '다음 절의 개선 의견 유지');
    expect(layoutReportPages(blocks).flatMap(page => page.items).some(item => item.blockIndex === nextIndex)).toBe(true);
    expect(JSON.stringify(blocks)).toBe(before);
});

it.each([true, false])('보고서 표 전용 모드(%s)는 표의 평가·집계·순위를 보존하고 원본 편집 화면을 유지한다', async tableOnly => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const attributes = [
        { id: 'a1', attribute: '정확도', marketSegment: '제조', customerName: '장비업체', order: 0 },
        { id: 'a2', attribute: '신뢰성', marketSegment: '제조', customerName: '검사업체', order: 1 },
    ];
    const fitnessMatrix = { marketsJson: JSON.stringify([{ id: 'm1', name: '제조', subSegments: [{ id: 's1', name: '장비업체' }, { id: 's2', name: '검사업체' }] }]), matrixJson: JSON.stringify({ a1: { m1: { s1: 'H', s2: 'M' } }, a2: { m1: { s1: 'M', s2: 'L*' } } }), managerComment: '대표 의견 원문', consultantNote: '컨설턴트 진단 원문' };
    const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith('/attributes') ? { attributes } : { fitnessMatrix }), { headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const container = document.createElement('div'); document.body.append(container);
    const root = createRoot(container);
    try {
        await act(async () => root.render(tableOnly
            ? createElement(FinalReportCaptureStage, { projectId: 'project', kanoPoints: [], requirementCount: 0, revision: 0, disabled: false })
            : createElement(FitnessWrapper, { projectId: 'project' })));
        const view = tableOnly ? container.querySelector('[data-worksheet-id="fitness"]')! : container;
        const table = view.querySelector('table')!;
        expect(table).not.toBeNull();
        expect(table.textContent).toContain('정확도');
        expect(table.textContent).toContain('신뢰성');
        expect(table.textContent).toContain('세분시장 순위');
        expect(table.textContent).toContain('1순위');
        expect(table.textContent).toContain('부적합');
        expect(table.querySelectorAll('tbody tr')).toHaveLength(2);
        if (tableOnly) {
            expect(view.querySelector('textarea')).toBeNull();
            expect(view.textContent).not.toContain('컨설턴트 진단 원문');
            expect(view.textContent).not.toContain('셀 클릭');
            expect(table.querySelectorAll('tbody tr')[0].querySelectorAll('td')).toHaveLength(3);
        } else {
            expect(view.querySelector('textarea')?.value).toBe('대표 의견 원문');
            expect(view.textContent).toContain('컨설턴트 진단 원문');
            expect(table.querySelectorAll('tbody tr')[0].querySelectorAll('td')).toHaveLength(4);
        }
        expect(fetchMock.mock.calls).toHaveLength(2);
    } finally { await act(async () => root.unmount()); container.remove(); }
});
