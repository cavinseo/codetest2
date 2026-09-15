// 모델의 내용 결정을 보존하면서 브라우저에서 Word 문서로 직렬화한다.
import {
    AlignmentType, Document, HeadingLevel, ImageRun, Packer, PageOrientation, Paragraph,
    SectionType, Table, TableCell, TableRow, TextRun, VerticalAlign, WidthType, convertMillimetersToTwip,
    type ISectionOptions,
} from 'docx';
import type { FinalReportBlock, FinalReportModel } from './final-report-document';

const PAGE = {
    size: { orientation: PageOrientation.PORTRAIT, width: convertMillimetersToTwip(210), height: convertMillimetersToTwip(297) },
    margin: {
        top: convertMillimetersToTwip(20), bottom: convertMillimetersToTwip(20),
        left: convertMillimetersToTwip(20), right: convertMillimetersToTwip(20),
    },
};

function cell(text: string, options: { bold?: boolean; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; width: number }) {
    return new TableCell({
        width: { size: options.width, type: WidthType.PERCENTAGE },
        verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({
            alignment: options.align ?? AlignmentType.LEFT,
            children: [new TextRun({ text, bold: options.bold })],
        })],
    });
}

function renderBlock(block: FinalReportBlock): Paragraph | Table {
    switch (block.kind) {
        case 'heading':
            return new Paragraph({
                heading: block.level === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
                children: [new TextRun(block.text)],
            });
        case 'paragraph':
            return new Paragraph({ children: [new TextRun(block.text)] });
        case 'keyValueTable':
            return new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                rows: block.rows.map(row => new TableRow({ children: [
                    cell(row.label, { width: 30, bold: true }), cell(row.value, { width: 70 }),
                ] })),
            });
        case 'dataTable':
            return new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                rows: [
                    new TableRow({
                        tableHeader: true,
                        children: block.headers.map(text => cell(text, { width: 100 / block.headers.length, bold: true, align: AlignmentType.CENTER })),
                    }),
                    ...block.rows.map(row => new TableRow({
                        children: row.map(text => cell(text, { width: 100 / block.headers.length })),
                    })),
                ],
            });
        case 'image':
            return new Paragraph({ children: [new ImageRun({
                type: block.pngDataUrl.startsWith('data:image/jpeg;') ? 'jpg' : 'png',
                // docx가 dataURL을 atob로 해독하므로 브라우저에 없는 Buffer를 사용하지 않는다.
                data: block.pngDataUrl,
                // 설치된 docx는 픽셀에 9,525를 곱해 EMU로 바꾸므로 96dpi로 mm를 환산한다.
                transformation: { width: block.widthMm * 96 / 25.4, height: block.heightMm * 96 / 25.4 },
                altText: { title: block.title, description: block.title, name: block.title },
            })] });
        default: {
            const exhaustive: never = block;
            return exhaustive;
        }
    }
}

export async function renderFinalReportDocx(model: FinalReportModel): Promise<Blob> {
    const sections: ISectionOptions[] = [];
    let portrait: Array<Paragraph | Table> = [];
    const flushPortrait = () => {
        if (portrait.length > 0) {
            sections.push({ properties: { page: PAGE, type: SectionType.NEXT_PAGE }, children: portrait });
            portrait = [];
        }
    };
    for (const block of model.blocks) {
        const child = renderBlock(block);
        if (block.kind === 'image' && block.landscape) {
            flushPortrait();
            sections.push({
                properties: {
                    type: SectionType.NEXT_PAGE,
                    // docx가 LANDSCAPE일 때 폭과 높이를 교환하므로 A4 원래 치수를 유지한다.
                    page: { ...PAGE, size: { ...PAGE.size, orientation: PageOrientation.LANDSCAPE } },
                },
                children: [child],
            });
        } else {
            portrait.push(child);
        }
    }
    flushPortrait();
    if (sections.length === 0) sections.push({ properties: { page: PAGE }, children: [] });
    const doc = new Document({
        title: model.title,
        styles: { default: { document: { run: { font: '맑은 고딕', size: 20 } } } },
        sections,
    });
    return new Blob([await Packer.toBlob(doc)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}
