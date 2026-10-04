// 인쇄용 캡처 동안만 테마와 스크롤 폭을 바꾸고 원래 워크시트 상태를 복구한다.
import { toCanvas } from 'html-to-image';
import type { CapturedWorksheetImage } from './final-report-document';
import { kanoSurveyFileNameStem } from './kano-survey-document';

/** 스크롤로 잘려 있는 안쪽 상자들. 캡처 전에 전부 펼쳐야 표 전체가 담긴다. */
const SCROLLABLE_SELECTOR = '.overflow-x-auto, .overflow-auto, .overflow-x-scroll, .overflow-scroll, .overflow-y-auto, .overflow-y-scroll, .overflow-hidden, .overflow-clip, textarea';

const DEFAULT_PIXEL_RATIO = 2;
const capturingNodes = new WeakSet<HTMLElement>();

type InlineStyleSnapshot = { element: HTMLElement | SVGElement; style: string | null };

function snapshotInlineStyles(elements: Array<HTMLElement | SVGElement>): InlineStyleSnapshot[] {
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
    node.classList.add('worksheet-image-capture');
    node.style.setProperty('background-color', '#ffffff', 'important');
    node.style.setProperty('background-image', 'none', 'important');
    node.style.setProperty('min-height', '0', 'important');
    node.style.setProperty('color', '#0f172a', 'important');
}

function displayInputValues(node: HTMLElement): Array<{ input: HTMLElement; label: HTMLElement }> {
    const replacements: Array<{ input: HTMLElement; label: HTMLElement }> = [];
    const fields = node.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select');
    for (const input of fields) {
        if (input.tagName === 'INPUT' && !['text', 'search', 'number', 'email', 'tel', 'url', 'date', 'time', 'month', 'week', 'datetime-local'].includes(input.type)) continue;
        const label = node.ownerDocument.createElement('span');
        label.className = input.className;
        label.style.cssText = input.style.cssText;
        label.textContent = input instanceof HTMLSelectElement
            ? Array.from(input.selectedOptions, option => option.textContent).join(', ')
            : input.value;
        for (const [property, value] of Object.entries({
            display: 'inline-block', height: 'auto', 'min-height': `${input.offsetHeight}px`,
            width: input.offsetWidth ? `${input.offsetWidth}px` : '100%', 'max-width': '100%',
            'white-space': 'pre-wrap', 'overflow-wrap': 'anywhere', overflow: 'visible',
            color: '#0f172a', 'background-color': '#ffffff', 'box-sizing': 'border-box',
        })) label.style.setProperty(property, value, 'important');
        input.replaceWith(label);
        replacements.push({ input, label });
    }
    return replacements;
}

/** 안쪽 스크롤부터 펼쳐야 바깥 컨테이너가 QFD 표 전체 폭을 측정할 수 있다. */
function expandScrollableAreas(elements: HTMLElement[]): void {
    for (const element of [...elements].reverse()) {
        element.style.setProperty('height', 'auto', 'important');
        element.style.setProperty('max-height', 'none', 'important');
        element.style.setProperty('overflow', 'visible', 'important');
        if (element.scrollWidth > element.clientWidth) {
            element.style.setProperty('width', `${element.scrollWidth}px`, 'important');
            element.style.setProperty('max-width', 'none', 'important');
        }
        element.scrollLeft = 0;
        element.scrollTop = 0;
    }
}

export async function waitForWorksheetReady(node: HTMLElement, title: string, timeoutMs = 60000): Promise<void> {
    const started = Date.now();
    while (true) {
        if (!node.isConnected) throw new Error('워크시트 화면이 변경되었습니다. 다시 시도해 주세요.');
        if (node.querySelector('[data-worksheet-state="error"], [role="alert"]')) {
            throw new Error(`${title} 화면을 불러오지 못했습니다. 워크시트를 다시 불러온 뒤 시도해 주세요.`);
        }
        if (!node.querySelector('[data-worksheet-state="loading"], .animate-spin, [aria-busy="true"]')) return;
        if (Date.now() - started >= timeoutMs) throw new Error(`${title} 화면을 불러오는 중입니다. 잠시 후 다시 시도해 주세요.`);
        await new Promise(resolve => setTimeout(resolve, 100));
    }
}

export function worksheetImageFileName(title: string, dataUrl: string): string {
    return `${kanoSurveyFileNameStem(title)}.${dataUrl.startsWith('data:image/jpeg') ? 'jpg' : 'png'}`;
}

export function downloadWorksheetImage(title: string, dataUrl: string): void {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = worksheetImageFileName(title, dataUrl);
    document.body.append(link);
    link.click();
    link.remove();
}

export async function captureWorksheetNode(node: HTMLElement, options: { pixelRatio?: number } = {}):
    Promise<Pick<CapturedWorksheetImage, 'pngDataUrl' | 'widthPx' | 'heightPx'>> {
    if (capturingNodes.has(node)) throw new Error('이 워크시트의 그림을 만들고 있습니다. 완료 후 다시 시도해 주세요.');
    capturingNodes.add(node);
    const worksheetId = node.dataset.worksheetId || node.id || 'unknown';
    const originalClass = node.getAttribute('class');
    const elements = [node, ...node.querySelectorAll<HTMLElement>(SCROLLABLE_SELECTOR)];
    for (const table of node.querySelectorAll('table')) {
        for (let parent = table.parentElement; parent && parent !== node; parent = parent.parentElement) {
            if (!elements.includes(parent)) {
                const childIndex = elements.findIndex(element => parent.contains(element));
                elements.splice(childIndex < 0 ? elements.length : childIndex, 0, parent);
            }
        }
    }
    const chartLabels = [...node.querySelectorAll<SVGElement>('[data-capture-chart-label], [data-capture-chart-label] *')];
    const originalStyles = snapshotInlineStyles([...elements, ...chartLabels]);
    const scrollPositions = elements.map(element => ({ element, left: element.scrollLeft, top: element.scrollTop }));
    let inputLabels: ReturnType<typeof displayInputValues> = [];
    try {
        await node.ownerDocument?.fonts?.ready;
        forcePrintTheme(node);
        // SVG 하위 요소는 라이브러리가 계산된 CSS를 복사하지 않아 인라인 색상이 필요하다.
        for (const label of chartLabels) {
            label.style.setProperty('fill', '#334155', 'important');
            label.style.setProperty('stroke', 'none', 'important');
        }
        inputLabels = displayInputValues(node);
        expandScrollableAreas(elements);
        const canvas = await toCanvas(node, {
            backgroundColor: '#ffffff',
            pixelRatio: options.pixelRatio ?? DEFAULT_PIXEL_RATIO,
            width: Math.max(node.scrollWidth, node.offsetWidth),
            height: Math.max(node.scrollHeight, node.offsetHeight),
            filter: element => !(element instanceof Element && element.hasAttribute('data-capture-exclude')),
        });
        // 고해상도 배율과 라이브러리 자동 축소가 반영된 실제 PNG 픽셀 치수를 넘긴다.
        const pngDataUrl = canvas.toDataURL('image/png');
        if (!pngDataUrl.startsWith('data:image/png')) throw new Error('이미지 크기가 브라우저의 지원 범위를 초과했습니다.');
        return { pngDataUrl, widthPx: canvas.width, heightPx: canvas.height };
    } catch (cause) {
        throw new Error(`워크시트 ${worksheetId} 캡처에 실패했습니다.`, { cause });
    } finally {
        capturingNodes.delete(node);
        for (const { input, label } of inputLabels) label.replaceWith(input);
        restoreInlineStyles(originalStyles);
        if (originalClass === null) node.removeAttribute('class');
        else node.setAttribute('class', originalClass);
        for (const { element, left, top } of scrollPositions) {
            element.scrollLeft = left;
            element.scrollTop = top;
        }
    }
}
