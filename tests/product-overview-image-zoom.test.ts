// 개요의 관련이미지를 누르면 화면 전체로 크게 보이고, 한 번 더 누르면 닫히는지 확인한다.
// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ProductOverviewFields from '../components/project/ProductOverviewFields';

vi.mock('../components/project/ProductOverviewContent', () => ({ default: () => null }));

let container: HTMLDivElement;
let root: Root;
const image = (name: string) => ({ dataUrl: `data:image/png;base64,${name}`, widthPx: 10, heightPx: 10 });
const zoomed = () => document.body.querySelector<HTMLElement>('[role="dialog"]');

beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
});

afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
});

async function render() {
    await act(async () => root.render(createElement(ProductOverviewFields, {
        value: { relatedImages: [image('A'), image('B')] },
    })));
}

it('사진을 누르면 크게 보이고, 한 번 더 누르면 닫힌다', async () => {
    await render();
    expect(zoomed()).toBeNull();

    await act(async () => container.querySelector<HTMLImageElement>('img[alt="관련이미지 2"]')!.click());
    expect(zoomed()!.querySelector('img')!.getAttribute('src')).toBe('data:image/png;base64,B');

    await act(async () => zoomed()!.querySelector('img')!.click());
    expect(zoomed()).toBeNull();
});

it('Esc 로도 닫힌다', async () => {
    await render();
    await act(async () => container.querySelector<HTMLImageElement>('img[alt="관련이미지 1"]')!.click());
    expect(zoomed()).not.toBeNull();

    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(zoomed()).toBeNull();
});
