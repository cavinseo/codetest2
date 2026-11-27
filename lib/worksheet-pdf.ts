// 워크시트 캡처 그림을 A4 PDF 파일로 만든다.
import { PDFDocument, clip, endPath, popGraphicsState, pushGraphicsState, rectangle } from 'pdf-lib';
import { planWorksheetPdfPages } from './worksheet-pdf-layout';

export async function createWorksheetPdf(image: { pngDataUrl: string; widthPx: number; heightPx: number }, pixelRatio = 2): Promise<Blob> {
    const plan = planWorksheetPdfPages(image.widthPx, image.heightPx, pixelRatio);
    const pdf = await PDFDocument.create();
    // 같은 그림을 한 번만 넣고 쪽마다 참조해야 긴 표에서도 파일이 쪽 수만큼 커지지 않는다.
    const embedded = await pdf.embedPng(image.pngDataUrl);
    const bodyWidth = plan.pageWidth - plan.margin * 2;
    const bodyHeight = plan.pageHeight - plan.margin * 2;
    for (const imageY of plan.imageYs) {
        const page = pdf.addPage([plan.pageWidth, plan.pageHeight]);
        // 본문 밖으로 넘친 앞뒤 쪽 내용이 여백에 겹쳐 찍히지 않게 본문 사각형으로 자른다.
        page.pushOperators(pushGraphicsState(), rectangle(plan.margin, plan.margin, bodyWidth, bodyHeight), clip(), endPath());
        page.drawImage(embedded, { x: plan.margin, y: imageY, width: plan.drawWidth, height: plan.drawHeight });
        page.pushOperators(popGraphicsState());
    }
    return new Blob([new Uint8Array(await pdf.save())], { type: 'application/pdf' });
}
