// 개요와 멘토 분석의 Markdown이 보고서 화면·교정·Word에서 같은 서식과 원문을 유지하는지 검증한다.
// @vitest-environment jsdom
import { Blob } from 'node:buffer';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import JSZip from 'jszip';
import { expect, it, vi } from 'vitest';
import FinalReportPages from '../components/project/FinalReportPages';
import { buildFinalReportModel, type FinalReportBlock, type FinalReportWorksheetData } from '../lib/final-report-document';
import { layoutReportPages, REPORT_PAPER } from '../lib/final-report-layout';
import { renderFinalReportDocx } from '../lib/final-report-docx';
import { EMPTY_REPORT_FREE_INPUT, reportDocumentSchema } from '../lib/final-report-payload';

const cover: FinalReportBlock = { kind: 'cover', title: '보고서', projectName: '제품', companyName: '회사', coachName: '멘토', outputDate: '2026.10.03' };
const markdown = '# 제품 특징\n\n**굵은 설명**과 *강조*, ~~취소~~, `코드` 및 [참고](https://example.test/market).\n\n- 첫 항목\n  - **하위 항목**\n\n> 인용 내용\n\n| 구분 | 설명 |\n| --- | --- |\n| 국내 | **성장** 시장 |\n\n```html\n<strong>코드 예시</strong>\n```\n\n<p>HTML <em>서식</em></p>';
const documentModel = (text = markdown) => ({ title: '보고서', fileName: '보고서.docx', blocks: [cover, { kind: 'paragraph' as const, text }] });
const rendered = (blocks: FinalReportBlock[]) => new DOMParser().parseFromString(renderToStaticMarkup(createElement(FinalReportPages, { blocks, readOnly: true })), 'text/html');

it('보고서에 제목·강조·목록·표·링크·코드와 HTML을 원문 기호 대신 서식으로 표시한다', () => {
    const model = documentModel();
    const before = JSON.stringify(model);
    const dom = rendered(model.blocks);
    expect([...dom.querySelectorAll('strong')].map(node => node.textContent)).toContain('굵은 설명');
    expect([...dom.querySelectorAll('em')].map(node => node.textContent)).toContain('강조');
    expect(dom.querySelector('del')?.textContent).toBe('취소');
    expect(dom.querySelector('a[href="https://example.test/market"]')?.textContent).toBe('참고');
    expect(dom.querySelector('table th')?.textContent).toBe('구분');
    expect(dom.querySelector('table td strong')?.textContent).toBe('성장');
    expect(dom.querySelector('[data-report-code]')?.textContent).toContain('<strong>코드 예시</strong>');
    expect(dom.body.textContent).not.toContain('# 제품 특징');
    expect(dom.body.textContent).not.toContain('**굵은 설명**');
    expect(dom.body.textContent).not.toContain('| 구분 |');
    expect(JSON.stringify(model)).toBe(before);
});

it('개요 두 항목과 멘토 분석의 원문을 독립 문단으로 보존해 저장·재조회 후에도 서식으로 표시한다', () => {
    const worksheets: FinalReportWorksheetData = { salesEstimates: [], specFunctions: [], productAttributes: [], requirements: [], kanoAggregation: [], competitiveAssessment: [], improvementNeeds: [], improvementFeatures: [], techTree: [], targetSpecs: [], improvementDirections: [], assets: [], fundingPlans: [], fundingSources: [] };
    const overview = { projectName: '제품', description: null, detailedDescription: '# 개요 제목\n\n**개요 내용**', marketDefinition: '## 시장 제목\n\n**시장 내용**', targetCustomer: '고객', coachName: null, generatedAt: '2026.10.03' };
    const analysis = '### 멘토 제목\n\n**멘토 내용**';
    const model = buildFinalReportModel(overview, worksheets, EMPTY_REPORT_FREE_INPUT, [], { spec: { analysis } });
    for (const text of [overview.detailedDescription, overview.marketDefinition, analysis]) expect(model.blocks.some(block => block.kind === 'paragraph' && block.text === text)).toBe(true);
    const loaded = reportDocumentSchema.parse(JSON.parse(JSON.stringify(model)));
    expect([...rendered(loaded.blocks).querySelectorAll('strong')].map(node => node.textContent)).toEqual(expect.arrayContaining(['개요 내용', '시장 내용', '멘토 내용']));
});

it('이전에 저장한 시장정의·목표고객 통합 문단도 제목의 Markdown을 표시하고 원문은 유지한다', () => {
    const text = '시장정의 · ## 성장 시장\n\n**핵심 시장**\n목표고객 · 제조 기업';
    const model = documentModel(text);
    const dom = rendered(model.blocks);
    expect(dom.body.textContent).toContain('성장 시장');
    expect(dom.body.textContent).not.toContain('## 성장 시장');
    expect(dom.body.textContent).toContain('목표고객 · 제조 기업');
    expect(model.blocks[1]).toMatchObject({ text });
});

it('보고서 HTML의 스크립트·이벤트·위험한 링크를 화면과 Word에서 제거한다', async () => {
    vi.stubGlobal('Blob', Blob);
    try {
        const model = documentModel('<h2>안전 제목</h2><p onclick="alert(1)"><strong>안전 본문</strong><a href="javascript:alert(1)">링크</a></p><script>alert(1)</script><style>body{display:none}</style>');
        const dom = rendered(model.blocks);
        expect(dom.querySelector('script, style, [onclick], a[href^="javascript:"]')).toBeNull();
        expect(dom.querySelector('strong')?.textContent).toBe('안전 본문');
        const zip = await JSZip.loadAsync(Buffer.from(await (await renderFinalReportDocx(model)).arrayBuffer()));
        const xml = await zip.file('word/document.xml')!.async('string');
        expect(xml).not.toContain('alert(1)');
        expect(xml).not.toContain('&lt;h2&gt;');
    } finally { vi.unstubAllGlobals(); }
});

it('보고서에서 서식이 적용된 문단과 표를 교정하면 같은 Markdown 원문을 편집한다', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const onEdit = vi.fn();
    try {
        await act(async () => root.render(createElement(FinalReportPages, { blocks: documentModel().blocks, onEdit })));
        const cell = container.querySelector<HTMLButtonElement>('table td button');
        expect(cell).not.toBeNull();
        await act(async () => cell!.click());
        const input = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="보고서 문구 교정"]')!;
        expect(input.value).toBe(markdown);
        const updated = '## 교정 제목\n\n**교정 내용**';
        await act(async () => {
            Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, updated);
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent === '교정 반영')!.click());
        expect(onEdit).toHaveBeenCalledWith({ kind: 'text', blockIndex: 1, text: updated });
    } finally {
        await act(async () => root.unmount());
        container.remove();
        vi.unstubAllGlobals();
    }
});

it('긴 Markdown 본문과 표는 페이지 경계를 지키고 Word에도 서식과 모든 내용을 보존한다', async () => {
    vi.stubGlobal('Blob', Blob);
    try {
        const rows = Array.from({ length: 70 }, (_, index) => `| 항목${index} | **중요${index}** ${'내용 '.repeat(index === 17 ? 400 : 3)} |`).join('\n');
        const model = documentModel(markdown + '\n\n| 항목 | 설명 |\n| --- | --- |\n' + rows);
        const pages = layoutReportPages(model.blocks);
        expect(pages.length).toBeGreaterThan(3);
        for (const page of pages) {
            let previousBottom = REPORT_PAPER.top;
            for (const item of page.items) {
                expect(item.top).toBeGreaterThanOrEqual(previousBottom);
                previousBottom = item.top + item.height;
                expect(previousBottom).toBeLessThanOrEqual(REPORT_PAPER.bottom + .01);
            }
        }
        const zip = await JSZip.loadAsync(Buffer.from(await (await renderFinalReportDocx(model)).arrayBuffer()));
        const xml = await zip.file('word/document.xml')!.async('string');
        const dom = new DOMParser().parseFromString(xml, 'text/xml');
        expect(xml.match(/<w:sectPr>/g)).toHaveLength(pages.length);
        expect(xml).not.toContain('**중요');
        for (let index = 0; index < 70; index++) expect(dom.documentElement.textContent).toContain(`중요${index}`);
        const boldRun = [...dom.getElementsByTagName('w:r')].find(run => run.textContent === '굵은 설명')!;
        expect(boldRun.getElementsByTagName('w:b')).toHaveLength(1);
        expect(dom.getElementsByTagName('w:i').length).toBeGreaterThan(0);
        expect(dom.getElementsByTagName('w:strike').length).toBeGreaterThan(0);
        expect(dom.getElementsByTagName('w:hyperlink').length).toBeGreaterThan(0);
        expect(dom.documentElement.textContent).toContain('<strong>코드 예시</strong>');
    } finally { vi.unstubAllGlobals(); }
});

it('본문이 없는 Markdown 표도 머리글을 표시한다', () => {
    const dom = rendered(documentModel('| 구분 | 규모 |\n| --- | --- |').blocks);
    expect([...dom.querySelectorAll('th')].map(node => node.textContent)).toEqual(['구분', '규모']);
});

it('한 페이지보다 긴 Markdown 표 머리글을 누락이나 무한 페이지 생성 없이 분할한다', () => {
    const header = '긴머리글'.repeat(800);
    const pages = layoutReportPages(documentModel(`| **${header}** | 설명 |\n| --- | --- |\n| 값 | 내용 |`).blocks);
    const tables = pages.flatMap(page => page.items).filter(item => item.kind === 'table');
    expect(tables.flatMap(item => item.rows.filter(row => row.index === -1)).flatMap(row => row.lines[0]).join('')).toBe(header);
    expect(tables.flatMap(item => item.rows.filter(row => row.index === 0)).flatMap(row => row.lines[0]).join('')).toBe('값');
    for (const item of tables) expect(item.top + item.height).toBeLessThanOrEqual(REPORT_PAPER.bottom + .01);
});
