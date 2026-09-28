// 미리보기와 Word가 함께 사용하는 A4 페이지 배치와 긴 표 분할을 계산한다.
import type { FinalReportBlock, FinalReportModel } from './final-report-document';

export const REPORT_PAPER = { width: 595.28, height: 841.89, margin: 42, top: 53, bottom: 787, body: 511.28 };
export type CoverBlock = Extract<FinalReportBlock, { kind: 'cover' }>;
export type ReportLayoutItem =
    | { kind: 'text'; blockIndex: number; lines: string[]; top: number; height: number; fontSize: number; lineHeight: number; bold: boolean; color: string; chapter: boolean; section: boolean }
    | { kind: 'table'; blockIndex: number; top: number; height: number; fontSize: number; lineHeight: number; widths: number[]; headers: string[][]; headerHeight: number; rows: Array<{ index: number; lines: string[][]; height: number }>; keyValue: boolean }
    | { kind: 'image'; blockIndex: number; top: number; height: number; width: number; block: Extract<FinalReportBlock, { kind: 'image' }> };
export interface ReportPageLayout { cover?: CoverBlock; items: ReportLayoutItem[] }

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
        let line = '', used = 0;
        for (const character of paragraph) {
            const nextWidth = characterWidth(character, fontSize);
            if (line && used + nextWidth > width) { lines.push(line); line = ''; used = 0; }
            line += character; used += nextWidth;
        }
        lines.push(line);
    }
    return lines;
}

export function layoutReportPages(blocks: FinalReportBlock[]): ReportPageLayout[] {
    const pages: ReportPageLayout[] = [];
    let page: ReportPageLayout = { items: [] }, y = REPORT_PAPER.top;
    const nextPage = () => {
        if (page.cover || page.items.length) pages.push(page);
        page = { items: [] }; y = REPORT_PAPER.top;
    };
    blocks.forEach((block, blockIndex) => {
        if (block.kind === 'pageBreak') { nextPage(); return; }
        if (block.kind === 'cover') { nextPage(); page.cover = block; nextPage(); return; }
        if (block.kind === 'heading' || block.kind === 'paragraph') {
            const chapter = block.kind === 'heading' && block.level === 1;
            const section = block.kind === 'heading' && block.level === 2;
            const tone = block.kind === 'paragraph' ? block.tone : undefined;
            const fontSize = chapter ? 12.5 : section ? 11.5 : tone === 'caption' ? 7.5 : tone ? 8.5 : 9.2;
            const lineHeight = fontSize * 1.55;
            const inset = chapter ? 20 : section ? 17 : 0;
            const lines = wrapReportText(block.text, REPORT_PAPER.body - inset, fontSize);
            const padding = chapter ? 12 : 0;
            const height = lines.length * lineHeight + padding;
            if ((chapter || section || tone === 'analysis') && y + Math.min(height + 65, 140) > REPORT_PAPER.bottom) nextPage();
            let start = 0;
            while (start < lines.length) {
                const count = Math.min(lines.length - start, Math.floor((REPORT_PAPER.bottom - y - padding) / lineHeight));
                if (count < 1) { nextPage(); continue; }
                const itemHeight = count * lineHeight + padding;
                page.items.push({ kind: 'text', blockIndex, lines: lines.slice(start, start + count), top: y, height: itemHeight, fontSize, lineHeight,
                    bold: chapter || section || tone === 'analysis', color: tone === 'analysis' ? '3C5470' : tone === 'notice' ? '986018' : tone === 'caption' ? '666666' : '1B1B1B', chapter, section });
                y += itemHeight + (chapter ? 15 : section ? 12 : tone === 'analysis' ? 3 : 8);
                start += count;
                if (start < lines.length) nextPage();
            }
            return;
        }
        if (block.kind === 'image') {
            const scale = Math.min(1, REPORT_PAPER.body / (block.widthMm * 72 / 25.4), 590 / (block.heightMm * 72 / 25.4));
            const width = block.widthMm * 72 / 25.4 * scale, height = block.heightMm * 72 / 25.4 * scale;
            if (y + height > REPORT_PAPER.bottom) nextPage();
            page.items.push({ kind: 'image', blockIndex, top: y, height, width, block }); y += height + 15;
            return;
        }
        const keyValue = block.kind === 'keyValueTable';
        const headers = keyValue ? [] : block.headers;
        const sourceRows = keyValue ? block.rows.map(row => [row.label, row.value]) : block.rows;
        const ratios = keyValue ? [30, 70] : block.columnWidths ?? block.headers.map(() => 1);
        const total = ratios.reduce((sum, value) => sum + value, 0);
        const widths = ratios.map(value => value / total * REPORT_PAPER.body);
        const fontSize = headers.length > 9 ? 8 : 8.5, lineHeight = fontSize * 1.55;
        const wrapCells = (cells: string[]) => cells.map((cell, i) => wrapReportText(cell, Math.max(fontSize, widths[i] - 6), fontSize));
        const headerLines = wrapCells(headers);
        // 셀의 위아래 여백 12pt와 브라우저에서 반올림되는 테두리 1pt를 함께 계산한다.
        const cellInset = 13;
        const headerHeight = headerLines.length ? Math.max(...headerLines.map(lines => lines.length)) * lineHeight + cellInset : 0;
        const rows = sourceRows.map((row, index) => ({ index, lines: wrapCells(row) }));
        let pending: Extract<ReportLayoutItem, { kind: 'table' }> | null = null;
        const finishTable = () => {
            if (pending) { page.items.push(pending); y = pending.top + pending.height + 14; pending = null; }
        };
        for (const row of rows) {
            let lineOffset = 0;
            const maxLines = Math.max(...row.lines.map(lines => lines.length), 1);
            while (lineOffset < maxLines) {
                if (!pending) {
                    if (y + headerHeight + lineHeight + cellInset + 1 > REPORT_PAPER.bottom) nextPage();
                    pending = { kind: 'table', blockIndex, top: y, height: headerHeight + 1, fontSize, lineHeight, widths, headers: headerLines, headerHeight, rows: [], keyValue };
                }
                const available = REPORT_PAPER.bottom - pending.top - pending.height;
                const fullHeight = (maxLines - lineOffset) * lineHeight + cellInset;
                if (fullHeight > available && pending.rows.length) { finishTable(); nextPage(); continue; }
                const count = Math.min(maxLines - lineOffset, Math.floor((available - cellInset) / lineHeight));
                if (count < 1) { finishTable(); nextPage(); continue; }
                const height = count * lineHeight + cellInset;
                pending.rows.push({ index: row.index, lines: row.lines.map(lines => lines.slice(lineOffset, lineOffset + count)), height });
                pending.height += height; lineOffset += count;
                if (lineOffset < maxLines) { finishTable(); nextPage(); }
            }
        }
        finishTable();
    });
    nextPage();
    return pages;
}
