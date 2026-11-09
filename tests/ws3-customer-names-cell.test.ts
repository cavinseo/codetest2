// WS-3 고객명 칸의 화면 동작(세분시장 합치기·멘토 적용·삭제 버튼·자동완성)을 리팩토링 전후로 고정한다.
// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ProductAttributesTable from '../components/project/ProductAttributesTable';

const mentor = vi.hoisted(() => ({ props: null as null | Record<string, any> }));
// 위저드 안쪽은 이 파일의 관심사가 아니므로, 받은 props 를 기록하고 적용 버튼만 보이는 대역으로 바꾼다.
vi.mock('../components/project/AttributeMentorWizard', () => ({
    default: (props: Record<string, any>) => {
        mentor.props = props;
        return createElement('button', {
            type: 'button',
            onClick: () => props.onApply([
                { marketSegment: '제조', customerName: '병, 정', customerNeed: '새 니즈', benefit: '새 혜택', attribute: '새 속성' },
            ], []),
        }, '멘토 결과 적용');
    },
}));

const base = { productName: '장비', techCapability: '', benefit: '혜택', attribute: '속성' };
let savedRows: Array<Record<string, any>>;
let container: HTMLDivElement;
let root: Root;

const customerInputs = () => [...container.querySelectorAll<HTMLInputElement>('input[aria-label^="고객명 "]')];
const segmentInputs = () => [...container.querySelectorAll<HTMLInputElement>('input[list^="ms_list_"]')];
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

async function click(element: Element) {
    await act(async () => { (element as HTMLElement).click(); });
}

beforeEach(() => {
    mentor.props = null;
    savedRows = [
        { ...base, id: 'a', marketSegment: '제조', customerName: '갑', customerNeed: '니즈1', order: 0 },
        { ...base, id: 'b', marketSegment: '유통', customerName: '을', customerNeed: '니즈2', order: 1 },
    ];
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
            savedRows = JSON.parse(String(init.body)).attributes;
            return new Response(JSON.stringify({ attributes: savedRows }));
        }
        const body = url.endsWith('/attributes') ? { attributes: savedRows }
            : url.endsWith('/spec') ? { specFunctions: [] } : { projects: [{ id: 'p', name: '장비' }] };
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

it('세분시장 이름을 다른 세분시장과 같게 바꾸고 칸을 벗어나면 두 고객명을 합친다', async () => {
    await mount();
    const renamed = segmentInputs()[1];
    await fill(renamed, '제조');
    // 바로 위 세분시장과 이름이 같아지면 칸이 하나로 합쳐져, 이름을 고친 입력칸에서 벗어나는 것으로 확인한다.
    await act(async () => { renamed.focus(); renamed.blur(); });
    await click(button('저장'));
    expect(savedRows.map(row => [row.marketSegment, row.customerName])).toEqual([['제조', '갑, 을'], ['제조', '갑, 을']]);
});

it('멘토 결과는 뒤에 덧붙이고 같은 세분시장의 기존 고객명과 합치며, 쉼표 고객명은 나눈다', async () => {
    await mount();
    await click(button('AI 멘토링'));
    await click(button('멘토 결과 적용'));
    // 떨어져 있는 같은 세분시장은 칸이 따로 그려지지만 고객명 목록은 같다.
    expect(customerInputs().map(item => item.value)).toEqual(['갑', '병', '정', '을', '갑', '병', '정']);
    await click(button('저장'));
    expect(savedRows.map(row => [row.marketSegment, row.customerName, row.customerNeed])).toEqual([
        ['제조', '갑, 병, 정', '니즈1'],
        ['유통', '을', '니즈2'],
        ['제조', '갑, 병, 정', '새 니즈'],
    ]);
});

it('멘토에 넘기는 기존 행은 고객명을 저장 형식(쉼표로 합친 한 칸)으로 담는다', async () => {
    savedRows[0].customerName = '갑, 병';
    await mount();
    await click(button('AI 멘토링'));
    expect(mentor.props?.analysisContext.existingRows.map((row: any) => [row.customerName, 'customerNames' in row]))
        .toEqual([['갑, 병', false], ['을', false]]);
});

it('고객명이 하나면 삭제 버튼이 없고, 개수 표시는 빈 칸을 세지 않는다', async () => {
    await mount();
    expect(container.querySelector('button[aria-label="고객명 1 삭제"]')).toBeNull();
    expect(container.textContent).toContain('1개 고객명');

    await click(container.querySelector('button[title="이 세분시장에 고객명 추가"]')!);
    expect(customerInputs().map(item => item.value)).toEqual(['갑', '', '을']);
    expect(container.textContent).toContain('1개 고객명');
    expect(container.querySelector('button[aria-label="고객명 2 삭제"]')).not.toBeNull();
});

it('고객명 자동완성에는 모든 세분시장의 고객명이 중복 없이 들어간다', async () => {
    savedRows[1].customerName = '을, 갑';
    await mount();
    const datalist = container.querySelector('datalist[id^="customer_name_list_"]')!;
    expect([...datalist.querySelectorAll('option')].map(option => option.value)).toEqual(['갑', '을']);
});
