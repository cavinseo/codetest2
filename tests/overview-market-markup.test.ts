// 추가 시장 자료의 서식과 박스·페이지 분할·교정·Word 원문 보존을 검증한다.
// @vitest-environment jsdom
import { Blob } from 'node:buffer';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import JSZip from 'jszip';
import { expect, it, vi } from 'vitest';
import FinalReportPages from '../components/project/FinalReportPages';
import { layoutReportPages, REPORT_PAPER } from '../lib/final-report-layout';
import { renderFinalReportDocx } from '../lib/final-report-docx';
import type { FinalReportBlock } from '../lib/final-report-document';

const source = '# 시장 전망\n\n- **성장 시장**\n- 신규 고객\n\n| 구분 | 규모 |\n| --- | --- |\n| 국내 | **120억원** |\n\n<h3>참고 자료</h3><p>HTML <em>출처</em></p>';
const model = (text = source) => ({ title: '보고서', fileName: '보고서.docx', blocks: [
    { kind: 'cover', title: '보고서', projectName: '프로젝트', companyName: '기업', coachName: '멘토', outputDate: '2026.10.04' },
    { kind: 'dataTable', title: '추가 시장 자료', headers: ['추가 시장 자료'], rows: [[text]] },
] as FinalReportBlock[] });

it('저장된 추가 시장 자료 박스 안에 제목·목록·표·HTML을 표시하고 원문을 보존한다', async () => {
    vi.stubGlobal('Blob', Blob);
    try {
        const report = model();
        const before = JSON.stringify(report);
        const html = renderToStaticMarkup(createElement(FinalReportPages, { blocks: report.blocks, readOnly: true }));
        const dom = new DOMParser().parseFromString(html, 'text/html');
        const box = dom.querySelector('[data-report-box]');
        expect(box).not.toBeNull();
        expect(box!.textContent).toContain('시장 전망');
        expect(box!.textContent).not.toContain('# 시장 전망');
        expect(box!.textContent).not.toContain('<h3>');
        expect(box!.querySelector('table td strong')?.textContent).toBe('120억원');
        expect(box!.querySelector('em')?.textContent).toBe('출처');
        expect(box!.textContent).toContain('•');
        const zip = await JSZip.loadAsync(Buffer.from(await (await renderFinalReportDocx(report)).arrayBuffer()));
        const xml = await zip.file('word/document.xml')!.async('string');
        expect(xml).toContain('시장 전망');
        expect(xml).toContain('120억원');
        expect(xml).toContain('<w:b/>');
        expect(xml).not.toContain('# 시장 전망');
        expect(xml).not.toContain('&lt;h3&gt;');
        expect(JSON.stringify(report)).toBe(before);
    } finally { vi.unstubAllGlobals(); }
});

it('긴 시장 자료의 표를 박스 안에서 여러 페이지로 나누고 마지막 행까지 보존한다', () => {
    const text = '# 상세 시장 조사\n\n| 번호 | 조사 내용 |\n| --- | --- |\n' + Array.from({ length: 150 }, (_, index) => `| ${index + 1} | **시장조사-${index + 1}** |`).join('\n');
    const report = model(text);
    const pages = layoutReportPages(report.blocks);
    expect(pages.length).toBeGreaterThan(3);
    for (const page of pages) for (const item of page.items) {
        expect(item.top).toBeGreaterThanOrEqual(REPORT_PAPER.top);
        expect(item.top + item.height).toBeLessThanOrEqual(REPORT_PAPER.bottom + .01);
    }
    const dom = new DOMParser().parseFromString(renderToStaticMarkup(createElement(FinalReportPages, { blocks: report.blocks, readOnly: true })), 'text/html');
    expect(dom.querySelectorAll('[data-report-box]').length).toBeGreaterThan(1);
    for (let index = 1; index <= 150; index++) expect([...dom.querySelectorAll('td strong')].filter(node => node.textContent === `시장조사-${index}`)).toHaveLength(1);
});

it('박스의 서식 표를 교정할 때 추가 시장 자료의 Markdown 원문 전체를 연다', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const container = document.createElement('div'); document.body.append(container);
    const root = createRoot(container);
    const onEdit = vi.fn();
    try {
        await act(async () => root.render(createElement(FinalReportPages, { blocks: model().blocks, onEdit })));
        const cell = container.querySelector<HTMLButtonElement>('[data-report-box] table td button');
        expect(cell).not.toBeNull();
        await act(async () => cell!.click());
        const input = container.querySelector<HTMLTextAreaElement>('textarea')!;
        expect(input.value).toBe(source);
        await act(async () => {
            Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, '## 교정된 시장 자료');
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent === '교정 반영')!.click());
        expect(onEdit).toHaveBeenCalledWith({ kind: 'tableCell', blockIndex: 1, row: 0, col: 0, value: '## 교정된 시장 자료' });
    } finally { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); }
});

it('목록만 입력해도 목록으로 표시하고 실행 코드와 위험한 링크를 제거한다', async () => {
    vi.stubGlobal('Blob', Blob);
    try {
        const lists = new DOMParser().parseFromString(renderToStaticMarkup(createElement(FinalReportPages, { blocks: model('- 첫 시장\n- 둘째 시장').blocks, readOnly: true })), 'text/html');
        expect(lists.querySelector('[data-report-box]')?.textContent).toContain('•');
        const report = model('<h2>시장 제목</h2><p onclick="alert(1)"><strong>시장 본문</strong><a href="javascript:alert(1)">자료</a></p><script>alert(1)</script><style>body{display:none}</style>');
        const dom = new DOMParser().parseFromString(renderToStaticMarkup(createElement(FinalReportPages, { blocks: report.blocks, readOnly: true })), 'text/html');
        expect(dom.querySelector('script, style, [onclick], a[href^="javascript:"]')).toBeNull();
        expect(dom.querySelector('strong')?.textContent).toBe('시장 본문');
        const zip = await JSZip.loadAsync(Buffer.from(await (await renderFinalReportDocx(report)).arrayBuffer()));
        const xml = await zip.file('word/document.xml')!.async('string');
        expect(xml).not.toContain('alert(1)');
        expect(xml).not.toContain('display:none');
    } finally { vi.unstubAllGlobals(); }
});
