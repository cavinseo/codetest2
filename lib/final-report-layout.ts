// 미리보기와 Word가 함께 사용하는 A4 페이지 배치와 긴 표 분할을 계산한다.
import type { FinalReportBlock, FinalReportModel } from './final-report-document';
import { getFitnessReportExcludedIndexes } from './final-report-fitness';
import { getGroupedCellSpans } from './final-report-table-merge';
import { parseReportMarkdown, reportRunsText, type ReportMarkdownBlock, type ReportTextRun } from './final-report-markdown';

export const REPORT_PAPER = { width: 595.28, height: 841.89, margin: 42, top: 53, bottom: 787, body: 511.28 };
export const REPORT_CHAPTER_PADDING = { vertical: 6, horizontal: 10 };
export const REPORT_VISUAL_LEFT = 4 * 72 / 25.4;
export const REPORT_VISUAL_WIDTH = (REPORT_PAPER.body - REPORT_VISUAL_LEFT) * .95;
export const REPORT_TABLE_LEFT = REPORT_VISUAL_LEFT + 18.7;
export type CoverBlock = Extract<FinalReportBlock, { kind: 'cover' }>;
export const REPORT_BOX = { padding: 8, headerHeight: 28 };
type ReportLeafLayoutItem =
    | { kind: 'text'; blockIndex: number; lines: string[]; richLines?: ReportTextRun[][]; code?: boolean; quote?: boolean; top: number; height: number; left: number; width: number; marker?: string; markerWidth: number; fontSize: number; lineHeight: number; bold: boolean; color: string; chapter: boolean }
    | { kind: 'table'; blockIndex: number; top: number; height: number; fontSize: number; lineHeight: number; widths: number[]; headers: string[][]; richHeaders?: ReportTextRun[][][]; headerHeight: number; mergeSpans?: number[][]; rows: Array<{ index: number; lines: string[][]; richLines?: ReportTextRun[][][]; height: number }> }
    | { kind: 'image'; blockIndex: number; top: number; height: number; width: number; block: Extract<FinalReportBlock, { kind: 'image' }> };
export type ReportLayoutItem = ReportLeafLayoutItem | { kind: 'box'; blockIndex: number; title: string; top: number; height: number; width: number; items: ReportLeafLayoutItem[] };
export interface ReportPageLayout { cover?: CoverBlock; items: ReportLayoutItem[] }

type TextBlock = Extract<FinalReportBlock, { kind: 'heading' | 'paragraph' }>;
type TableBlock = Extract<FinalReportBlock, { kind: 'dataTable' | 'keyValueTable' }>;
type ImageBlock = Extract<FinalReportBlock, { kind: 'image' }>;
type TableLayoutItem = Extract<ReportLayoutItem, { kind: 'table' }>;
interface PageCursor { pages: ReportPageLayout[]; currentPage: ReportPageLayout; top: number; bounds: { top: number; bottom: number; body: number; tableWidth: number; paragraphIndentMm: number } }

export type ReportCoverElement =
    | { kind: 'text' | 'title'; top: number; text: string; fontSize: number; bold: boolean }
    | { kind: 'divider'; top: number; height: number };

export function reportCoverElements(cover: CoverBlock): ReportCoverElement[] {
    return [
        { kind: 'text', top: 96, text: 'KS-QFD 제품개발 및 개선프로그램 결과보고서', fontSize: 11, bold: true },
        { kind: 'title', top: 218, text: cover.title, fontSize: 25, bold: true },
        { kind: 'text', top: 260, text: `프로젝트명 : ${cover.projectName}`, fontSize: 12, bold: false },
        { kind: 'text', top: 302, text: `기업명: ${cover.companyName}`, fontSize: 15, bold: true },
        { kind: 'divider', top: 339, height: 10 },
        { kind: 'text', top: 442, text: `작성일: ${cover.outputDate}`, fontSize: 13, bold: false },
        { kind: 'text', top: 510, text: `코치명: ${cover.coachName}`, fontSize: 13, bold: false },
        { kind: 'text', top: 650, text: '케이랩스\nKS-QFD', fontSize: 17, bold: true },
    ];
}

export function reportOutputDate(now = new Date()): string {
    return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now).replaceAll('-', '.');
}

export function withReportOutputDate(model: FinalReportModel, now = new Date()): FinalReportModel {
    return { ...model, blocks: model.blocks.map(block => block.kind === 'cover' ? { ...block, outputDate: reportOutputDate(now) } : block) };
}

// 한글은 전각 폭을 사용하고 영문은 보수적인 폭으로 줄을 나누어 양쪽 렌더러에서 같은 줄을 유지한다.
function characterWidth(character: string, fontSize: number): number {
    if (/[\s]/.test(character)) return fontSize * .34;
    if (/[ilI.,'`!:;|]/.test(character)) return fontSize * .32;
    if (/[MW@%]/.test(character)) return fontSize;
    if (/[0-9]/.test(character)) return fontSize * .57;
    return fontSize * (/^[\x20-\x7e]$/.test(character) ? .65 : 1.02);
}

export function wrapReportText(text: string, width: number, fontSize: number): string[] {
    const lines: string[] = [];
    for (const paragraph of text.replaceAll('\r', '').replaceAll('\t', '    ').split('\n')) {
        let line = '', lineWidth = 0;
        for (const character of paragraph) {
            const nextWidth = characterWidth(character, fontSize);
            if (line && lineWidth + nextWidth > width) { lines.push(line); line = ''; lineWidth = 0; }
            line += character; lineWidth += nextWidth;
        }
        lines.push(line);
    }
    return lines;
}

function wrapReportRuns(runs: ReportTextRun[], width: number, fontSize: number): ReportTextRun[][] {
    const lines: ReportTextRun[][] = [[]];
    let lineWidth = 0;
    for (const run of runs) {
        let fragment = '';
        const flush = () => { if (fragment) lines[lines.length - 1].push({ ...run, text: fragment }); fragment = ''; };
        for (const character of run.text.replaceAll('\r', '').replaceAll('\t', '    ')) {
            if (character === '\n') { flush(); lines.push([]); lineWidth = 0; continue; }
            const nextWidth = (run.code ? Math.max(characterWidth(character, fontSize), fontSize * .65) : characterWidth(character, fontSize)) * (run.bold ? 1.08 : 1);
            if (lineWidth && lineWidth + nextWidth > width) { flush(); lines.push([]); lineWidth = 0; }
            fragment += character; lineWidth += nextWidth;
        }
        flush();
    }
    return lines;
}

function startNextPage(cursor: PageCursor) {
    if (cursor.currentPage.cover || cursor.currentPage.items.length) cursor.pages.push(cursor.currentPage);
    cursor.currentPage = { items: [] };
    cursor.top = cursor.bounds.top;
}

interface TextParagraph {
    text: string; fontSize: number; left: number; bold: boolean; color: string;
    chapter: boolean; section: boolean; marker?: string; markerWidth: number;
    runs?: ReportTextRun[]; code?: boolean; quote?: boolean;
}

const millimetersToPoints = (millimeters: number) => millimeters * 72 / 25.4;
const TEXT_TYPOGRAPHY = {
    chapter: { fontSize: 16, left: 0, bold: true },
    section: { fontSize: 14, left: REPORT_VISUAL_LEFT, bold: true },
    subheading: { fontSize: 12, left: millimetersToPoints(8), bold: true },
    body: { fontSize: 11, left: millimetersToPoints(12), bold: false },
    nestedBullet: { fontSize: 10, left: millimetersToPoints(16), bold: false },
    caption: { fontSize: 9, left: 0, bold: false },
};

function textTypography(block: TextBlock) {
    if (block.kind === 'heading') return block.level === 1 ? TEXT_TYPOGRAPHY.chapter : TEXT_TYPOGRAPHY.section;
    if (block.tone === 'analysis') return TEXT_TYPOGRAPHY.subheading;
    if (block.tone === 'caption') return TEXT_TYPOGRAPHY.caption;
    return TEXT_TYPOGRAPHY.body;
}

function formatParagraphLine(line: string, paragraph: TextParagraph): TextParagraph {
    if (/^\(\d+\)\s+/.test(line)) return { ...paragraph, ...TEXT_TYPOGRAPHY.subheading, text: line };
    const listMatch = /^([ \t]*)([•○▪·*\-]|\d+[.)])[ \t]+(.*)$/.exec(line);
    if (!listMatch) return { ...paragraph, text: line };
    const [, leadingWhitespace, marker, text] = listMatch;
    const typography = leadingWhitespace ? TEXT_TYPOGRAPHY.nestedBullet : TEXT_TYPOGRAPHY.body;
    const markerWidth = Math.max(13, Array.from(marker).reduce((sum, character) => sum + characterWidth(character, typography.fontSize), 0) + 5);
    return { ...paragraph, ...typography, text, marker, markerWidth, left: typography.left + markerWidth };
}

function formatReportParagraphs(block: TextBlock): TextParagraph[] {
    const tone = block.kind === 'paragraph' ? block.tone : undefined;
    const paragraph: TextParagraph = {
        text: block.text, ...textTypography(block),
        color: tone === 'notice' ? '986018' : tone === 'caption' ? '666666' : '1B1B1B',
        chapter: block.kind === 'heading' && block.level === 1,
        section: block.kind === 'heading' && block.level === 2,
        markerWidth: 0,
    };
    if (block.kind === 'heading' || tone) return [paragraph];
    return block.text.replaceAll('\r', '').split('\n').map(line => formatParagraphLine(line, paragraph));
}

function appendTextParagraph(cursor: PageCursor, paragraph: TextParagraph, blockIndex: number, gapAfter: number) {
    const { chapter, fontSize, left, markerWidth } = paragraph;
    const lineHeight = fontSize * 1.6;
    const width = cursor.bounds.body - left;
    const textWidth = width - (chapter ? REPORT_CHAPTER_PADDING.horizontal * 2 : 0);
    const richLines = paragraph.runs ? wrapReportRuns(paragraph.runs, textWidth, fontSize) : undefined;
    const lines = richLines ? richLines.map(reportRunsText) : wrapReportText(paragraph.text, textWidth, fontSize);
    const padding = chapter ? REPORT_CHAPTER_PADDING.vertical * 2 : 0;
    const height = lines.length * lineHeight + padding;
    if (paragraph.bold && cursor.top + Math.min(height + 65, 140) > cursor.bounds.bottom) startNextPage(cursor);
    let lineOffset = 0;
    while (lineOffset < lines.length) {
        const lineCount = Math.min(lines.length - lineOffset, Math.floor((cursor.bounds.bottom - cursor.top - padding) / lineHeight));
        if (lineCount < 1) { startNextPage(cursor); continue; }
        const itemHeight = lineCount * lineHeight + padding;
        cursor.currentPage.items.push({ kind: 'text', blockIndex, lines: lines.slice(lineOffset, lineOffset + lineCount), top: cursor.top, height: itemHeight, left, width,
            ...(richLines ? { richLines: richLines.slice(lineOffset, lineOffset + lineCount), code: paragraph.code, quote: paragraph.quote } : {}),
            marker: lineOffset === 0 ? paragraph.marker : undefined, markerWidth, fontSize, lineHeight,
            bold: paragraph.bold, color: paragraph.color, chapter });
        cursor.top += itemHeight;
        lineOffset += lineCount;
        if (lineOffset < lines.length) startNextPage(cursor);
    }
    cursor.top += gapAfter;
}

function appendTextLayout(cursor: PageCursor, block: TextBlock, blockIndex: number) {
    const rich = block.kind === 'paragraph' && !block.tone ? parseReportMarkdown(block.text) : null;
    if (rich) { appendMarkdownLayout(cursor, rich, blockIndex); return; }
    const paragraphs = formatReportParagraphs(block);
    paragraphs.forEach((paragraph, index) => {
        const isLastParagraph = index === paragraphs.length - 1;
        let gapAfter = 0;
        if (paragraph.chapter) gapAfter = 15;
        else if (paragraph.section) gapAfter = 12;
        else if (paragraph.bold) gapAfter = 6;
        else if (isLastParagraph) gapAfter = 8;
        else if (paragraph.marker) gapAfter = 4;
        appendTextParagraph(cursor, paragraph, blockIndex, gapAfter);
    });
}

function appendMarkdownLayout(cursor: PageCursor, blocks: ReportMarkdownBlock[], blockIndex: number) {
    for (const block of blocks) {
        if (block.kind === 'table') {
            appendTableLayout(cursor, { kind: 'dataTable', headers: block.headers.map(reportRunsText), rows: block.rows.map(row => row.map(reportRunsText)), columnWidths: Array(block.columns).fill(1) }, blockIndex, block);
            continue;
        }
        const fontSize = block.headingLevel ? [16, 14, 12, 11, 11, 10][block.headingLevel - 1] : block.code || block.depth ? 10 : 11;
        const markerWidth = block.marker ? Math.max(13, Array.from(block.marker).reduce((sum, character) => sum + characterWidth(character, fontSize), 0) + 5) : 0;
        const paragraph: TextParagraph = {
            text: reportRunsText(block.runs), runs: block.runs, fontSize,
            left: millimetersToPoints(cursor.bounds.paragraphIndentMm + block.depth * 4) + markerWidth + (block.quote ? 8 : 0),
            bold: Boolean(block.headingLevel), color: block.quote ? '555555' : '1B1B1B',
            chapter: false, section: false, marker: block.marker, markerWidth, code: block.code, quote: block.quote,
        };
        appendTextParagraph(cursor, paragraph, blockIndex, block.marker ? 4 : 8);
    }
}

function appendImageLayout(cursor: PageCursor, block: ImageBlock, blockIndex: number) {
    const scale = Math.min(1, REPORT_VISUAL_WIDTH / (block.widthMm * 72 / 25.4), 590 / (block.heightMm * 72 / 25.4));
    const width = block.widthMm * 72 / 25.4 * scale, height = block.heightMm * 72 / 25.4 * scale;
    if (cursor.top + height > cursor.bounds.bottom) startNextPage(cursor);
    cursor.currentPage.items.push({ kind: 'image', blockIndex, top: cursor.top, height, width, block });
    cursor.top += height + 15;
}

// 셀의 위아래 여백 12pt와 브라우저에서 반올림되는 테두리 1pt를 함께 계산한다.
const TABLE_CELL_INSET = 13;

function prepareTableLayout(block: TableBlock, width: number, rich?: Extract<ReportMarkdownBlock, { kind: 'table' }>) {
    const keyValue = block.kind === 'keyValueTable';
    const headers = keyValue ? [] : block.headers;
    const sourceRows = keyValue ? block.rows.map(row => [row.label, row.value]) : block.rows;
    const widthRatios = keyValue ? [30, 70] : block.columnWidths ?? block.headers.map(() => 1);
    const totalRatio = widthRatios.reduce((sum, value) => sum + value, 0);
    const widths = widthRatios.map(ratio => ratio / totalRatio * width);
    const fontSize = headers.length > 9 ? 8 : 8.5, lineHeight = fontSize * 1.55;
    const wrapCells = (cells: string[], bold = false) => cells.map((cell, column) => wrapReportText(cell, Math.max(fontSize, widths[column] - 8), fontSize * (bold ? 1.08 : 1)));
    const wrapRichCells = (cells: ReportTextRun[][]) => cells.map((cell, column) => wrapReportRuns(cell, Math.max(fontSize, widths[column] - 8), fontSize));
    const richHeaders = rich ? wrapRichCells(rich.headers.map(cell => cell.map(run => ({ ...run, bold: true })))) : undefined;
    const headerLines = richHeaders ? richHeaders.map(lines => lines.map(reportRunsText)) : wrapCells(headers, true);
    const headerHeight = headerLines.length ? Math.max(...headerLines.map(lines => lines.length)) * lineHeight + TABLE_CELL_INSET : 0;
    const rows = sourceRows.map((row, index) => {
        const richLines = rich ? wrapRichCells(rich.rows[index]) : undefined;
        return { index, lines: richLines ? richLines.map(lines => lines.map(reportRunsText)) : wrapCells(row), ...(richLines ? { richLines } : {}) };
    });
    return { widths, fontSize, lineHeight, headerLines, richHeaders, headerHeight, rows };
}

function layoutMergedTableRows(rows: TableLayoutItem['rows'], block: TableBlock, mergeCells: boolean[][], lineHeight: number) {
    const mergeSpans = getGroupedCellSpans(rows.map(row => block.kind === 'dataTable' ? block.rows[row.index] ?? row.lines.map(() => '') : row.lines.map(() => '')), block.kind === 'dataTable' ? block.mergeColumns ?? [] : []);
    const fittedRows = rows.map((row, index) => {
        const merged = mergeCells[row.index] ?? [];
        mergeSpans[index] = mergeSpans[index].map((span, column) => merged[column] ? span : 1);
        return { ...row, lines: row.lines.map((lines, column) => mergeSpans[index][column] === 0 ? [] : lines),
            height: Math.max(1, ...row.lines.map((lines, column) => merged[column] ? 0 : lines.length)) * lineHeight + TABLE_CELL_INSET };
    });
    // 병합된 분류의 글자 높이는 그룹 전체에 한 번만 반영한다.
    fittedRows.forEach((row, index) => row.lines.forEach((lines, column) => {
        if (!mergeCells[row.index]?.[column] || !mergeSpans[index][column]) return;
        const end = index + mergeSpans[index][column];
        const available = fittedRows.slice(index, end).reduce((sum, part) => sum + part.height, 0);
        fittedRows[end - 1].height += Math.max(0, lines.length * lineHeight + TABLE_CELL_INSET - available);
    }));
    return { rows: fittedRows, mergeSpans, height: fittedRows.reduce((sum, row) => sum + row.height, 0) };
}

function appendTableLayout(cursor: PageCursor, block: TableBlock, blockIndex: number, rich?: Extract<ReportMarkdownBlock, { kind: 'table' }>) {
    const prepared = prepareTableLayout(block, cursor.bounds.tableWidth, rich);
    const { widths, fontSize, lineHeight, rows } = prepared;
    let { headerLines, richHeaders, headerHeight } = prepared;
    // 한 페이지보다 긴 머리글도 일반 행처럼 나눠 표시한다.
    if (headerHeight + lineHeight + TABLE_CELL_INSET + 1 > cursor.bounds.bottom - cursor.bounds.top) {
        rows.unshift({ index: -1, lines: headerLines, richLines: richHeaders?.map(cell => cell.map(line => line.map(run => ({ ...run, bold: true })))) });
        headerLines = []; richHeaders = []; headerHeight = 0;
    }
    const sourceRows = block.kind === 'dataTable' ? block.rows : block.rows.map(row => [row.label, row.value]);
    const wrappedRows = new Map(rows.map(row => [row.index, row]));
    const globalSpans = getGroupedCellSpans(sourceRows, block.kind === 'dataTable' ? block.mergeColumns ?? [] : []);
    const mergeCells = sourceRows.map((row, index) => row.map((_, column) => globalSpans[index][column] !== 1 &&
        wrappedRows.get(index)!.lines[column].length * lineHeight + TABLE_CELL_INSET <= cursor.bounds.bottom - cursor.bounds.top - headerHeight - 1));
    let pendingTable: TableLayoutItem | null = null;
    let pendingRows: TableLayoutItem['rows'] = [];
    const finishTable = () => {
        if (!pendingTable) return;
        if (pendingTable.rows.length || !rows.length) {
            cursor.currentPage.items.push(pendingTable);
            cursor.top = pendingTable.top + pendingTable.height + 14;
        }
        pendingTable = null; pendingRows = [];
    };
    const newTable = (): TableLayoutItem => ({ kind: 'table', blockIndex, top: cursor.top, height: headerHeight + 1, fontSize, lineHeight, widths, headers: headerLines, richHeaders, headerHeight, rows: [] });
    if (!rows.length && headerLines.length) {
        if (cursor.top + headerHeight + 1 > cursor.bounds.bottom) startNextPage(cursor);
        pendingTable = newTable();
    }
    for (const row of rows) {
        let lineOffset = 0;
        const merged = mergeCells[row.index] ?? [];
        const maxLines = Math.max(...row.lines.map((lines, column) => merged[column] ? 0 : lines.length), 1);
        while (lineOffset < maxLines) {
            if (!pendingTable) {
                if (cursor.top + headerHeight + lineHeight + TABLE_CELL_INSET + 1 > cursor.bounds.bottom) startNextPage(cursor);
                pendingTable = newTable();
            }
            const fragment = (count: number) => ({ index: row.index, lines: row.lines.map((lines, column) => merged[column] ? lines : lines.slice(lineOffset, lineOffset + count)),
                ...(row.richLines ? { richLines: row.richLines.map(lines => lines.slice(lineOffset, lineOffset + count)) } : {}), height: 0 });
            // 긴 행은 현재 페이지에 들어가는 줄부터 배치해 다음 페이지로 이어 준다.
            let low = 0, high = maxLines - lineOffset;
            while (low < high) {
                const count = Math.ceil((low + high) / 2);
                const fitted = layoutMergedTableRows([...pendingRows, fragment(count)], block, mergeCells, lineHeight);
                if (pendingTable.top + headerHeight + 1 + fitted.height <= cursor.bounds.bottom) low = count;
                else high = count - 1;
            }
            if (!low) { finishTable(); startNextPage(cursor); continue; }
            pendingRows.push(fragment(low));
            const fitted = layoutMergedTableRows(pendingRows, block, mergeCells, lineHeight);
            pendingTable = { ...pendingTable, ...fitted, height: headerHeight + 1 + fitted.height };
            lineOffset += low;
            if (lineOffset < maxLines) { finishTable(); startNextPage(cursor); }
        }
    }
    finishTable();
}

function appendMarketReferenceBox(cursor: PageCursor, block: Extract<TableBlock, { kind: 'dataTable' }>, blockIndex: number): boolean {
    const source = block.rows[0][0];
    const rich = parseReportMarkdown(source, /^\s*(?:[-+*]|\d+[.)])\s/m.test(source));
    if (!rich) return false;
    if (!rich.length) return true;
    const { padding, headerHeight } = REPORT_BOX;
    if (cursor.top + headerHeight + padding * 2 + 65 > cursor.bounds.bottom) startNextPage(cursor);
    const width = cursor.bounds.tableWidth + 1;
    const firstContentTop = cursor.top + headerHeight + padding;
    const inner: PageCursor = {
        pages: [], currentPage: { items: [] }, top: firstContentTop,
        bounds: { top: cursor.bounds.top + headerHeight + padding, bottom: cursor.bounds.bottom - padding - 1,
            body: width - padding * 2, tableWidth: width - padding * 2 - 1, paragraphIndentMm: 0 },
    };
    appendMarkdownLayout(inner, rich, blockIndex);
    startNextPage(inner);
    inner.pages.forEach((page, index) => {
        if (index || page.items[0].top < firstContentTop) startNextPage(cursor);
        const top = cursor.top;
        const items = page.items.filter((item): item is ReportLeafLayoutItem => item.kind !== 'box').map(item => ({ ...item, top: item.top - top }));
        const last = items.at(-1)!;
        const height = last.top + last.height + padding + 1;
        cursor.currentPage.items.push({ kind: 'box', blockIndex, title: block.headers[0], top, height, width, items });
        cursor.top += height + 14;
    });
    return true;
}

export function layoutReportPages(blocks: FinalReportBlock[]): ReportPageLayout[] {
    const cursor: PageCursor = { pages: [], currentPage: { items: [] }, top: REPORT_PAPER.top, bounds: { top: REPORT_PAPER.top, bottom: REPORT_PAPER.bottom, body: REPORT_PAPER.body, tableWidth: REPORT_VISUAL_WIDTH - 1, paragraphIndentMm: 12 } };
    const excluded = getFitnessReportExcludedIndexes(blocks);
    blocks.forEach((block, blockIndex) => {
        if (excluded.has(blockIndex)) return;
        if (block.kind === 'pageBreak') {
            const next = blocks[blockIndex + 1];
            const worksheetSection = next?.kind === 'heading' && next.level === 2 && /\(WS-\d+\)/i.test(next.text);
            if (!worksheetSection) startNextPage(cursor);
        }
        else if (block.kind === 'cover') {
            startNextPage(cursor);
            cursor.currentPage.cover = block;
            startNextPage(cursor);
        } else if (block.kind === 'heading' || block.kind === 'paragraph') appendTextLayout(cursor, block, blockIndex);
        else if (block.kind === 'image') appendImageLayout(cursor, block, blockIndex);
        else if (block.kind === 'dataTable' && block.title === '추가 시장 자료' && block.headers.length === 1 && block.rows.length === 1 && appendMarketReferenceBox(cursor, block, blockIndex)) return;
        else appendTableLayout(cursor, block, blockIndex);
    });
    startNextPage(cursor);
    return cursor.pages;
}
