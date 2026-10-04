// WS-10의 AS-IS 선택과 신규 기능 입력, WS-12의 신규 행 표시를 검증한다.
// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import TechTreeTable from '../components/project/TechTreeTable';
import TargetSpecTable from '../components/project/TargetSpecTable';

let container: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn();
const button = (label: string) => [...container.querySelectorAll('button')].find((item) => item.textContent?.trim() === label)!;
const click = async (label: string) => { await act(async () => button(label).click()); };
const fill = async (element: HTMLInputElement, value: string) => {
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, value);
        element.dispatchEvent(new Event('input', { bubbles: true }));
    });
};

beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('fetch', fetchMock);
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    fetchMock.mockImplementation(async (url: string, init?: { method?: string }) => {
        const path = String(url);
        let payload: unknown;
        if (init?.method === 'POST') payload = { entries: JSON.parse((init as { body: string }).body).entries };
        else if (path.endsWith('/spec')) payload = { specFunctions: [
            { id: 'core', level: 'CORE', name: '구동', order: 0 },
            { id: 'sub', level: 'SUB', parentId: 'core', name: '속도 제어', technology: 'PID 제어', order: 1 },
        ] };
        else if (path.endsWith('/requirements')) payload = { requirements: [] };
        else if (path.endsWith('/qfd/analysis')) payload = { requirements: [] };
        else if (path.endsWith('/tech-tree')) payload = { entries: [
            { id: 'voice', customerVoice: '더 빠르게', coreSpec: '', subSpec: '', techCharacteristic: '', order: 0 },
        ] };
        else payload = { rows: [
            { id: 'saved', category: '구동', subCategory: '속도 제어', specItem: 'PID 제어', note: '유지', order: 0 },
            { id: 'new', category: '구동', subCategory: '신규 기능', specItem: '광학 센서', note: '개선', order: 1 },
        ], asIsRows: [], suggestions: [], newSpecs: [{ category: '구동', subCategory: '신규 기능' }] };
        return new Response(JSON.stringify(payload), { status: 200 });
    });
});
afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.resetAllMocks();
    vi.unstubAllGlobals();
});

it('핵심스펙이 비어 있는 고객의 소리 행에서 WS-2 세부스펙을 고르면 핵심과 기술이 함께 채워진다', async () => {
    await act(async () => root.render(createElement(TechTreeTable, { projectId: 'project' })));
    await click('선택');
    const option = [...container.querySelectorAll('button')].find((item) => item.textContent?.includes('속도 제어') && item.textContent?.includes('PID 제어'))!;
    expect(option).toBeTruthy();
    await act(async () => option.click());
    expect(container.querySelector<HTMLInputElement>('input[placeholder="핵심 기능"]')!.value).toBe('구동');
    expect(container.querySelector<HTMLInputElement>('input[placeholder="세부 기능"]')!.value).toBe('속도 제어');
    expect(container.querySelector<HTMLInputElement>('input[placeholder="기술적 특성"]')!.value).toBe('PID 제어');
});

it('WS-2에 없는 세부스펙은 기존 핵심스펙을 지정하여 별도로 추가하고 WS-10 저장에 포함한다', async () => {
    await act(async () => root.render(createElement(TechTreeTable, { projectId: 'project' })));
    await click('선택');
    await click('신규 세부스펙 추가');
    const core = container.querySelector<HTMLSelectElement>('select[aria-label="신규 세부스펙 핵심스펙"]')!;
    await act(async () => { core.value = '구동'; core.dispatchEvent(new Event('change', { bubbles: true })); });
    await fill(container.querySelector<HTMLInputElement>('input[aria-label="신규 세부스펙 이름"]')!, '신규 기능');
    await fill(container.querySelector<HTMLInputElement>('input[aria-label="신규 세부스펙 기술적 특성"]')!, '광학 센서');
    await click('세부스펙 추가');
    await click('저장');
    const written = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(written![1].body).entries[0]).toMatchObject({ customerVoice: '더 빠르게', coreSpec: '구동', subSpec: '신규 기능', techCharacteristic: '광학 센서' });
});

it('WS-12에 자동 추가된 세부항목은 신규 배지와 색으로 구분된다', async () => {
    await act(async () => root.render(createElement(TargetSpecTable, { projectId: 'project' })));
    const row = [...container.querySelectorAll('tr')].find((item) => item.querySelector<HTMLInputElement>('input[value="신규 기능"]'))!;
    expect(row).toBeTruthy();
    expect(row.className).toContain('emerald');
    expect(row.textContent).toContain('신규');
});
