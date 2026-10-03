// 자금조달 구분별 세부행 추가·삭제, 합계, 저장 및 권한별 편집을 검증한다.
// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FundingTable from '../components/project/FundingTable';

type Source = { id: string; category: string; year1: string | null; year2: string | null; year3: string | null; order: number };
let root: Root;
let container: HTMLDivElement;
let sources: Source[];
let canWrite: boolean;
let fetchMock: ReturnType<typeof vi.fn>;
const categories = ['정부자금', '엔젤투자금', '연구개발 지원금(R&D)', '민간투자주도형 기술창업지원(TIPS)', '벤처캐피털(VC)', '기타'];
const plans = [{ id: 'plan', category: '소요자금', item: '개발비', year1: 100, year2: 200, year3: 300, order: 0 }];
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    canWrite = true;
    sources = [
        { id: 's1', category: '정부자금', year1: '기존 지원:1,300', year2: '{"source":"운전자금","amount":"500"}', year3: null, order: 0 },
        { id: 's2', category: '정부자금', year1: '{"source":"추가 지원","amount":"120.5"}', year2: '', year3: '20', order: 1 },
        { id: 's3', category: 'TIPS', year1: 'TIPS 일반 R&D:250', year2: '', year3: '', order: 2 },
    ];
    fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method === 'POST') sources = JSON.parse(String(init.body)).sources.map((row: Source, index: number) => ({ ...row, id: `saved-${index}` }));
        return json({ plans, sources, canWrite });
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

const group = (category: string) => container.querySelector<HTMLTableSectionElement>(`tbody[data-source-category="${category}"]`)!;
const button = (label: string) => container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
const values = (category: string) => [...group(category).querySelectorAll('input')].map(input => input.value);
const totals = () => [...container.querySelectorAll('tfoot td')].slice(1).map(cell => cell.textContent);
const click = async (element: HTMLElement) => act(async () => element.click());
const mount = async () => act(async () => root.render(createElement(FundingTable, { projectId: 'fixture', mode: 'source' })));
const save = async () => click([...container.querySelectorAll('button')].find(element => element.textContent === '저장')!);

async function input(category: string, row: number, year: number, part: '출처' | '금액', value: string) {
    const element = container.querySelector<HTMLInputElement>(`input[aria-label="${category} 세부항목 ${row} ${year}차년도(Y+${year}) ${part}"]`)!;
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, value);
        element.dispatchEvent(new Event('input', { bubbles: true }));
    });
}

describe('WS-17 세부항목', () => {
    it('같은 구분의 세부행은 묶고 기존 JSON·문자열·금액 형식을 모두 보존한다', async () => {
        const before = structuredClone(sources);
        await mount();
        expect(group('정부자금').querySelector('th')?.rowSpan).toBe(2);
        expect(values('정부자금')).toContain('기존 지원');
        expect(values('정부자금')).toContain('추가 지원');
        expect(values(categories[3])).toContain('TIPS 일반 R&D');
        expect(totals()).toEqual(['1,670.5', '500', '20']);
        await save();
        expect(sources.map(({ id: _id, ...row }) => row)).toEqual(before.map(({ id: _id, ...row }) => row));
        expect(JSON.parse(fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')![1].body).plans).toBeUndefined();
    });

    it('각 구분에 여러 세부행을 추가하고 3개년 금액을 합산하여 저장한다', async () => {
        await mount();
        for (const category of categories) await click(button(`${category} 세부항목 추가`));
        expect(group('정부자금').querySelectorAll('tr')).toHaveLength(3);
        await input('정부자금', 3, 1, '출처', '신규 지원');
        await input('정부자금', 3, 1, '금액', '100.25');
        await input('정부자금', 3, 2, '금액', '200');
        await input('정부자금', 3, 3, '금액', '300');
        expect(totals()).toEqual(['1,770.75', '700', '320']);
        await save();
        expect(sources).toHaveLength(9);
        expect(sources.map(row => row.order)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
        expect(values('정부자금')).toContain('신규 지원');
        expect(totals()).toEqual(['1,770.75', '700', '320']);
    });

    it('삭제 취소 시 내용이 유지되고 확인 후에는 선택한 세부행만 제거한다', async () => {
        await mount();
        vi.mocked(window.confirm).mockReturnValueOnce(false);
        await click(button('정부자금 세부항목 1 삭제'));
        expect(group('정부자금').querySelectorAll('tr')).toHaveLength(2);
        await click(button('정부자금 세부항목 1 삭제'));
        expect(group('정부자금').querySelectorAll('tr')).toHaveLength(1);
        expect(values('정부자금')).not.toContain('기존 지원');
        expect(values('정부자금')).toContain('추가 지원');
        expect(totals()).toEqual(['370.5', '0', '20']);
        await save();
        expect(sources).toHaveLength(2);
        expect(values(categories[3])).toContain('TIPS 일반 R&D');
    });

    it('전부 삭제하여 저장·재조회해도 세부행이 복원되지 않으며 기본 구분에는 다시 추가할 수 있다', async () => {
        await mount();
        await click(button('정부자금 세부항목 1 삭제'));
        await click(button('정부자금 세부항목 1 삭제'));
        await click(button(`${categories[3]} 세부항목 1 삭제`));
        await save();
        expect(sources).toEqual([]);
        expect(container.querySelectorAll('tbody input')).toHaveLength(0);
        expect(totals()).toEqual(['0', '0', '0']);
        for (const category of categories) expect(button(`${category} 세부항목 추가`)).not.toBeNull();
        await click(button('정부자금 세부항목 추가'));
        expect(group('정부자금').querySelectorAll('input')).toHaveLength(6);
    });

    it('이름이 같은 출처의 별도 세부행과 사용자 지정 구분을 임의로 합치거나 삭제하지 않는다', async () => {
        sources.push({ ...sources[0], id: 's4', category: '협력자금', order: 3 });
        sources.push({ ...sources[0], id: 's5', order: 4 });
        await mount();
        expect(group('정부자금').querySelectorAll('tr')).toHaveLength(3);
        expect(values('협력자금')).toContain('기존 지원');
        await save();
        expect(sources).toHaveLength(5);
        expect(totals()).toEqual(['4,270.5', '1,500', '20']);
    });

    it('읽기 전용 권한에서는 추가·삭제·입력·저장을 비활성화한다', async () => {
        canWrite = false;
        await mount();
        for (const element of container.querySelectorAll('input, button')) expect(element.matches(':disabled')).toBe(true);
        await click(button('정부자금 세부항목 추가'));
        await click(button('정부자금 세부항목 1 삭제'));
        expect(group('정부자금').querySelectorAll('tr')).toHaveLength(2);
        expect(window.confirm).not.toHaveBeenCalled();
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('저장 중에는 편집을 막고 저장 실패 시 입력과 세부행을 유지하여 다시 저장할 수 있다', async () => {
        await mount();
        await click(button('정부자금 세부항목 추가'));
        await input('정부자금', 3, 1, '출처', '실패 후 보존');
        let finish!: (response: Response) => void;
        fetchMock.mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }));
        vi.spyOn(console, 'error').mockImplementation(() => {});
        await save();
        expect(button('정부자금 세부항목 추가').matches(':disabled')).toBe(true);
        await click(button('정부자금 세부항목 1 삭제'));
        await act(async () => finish(json({ error: '실패' }, 500)));
        expect(values('정부자금')).toContain('실패 후 보존');
        expect(container.textContent).toContain('저장하지 못했습니다.');
        expect(button('정부자금 세부항목 추가').matches(':disabled')).toBe(false);
        await save();
        expect(sources).toHaveLength(4);
    });
});
