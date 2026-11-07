// WS-3 고객니즈·제공혜택·제품속성 칸의 화면 동작(병합 칸 일괄 수정·자동완성·스펙 가져오기 표시)을 리팩토링 전후로 고정한다.
// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ProductAttributesTable from '../components/project/ProductAttributesTable';

const base = { productName: '장비', techCapability: '', customerName: '갑' };
const specs = [
    { id: 'c', level: 'CORE', name: '핵심', order: 0 },
    { id: 's', level: 'SUB', parentId: 'c', name: '세부', order: 1 },
    { id: 'd', level: 'DETAIL', parentId: 's', name: '스펙속성', technology: '스펙기술', order: 2 },
];
let savedRows: Array<Record<string, any>>;
let container: HTMLDivElement;
let root: Root;

const inputs = (prefix: string) => [...container.querySelectorAll<HTMLInputElement>(`tbody input[list^="${prefix}_list_"]`)];
const options = (prefix: string) => [...container.querySelector(`datalist[id^="${prefix}_list_"]`)!.querySelectorAll('option')].map(option => option.value);
const button = (text: string) => [...container.querySelectorAll('button')].find(item => item.textContent?.trim() === text)!;

async function mount() {
    await act(async () => { root.render(createElement(ProductAttributesTable, { projectId: 'p' })); });
}

async function fill(element: HTMLInputElement, value: string) {
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, value);
        element.dispatchEvent(new Event('input', { bubbles: true }));
    });
}

async function save() {
    await act(async () => { button('저장').click(); });
}

beforeEach(() => {
    savedRows = [
        { ...base, id: 'a', marketSegment: '제조', customerNeed: '니즈1', benefit: '혜택1', attribute: '스펙속성', order: 0 },
        { ...base, id: 'b', marketSegment: '제조', customerNeed: '니즈1', benefit: '혜택1', attribute: '직접속성', order: 1 },
        { ...base, id: 'c', marketSegment: '제조', customerNeed: '니즈2', benefit: '혜택1', attribute: '속성3', order: 2 },
    ];
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
            savedRows = JSON.parse(String(init.body)).attributes;
            return new Response(JSON.stringify({ attributes: savedRows }));
        }
        const body = url.endsWith('/attributes') ? { attributes: savedRows }
            : url.endsWith('/spec') ? { specFunctions: specs } : { projects: [{ id: 'p', name: '장비' }] };
        return new Response(JSON.stringify(body));
    }));
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
});

afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

it('같은 니즈는 한 칸으로 병합되고, 고치면 묶인 행 모두에 적용된다', async () => {
    await mount();
    expect(inputs('cn').map(item => [item.value, item.closest('td')!.rowSpan])).toEqual([['니즈1', 2], ['니즈2', 1]]);
    await fill(inputs('cn')[0], '바꾼 니즈');
    await save();
    expect(savedRows.map(row => row.customerNeed)).toEqual(['바꾼 니즈', '바꾼 니즈', '니즈2']);
});

it('혜택은 같은 니즈 안에서만 병합되고, 고치면 그 묶음에만 적용된다', async () => {
    await mount();
    expect(inputs('bn').map(item => [item.value, item.closest('td')!.rowSpan])).toEqual([['혜택1', 2], ['혜택1', 1]]);
    await fill(inputs('bn')[0], '바꾼 혜택');
    await save();
    expect(savedRows.map(row => row.benefit)).toEqual(['바꾼 혜택', '바꾼 혜택', '혜택1']);
});

it('니즈·혜택·속성 자동완성은 표 전체 값을 중복 없이 보여 준다', async () => {
    await mount();
    expect(options('cn')).toEqual(['니즈1', '니즈2']);
    expect(options('bn')).toEqual(['혜택1']);
    expect(options('attribute')).toEqual(['스펙속성', '직접속성', '속성3']);
});

it('스펙에서 온 속성은 강조되고, 직접 고치면 강조가 풀리며, 해당 행만 바뀐다', async () => {
    await mount();
    const attributes = inputs('attribute');
    expect(attributes.map(item => item.className.includes('text-cyan-300'))).toEqual([true, false, false]);
    await fill(attributes[0], '스펙속성 수정');
    expect(inputs('attribute')[0].className).toContain('text-gray-300');
    await save();
    expect(savedRows.map(row => row.attribute)).toEqual(['스펙속성 수정', '직접속성', '속성3']);
});

it('속성 칸의 스펙 버튼으로 고른 세세부기능이 그 행에 들어가고 강조된다', async () => {
    await mount();
    const pickButtons = [...container.querySelectorAll<HTMLButtonElement>('tbody button[title="AS-IS 스펙에서 가져오기"]')];
    await act(async () => { pickButtons[1].dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    const detailRow = [...container.querySelectorAll('tr')].find(row => row.textContent?.includes('스펙기술'))!;
    await act(async () => { (detailRow as HTMLElement).click(); });
    const attributes = inputs('attribute');
    expect(attributes.map(item => item.value)).toEqual(['스펙속성', '스펙속성', '속성3']);
    expect(attributes[1].className).toContain('text-cyan-300');
});
