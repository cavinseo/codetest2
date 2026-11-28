// 천원 매출 입력의 저장·재조회와 기존 금액의 실제 가치 보존을 검증한다.
// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import SalesTable from '../components/project/SalesTable';

it('기존 100백만원을 100,000천원으로 표시하고 신규 천원 금액을 저장 후 복원한다', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    let rows = [
        { id: 'current', period: 'Y', customer: '현재 고객', competitor: '', amount: 100, order: 0 },
        { id: 'future', period: 'Y_PLUS_1', customer: '목표 고객', competitor: '', amount: 200, order: 1 },
    ];
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method === 'POST') rows = JSON.parse(String(init.body)).rows;
        return new Response(JSON.stringify({ rows, revision: 'revision' }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
        await act(async () => root.render(createElement(SalesTable, { projectId: 'fixture' })));
        const money = container.querySelector<HTMLInputElement>('input[inputmode="decimal"]')!;
        expect(money.value).toBe('100,000');
        expect(container.textContent).toContain('단위: 천원');
        await act(async () => {
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(money, '12345.6');
            money.dispatchEvent(new Event('input', { bubbles: true }));
        });
        expect(money.value).toBe('12,345.6');
        await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent?.trim() === '저장')!.click());
        expect(rows[0].amount).toBe(12.3456);
        expect(rows[1].amount).toBe(200);
        await act(async () => root.render(null));
        await act(async () => root.render(createElement(SalesTable, { projectId: 'fixture' })));
        expect(container.querySelector<HTMLInputElement>('input[inputmode="decimal"]')!.value).toBe('12,345.6');
    } finally {
        await act(async () => root.unmount());
        container.remove();
        vi.unstubAllGlobals();
    }
});
