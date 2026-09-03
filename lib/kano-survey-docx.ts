// 설문지 모델을 Word(.docx)로 그린다. 문구와 행 규칙은 kano-survey-document.ts 에 있고
// 여기서는 배치와 서식만 정한다 — 그래서 이 파일은 스모크 테스트만 한다.
import {
    AlignmentType, Document, HeadingLevel, Packer, PageOrientation, Paragraph,
    Table, TableCell, TableRow, TextRun, VerticalAlign, WidthType, convertMillimetersToTwip,
} from 'docx';
import type { KanoSurveyDocumentModel } from './kano-survey-document';

// A4 세로. 양식이 그렇다.
const PAGE = {
    size: { orientation: PageOrientation.PORTRAIT, width: convertMillimetersToTwip(210), height: convertMillimetersToTwip(297) },
    margin: {
        top: convertMillimetersToTwip(20), bottom: convertMillimetersToTwip(20),
        left: convertMillimetersToTwip(20), right: convertMillimetersToTwip(20),
    },
};

// 열 너비(%). 질문 열이 넓고 응답 칸 5개가 같은 폭이다.
const COLUMN_WIDTHS = [8, 52, 8, 8, 8, 8, 8];

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

function headerRow(model: KanoSurveyDocumentModel): TableRow {
    return new TableRow({
        // 2쪽으로 넘어가면 머리글을 다시 찍는다. 양식도 그렇다.
        tableHeader: true,
        children: [
            new TableCell({
                columnSpan: 2,
                width: { size: COLUMN_WIDTHS[0] + COLUMN_WIDTHS[1], type: WidthType.PERCENTAGE },
                verticalAlign: VerticalAlign.CENTER,
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: model.questionHeader, bold: true })] })],
            }),
            ...model.answerLabels.map((label, i) => cell(label, { bold: true, align: AlignmentType.CENTER, width: COLUMN_WIDTHS[i + 2] })),
        ],
    });
}

function questionRow(no: string, text: string, answerCount: number): TableRow {
    return new TableRow({
        children: [
            cell(no, { align: AlignmentType.CENTER, width: COLUMN_WIDTHS[0] }),
            cell(text, { width: COLUMN_WIDTHS[1] }),
            // 응답 칸은 빈칸이다. 양식이 그렇다.
            ...Array.from({ length: answerCount }, (_, i) => cell('', { width: COLUMN_WIDTHS[i + 2] })),
        ],
    });
}

export async function renderKanoSurveyDocx(model: KanoSurveyDocumentModel): Promise<Buffer> {
    const doc = new Document({
        styles: { default: { document: { run: { font: '맑은 고딕', size: 20 } } } },
        sections: [{
            properties: { page: PAGE },
            children: [
                new Paragraph({ heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, children: [new TextRun({ text: model.title, bold: true })] }),
                new Paragraph({ spacing: { before: 200, after: 200 }, children: [new TextRun(model.guide)] }),
                new Paragraph({ spacing: { after: 300 }, children: [new TextRun(model.introduction)] }),
                new Table({
                    width: { size: 100, type: WidthType.PERCENTAGE },
                    rows: [headerRow(model), ...model.rows.map((row) => questionRow(row.no, row.text, model.answerLabels.length))],
                }),
                new Paragraph({ spacing: { before: 400 }, alignment: AlignmentType.CENTER, children: [new TextRun(model.closing)] }),
            ],
        }],
    });
    return Packer.toBuffer(doc);
}
