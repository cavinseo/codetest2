// 승인된 보고서의 글자 크기·들여쓰기·내어쓰기와 원문 보존을 검증한다.
// @vitest-environment jsdom
import { Blob } from 'node:buffer';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import JSZip from 'jszip';
import { expect, it, vi } from 'vitest';
import FinalReportPages from '../components/project/FinalReportPages';
import { layoutReportPages, REPORT_PAPER, type ReportLayoutItem } from '../lib/final-report-layout';
import { renderFinalReportDocx } from '../lib/final-report-docx';
import type { FinalReportBlock } from '../lib/final-report-document';

vi.stubGlobal('Blob', Blob);
const mm = (value: number) => value * 72 / 25.4;
const cover: FinalReportBlock = { kind: 'cover', title: '보고서', projectName: 'AI PLC 관리 장비', companyName: 'KNF', coachName: '멘토', outputDate: '2026.09.29' };
const blocks: FinalReportBlock[] = [
    cover, { kind: 'heading', level: 1, text: 'Ⅱ. 제품 진단' },
    { kind: 'heading', level: 2, text: '제품속성표 (WS-3)' },
    { kind: 'paragraph', tone: 'analysis', text: 'WS-3 멘토 분석(보고)' },
    { kind: 'paragraph', text: '분석 본문\n• 고장 진단을 지원한다.\n  - 원인 후보와 조치 방법을 제공한다.' },
];

it('장·절·소제목·본문·하위 항목을 승인한 다섯 단계로 배치한다', () => {
    const original = structuredClone(blocks);
    const items = layoutReportPages(blocks).flatMap(page => page.items).filter(item => item.kind === 'text');
    expect(items.map(item => item.fontSize)).toEqual([16, 14, 12, 11, 11, 10]);
    expect(items.slice(0, 4).map(item => item.left)).toEqual([0, mm(4), mm(8), mm(12)]);
    expect(items[4].left - items[4].markerWidth).toBeCloseTo(mm(12));
    expect(items[5].left - items[5].markerWidth).toBeCloseTo(mm(16));
    expect(items[4].marker).toBe('•');
    expect(items[5].marker).toBe('-');
    expect(items.every(item => item.lineHeight === item.fontSize * 1.6)).toBe(true);
    expect(blocks).toEqual(original);
});

it('긴 하위 항목은 같은 본문 시작선으로 페이지를 나누고 기호는 처음에만 표시한다', () => {
    const content = '데이터와 조치 이력을 보존한다. '.repeat(1200);
    const items = layoutReportPages([{ kind: 'paragraph', text: '  - ' + content }])
        .flatMap(page => page.items).filter(item => item.kind === 'text');
    expect(items.length).toBeGreaterThan(2);
    expect(items.flatMap(item => item.lines).join('')).toBe(content);
    expect(items.filter(item => item.marker === '-')).toHaveLength(1);
    expect(new Set(items.map(item => item.left)).size).toBe(1);
    for (const item of items) expect(item.top + item.height).toBeLessThanOrEqual(REPORT_PAPER.bottom + .01);
});

it('글머리가 아닌 음수·제품 코드·본문과 빈 줄을 임의로 목록으로 바꾸지 않는다', () => {
    const items = layoutReportPages([{ kind: 'paragraph', text: '-3.5%\nPLC-AI\n\n일반 본문' }])
        .flatMap(page => page.items).filter(item => item.kind === 'text');
    expect(items.every(item => !item.marker && item.fontSize === 11)).toBe(true);
    expect(items.flatMap(item => item.lines)).toEqual(['-3.5%', 'PLC-AI', '', '일반 본문']);
});

it('미리보기는 실제 글자 크기·왼쪽 위치와 원래 블록의 교정 대상을 유지한다', () => {
    const html = renderToStaticMarkup(React.createElement(FinalReportPages, { blocks, onEdit: () => {} }));
    const document = new DOMParser().parseFromString(html, 'text/html');
    const elements = [...document.querySelectorAll<HTMLElement>('[data-report-block]')];
    expect(elements.map(el => el.style.fontSize)).toEqual(['16pt', '14pt', '12pt', '11pt', '11pt', '10pt']);
    expect(elements[5].querySelector('button')?.getAttribute('aria-label')).toBe('문단 5 교정');
    expect(parseFloat(elements[5].style.left)).toBeGreaterThan(parseFloat(elements[4].style.left));
    expect(elements[5].textContent).toContain('원인 후보와 조치 방법을 제공한다.');
});

it('미리보기는 중복 그룹 칸을 세로 병합해 가운데 한 번만 표시한다', () => {
    const table: FinalReportBlock = { kind: 'dataTable', headers: ['No', '항목', '1차 그룹'], mergeColumns: [2], rows: [
        ['1', '첫째', '공통'], ['2', '둘째', '공통'], ['3', '셋째', '다름'],
    ] };
    const html = renderToStaticMarkup(React.createElement(FinalReportPages, { blocks: [table] }));
    const document = new DOMParser().parseFromString(html, 'text/html');
    const rows = [...document.querySelectorAll('tbody tr')];
    const merged = rows[0].querySelector<HTMLTableCellElement>('td[rowspan]');
    expect(merged?.rowSpan).toBe(2);
    expect(merged?.textContent).toBe('공통');
    expect(merged?.style.verticalAlign).toBe('middle');
    expect(merged?.style.textAlign).toBe('center');
    expect(rows[1].querySelectorAll('td')).toHaveLength(2);
});

it('Word에 미리보기와 같은 단계 및 글머리 내어쓰기·탭 위치를 기록한다', async () => {
    const blob = await renderFinalReportDocx({ title: '보고서', fileName: '보고서.docx', blocks });
    const zip = await JSZip.loadAsync(Buffer.from(await blob.arrayBuffer()));
    const xml = await zip.file('word/document.xml')!.async('string');
    const document = new DOMParser().parseFromString(xml, 'text/xml');
    const paragraphs = [...document.getElementsByTagName('w:p')];
    for (const [value, size, indent] of [
        ['제품속성표 (WS-3)', 14, 4], ['WS-3 멘토 분석(보고)', 12, 8], ['분석 본문', 11, 12],
    ] as const) {
        const paragraph = paragraphs.find(p => p.textContent === value)!;
        expect(paragraph.getElementsByTagName('w:sz')[0].getAttribute('w:val')).toBe(String(size * 2));
        expect(paragraph.getElementsByTagName('w:ind')[0].getAttribute('w:left')).toBe(String(Math.round(mm(indent) * 20)));
    }
    const child = paragraphs.find(p => p.textContent?.includes('원인 후보와 조치 방법'))!;
    const indent = child.getElementsByTagName('w:ind')[0];
    expect(Number(indent.getAttribute('w:hanging'))).toBeGreaterThan(0);
    expect(Number(indent.getAttribute('w:left')) - Number(indent.getAttribute('w:hanging'))).toBeCloseTo(Math.round(mm(16) * 20), -1);
    expect([...child.getElementsByTagName('w:r')].some(run => run.getElementsByTagName('w:tab').length === 1)).toBe(true);
    expect(child.getElementsByTagName('w:sz')[0].getAttribute('w:val')).toBe('20');
});

it('번호·여러 글머리와 탭으로 들여쓴 하위 항목을 구분하고 소제목 원문을 보존한다', () => {
    const items = layoutReportPages([{ kind: 'paragraph', text: '(1) 고객 분석\n1. 첫 항목\n- 둘째 항목\n\t○ 하위 항목\n  12) 하위 번호' }])
        .flatMap(page => page.items).filter(item => item.kind === 'text');
    expect(items.map(item => item.fontSize)).toEqual([12, 11, 11, 10, 10]);
    expect(items[0].lines).toEqual(['(1) 고객 분석']);
    expect(items.map(item => item.marker)).toEqual([undefined, '1.', '-', '○', '12)']);
    expect(items[4].left - items[4].markerWidth).toBeCloseTo(mm(16));
});

it('표·워크시트는 2단계 제목 폭의 95% 안에 배치하고 표의 첫 행·첫 열은 가운데 정렬한다', async () => {
    const table: FinalReportBlock = { kind: 'dataTable', headers: ['구분', '설명'], rows: [['첫 항목', '설명 내용'], ['둘째 항목', '다른 설명']] };
    const image: FinalReportBlock = { kind: 'image', title: '워크시트', pngDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', widthMm: 220, heightMm: 40, landscape: false };
    const reportBlocks: FinalReportBlock[] = [cover, { kind: 'heading', level: 2, text: '제품속성표' }, table, image];
    const items = layoutReportPages(reportBlocks).flatMap(page => page.items);
    const section = items.find((item): item is Extract<ReportLayoutItem, { kind: 'text' }> => item.kind === 'text' && item.fontSize === 14)!;
    const laidTable = items.find((item): item is Extract<ReportLayoutItem, { kind: 'table' }> => item.kind === 'table')!;
    const laidImage = items.find((item): item is Extract<ReportLayoutItem, { kind: 'image' }> => item.kind === 'image')!;
    expect(laidTable.widths.reduce((sum, width) => sum + width, 0)).toBeCloseTo(section.width * .95 - 1, 5);
    expect(laidImage.width).toBeCloseTo(section.width * .95, 0);
    const dom = new DOMParser().parseFromString(renderToStaticMarkup(React.createElement(FinalReportPages, { blocks: reportBlocks, readOnly: true })), 'text/html');
    const htmlTable = dom.querySelector<HTMLTableElement>('table')!;
    const htmlFigure = dom.querySelector<HTMLElement>('figure')!;
    expect(parseFloat(htmlTable.style.left)).toBeCloseTo(REPORT_PAPER.margin + section.left);
    expect(parseFloat(htmlFigure.style.left)).toBeCloseTo(REPORT_PAPER.margin + section.left);
    expect([...htmlTable.querySelectorAll('th')].every(cell => cell.style.textAlign === 'center')).toBe(true);
    expect([...htmlTable.querySelectorAll('tbody tr')].every(row => row.querySelector('td')?.style.textAlign === 'center')).toBe(true);
    expect(htmlTable.querySelector('tbody tr td:nth-child(2)')?.getAttribute('style')).not.toContain('text-align:center');
    const zip = await JSZip.loadAsync(Buffer.from(await (await renderFinalReportDocx({ title: '보고서', fileName: '보고서.docx', blocks: reportBlocks })).arrayBuffer()));
    const xml = new DOMParser().parseFromString(await zip.file('word/document.xml')!.async('string'), 'text/xml');
    const wordTable = [...xml.getElementsByTagName('w:tbl')].find(node => node.textContent?.includes('첫 항목'))!;
    expect(wordTable.getElementsByTagName('w:tblInd')[0].getAttribute('w:w')).toBe(String(Math.round(section.left * 20)));
    expect(Number(wordTable.getElementsByTagName('w:tblW')[0].getAttribute('w:w'))).toBeCloseTo(laidTable.widths.reduce((sum, width) => sum + width, 0) * 20, 0);
    const wordRows = [...wordTable.getElementsByTagName('w:tr')];
    expect(wordRows[0].getElementsByTagName('w:jc')).toHaveLength(2);
    expect([...wordRows[0].getElementsByTagName('w:jc')].every(node => node.getAttribute('w:val') === 'center')).toBe(true);
    expect(wordRows.slice(1).every(row => row.getElementsByTagName('w:tc')[0].getElementsByTagName('w:jc')[0].getAttribute('w:val') === 'center')).toBe(true);
    expect(wordRows[1].getElementsByTagName('w:tc')[1].getElementsByTagName('w:jc')[0].getAttribute('w:val')).toBe('left');
    const wordImage = [...xml.getElementsByTagName('w:p')].find(paragraph => paragraph.getElementsByTagName('w:drawing').length)!;
    const imageIndent = wordImage.getElementsByTagName('w:ind')[0];
    expect(imageIndent.getAttribute('w:left')).toBe(String(Math.round(section.left * 20)));
    expect(imageIndent.getAttribute('w:right')).toBe(String(Math.round((section.width - laidImage.width) * 20)));
});
