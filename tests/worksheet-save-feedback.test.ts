// 저장 실패를 알리는지(WS-14), 저장 직후 다시 고치면 다음 워크시트로 넘어가지 않는지(WS-1) 검증한다.
// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import AssetsTable from '../components/project/AssetsTable';
import SalesTable from '../components/project/SalesTable';

let container: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn();
const button = (label: string) => [...container.querySelectorAll('button')].find(item => item.textContent?.trim() === label);
const statusText = () => [...document.querySelectorAll('[role="status"]')].map(item => item.textContent).join(' ');
const setInput = (input: HTMLInputElement, value: string) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
};

beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(async () => {
    await act(async () => { root.unmount(); });
    container.remove();
    fetchMock.mockReset();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

it.each([
    ['서버가 거절하면', async () => ({ ok: false, status: 403, json: async () => ({}) })],
    ['연결이 끊기면', async () => { throw new TypeError('Failed to fetch'); }],
])('WS-14 저장이 %s 실패를 알린다', async (_label, failure) => {
    fetchMock.mockImplementation(async (_url: string, options?: { method?: string }) => (options?.method === 'POST'
        ? failure()
        : { ok: true, json: async () => ({ assets: [{ id: 'a', type: 'CORE', content: '특허', order: 0 }] }) }));
    await act(async () => root.render(createElement(AssetsTable, { projectId: 'project' })));

    await act(async () => button('저장하기')?.click() ?? button('저장')?.click());

    expect(statusText()).toContain('저장에 실패했습니다');
});

it('WS-14 저장이 성공하면 다시 불러오는 동안에도 저장 알림이 보인다', async () => {
    fetchMock.mockImplementation(async (_url: string, options?: { method?: string }) => (options?.method === 'POST'
        ? { ok: true, json: async () => ({}) }
        : { ok: true, json: async () => ({ assets: [] }) }));
    await act(async () => root.render(createElement(AssetsTable, { projectId: 'project' })));

    await act(async () => button('저장하기')?.click() ?? button('저장')?.click());

    expect(statusText()).toContain('저장되었습니다');
});

it('WS-1 저장 뒤 1초 안에 다시 고치면 다음 워크시트로 넘어가지 않는다', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const savedRows = [{ id: 'r', period: 'Y', customer: '갑', amount: 10, competitor: '', order: 0 }];
    fetchMock.mockImplementation(async () => ({ ok: true, json: async () => ({ rows: savedRows }) }));
    const onSaved = vi.fn();
    await act(async () => root.render(createElement(SalesTable, { projectId: 'project', onSaved })));

    await act(async () => button('저장하기')?.click() ?? button('저장')?.click());
    const customer = [...container.querySelectorAll<HTMLInputElement>('input')].find(input => input.value === '갑')!;
    await act(async () => setInput(customer, '을'));
    await act(async () => { vi.advanceTimersByTime(1000); });

    expect(onSaved).not.toHaveBeenCalled();
    expect(statusText()).toContain('이동하지 않았습니다');
});

it('WS-1 저장 뒤 고치지 않으면 1초 뒤 다음 워크시트로 넘어가고, 그 전에 화면을 떠나면 넘기지 않는다', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const savedRows = [{ id: 'r', period: 'Y', customer: '갑', amount: 10, competitor: '', order: 0 }];
    fetchMock.mockImplementation(async () => ({ ok: true, json: async () => ({ rows: savedRows }) }));
    const onSaved = vi.fn();
    await act(async () => root.render(createElement(SalesTable, { projectId: 'project', onSaved })));
    await act(async () => button('저장하기')?.click() ?? button('저장')?.click());
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(onSaved).toHaveBeenCalledTimes(1);

    await act(async () => button('저장하기')?.click() ?? button('저장')?.click());
    await act(async () => root.render(createElement('div')));
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(onSaved).toHaveBeenCalledTimes(1);
});
