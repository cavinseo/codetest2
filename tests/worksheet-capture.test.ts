// 실제 렌더링 대신 캡처 옵션과 실패 후 DOM 복구 계약을 검증한다.
import { beforeEach, expect, it, vi } from 'vitest';
import { toCanvas } from 'html-to-image';
import { captureWorksheetNode } from '../lib/worksheet-capture';

vi.mock('html-to-image', () => ({ toCanvas: vi.fn() }));

function element(id = 'qfd', scrollWidth = 1400, clientWidth = 700) {
    const attributes = new Map<string, string>([['class', 'dark worksheet'], ['style', 'width: 700px;']]);
    const style = { cssText: 'width: 700px;', setProperty: vi.fn() };
    const classes = new Set(['dark', 'worksheet']);
    return {
        dataset: { worksheetId: id }, id: '', style,
        scrollWidth, clientWidth, offsetWidth: clientWidth, scrollHeight: 600, offsetHeight: 400,
        classList: { add: (value: string) => classes.add(value), remove: (value: string) => classes.delete(value), contains: (value: string) => classes.has(value) },
        getAttribute: (key: string) => key === 'class' ? [...classes].join(' ') : attributes.get(key) ?? null,
        setAttribute: (key: string, value: string) => {
            attributes.set(key, value);
            if (key === 'class') { classes.clear(); value.split(' ').forEach(name => classes.add(name)); }
            if (key === 'style') style.cssText = value;
        },
        removeAttribute: (key: string) => { attributes.delete(key); if (key === 'style') style.cssText = ''; },
        querySelectorAll: vi.fn(() => [] as unknown[]),
    };
}

beforeEach(() => vi.resetAllMocks());

it('passes light options and returns actual canvas dimensions including library scaling', async () => {
    const node = element();
    const toDataURL = vi.fn(() => 'data:image/png;base64,captured');
    vi.mocked(toCanvas).mockImplementation(async () => {
        expect(node.classList.contains('light')).toBe(true);
        expect(node.classList.contains('dark')).toBe(false);
        expect(node.style.setProperty).toHaveBeenCalledWith('background-color', '#ffffff', 'important');
        expect(node.style.setProperty).toHaveBeenCalledWith('color', '#0f172a', 'important');
        return { width: 2400, height: 1000, toDataURL } as unknown as HTMLCanvasElement;
    });
    expect(await captureWorksheetNode(node as unknown as HTMLElement)).toEqual({ pngDataUrl: 'data:image/png;base64,captured', widthPx: 2400, heightPx: 1000 });
    expect(toCanvas).toHaveBeenCalledWith(node, { backgroundColor: '#ffffff', pixelRatio: 2, width: 1400, height: 600 });
    expect(toDataURL).toHaveBeenCalledWith('image/png');
    expect(node.getAttribute('class')).toBe('dark worksheet');
    expect(node.style.cssText).toBe('width: 700px;');
});

it('expands nested horizontal scrollers and honors the requested pixel ratio', async () => {
    const node = element();
    const scroller = element('qfd', 2000, 600);
    node.querySelectorAll.mockReturnValue([scroller]);
    vi.mocked(toCanvas).mockResolvedValue({ width: 2000, height: 600, toDataURL: () => 'data:image/png;base64,ok' } as unknown as HTMLCanvasElement);
    await captureWorksheetNode(node as unknown as HTMLElement, { pixelRatio: 1 });
    expect(scroller.style.setProperty).toHaveBeenCalledWith('width', '2000px', 'important');
    expect(scroller.style.setProperty).toHaveBeenCalledWith('overflow', 'visible', 'important');
    expect(toCanvas).toHaveBeenCalledWith(node, expect.objectContaining({ pixelRatio: 1 }));
    expect(scroller.style.cssText).toBe('width: 700px;');
});

it.each(['fitness', 'kano-aggregation', 'qfd'])('identifies %s on failure and restores original attributes', async worksheetId => {
    const node = element(worksheetId);
    node.removeAttribute('style');
    const failure = new Error('capture failed');
    vi.mocked(toCanvas).mockRejectedValue(failure);
    await expect(captureWorksheetNode(node as unknown as HTMLElement)).rejects.toMatchObject({ message: `워크시트 ${worksheetId} 캡처에 실패했습니다.`, cause: failure });
    expect(node.getAttribute('class')).toBe('dark worksheet');
    expect(node.getAttribute('style')).toBeNull();
});

it('wraps PNG serialization failures and preserves an existing light class', async () => {
    const node = element();
    node.setAttribute('class', 'light worksheet');
    vi.mocked(toCanvas).mockResolvedValue({ width: 100, height: 100, toDataURL: () => { throw new Error('tainted canvas'); } } as unknown as HTMLCanvasElement);
    await expect(captureWorksheetNode(node as unknown as HTMLElement)).rejects.toThrow('워크시트 qfd');
    expect(node.getAttribute('class')).toBe('light worksheet');
});
