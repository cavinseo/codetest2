// 개인 AI 연결 카드의 벤더별 키 안내와 안전한 연결 결과 표시를 검증한다.
// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import PersonalAiConnection from '../components/member/PersonalAiConnection';

let container: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn();

async function render() {
    await act(async () => root.render(createElement(PersonalAiConnection)));
}

async function chooseApiMode() {
    await act(async () => {
        container.querySelector<HTMLInputElement>('#personal-ai-mode-api')!.click();
    });
}

async function chooseVendor(vendor: string) {
    const select = container.querySelector<HTMLSelectElement>('#personal-ai-vendor')!;
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(select, vendor);
        select.dispatchEvent(new Event('change', { bubbles: true }));
    });
}

beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
        if (url === '/api/me/ai-connection/verify' && init?.method === 'POST') {
            return Promise.resolve({
                ok: true,
                json: async () => ({
                    ok: false,
                    message: 'Gemini API 키가 유효하지 않습니다. Google AI Studio에서 새 키를 저장하세요.',
                    vendorDetail: 'vendor-detail-must-not-leak',
                }),
            });
        }
        return Promise.resolve({ ok: false, json: async () => null });
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
});

it('선택한 API 벤더에 맞는 키 형식을 안내한다', async () => {
    await render();
    await chooseApiMode();

    const keyInput = container.querySelector<HTMLInputElement>('#personal-ai-key')!;
    expect(keyInput.placeholder).toBe('sk-...');

    await chooseVendor('gemini');
    expect(keyInput.placeholder).toBe('AIza...');

    await chooseVendor('anthropic');
    expect(keyInput.placeholder).toBe('sk-ant-...');
});

it('연결 확인 결과는 안전한 메시지만 화면에 표시한다', async () => {
    await render();
    await chooseApiMode();
    await chooseVendor('gemini');

    await act(async () => {
        container.querySelector<HTMLButtonElement>('#personal-ai-verify')!.click();
    });

    expect(container.textContent).toContain('Gemini API 키가 유효하지 않습니다.');
    expect(container.textContent).not.toContain('vendor-detail-must-not-leak');
});
