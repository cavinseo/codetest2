// WS-15 입력값의 그래프 반영과 저장·재조회 및 WS-16 화면 보존을 검증한다.
// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FundingTable from '../components/project/FundingTable';
import FundingPlanChart from '../components/project/FundingPlanChart';

let root: Root;
let container: HTMLDivElement;
let plans: Array<{ id: string; category: string; item: string; year1: number; year2: number | null; year3: number | null; order: number }>;
let fetchMock: ReturnType<typeof vi.fn>;
const sources = [{ id: 'source', category: '정부자금', year1: '{"source":"지원금","amount":"50"}', year2: '', year3: '', order: 0 }];

beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    plans = [
        { id: 'sales', category: '매출액', item: '매출액', year1: 250, year2: 1000, year3: 2000, order: 0 },
        { id: 'cost', category: '소요자금', item: '생산비용', year1: 200, year2: 800, year3: 1700, order: 1 },
        { id: 'other', category: '소요자금', item: '기타', year1: 35, year2: 35, year3: 70, order: 2 },
        { id: 'total', category: '소요자금', item: '소요자금 합계', year1: 9999, year2: 9999, year3: 9999, order: 3 },
    ];
    fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method === 'POST') plans = JSON.parse(String(init.body)).plans;
        return new Response(JSON.stringify({ plans, sources, canWrite: true }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
});

afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
});

async function mount(mode: 'plan' | 'source' = 'plan') {
    await act(async () => root.render(createElement(FundingTable, { projectId: 'fixture', mode })));
}

async function input(label: string, value: string) {
    const element = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, value);
        element.dispatchEvent(new Event('input', { bubbles: true }));
    });
}

const chart = () => container.querySelector('section[aria-label="매출 성장 및 손익분기 분석"]')!;

describe('WS-15 선 그래프', () => {
    it('양식의 매출액·소요자금 두 선과 3개 연도 금액을 표시하고 저장된 합계를 중복 합산하지 않는다', async () => {
        await mount();
        expect(chart().querySelector('[data-series="revenue"]')).not.toBeNull();
        expect(chart().querySelector('[data-series="required"]')).not.toBeNull();
        expect(chart().querySelectorAll('[data-revenue-point]')).toHaveLength(3);
        for (const text of ['235', '835', '1,770', '+300%', '+100%', '+230', 'Y+1년차부터']) expect(chart().textContent).toContain(text);
        expect(container.textContent).not.toContain('9,999');
        expect(container.textContent).toContain('2,840');
    });

    it('매출과 비용을 수정하면 즉시 그래프·분기점을 갱신하고 저장 후에도 유지한다', async () => {
        await mount();
        const initialPath = chart().querySelector('[data-series="revenue"]')!.getAttribute('d');
        await input('2차년도(Y+2) 매출액', '500');
        await input('1차년도(Y+1) 생산비용', '300');
        expect(chart().querySelector('[data-series="revenue"]')!.getAttribute('d')).not.toBe(initialPath);
        expect(chart().querySelectorAll('[data-break-even]')).toHaveLength(1);
        expect(chart().textContent).toContain('손익분기점 1 (추정)');
        expect(chart().textContent).toContain('-335');
        const beforeSave = chart().textContent;
        await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent === '저장')!.click());
        expect(chart().textContent).toBe(beforeSave);
        const saved = JSON.parse(fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')![1].body);
        expect(saved.plans[0]).toMatchObject({ year1: 250, year2: 500, year3: 2000 });
        expect(saved.plans[1].year1).toBe(300);
        expect(saved.sources).toBeUndefined();
    });

    it('미입력 매출을 0으로 그리지 않고 중간 연도에서 선을 끊는다', async () => {
        plans[0].year2 = null;
        await mount();
        const path = chart().querySelector('[data-series="revenue"]')!.getAttribute('d')!;
        expect(path.match(/M/g)).toHaveLength(2);
        expect(path).not.toContain('L');
        expect(chart().querySelectorAll('[data-revenue-point]')).toHaveLength(2);
        expect(chart().textContent).toContain('미입력');
        expect(chart().textContent).toContain('산출 불가');
    });

    it.each([
        { revenue: 0, required: 0, text: '입력하면 손익분기점' },
        { revenue: 100, required: 200, text: '3개년 계획 내 손익분기점에 도달하지 못했습니다.' },
        { revenue: 200, required: 200, text: '손익분기점 1 · Y+1년차' },
        { revenue: -50, required: 20, text: '-50' },
    ])('영·음수·미달·일치 금액에서도 유효한 축과 상태를 표시한다 ($revenue/$required)', async value => {
        await act(async () => root.render(createElement(FundingPlanChart, { values: Array.from({ length: 3 }, () => value) })));
        expect(chart().innerHTML).not.toMatch(/NaN|Infinity/);
        expect(chart().textContent).toContain(value.text);
    });

    it('WS-16 조달 출처와 금액 화면에는 WS-15 그래프를 추가하지 않는다', async () => {
        await mount('source');
        expect(container.querySelector('svg[role="img"]')).toBeNull();
        expect(container.textContent).toContain('[WS-16] 자금조달계획표');
        expect([...container.querySelectorAll('input')].map(element => element.value)).toContain('지원금');
    });
});
