// 워크시트 캡처 그림을 A4 PDF 쪽에 나눠 싣는 배치를 계산한다.
//
// 그림 한 장을 페이지에 맞춰 통째로 줄이면 긴 표는 글자를 읽을 수 없을 만큼 작아진다.
// 그래서 폭만 본문에 맞추고, 본문 높이를 넘는 부분은 다음 쪽으로 이어 싣는다.

/** PDF 기본 단위(pt) 기준 A4 크기다. */
export const A4_PT = { width: 595.28, height: 841.89 };

/** 사방 10mm 여백이다. 프린터의 인쇄 불가 영역에 표 가장자리가 잘리지 않게 한다. */
export const PDF_MARGIN_PT = 28.35;

/** 화면 CSS px 1개는 96dpi 기준 0.75pt 다. 이 비율로 화면에서 본 크기를 보존한다. */
const PT_PER_CSS_PX = 0.75;

/** 개별 PDF 다운로드를 제공하는 워크시트다. 탭 id 와 독립 페이지 경로를 모두 적는다. */
export const WORKSHEET_PDF_IDS = [
    'spec',
    'attributes',
    'fitness',
    'attributes/fitness',
    'requirements',
    'kano-aggregation',
    'kano/analysis',
] as const;

export function isWorksheetPdfEnabled(worksheetId: string): boolean {
    return (WORKSHEET_PDF_IDS as readonly string[]).includes(worksheetId);
}

export interface WorksheetPdfPlan {
    pageWidth: number;
    pageHeight: number;
    margin: number;
    drawWidth: number;
    drawHeight: number;
    /** 각 쪽에서 그림 왼쪽 아래 모서리의 y 좌표다. 본문 밖으로 나간 부분은 잘라 낸다. */
    imageYs: number[];
}

export function planWorksheetPdfPages(widthPx: number, heightPx: number, pixelRatio = 2): WorksheetPdfPlan {
    if ([widthPx, heightPx, pixelRatio].some(value => !Number.isFinite(value) || value <= 0)) {
        throw new Error('그림 크기와 배율은 양수여야 합니다.');
    }
    // 가로로 넓은 표는 가로 방향이어야 덜 줄어든다.
    const landscape = widthPx > heightPx;
    const pageWidth = landscape ? A4_PT.height : A4_PT.width;
    const pageHeight = landscape ? A4_PT.width : A4_PT.height;
    const bodyWidth = pageWidth - PDF_MARGIN_PT * 2;
    const bodyHeight = pageHeight - PDF_MARGIN_PT * 2;
    const naturalWidth = widthPx / pixelRatio * PT_PER_CSS_PX;
    const naturalHeight = heightPx / pixelRatio * PT_PER_CSS_PX;
    // 작은 그림을 키우면 흐려지기만 하므로 축소만 한다.
    const scale = Math.min(1, bodyWidth / naturalWidth);
    const drawWidth = naturalWidth * scale;
    const drawHeight = naturalHeight * scale;
    const pageCount = Math.ceil(drawHeight / bodyHeight);
    const bodyTop = pageHeight - PDF_MARGIN_PT;
    const imageYs = Array.from({ length: pageCount }, (_, index) => bodyTop + index * bodyHeight - drawHeight);
    return { pageWidth, pageHeight, margin: PDF_MARGIN_PT, drawWidth, drawHeight, imageYs };
}

export function worksheetPdfFileName(stem: string): string {
    return `${stem}.pdf`;
}
