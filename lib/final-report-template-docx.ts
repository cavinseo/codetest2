// A4 미리보기의 줄·행 분할과 표지 배치를 같은 페이지 순서로 Word에 출력한다.
import { AlignmentType, BorderStyle, Document, Footer, Header, HeightRule, ImageRun, LineRuleType, Packer, Paragraph, SectionType, ShadingType, Table, TableCell, TableLayoutType, TableRow, TextRun, VerticalAlign, WidthType, type ISectionOptions } from 'docx';
import type { FinalReportModel } from './final-report-document';
import { layoutReportPages, withReportOutputDate, wrapReportText, REPORT_PAPER, type CoverBlock, type ReportLayoutItem } from './final-report-layout';

const twip = (points: number) => Math.round(points * 20);
const border = { style: BorderStyle.SINGLE, color: '929BA4', size: 4 };
const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };

function paragraph(lines: string[], fontSize: number, lineHeight: number, options: { bold?: boolean; color?: string; center?: boolean; font?: string } = {}) {
    return new Paragraph({
        alignment: options.center ? AlignmentType.CENTER : AlignmentType.LEFT,
        spacing: { before: 0, after: 0, line: twip(lineHeight), lineRule: LineRuleType.EXACT },
        children: lines.map((text, index) => new TextRun({ text, ...(index ? { break: 1 } : {}), size: fontSize * 2, font: options.font ?? '맑은 고딕', bold: options.bold, color: options.color ?? '1B1B1B' })),
    });
}

function gap(height: number): Paragraph {
    return paragraph([''], 1, Math.max(.1, height));
}

function renderTable(item: Extract<ReportLayoutItem, { kind: 'table' }>) {
    const row = (cells: string[][], height: number, header: boolean) => new TableRow({
        tableHeader: header, cantSplit: true, height: { value: twip(height), rule: HeightRule.EXACT },
        children: cells.map((lines, index) => new TableCell({
            width: { size: twip(item.widths[index]), type: WidthType.DXA },
            margins: { top: twip(6), bottom: twip(6), left: twip(3), right: twip(3) },
            verticalAlign: VerticalAlign.TOP,
            shading: { type: ShadingType.CLEAR, fill: header ? 'E7ECF1' : 'FFFFFF' },
            children: [paragraph(lines.length ? lines : [''], item.fontSize, item.lineHeight, { bold: header })],
        })),
    });
    return new Table({
        width: { size: twip(REPORT_PAPER.body), type: WidthType.DXA }, layout: TableLayoutType.FIXED,
        columnWidths: item.widths.map(twip), borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
        rows: [...(item.headers.length ? [row(item.headers, item.headerHeight, true)] : []), ...item.rows.map(r => row(r.lines, r.height, false))],
    });
}

function renderText(item: Extract<ReportLayoutItem, { kind: 'text' }>): Paragraph | Table {
    if (item.chapter) return new Table({
        width: { size: twip(REPORT_PAPER.body), type: WidthType.DXA },
        borders: { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none },
        rows: [new TableRow({ height: { value: twip(item.height), rule: HeightRule.EXACT }, children: [new TableCell({
            margins: { top: twip(6), bottom: twip(6), left: twip(10), right: twip(10) }, shading: { fill: 'E1E1E1' },
            children: [paragraph(item.lines, item.fontSize, item.lineHeight, { bold: true })],
        })] })],
    });
    return paragraph(item.section ? item.lines.map((line, i) => `${i ? '　 ' : '▪  '}${line}`) : item.lines, item.fontSize, item.lineHeight, { bold: item.bold, color: item.color });
}

function coverChildren(cover: CoverBlock) {
    const children: Array<Paragraph | Table> = [];
    let cursor = REPORT_PAPER.top;
    const line = (top: number, text: string, size: number, bold = false, font?: string) => {
        if (top > cursor) children.push(gap(top - cursor));
        const lines = wrapReportText(text, REPORT_PAPER.body, size);
        children.push(paragraph(lines, size, size * 1.55, { bold, center: true, font }));
        cursor = top + lines.length * size * 1.55;
    };
    line(96, 'KS-QFD 제품개발 및 개선프로그램 결과보고서', 11, true);
    line(218, cover.title, 25, true, '바탕');
    line(260, cover.projectName, 12);
    line(302, `기업명: ${cover.companyName}`, 15, true);
    children.push(gap(Math.max(.1, 339 - cursor)));
    children.push(new Paragraph({ shading: { fill: '959595' }, spacing: { before: 0, after: 0, line: twip(10), lineRule: LineRuleType.EXACT }, children: [new TextRun({ text: ' ', size: 2 })] }));
    cursor = 349;
    line(442, `작성일: ${cover.outputDate}`, 13);
    line(510, `코치명: ${cover.coachName}`, 13);
    line(650, '케이랩스\nKS-QFD', 17, true);
    return children;
}

export async function renderTemplateReportDocx(input: FinalReportModel): Promise<Blob> {
    const model = withReportOutputDate(input);
    const pages = layoutReportPages(model.blocks);
    const project = model.blocks.find((block): block is CoverBlock => block.kind === 'cover')?.projectName ?? '';
    const sections: ISectionOptions[] = pages.map((page, index) => {
        const children: Array<Paragraph | Table> = [];
        let cursor = REPORT_PAPER.top;
        if (page.cover) children.push(...coverChildren(page.cover));
        else for (const item of page.items) {
            if (item.top > cursor) children.push(gap(item.top - cursor));
            if (item.kind === 'text') children.push(renderText(item));
            else if (item.kind === 'table') children.push(renderTable(item));
            else children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0, line: twip(item.height), lineRule: LineRuleType.EXACT }, children: [new ImageRun({
                type: item.block.pngDataUrl.startsWith('data:image/jpeg;') ? 'jpg' : 'png', data: item.block.pngDataUrl,
                transformation: { width: item.width * 96 / 72, height: item.height * 96 / 72 },
                altText: { title: item.block.title, description: item.block.title, name: item.block.title },
            })] }));
            cursor = item.top + item.height;
        }
        return {
            properties: { type: SectionType.NEXT_PAGE, page: {
                size: { width: twip(REPORT_PAPER.width), height: twip(REPORT_PAPER.height) },
                margin: { top: twip(REPORT_PAPER.top), bottom: twip(REPORT_PAPER.height - REPORT_PAPER.bottom), left: twip(42), right: twip(42), header: twip(20), footer: twip(18) },
            } },
            headers: { default: new Header({ children: [new Paragraph({ shading: { fill: '888888' }, spacing: { before: 0, after: 0, line: twip(17), lineRule: LineRuleType.EXACT }, children: [new TextRun({ text: `  KS-QFD 활용 제품개선보고서    ${project}`, color: 'FFFFFF', size: 16 })] })] }) },
            footers: { default: new Footer({ children: [paragraph([String(index + 1)], 8.5, 21, { color: '747474', center: true })] }) },
            children,
        };
    });
    // 자동 삽입되는 구역 나눔의 빈 문단이 꽉 찬 표 뒤에 빈 페이지를 만들지 않게 한다.
    const doc = new Document({ title: model.title, styles: { default: { document: { run: { font: '맑은 고딕', size: 18 }, paragraph: { spacing: { before: 0, after: 0, line: twip(1), lineRule: LineRuleType.EXACT } } } } }, sections });
    return new Blob([await Packer.toBlob(doc)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}
