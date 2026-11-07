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
let specFunctions: Array<{ id: string; level: 'DETAIL'; name: string; technology: string; order: number }>;

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
    await act(async () => { container.querySelector<HTMLButtonElement>('button[title="같은 세분시장 항목 추가"]')!.click(); });
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
    specFunctions = [];
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
            savedRows = JSON.parse(String(init.body)).attributes;
            return new Response(JSON.stringify({ attributes: savedRows }));
        }
        const data = String(url).endsWith('/attributes') ? { attributes: savedRows }
            : String(url).endsWith('/spec') ? { specFunctions }
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

it('세분시장 항목 추가는 기존 행 뒤에 빈 항목을 만들고 다른 니즈를 보존한다', async () => {
    await mount();
    await act(async () => {
        container.querySelector<HTMLButtonElement>('button[title="같은 세분시장 항목 추가"]')!.click();
    });

    await save();
    expect(savedRows).toHaveLength(3);
    expect(savedRows[1]).toMatchObject({
        marketSegment: originalRows[0].marketSegment,
        customerName: originalRows[0].customerName, customerNeed: '', benefit: '', attribute: '', order: 1,
    });
    expect(savedRows[2]).toMatchObject({ ...originalRows[1], order: 2 });
});

it('선택된 제품속성의 적용기술을 자동 표시하고 작성자 추가 내용은 유지한다', async () => {
    specFunctions = [
        { id: 'spec-1', level: 'DETAIL', name: '설비별 기본 설정', technology: 'PLC 기술', order: 0 },
        { id: 'spec-2', level: 'DETAIL', name: '태그 자동 매핑', technology: '진단 엔진', order: 1 },
    ];
    savedRows = savedRows.map(row => ({ ...row, techCapability: 'PLC 기술\n작성자 추가 기술' }));
    await mount();

    const automatic = () => container.querySelector<HTMLElement>('[aria-label="WS-2 적용기술 자동 입력"]')!.textContent!;
    const manual = () => container.querySelector<HTMLTextAreaElement>('textarea[aria-label="추가 기술역량"]')!;
    expect(automatic()).toContain('PLC 기술');
    expect(automatic()).toContain('진단 엔진');
    expect(manual().value).toBe('작성자 추가 기술');

    await fill(container.querySelector<HTMLInputElement>('input[list="attribute_list_attr_1"]'), '새 제품속성');
    expect(automatic()).not.toContain('PLC 기술');
    expect(automatic()).toContain('진단 엔진');
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(manual(), '작성자 추가 기술\n현장 경험');
        manual().dispatchEvent(new Event('input', { bubbles: true }));
    });
    await save();
    expect(savedRows[0].techCapability).toBe('진단 엔진\n작성자 추가 기술\n현장 경험');

    await act(async () => { root.unmount(); });
    root = createRoot(container);
    await mount();
    expect(automatic()).toContain('진단 엔진');
    expect(manual().value).toBe('작성자 추가 기술\n현장 경험');
});

function customerInputs() {
    return [...container.querySelectorAll<HTMLInputElement>('input[aria-label^="고객명 "]')];
}

function clickCustomerButton(title: string, index = 0) {
    return act(async () => { container.querySelectorAll<HTMLButtonElement>(`button[title="${title}"]`)[index].click(); });
}

const legacyRows = [
    { ...originalRows[0], id: 'a', customerName: '고객A', customerNeed: '니즈1', benefit: '혜택1', attribute: '속성1', order: 0 },
    { ...originalRows[0], id: 'b', customerName: '고객B', customerNeed: '니즈2', benefit: '혜택2', attribute: '속성2', order: 1 },
];

it('세분시장 하나에 고객명을 여러 개 입력하면 모든 행에 합쳐 저장하고 다시 불러온다', async () => {
    await mount();
    expect(customerInputs().map(item => item.value)).toEqual(['넥스트텍']);
    expect(customerInputs()[0].closest('td')?.rowSpan).toBe(2);
    expect(container.querySelector('button[title="같은 고객명에 고객니즈 추가"]')).toBeNull();

    await clickCustomerButton('이 세분시장에 고객명 추가');
    await fill(customerInputs()[1], '에이원');
    await save();
    expect(savedRows.map(row => row.customerName)).toEqual(['넥스트텍, 에이원', '넥스트텍, 에이원']);
    expect(savedRows.map(row => row.customerNeed)).toEqual(originalRows.map(row => row.customerNeed));
    expect(savedRows[0]).not.toHaveProperty('customerNames');

    await act(async () => { root.unmount(); });
    root = createRoot(container);
    await mount();
    expect(customerInputs().map(item => item.value)).toEqual(['넥스트텍', '에이원']);

    await clickCustomerButton('고객명 삭제');
    await save();
    expect(savedRows.map(row => row.customerName)).toEqual(['에이원', '에이원']);
});

it('고객 니즈는 고객명을 고르지 않고 세분시장 단위로 추가되며 고객명을 이어받는다', async () => {
    await mount();
    const newId = await addNeed();
    await save();
    expect(savedRows.find(row => row.id === newId)).toMatchObject({
        marketSegment: originalRows[0].marketSegment, customerName: '넥스트텍', customerNeed: '외부 인력 도착 전 복구',
    });
});

it('쉼표로 입력한 고객명은 칸을 벗어나면 나뉘고 빈 칸은 저장되지 않는다', async () => {
    await mount();
    await fill(customerInputs()[0], '갑, 을');
    await act(async () => { customerInputs()[0].focus(); customerInputs()[0].blur(); });
    expect(customerInputs().map(item => item.value)).toEqual(['갑', '을']);

    await clickCustomerButton('이 세분시장에 고객명 추가');
    await save();
    expect(savedRows[0].customerName).toBe('갑, 을');
});

it('숫자 쉼표 고객명은 칸을 벗어나도 나뉘지 않고 원문 그대로 저장·재로드된다', async () => {
    await mount();
    await fill(customerInputs()[0], '12,000명 고객사');
    await act(async () => { customerInputs()[0].focus(); customerInputs()[0].blur(); });
    expect(customerInputs().map(item => item.value)).toEqual(['12,000명 고객사']);

    await save();
    expect(savedRows.map(row => row.customerName)).toEqual(['12,000명 고객사', '12,000명 고객사']);

    await act(async () => { root.unmount(); });
    root = createRoot(container);
    await mount();
    expect(customerInputs().map(item => item.value)).toEqual(['12,000명 고객사']);
});

it('고객명별로 다른 니즈가 저장된 기존 데이터는 니즈를 모두 남기고 고객명만 합치며 저장 전에는 DB 를 쓰지 않는다', async () => {
    savedRows = legacyRows.map(row => ({ ...row }));
    await mount();
    expect(customerInputs().map(item => item.value)).toEqual(['고객A', '고객B']);
    expect(input('a', 'cn')?.value).toBe('니즈1');
    expect(input('b', 'cn')?.value).toBe('니즈2');
    const posts = () => vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === 'POST');
    expect(posts()).toHaveLength(0);

    await save();
    expect(savedRows.map(row => [row.id, row.customerName, row.customerNeed, row.benefit, row.attribute])).toEqual([
        ['a', '고객A, 고객B', '니즈1', '혜택1', '속성1'],
        ['b', '고객A, 고객B', '니즈2', '혜택2', '속성2'],
    ]);
});

it('고객명만 달랐던 같은 내용의 행은 첫 행 하나로 합친다', async () => {
    savedRows = [legacyRows[0], { ...legacyRows[0], id: 'dup', customerName: '고객B', order: 1 }];
    await mount();
    await save();
    expect(savedRows.map(row => [row.id, row.customerName])).toEqual([['a', '고객A, 고객B']]);
});

it('떨어져 있는 같은 세분시장도 고객명을 함께 바꾸고, 다른 세분시장은 건드리지 않는다', async () => {
    savedRows = [
        { ...legacyRows[0], customerName: '고객A' },
        { ...legacyRows[1], marketSegment: '다른 시장', customerName: '고객C' },
        { ...legacyRows[1], id: 'c', customerNeed: '니즈3', customerName: '고객A', order: 2 },
    ];
    await mount();
    await fill(customerInputs()[0], '고객Z');
    await save();
    expect(savedRows.map(row => row.customerName)).toEqual(['고객Z', '고객C', '고객Z']);
});
