// Word(.docx) 문서들이 함께 쓰는 쪽 설정과 표 칸.
//
// Kano 설문지와 결과보고서(간이 양식)가 A4 쪽 설정과 글자 칸 함수를 똑같이 복사해 들고
// 있었다(2026-10-25 코드 리뷰 D8). 한쪽만 여백이나 칸 정렬을 고치면 두 문서가 어긋난다.
import { AlignmentType, PageOrientation, Paragraph, TableCell, TextRun, VerticalAlign, WidthType, convertMillimetersToTwip } from 'docx';

/** A4 세로, 사방 여백 20mm. */
export const A4_PORTRAIT_PAGE = {
    size: { orientation: PageOrientation.PORTRAIT, width: convertMillimetersToTwip(210), height: convertMillimetersToTwip(297) },
    margin: {
        top: convertMillimetersToTwip(20), bottom: convertMillimetersToTwip(20),
        left: convertMillimetersToTwip(20), right: convertMillimetersToTwip(20),
    },
};

/** 글자 한 줄짜리 표 칸. width 는 표 너비에 대한 백분율이다. */
export function textCell(text: string, options: { bold?: boolean; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; width: number }) {
    return new TableCell({
        width: { size: options.width, type: WidthType.PERCENTAGE },
        verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({
            alignment: options.align ?? AlignmentType.LEFT,
            children: [new TextRun({ text, bold: options.bold })],
        })],
    });
}
