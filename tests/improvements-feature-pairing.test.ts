// 고객니즈 행을 지워도 아래 "개선 기능 및 성능 List" 가 다른 니즈로 밀리지
// 않는지 실제 React DOM 으로 확인한다. 예전에는 두 표를 배열 인덱스로 짝지어,
// A·B·C 중 B 를 지우면 C 에 B 의 기능이 달린 채로 저장됐다.
// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ImprovementsTable from '../components/project/ImprovementsTable';

const savedItems = [
    { id: 'need_a', type: 'need', content: 'A', improvementRate: '10', devProportion: '1', order: 0 },
    { id: 'need_b', type: 'need', content: 'B', improvementRate: '20', devProportion: '2', order: 1 },
    { id: 'need_c', type: 'need', content: 'C', improvementRate: '30', devProportion: '3', order: 2 },
    { id: 'feat_a', type: 'feature', content: 'A', improvementRate: '기능1', devProportion: '향상1', order: 0 },
    { id: 'feat_b', type: 'feature', content: 'B', improvementRate: '기능2', devProportion: '향상2', order: 1 },
    { id: 'feat_c', type: 'feature', content: 'C', improvementRate: '기능3', devProportion: '향상3', order: 2 },
];

let container: HTMLDivElement;
let root: Root;

function fetchMock(input: RequestInfo | URL) {
    const url = String(input);
    const payload = url.endsWith('/improvements')
        ? { items: savedItems }
        : { requirements: [] };
    return Promise.resolve({ ok: true, json: () => Promise.resolve(payload) } as Response);
}

async function mount() {
    await act(async () => { root.render(createElement(ImprovementsTable, { projectId: 'fixture-project' })); });
}

// 0번 표가 고객니즈, 1번 표가 개선 기능 목록이다.
function tableRows(tableIndex: number) {
    const table = container.querySelectorAll('table')[tableIndex];
    expect(table, `${tableIndex}번 표가 있어야 합니다.`).toBeDefined();
    return [...table.querySelectorAll('tbody tr')];
}

// 기능 표의 각 행을 "고객니즈|추가기능" 으로 읽는다.
function featurePairs() {
    return tableRows(1)
        .map((row) => [...row.querySelectorAll('input')].map((input) => input.value))
        .filter((values) => values.some(Boolean))
        .map(([need, added]) => `${need}|${added}`);
}

beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('fetch', vi.fn(fetchMock));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(async () => {
    await act(async () => { root.unmount(); });
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('개선포인트 두 표의 짝', () => {
    it('저장된 기능은 자기 고객니즈를 그대로 들고 있다', async () => {
        await mount();
        expect(featurePairs()).toEqual(['A|기능1', 'B|기능2', 'C|기능3']);
    });

    it('가운데 니즈를 지워도 남은 기능이 다른 니즈로 밀리지 않는다', async () => {
        await mount();

        // 니즈 표의 두 번째 행(B)을 지운다.
        const deleteB = tableRows(0)[1].querySelector('button');
        expect(deleteB, 'B 행의 삭제 버튼이 있어야 합니다.').toBeTruthy();
        await act(async () => { deleteB!.click(); });

        // 니즈는 A·C 만 남고, 기능은 자기 짝을 유지한다.
        // 예전에는 여기서 'A|기능1', 'C|기능2', '|기능3' 이 되어 C 에 B 의 기능이 붙었다.
        expect(tableRows(0)).toHaveLength(2);
        expect(featurePairs()).toEqual(['A|기능1', 'B|기능2', 'C|기능3']);
    });
});
