// WS-12의 그룹 셀 병합과 병합값 수정 시 모든 원본 행의 보존을 검증한다.
// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import TargetSpecTable from '../components/project/TargetSpecTable';

let container: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn();
const data = [
    { id: 'a1', category: '구동', subCategory: '제어', specItem: '기술 1', note: '유지', targetValue: '10', unit: 'ms', order: 0 },
    { id: 'a2', category: '구동', subCategory: '제어', specItem: '기술 2', note: '신규', targetValue: '20', unit: 'ms', order: 1 },
    { id: 'a3', category: '구동', subCategory: '전송', specItem: '기술 3', note: '유지', order: 2 },
    { id: 'b1', category: '측정', subCategory: '제어', specItem: '기술 4', note: '유지', order: 3 },
    { id: 'empty1', category: '', subCategory: '', specItem: '기술 5', order: 4 },
    { id: 'empty2', category: '', subCategory: '', specItem: '기술 6', order: 5 },
];
const inputs = (placeholder: string) => [...container.querySelectorAll<HTMLInputElement>(`tbody input[placeholder="${placeholder}"]`)];
async function fill(element: HTMLInputElement, value: string) {
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, value);
        element.dispatchEvent(new Event('input', { bubbles: true }));
    });
}
beforeEach(async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation(async (_url: string, init?: { body?: string }) => new Response(JSON.stringify({
        rows: init?.body ? JSON.parse(init.body).rows.map((row: object, index: number) => ({ id: `saved-${index}`, ...row })) : data,
        asIsRows: [], suggestions: [], newSpecs: [],
    })));
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root.render(createElement(TargetSpecTable, { projectId: 'project' })));
});
afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.resetAllMocks();
    vi.unstubAllGlobals();
});

it('스펙분류와 같은 분류 안의 세부항목만 한 번 표시하고 모든 기술 행과 빈 입력칸을 유지한다', () => {
    expect(inputs('스펙분류').map((input) => input.value)).toEqual(['구동', '측정', '', '']);
    expect(inputs('세부항목').map((input) => input.value)).toEqual(['제어', '전송', '제어', '', '']);
    expect(inputs('스펙분류')[0].closest('td')!.rowSpan).toBe(3);
    expect(inputs('세부항목')[0].closest('td')!.rowSpan).toBe(2);
    expect(inputs('기술적 특성').map((input) => input.value)).toEqual(data.map((row) => row.specItem));
    expect(inputs('세부항목')[0].closest('td')!.textContent).toContain('신규');
});

it('병합값을 비운 뒤 다시 입력해도 같은 그룹 전체에 저장하고 하위 기술·목표값은 보존한다', async () => {
    const category = inputs('스펙분류')[0];
    await act(async () => category.focus());
    await fill(category, '');
    await fill(category, '구동 개선');
    await act(async () => category.blur());
    const sub = inputs('세부항목')[0];
    await act(async () => sub.focus());
    await fill(sub, '제어 개선');
    await act(async () => sub.blur());
    const save = [...container.querySelectorAll('button')].find((button) => button.textContent === '저장')!;
    await act(async () => save.click());
    const written = JSON.parse(fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')![1].body).rows;
    expect(written).toHaveLength(data.length);
    expect(written.slice(0, 3).map((row: { category: string }) => row.category)).toEqual(['구동 개선', '구동 개선', '구동 개선']);
    expect(written.map((row: { subCategory: string }) => row.subCategory)).toEqual(['제어 개선', '제어 개선', '전송', '제어', '', '']);
    expect(written.map((row: { specItem: string }) => row.specItem)).toEqual(data.map((row) => row.specItem));
    expect(written[0]).toMatchObject({ targetValue: '10', unit: 'ms' });
    expect(written[1]).toMatchObject({ targetValue: '20', unit: 'ms', note: '신규' });
});
