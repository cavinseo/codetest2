// 결과보고서 미리보기의 A4 페이지를 PDF 파일로 변환한다.
import { toPng } from 'html-to-image';
import { PDFDocument } from 'pdf-lib';
import { REPORT_PAPER } from '@/lib/final-report-layout';

export async function createFinalReportPdf(source: HTMLElement): Promise<Blob> {
    const pages = [...source.querySelectorAll<HTMLElement>('[data-report-page]')];
    if (pages.length === 0) throw new Error('PDF로 저장할 보고서 페이지가 없습니다.');

    await document.fonts.ready;
    await Promise.all([...source.querySelectorAll<HTMLImageElement>('img')].map(image => image.decode()));

    const pdf = await PDFDocument.create();
    for (const page of pages) {
        const png = await toPng(page, { backgroundColor: '#fff', pixelRatio: 2, style: { margin: '0', boxShadow: 'none' } });
        const image = await pdf.embedPng(png);
        pdf.addPage([REPORT_PAPER.width, REPORT_PAPER.height]).drawImage(image, {
            x: 0, y: 0, width: REPORT_PAPER.width, height: REPORT_PAPER.height,
        });
    }
    return new Blob([new Uint8Array(await pdf.save())], { type: 'application/pdf' });
}
