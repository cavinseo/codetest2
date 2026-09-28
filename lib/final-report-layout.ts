// 미리보기와 Word가 함께 사용하는 A4 페이지 배치와 긴 표 분할을 계산한다.
import type { FinalReportBlock, FinalReportModel } from './final-report-document';

export const REPORT_PAPER = { width: 595.28, height: 841.89, margin: 42, top: 53, bottom: 787, body: 511.28 };
export type CoverBlock = Extract<FinalReportBlock, { kind: 'cover' }>;
export type ReportLayoutItem =
    | { kind: 'text'; blockIndex: number; lines: string[]; top: number; height: number; fontSize: number; lineHeight: number; bold: boolean; color: string; chapter: boolean; section: boolean }
    | { kind: 'table'; blockIndex: number; top: number; height: number; fontSize: number; lineHeight: number; widths: number[]; headers: string[][]; headerHeight: number; rows: Array<{ index: number; lines: string[][]; height: number }> }
    | { kind: 'image'; blockIndex: number; top: number; height: number; width: number; block: Extract<FinalReportBlock, { kind: 'image' }> };
export interface ReportPageLayout { cover?: CoverBlock; items: ReportLayoutItem[] }

type TextBlock = Extract<FinalReportBlock, { kind: 'heading' | 'paragraph' }>;
type TableBlock = Extract<FinalReportBlock, { kind: 'dataTable' | 'keyValueTable' }>;
type ImageBlock = Extract<FinalReportBlock, { kind: 'image' }>;
type TableLayoutItem = Extract<ReportLayoutItem, { kind: 'table' }>;
interface PageCursor { pages: ReportPageLayout[]; currentPage: ReportPageLayout; top: number }

export type ReportCoverElement =
    | { kind: 'text' | 'title'; top: number; text: string; fontSize: number; bold: boolean }
    | { kind: 'divider'; top: number; height: number };

export function reportCoverElements(cover: CoverBlock): ReportCoverElement[] {
    return [
        { kind: 'text', top: 96, text: 'KS-QFD 제품개발 및 개선프로그램 결과보고서', fontSize: 11, bold: true },
        { kind: 'title', top: 218, text: cover.title, fontSize: 25, bold: true },
        { kind: 'text', top: 260, text: cover.projectName, fontSize: 12, bold: false },
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

function startNextPage(cursor: PageCursor) {
    if (cursor.currentPage.cover || cursor.currentPage.items.length) cursor.pages.push(cursor.currentPage);
    cursor.currentPage = { items: [] };
    cursor.top = REPORT_PAPER.top;
}

function appendTextLayout(cursor: PageCursor, block: TextBlock, blockIndex: number) {
    const chapter = block.kind === 'heading' && block.level === 1;
    const section = block.kind === 'heading' && block.level === 2;
    const tone = block.kind === 'paragraph' ? block.tone : undefined;
    const fontSize = chapter ? 12.5 : section ? 11.5 : tone === 'caption' ? 7.5 : tone ? 8.5 : 9.2;
    const lineHeight = fontSize * 1.55;
    const inset = chapter ? 20 : section ? 17 : 0;
    const lines = wrapReportText(block.text, REPORT_PAPER.body - inset, fontSize);
    const padding = chapter ? 12 : 0;
    const height = lines.length * lineHeight + padding;
    if ((chapter || section || tone === 'analysis') && cursor.top + Math.min(height + 65, 140) > REPORT_PAPER.bottom) startNextPage(cursor);
    let lineOffset = 0;
    while (lineOffset < lines.length) {
        const lineCount = Math.min(lines.length - lineOffset, Math.floor((REPORT_PAPER.bottom - cursor.top - padding) / lineHeight));
        if (lineCount < 1) { startNextPage(cursor); continue; }
        const itemHeight = lineCount * lineHeight + padding;
        cursor.currentPage.items.push({ kind: 'text', blockIndex, lines: lines.slice(lineOffset, lineOffset + lineCount), top: cursor.top, height: itemHeight, fontSize, lineHeight,
            bold: chapter || section || tone === 'analysis', color: tone === 'analysis' ? '3C5470' : tone === 'notice' ? '986018' : tone === 'caption' ? '666666' : '1B1B1B', chapter, section });
        cursor.top += itemHeight + (chapter ? 15 : section ? 12 : tone === 'analysis' ? 3 : 8);
        lineOffset += lineCount;
        if (lineOffset < lines.length) startNextPage(cursor);
    }
}

function appendImageLayout(cursor: PageCursor, block: ImageBlock, blockIndex: number) {
    const scale = Math.min(1, REPORT_PAPER.body / (block.widthMm * 72 / 25.4), 590 / (block.heightMm * 72 / 25.4));
    const width = block.widthMm * 72 / 25.4 * scale, height = block.heightMm * 72 / 25.4 * scale;
    if (cursor.top + height > REPORT_PAPER.bottom) startNextPage(cursor);
    cursor.currentPage.items.push({ kind: 'image', blockIndex, top: cursor.top, height, width, block });
    cursor.top += height + 15;
}

// 셀의 위아래 여백 12pt와 브라우저에서 반올림되는 테두리 1pt를 함께 계산한다.
const TABLE_CELL_INSET = 13;

function prepareTableLayout(block: TableBlock) {
    const keyValue = block.kind === 'keyValueTable';
    const headers = keyValue ? [] : block.headers;
    const sourceRows = keyValue ? block.rows.map(row => [row.label, row.value]) : block.rows;
    const widthRatios = keyValue ? [30, 70] : block.columnWidths ?? block.headers.map(() => 1);
    const totalRatio = widthRatios.reduce((sum, value) => sum + value, 0);
    const widths = widthRatios.map(ratio => ratio / totalRatio * REPORT_PAPER.body);
    const fontSize = headers.length > 9 ? 8 : 8.5, lineHeight = fontSize * 1.55;
    const wrapCells = (cells: string[]) => cells.map((cell, column) => wrapReportText(cell, Math.max(fontSize, widths[column] - 6), fontSize));
    const headerLines = wrapCells(headers);
    const headerHeight = headerLines.length ? Math.max(...headerLines.map(lines => lines.length)) * lineHeight + TABLE_CELL_INSET : 0;
    const rows = sourceRows.map((row, index) => ({ index, lines: wrapCells(row) }));
    return { widths, fontSize, lineHeight, headerLines, headerHeight, rows };
}

function appendTableLayout(cursor: PageCursor, block: TableBlock, blockIndex: number) {
    const { widths, fontSize, lineHeight, headerLines, headerHeight, rows } = prepareTableLayout(block);
    let pendingTable: TableLayoutItem | null = null;
    const finishTable = () => {
        if (!pendingTable) return;
        cursor.currentPage.items.push(pendingTable);
        cursor.top = pendingTable.top + pendingTable.height + 14;
        pendingTable = null;
    };
    for (const row of rows) {
        let lineOffset = 0;
        const maxLines = Math.max(...row.lines.map(lines => lines.length), 1);
        while (lineOffset < maxLines) {
            if (!pendingTable) {
                if (cursor.top + headerHeight + lineHeight + TABLE_CELL_INSET + 1 > REPORT_PAPER.bottom) startNextPage(cursor);
                pendingTable = { kind: 'table', blockIndex, top: cursor.top, height: headerHeight + 1, fontSize, lineHeight, widths, headers: headerLines, headerHeight, rows: [] };
            }
            const availableHeight = REPORT_PAPER.bottom - pendingTable.top - pendingTable.height;
            const remainingHeight = (maxLines - lineOffset) * lineHeight + TABLE_CELL_INSET;
            if (remainingHeight > availableHeight && pendingTable.rows.length) { finishTable(); startNextPage(cursor); continue; }
            const lineCount = Math.min(maxLines - lineOffset, Math.floor((availableHeight - TABLE_CELL_INSET) / lineHeight));
            if (lineCount < 1) { finishTable(); startNextPage(cursor); continue; }
            const height = lineCount * lineHeight + TABLE_CELL_INSET;
            pendingTable.rows.push({ index: row.index, lines: row.lines.map(lines => lines.slice(lineOffset, lineOffset + lineCount)), height });
            pendingTable.height += height;
            lineOffset += lineCount;
            if (lineOffset < maxLines) { finishTable(); startNextPage(cursor); }
        }
    }
    finishTable();
}

export function layoutReportPages(blocks: FinalReportBlock[]): ReportPageLayout[] {
    const cursor: PageCursor = { pages: [], currentPage: { items: [] }, top: REPORT_PAPER.top };
    blocks.forEach((block, blockIndex) => {
        if (block.kind === 'pageBreak') startNextPage(cursor);
        else if (block.kind === 'cover') {
            startNextPage(cursor);
            cursor.currentPage.cover = block;
            startNextPage(cursor);
        } else if (block.kind === 'heading' || block.kind === 'paragraph') appendTextLayout(cursor, block, blockIndex);
        else if (block.kind === 'image') appendImageLayout(cursor, block, blockIndex);
        else appendTableLayout(cursor, block, blockIndex);
    });
    startNextPage(cursor);
    return cursor.pages;
}
