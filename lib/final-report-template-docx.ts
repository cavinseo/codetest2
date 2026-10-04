// A4 미리보기의 줄·행 분할과 표지 배치를 같은 페이지 순서로 Word에 출력한다.
import { AlignmentType, BorderStyle, Document, ExternalHyperlink, Footer, Header, HeightRule, ImageRun, LineRuleType, Packer, Paragraph, SectionType, ShadingType, Table, TableCell, TableLayoutType, TableRow, Tab, TabStopType, TextRun, VerticalAlign, VerticalMergeType, WidthType, type ISectionOptions } from 'docx';
import type { FinalReportModel } from './final-report-document';
import { getTableMergeSpans } from './final-report-table-merge';
import { reportColumnSpans } from './final-report-table-structure';
import { layoutReportPages, reportCoverElements, withReportOutputDate, wrapReportText, REPORT_CHAPTER_PADDING, REPORT_BOX, REPORT_PAPER, type CoverBlock, type ReportLayoutItem, type ReportPageLayout } from './final-report-layout';
import type { ReportTextRun } from './final-report-markdown';

const pointsToTwips = (points: number) => Math.round(points * 20);
const border = { style: BorderStyle.SINGLE, color: '929BA4', size: 4 };
const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };

interface WordParagraphStyle {
    bold?: boolean;
    color?: string;
    center?: boolean;
    font?: string;
    left?: number;
    marker?: string;
    markerWidth?: number;
    code?: boolean;
    quote?: boolean;
}

function paragraphTextRuns(lines: string[], fontSize: number, style: WordParagraphStyle, richLines?: ReportTextRun[][]): Array<TextRun | ExternalHyperlink> {
    if (richLines) {
        const children: Array<TextRun | ExternalHyperlink> = [];
        if (style.marker) children.push(new TextRun({ children: [style.marker, new Tab()], size: fontSize * 2, font: '맑은 고딕' }));
        richLines.forEach((line, lineIndex) => {
            if (!line.length) children.push(new TextRun({ text: '', ...(lineIndex ? { break: 1 } : {}), size: fontSize * 2 }));
            line.forEach((run, runIndex) => {
                const text = new TextRun({ text: run.text, ...(lineIndex && runIndex === 0 ? { break: 1 } : {}), size: fontSize * 2,
                    font: run.code ? 'Consolas' : style.font ?? '맑은 고딕', bold: style.bold || run.bold, italics: run.italic, strike: run.strike,
                    color: run.href ? '1D4ED8' : style.color ?? '1B1B1B', ...(run.href ? { underline: {} } : {}),
                    ...(run.code ? { shading: { fill: 'F1F3F5' } } : {}) });
                children.push(run.href && /^(https?:|mailto:)/i.test(run.href) ? new ExternalHyperlink({ link: run.href, children: [text] }) : text);
            });
        });
        return children;
    }
    return lines.map((text, index) => new TextRun({
        children: index === 0 && style.marker ? [style.marker, new Tab(), text] : [text],
        ...(index ? { break: 1 } : {}),
        size: fontSize * 2,
        font: style.font ?? '맑은 고딕',
        bold: style.bold,
        color: style.color ?? '1B1B1B',
    }));
}

function createWordParagraph(lines: string[], fontSize: number, lineHeight: number, style: WordParagraphStyle = {}, richLines?: ReportTextRun[][]) {
    const indent = style.left === undefined ? undefined : {
        left: pointsToTwips(style.left),
        ...(style.marker ? { hanging: pointsToTwips(style.markerWidth ?? 0) } : {}),
    };
    const tabStops = style.marker ? [{ type: TabStopType.LEFT, position: pointsToTwips(style.left ?? 0) }] : undefined;
    return new Paragraph({
        alignment: style.center ? AlignmentType.CENTER : AlignmentType.LEFT,
        indent,
        tabStops,
        ...(style.code ? { shading: { fill: 'F1F3F5' } } : {}),
        ...(style.quote ? { border: { left: { style: BorderStyle.SINGLE, color: '94A3B8', size: 12, space: 3 } } } : {}),
        spacing: { before: 0, after: 0, line: pointsToTwips(lineHeight), lineRule: LineRuleType.EXACT },
        children: paragraphTextRuns(lines, fontSize, style, richLines),
    });
}

function gap(height: number): Paragraph {
    return createWordParagraph([''], 1, Math.max(.1, height));
}

function renderTable(item: Extract<ReportLayoutItem, { kind: 'table' }>, block: FinalReportModel['blocks'][number], indent = 0) {
    const mergeSpans = getTableMergeSpans(item, block);
    const row = (cells: string[][], height: number, header: boolean, rowIndex = -1) => new TableRow({
        tableHeader: header, ...(header ? { cantSplit: true } : {}), height: { value: pointsToTwips(height), rule: HeightRule.ATLEAST },
        children: cells.flatMap((lines, index) => {
            const columnSpan = !header && block.kind === 'dataTable' ? reportColumnSpans(block, item.rows[rowIndex].index)[index] : 1;
            if (!columnSpan) return [];
            const span = rowIndex < 0 ? 1 : mergeSpans[rowIndex][index];
            const displayedLines = lines;
            return new TableCell({
            width: { size: pointsToTwips(item.widths.slice(index, index + columnSpan).reduce((sum, width) => sum + width, 0)), type: WidthType.DXA },
            columnSpan,
            margins: { top: pointsToTwips(6), bottom: pointsToTwips(6), left: pointsToTwips(3), right: pointsToTwips(3) },
            verticalAlign: span === 1 ? VerticalAlign.TOP : VerticalAlign.CENTER,
            ...(span > 1 ? { verticalMerge: VerticalMergeType.RESTART } : span === 0 ? { verticalMerge: VerticalMergeType.CONTINUE } : {}),
            shading: { type: ShadingType.CLEAR, fill: header ? 'E7ECF1' : block.kind === 'dataTable' && block.highlightRows?.includes(item.rows[rowIndex].index) ? 'DCFCE7' : 'FFFFFF' },
            children: [createWordParagraph(span === 0 ? [''] : displayedLines.length ? displayedLines : [''], item.fontSize, item.lineHeight, { bold: header, center: span > 1 }, header ? item.richHeaders?.[index] : item.rows[rowIndex].richLines?.[index])],
        }); }),
    });
    return new Table({
        width: { size: pointsToTwips(item.widths.reduce((sum, width) => sum + width, 0)), type: WidthType.DXA }, indent: { size: pointsToTwips(indent), type: WidthType.DXA }, layout: TableLayoutType.FIXED,
        columnWidths: item.widths.map(pointsToTwips), borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
        rows: [...(item.structuredHeaders ? item.structuredHeaders.map((header, headerIndex) => new TableRow({ tableHeader: true, cantSplit: true, height: { value: pointsToTwips(header.height), rule: HeightRule.ATLEAST },
            children: [...header.cells, ...(headerIndex === 1 ? item.structuredHeaders![0].cells.filter(cell => cell.rowSpan === 2).map(cell => ({ ...cell, lines: [''], rowSpan: 0 })) : [])].sort((a, b) => a.column - b.column).map(cell => new TableCell({
                columnSpan: cell.span, width: { size: pointsToTwips(item.widths.slice(cell.column, cell.column + cell.span).reduce((sum, width) => sum + width, 0)), type: WidthType.DXA },
                ...(cell.rowSpan === 2 ? { verticalMerge: VerticalMergeType.RESTART } : cell.rowSpan === 0 ? { verticalMerge: VerticalMergeType.CONTINUE } : {}),
                verticalAlign: VerticalAlign.CENTER, shading: { type: ShadingType.CLEAR, fill: 'E7ECF1' }, margins: { top: 120, bottom: 120, left: 60, right: 60 },
                children: [createWordParagraph(cell.lines, item.fontSize, item.lineHeight, { bold: true, center: true })],
            })),
        })) : item.headers.length ? [row(item.headers, item.headerHeight, true)] : []), ...item.rows.map((r, index) => row(r.lines, r.height, false, index))],
    });
}

function combinePageTableFragments(pages: ReportPageLayout[], blocks: FinalReportModel['blocks']): ReportPageLayout[] {
    const fullTables = new Map<number, Extract<ReportLayoutItem, { kind: 'table' }>>();
    for (const page of pages) {
        for (const item of page.items) {
            if (item.kind !== 'table') continue;
            const block = blocks[item.blockIndex];
            if (block?.kind !== 'dataTable' || block.title === '추가 시장 자료') continue;
            const existing = fullTables.get(item.blockIndex);
            if (!existing) {
                fullTables.set(item.blockIndex, { ...item, rows: [...item.rows], mergeSpans: undefined });
                continue;
            }
            for (const fragment of item.rows) {
                const previous = existing.rows.find(row => row.index === fragment.index);
                if (!previous) {
                    existing.rows.push(fragment);
                    continue;
                }
                previous.lines = previous.lines.map((lines, column) => [...lines, ...(fragment.lines[column] ?? [])]);
                if (previous.richLines && fragment.richLines) {
                    previous.richLines = previous.richLines.map((lines, column) => [...lines, ...(fragment.richLines?.[column] ?? [])]);
                }
                previous.height += fragment.height;
            }
        }
    }

    const insertedTables = new Set<number>();
    return pages.map(page => ({
        ...page,
        items: page.items.flatMap(item => {
            if (item.kind !== 'table' || !fullTables.has(item.blockIndex)) return [item];
            if (insertedTables.has(item.blockIndex)) return [];
            insertedTables.add(item.blockIndex);
            return [fullTables.get(item.blockIndex)!];
        }),
    })).filter(page => page.cover || page.items.length > 0);
}

function renderText(item: Extract<ReportLayoutItem, { kind: 'text' }>): Paragraph | Table {
    if (item.chapter) return new Table({
        width: { size: pointsToTwips(REPORT_PAPER.body), type: WidthType.DXA },
        borders: { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none },
        rows: [new TableRow({ height: { value: pointsToTwips(item.height), rule: HeightRule.EXACT }, children: [new TableCell({
            margins: { top: pointsToTwips(REPORT_CHAPTER_PADDING.vertical), bottom: pointsToTwips(REPORT_CHAPTER_PADDING.vertical), left: pointsToTwips(REPORT_CHAPTER_PADDING.horizontal), right: pointsToTwips(REPORT_CHAPTER_PADDING.horizontal) }, shading: { fill: 'E1E1E1' },
            children: [createWordParagraph(item.lines, item.fontSize, item.lineHeight, { bold: true })],
        })] })],
    });
    return createWordParagraph(item.lines, item.fontSize, item.lineHeight, { bold: item.bold, color: item.color, left: item.left, marker: item.marker, markerWidth: item.markerWidth, code: item.code, quote: item.quote }, item.richLines);
}

function coverChildren(cover: CoverBlock) {
    const children: Array<Paragraph | Table> = [];
    let cursor = REPORT_PAPER.top;
    for (const element of reportCoverElements(cover)) {
        if (element.kind === 'divider') {
            children.push(gap(Math.max(.1, element.top - cursor)));
            children.push(new Paragraph({ shading: { fill: '959595' }, spacing: { before: 0, after: 0, line: pointsToTwips(element.height), lineRule: LineRuleType.EXACT }, children: [new TextRun({ text: ' ', size: 2 })] }));
            cursor = element.top + element.height;
        } else {
            if (element.top > cursor) children.push(gap(element.top - cursor));
            const lines = wrapReportText(element.text, REPORT_PAPER.body, element.fontSize);
            children.push(createWordParagraph(lines, element.fontSize, element.fontSize * 1.55, { bold: element.bold, center: true, font: element.kind === 'title' ? '바탕' : undefined }));
            cursor = element.top + lines.length * element.fontSize * 1.55;
        }
    }
    return children;
}

function renderImage(item: Extract<ReportLayoutItem, { kind: 'image' }>) {
    return new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0, line: pointsToTwips(item.height), lineRule: LineRuleType.EXACT }, children: [new ImageRun({
        type: item.block.pngDataUrl.startsWith('data:image/jpeg;') ? 'jpg' : 'png', data: item.block.pngDataUrl,
        transformation: { width: item.width * 96 / 72, height: item.height * 96 / 72 },
        altText: { title: item.block.title, description: item.block.title, name: item.block.title },
    })] });
}

function renderBox(item: Extract<ReportLayoutItem, { kind: 'box' }>) {
    const { padding, headerHeight } = REPORT_BOX;
    const children: Array<Paragraph | Table> = [];
    let cursor = headerHeight + padding;
    for (const child of item.items) {
        if (child.top > cursor) children.push(gap(child.top - cursor));
        if (child.kind === 'text') children.push(renderText(child));
        else if (child.kind === 'table') children.push(renderTable(child, { kind: 'paragraph', text: '' }, 0));
        cursor = child.top + child.height;
    }
    // Word의 중첩 표 뒤에는 문단이 필요하므로 배치에서도 예약한 1pt만 사용한다.
    children.push(gap(1));
    return new Table({
        width: { size: pointsToTwips(item.width), type: WidthType.DXA },
        indent: { size: pointsToTwips(0), type: WidthType.DXA }, layout: TableLayoutType.FIXED,
        columnWidths: [pointsToTwips(item.width)], borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
        rows: [
            new TableRow({ tableHeader: true, cantSplit: true, height: { value: pointsToTwips(headerHeight), rule: HeightRule.ATLEAST }, children: [new TableCell({
                margins: { top: pointsToTwips(6), bottom: pointsToTwips(6), left: pointsToTwips(3), right: pointsToTwips(3) }, shading: { fill: 'E7ECF1' },
                children: [createWordParagraph([item.title], 9, 14, { bold: true, center: true })],
            })] }),
            new TableRow({ cantSplit: true, height: { value: pointsToTwips(item.height - headerHeight), rule: HeightRule.ATLEAST }, children: [new TableCell({
                margins: { top: pointsToTwips(padding), bottom: pointsToTwips(padding), left: pointsToTwips(padding), right: pointsToTwips(padding) }, children,
            })] }),
        ],
    });
}

function renderPageContents(page: ReportPageLayout, blocks: FinalReportModel['blocks']): Array<Paragraph | Table> {
    if (page.cover) return coverChildren(page.cover);
    const children: Array<Paragraph | Table> = [];
    let cursor = REPORT_PAPER.top;
    for (const item of page.items) {
        if (item.top > cursor) children.push(gap(item.top - cursor));
        if (item.kind === 'box') children.push(renderBox(item));
        else if (item.kind === 'text') children.push(renderText(item));
        else if (item.kind === 'table') children.push(renderTable(item, blocks[item.blockIndex]));
        else children.push(renderImage(item));
        cursor = item.top + item.height;
    }
    return children;
}

function createPageSection(page: ReportPageLayout, index: number, projectName: string, blocks: FinalReportModel['blocks']): ISectionOptions {
    return {
        properties: { type: SectionType.NEXT_PAGE, page: {
            size: { width: pointsToTwips(REPORT_PAPER.width), height: pointsToTwips(REPORT_PAPER.height) },
            margin: { top: pointsToTwips(REPORT_PAPER.top), bottom: pointsToTwips(REPORT_PAPER.height - REPORT_PAPER.bottom), left: pointsToTwips(REPORT_PAPER.margin), right: pointsToTwips(REPORT_PAPER.margin), header: pointsToTwips(20), footer: pointsToTwips(18) },
        } },
        headers: { default: new Header({ children: [new Paragraph({ shading: { fill: '888888' }, spacing: { before: 0, after: 0, line: pointsToTwips(17), lineRule: LineRuleType.EXACT }, children: [new TextRun({ text: `  KS-QFD 활용 제품개선보고서    ${projectName}`, color: 'FFFFFF', size: 16 })] })] }) },
        footers: { default: new Footer({ children: [createWordParagraph([String(index + 1)], 8.5, 21, { color: '747474', center: true })] }) },
        children: renderPageContents(page, blocks),
    };
}

export async function renderTemplateReportDocx(reportModel: FinalReportModel): Promise<Blob> {
    const datedReport = withReportOutputDate(reportModel);
    const pages = combinePageTableFragments(layoutReportPages(datedReport.blocks), datedReport.blocks);
    const projectName = datedReport.blocks.find((block): block is CoverBlock => block.kind === 'cover')?.projectName ?? '';
    const sections = pages.map((page, index) => createPageSection(page, index, projectName, datedReport.blocks));
    // 자동 삽입되는 구역 나눔의 빈 문단이 꽉 찬 표 뒤에 빈 페이지를 만들지 않게 한다.
    const doc = new Document({ title: datedReport.title, styles: { default: { document: { run: { font: '맑은 고딕', size: 18 }, paragraph: { spacing: { before: 0, after: 0, line: pointsToTwips(1), lineRule: LineRuleType.EXACT } } } } }, sections });
    return new Blob([await Packer.toBlob(doc)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}
