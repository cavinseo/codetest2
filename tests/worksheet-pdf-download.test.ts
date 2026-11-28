// 개별 PDF 다운로드가 WS-2·3·4·5·7 에만 나타나고 캡처 그림을 A4 쪽으로 나눠 담는지 검증한다.
// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { toCanvas } from 'html-to-image';
import WorksheetImageExport from '../components/project/WorksheetImageExport';
import { createWorksheetPdf } from '../lib/worksheet-pdf';
import { downloadBlobAsFile } from '../lib/file-download';

vi.mock('html-to-image', () => ({ toCanvas: vi.fn() }));
vi.mock('../lib/file-download', () => ({ downloadBlobAsFile: vi.fn() }));
vi.mock('../lib/worksheet-pdf', async importOriginal => {
    const actual = await importOriginal<typeof import('../lib/worksheet-pdf')>();
    return { createWorksheetPdf: vi.fn(actual.createWorksheetPdf) };
});
afterEach(() => { document.body.replaceChildren(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

const ONE_PIXEL_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

async function renderExport(props: { worksheetId: string; projectId?: string }) {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(createElement(WorksheetImageExport, {
        title: 'WS-2 스펙', ...props, children: createElement('p', null, '현재 결과'),
    })));
    return { container, unmount: () => act(async () => root.unmount()) };
}

function pdfButton(container: HTMLElement) {
    return [...container.querySelectorAll('button')].find(button => button.textContent === 'PDF 다운로드');
}

it('허용된 워크시트에서 PDF 버튼을 누르면 캡처 그림으로 PDF 를 만들어 내려받는다', async () => {
    vi.mocked(toCanvas).mockResolvedValue({ width: 200, height: 100, toDataURL: () => ONE_PIXEL_PNG } as HTMLCanvasElement);
    vi.stubGlobal('fetch', vi.fn());
    const { container, unmount } = await renderExport({ worksheetId: 'spec', projectId: 'p1' });
    const button = pdfButton(container)!;
    expect(button.getAttribute('aria-label')).toBe('WS-2 스펙 PDF 다운로드');
    await act(async () => button.click());
    expect(createWorksheetPdf).toHaveBeenCalledWith({ pngDataUrl: ONE_PIXEL_PNG, widthPx: 200, heightPx: 100 });
    expect(downloadBlobAsFile).toHaveBeenCalledOnce();
    const [blob, fileName] = vi.mocked(downloadBlobAsFile).mock.calls[0];
    expect(fileName).toBe('WS-2 스펙.pdf');
    expect(blob.type).toBe('application/pdf');
    expect(container.querySelector('[role="alert"]')).toBeNull();
    await unmount();
});

it('PDF 생성이 실패하면 오류를 보여 주고 내려받지 않는다', async () => {
    vi.mocked(toCanvas).mockResolvedValue({ width: 200, height: 100, toDataURL: () => ONE_PIXEL_PNG } as HTMLCanvasElement);
    vi.mocked(createWorksheetPdf).mockRejectedValueOnce('깨짐');
    const { container, unmount } = await renderExport({ worksheetId: 'kano/analysis', projectId: 'p1' });
    await act(async () => pdfButton(container)!.click());
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('PDF를 만들지 못했습니다. 다시 시도해 주세요.');
    expect(downloadBlobAsFile).not.toHaveBeenCalled();
    await unmount();
});

it('다른 워크시트와 결과보고서 캡처 단계에는 PDF 버튼을 두지 않는다', async () => {
    for (const props of [{ worksheetId: 'sales', projectId: 'p1' }, { worksheetId: 'qfd', projectId: 'p1' }, { worksheetId: 'spec' }]) {
        const { container, unmount } = await renderExport(props);
        expect(pdfButton(container)).toBeUndefined();
        await unmount();
    }
});

it('긴 그림은 A4 여러 쪽으로 나누고 그림은 한 번만 넣는다', async () => {
    const blob = await createWorksheetPdf({ pngDataUrl: ONE_PIXEL_PNG, widthPx: 100, heightPx: 5000 });
    // jsdom 의 Blob 에는 arrayBuffer 가 없어 FileReader 로 읽는다.
    const bytes = await new Promise<ArrayBuffer>(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.readAsArrayBuffer(blob);
    });
    const pdf = await PDFDocument.load(bytes);
    // 5000px ÷ 배율 2 × 0.75 = 1875pt, 세로 본문 785.19pt → 3쪽이다.
    expect(pdf.getPageCount()).toBe(3);
    expect(pdf.getPage(0).getSize()).toEqual({ width: 595.28, height: 841.89 });
    const images = pdf.context.enumerateIndirectObjects().filter(([, object]) => String((object as { dict?: { get: (key: unknown) => unknown } }).dict?.get?.(pdf.context.obj('Subtype'))) === '/Image');
    expect(images).toHaveLength(1);
});
