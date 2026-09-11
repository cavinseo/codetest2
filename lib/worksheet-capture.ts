// 인쇄용 캡처 동안만 테마와 스크롤 폭을 바꾸고 원래 워크시트 상태를 복구한다.
import { toCanvas } from 'html-to-image';
import type { CapturedWorksheetImage } from './final-report-document';

/** 가로 스크롤로 잘려 있는 안쪽 상자들. 캡처 전에 전부 펼쳐야 표 전체가 담긴다. */
const SCROLLABLE_SELECTOR = '.overflow-x-auto, .overflow-auto, .overflow-x-scroll, .overflow-scroll';

const DEFAULT_PIXEL_RATIO = 2;

type InlineStyleSnapshot = { element: HTMLElement; style: string | null };

function snapshotInlineStyles(elements: HTMLElement[]): InlineStyleSnapshot[] {
    return elements.map(element => ({ element, style: element.getAttribute('style') }));
}

function restoreInlineStyles(snapshots: InlineStyleSnapshot[]): void {
    for (const { element, style } of snapshots) {
        if (style === null) element.removeAttribute('style');
        else element.setAttribute('style', style);
    }
}

/** 흰 배경만 지정하면 흰 글자가 남으므로 기존 .light 하위 색상 규칙도 적용한다. */
function forcePrintTheme(node: HTMLElement): void {
    node.classList.remove('dark');
    node.classList.add('light');
    node.style.setProperty('background-color', '#ffffff', 'important');
    node.style.setProperty('color', '#0f172a', 'important');
}

/** 안쪽 스크롤부터 펼쳐야 바깥 컨테이너가 QFD 표 전체 폭을 측정할 수 있다. */
function expandScrollableWidths(elements: HTMLElement[]): void {
    for (const element of [...elements].reverse()) {
        if (element.scrollWidth > element.clientWidth) {
            element.style.setProperty('width', `${element.scrollWidth}px`, 'important');
            element.style.setProperty('max-width', 'none', 'important');
            element.style.setProperty('overflow', 'visible', 'important');
        }
    }
}

export async function captureWorksheetNode(node: HTMLElement, options: { pixelRatio?: number } = {}):
    Promise<Pick<CapturedWorksheetImage, 'pngDataUrl' | 'widthPx' | 'heightPx'>> {
    const worksheetId = node.dataset.worksheetId || node.id || 'unknown';
    const originalClass = node.getAttribute('class');
    const elements = [node, ...node.querySelectorAll<HTMLElement>(SCROLLABLE_SELECTOR)];
    const originalStyles = snapshotInlineStyles(elements);
    try {
        forcePrintTheme(node);
        expandScrollableWidths(elements);
        const canvas = await toCanvas(node, {
            backgroundColor: '#ffffff',
            pixelRatio: options.pixelRatio ?? DEFAULT_PIXEL_RATIO,
            width: Math.max(node.scrollWidth, node.offsetWidth),
            height: Math.max(node.scrollHeight, node.offsetHeight),
        });
        // 고해상도 배율과 라이브러리 자동 축소가 반영된 실제 PNG 픽셀 치수를 넘긴다.
        return { pngDataUrl: canvas.toDataURL('image/png'), widthPx: canvas.width, heightPx: canvas.height };
    } catch (cause) {
        throw new Error(`워크시트 ${worksheetId} 캡처에 실패했습니다.`, { cause });
    } finally {
        restoreInlineStyles(originalStyles);
        if (originalClass === null) node.removeAttribute('class');
        else node.setAttribute('class', originalClass);
    }
}
