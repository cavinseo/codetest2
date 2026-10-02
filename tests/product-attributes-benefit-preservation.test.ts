// 고객니즈 추가와 제공혜택 편집이 기존 행의 화면 및 저장 값을 보존하는지 검증한다.
// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ProductAttributesTable from '../components/project/ProductAttributesTable';

const originalRows = [
    { id: 'attr_1', productName: 'AI PLC 관리 장비', marketSegment: 'PLC SI 시장', customerName: '넥스트텍',
        customerNeed: '고장 원인 분석', benefit: '고장 전후 데이터 자동 저장', attribute: '설비별 기본 설정', techCapability: '', order: 0 },
    { id: 'attr_2', productName: 'AI PLC 관리 장비', marketSegment: 'PLC SI 시장', customerName: '넥스트텍',
        customerNeed: '전문인력 없이 고장 진단', benefit: '원격 1차 해결률 향상', attribute: '태그 자동 매핑', techCapability: '', order: 1 },
];
let container: HTMLDivElement;
let root: Root;
let savedRows: typeof originalRows;

async function mount() {
    await act(async () => { root.render(createElement(ProductAttributesTable, { projectId: 'fixture-project' })); });
}

function input(rowId: string, field: 'cn' | 'bn') {
    return container.querySelector<HTMLInputElement>(`input[list="${field}_list_${rowId}"]`);
}

async function fill(element: HTMLInputElement | null, value: string) {
    expect(element).not.toBeNull();
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, value);
        element!.dispatchEvent(new Event('input', { bubbles: true }));
    });
}

async function addNeed() {
    await act(async () => { container.querySelector<HTMLButtonElement>('button[title="같은 고객명에 고객니즈 추가"]')!.click(); });
    const newRow = container.querySelectorAll('tbody tr')[1];
    const needInput = newRow.querySelector<HTMLInputElement>('input[list^="cn_list_"]')!;
    await fill(needInput, '외부 인력 도착 전 복구');
    return needInput.getAttribute('list')!.slice('cn_list_'.length);
}

async function save() {
    const button = [...container.querySelectorAll('button')].find(item => item.textContent?.trim() === '저장')!;
    await act(async () => { button.click(); });
}

beforeEach(() => {
    savedRows = originalRows.map(row => ({ ...row }));
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
            savedRows = JSON.parse(String(init.body)).attributes;
            return new Response(JSON.stringify({ attributes: savedRows }));
        }
        const data = String(url).endsWith('/attributes') ? { attributes: savedRows }
            : String(url).endsWith('/spec') ? { specFunctions: [] }
                : { projects: [{ id: 'fixture-project', name: 'AI PLC 관리 장비' }] };
        return new Response(JSON.stringify(data));
    }));
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(async () => {
    await act(async () => { root.unmount(); });
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

it('추가한 니즈에 아래 행과 같은 혜택을 입력해도 기존 제공혜택 칸을 유지한다', async () => {
    await mount();
    const newId = await addNeed();
    expect(input('attr_2', 'bn')?.value).toBe(originalRows[1].benefit);
    await fill(input(newId, 'bn'), originalRows[1].benefit);
    expect(input('attr_2', 'bn')?.value).toBe(originalRows[1].benefit);
    expect(input(newId, 'bn')?.closest('td')?.rowSpan).toBe(1);
    await save();
    expect(savedRows.filter(row => originalRows.some(original => original.id === row.id))).toEqual([
        originalRows[0], { ...originalRows[1], order: 2 },
    ]);
    await act(async () => { root.unmount(); });
    root = createRoot(container);
    await mount();
    expect(input('attr_2', 'bn')?.value).toBe(originalRows[1].benefit);
    expect(input(newId, 'bn')?.value).toBe(originalRows[1].benefit);
});

it('추가한 니즈의 혜택을 다시 수정해 저장해도 아래 행의 기존 혜택을 덮어쓰지 않는다', async () => {
    await mount();
    const newId = await addNeed();
    await fill(input(newId, 'bn'), originalRows[1].benefit);
    await fill(input(newId, 'bn'), '새 니즈 전용 혜택');
    await save();
    expect(savedRows.find(row => row.id === 'attr_2')?.benefit).toBe(originalRows[1].benefit);
    expect(savedRows.find(row => row.id === newId)?.benefit).toBe('새 니즈 전용 혜택');
    expect(input('attr_2', 'bn')?.value).toBe(originalRows[1].benefit);
});

it('같은 고객 니즈에 여러 제품속성을 추가하고 저장 후 다시 불러온다', async () => {
    await mount();
    const addAttribute = () => container.querySelector<HTMLButtonElement>('tbody tr:first-child button[title="같은 고객 니즈에 제품속성 추가"]')!;

    await act(async () => { addAttribute().click(); });
    await act(async () => { addAttribute().click(); });

    const attributeInputs = [...container.querySelectorAll<HTMLInputElement>('tbody input[list^="attribute_list_"]')];
    expect(attributeInputs).toHaveLength(4);
    await fill(attributeInputs[1], '고장 이력 분석');
    await fill(attributeInputs[2], '원격 진단 알림');
    expect(input('attr_2', 'bn')?.value).toBe(originalRows[1].benefit);

    await save();
    expect(savedRows.map(row => row.attribute)).toEqual([
        '설비별 기본 설정', '고장 이력 분석', '원격 진단 알림', '태그 자동 매핑',
    ]);
    for (const row of savedRows.slice(1, 3)) {
        expect(row.marketSegment).toBe(originalRows[0].marketSegment);
        expect(row.customerName).toBe(originalRows[0].customerName);
        expect(row.customerNeed).toBe(originalRows[0].customerNeed);
        expect(row.benefit).toBe(originalRows[0].benefit);
    }

    await act(async () => { root.unmount(); });
    root = createRoot(container);
    await mount();
    expect([...container.querySelectorAll<HTMLInputElement>('tbody input[list^="attribute_list_"]')].map(element => element.value))
        .toEqual(savedRows.map(row => row.attribute));
    expect(input('attr_2', 'bn')?.value).toBe(originalRows[1].benefit);
});
