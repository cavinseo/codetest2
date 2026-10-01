// 인라인 편집 중에 상단 "저장" 을 눌러도 방금 친 글자가 함께 저장되는지
// 실제 React DOM 으로 확인한다. 예전에는 editValues 를 둔 채 requirements 만
// 보내고 성공하면 editValues 를 버려서, "저장되었습니다" 를 띄우면서 편집이
// 원래 값으로 되돌아갔다.
// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RequirementsTable from '../components/project/RequirementsTable';

const requirements = [
    { id: 'req_1', category: '사용성', subcategory: '속도', requirement: '빠른 주문', order: 0 },
    { id: 'req_2', category: '안정성', subcategory: '보호', requirement: '안전한 보관', order: 1 },
];

let container: HTMLDivElement;
let root: Root;
let posted: Array<Record<string, unknown>>;
let savedRequirements = requirements;
let saveStatus = 200;

function fetchMock(input: RequestInfo | URL, init?: RequestInit) {
    const url = String(input);
    if (init?.method === 'POST') {
        posted.push(JSON.parse(String(init.body)) as Record<string, unknown>);
        if (saveStatus === 200) savedRequirements = posted.at(-1)!.requirements as typeof requirements;
        return Promise.resolve({ ok: saveStatus === 200, status: saveStatus, json: () => Promise.resolve({ success: saveStatus === 200 }) } as Response);
    }
    const payload = url.endsWith('/attributes') ? { attributes: [] } : { requirements: savedRequirements };
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(payload) } as Response);
}

// 편집 모드에서는 행 안의 체크 버튼도 title="저장" 이라, 글자로만 찾는다.
function buttonByText(label: string) {
    const found = [...container.querySelectorAll('button')].find((item) => item.textContent?.trim() === label);
    expect(found, `"${label}" 버튼이 있어야 합니다.`).toBeTruthy();
    return found!;
}

beforeEach(() => {
    posted = [];
    savedRequirements = requirements;
    saveStatus = 200;
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('fetch', vi.fn(fetchMock));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

const mixedGroups = [
    { id: 'req_1', category: '사용성', subcategory: '속도', requirement: '빠른 주문', order: 10 },
    { id: 'req_2', category: '안정성', subcategory: '보호', requirement: '안전한 보관', order: 20 },
    { id: 'req_3', category: '사용성', subcategory: '편의', requirement: '쉬운 입력', order: 30 },
    { id: 'req_4', category: '안정성', subcategory: '보호', requirement: '오류 방지', order: 40 },
    { id: 'req_5', category: '사용성', subcategory: '속도', requirement: '빠른 조회', order: 50 },
];

async function mountMixedGroups() {
    savedRequirements = mixedGroups;
    await act(async () => { root.render(createElement(RequirementsTable, { projectId: 'fixture-project' })); });
}

async function fill(selector: string, value: string) {
    const input = container.querySelector<HTMLInputElement>(selector)!;
    expect(input).not.toBeNull();
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
}

const displayedRequirements = () => [...container.querySelectorAll('tbody tr')].map(row => row.children[1].textContent);

it('미분류 항목을 분류한 뒤에도 모든 행의 1·2차 그룹이 보이고 저장값이 유지된다', async () => {
    savedRequirements = [
        { id: 'req_1', category: '미분류', subcategory: '', requirement: '첫째', order: 0 },
        { id: 'req_2', category: '미분류', subcategory: '', requirement: '둘째', order: 1 },
        { id: 'req_3', category: '미분류', subcategory: '기존 2차', requirement: '셋째', order: 2 },
        { id: 'req_4', category: '미분류', subcategory: '기존 2차', requirement: '넷째', order: 3 },
    ];
    await act(async () => { root.render(createElement(RequirementsTable, { projectId: 'fixture-project' })); });
    await act(async () => { container.querySelectorAll<HTMLButtonElement>('button[title="수정"]')[0].click(); });
    await fill('input[list="cat_autocomplete"]', '새 1차');
    await fill('input[list="subcat_autocomplete"]', '새 2차');
    await act(async () => { buttonByText('저장').click(); });

    const rows = [...container.querySelectorAll('tbody tr')];
    expect(rows.map(row => [row.children[1].textContent, row.children[2].textContent?.trim(), row.children[3].textContent?.trim()])).toEqual([
        ['첫째', '새 1차', '새 2차'],
        ['둘째', '미분류', '—'],
        ['셋째', '미분류', '기존 2차'],
        ['넷째', '미분류', '기존 2차'],
    ]);
    expect(savedRequirements.map(row => [row.id, row.category, row.subcategory])).toEqual([
        ['req_1', '새 1차', '새 2차'],
        ['req_2', '미분류', ''],
        ['req_3', '미분류', '기존 2차'],
        ['req_4', '미분류', '기존 2차'],
    ]);
    await act(async () => { root.unmount(); });
    root = createRoot(container);
    await act(async () => { root.render(createElement(RequirementsTable, { projectId: 'fixture-project' })); });
    expect([...container.querySelectorAll('tbody tr')].map(row => [row.children[2].textContent?.trim(), row.children[3].textContent?.trim()])).toEqual([
        ['새 1차', '새 2차'],
        ['미분류', '—'],
        ['미분류', '기존 2차'],
        ['미분류', '기존 2차'],
    ]);
});

it('편집 중 저장하면 새 그룹으로 묶고 저장한 순서를 다시 불러와도 유지한다', async () => {
    await mountMixedGroups();
    await act(async () => { container.querySelectorAll<HTMLButtonElement>('button[title="수정"]')[2].click(); });
    await fill('input[list="cat_autocomplete"]', '안정성');
    await fill('input[list="subcat_autocomplete"]', '보호');
    await act(async () => { buttonByText('저장').click(); });
    expect(savedRequirements.map(row => row.id)).toEqual(['req_1', 'req_5', 'req_2', 'req_3', 'req_4']);
    expect(savedRequirements.map(row => row.order)).toEqual([0, 1, 2, 3, 4]);
    const expected = ['빠른 주문', '빠른 조회', '안전한 보관', '쉬운 입력', '오류 방지'];
    expect(displayedRequirements()).toEqual(expected);
    await act(async () => { root.unmount(); });
    root = createRoot(container);
    await act(async () => { root.render(createElement(RequirementsTable, { projectId: 'fixture-project' })); });
    expect(displayedRequirements()).toEqual(expected);
});

it.each([true, false])('새 요구사항을 추가하고 저장하면 기존 그룹 뒤에 연결한다 (Enter 확정=%s)', async confirmWithEnter => {
    await mountMixedGroups();
    await act(async () => { buttonByText('행 추가').click(); });
    await fill('input[placeholder="항목 * (Enter로 추가)"]', '새로운 빠른 검색');
    await fill('input[placeholder="1차 그룹 *"]', '사용성');
    await fill('input[placeholder="2차 그룹 (선택)"]', '속도');
    if (confirmWithEnter) {
        await act(async () => { container.querySelector('input[placeholder="1차 그룹 *"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    }
    await act(async () => { buttonByText('저장').click(); });
    expect(savedRequirements.map(row => row.requirement)).toEqual(['빠른 주문', '빠른 조회', '새로운 빠른 검색', '쉬운 입력', '안전한 보관', '오류 방지']);
    expect(savedRequirements.map(row => row.order)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(savedRequirements.filter(row => mixedGroups.some(existing => existing.id === row.id))).toHaveLength(5);
    expect(displayedRequirements()).toEqual(savedRequirements.map(row => row.requirement));
});

it('저장이 실패하면 편집 내용과 기존 순서를 남기고 재시도할 수 있다', async () => {
    await mountMixedGroups();
    await act(async () => { container.querySelectorAll<HTMLButtonElement>('button[title="수정"]')[2].click(); });
    await fill('input[list="cat_autocomplete"]', '안정성');
    saveStatus = 500;
    await act(async () => { buttonByText('저장').click(); });
    expect(container.querySelector<HTMLInputElement>('input[list="cat_autocomplete"]')?.value).toBe('안정성');
    expect(savedRequirements).toEqual(mixedGroups);
    saveStatus = 200;
    await act(async () => { buttonByText('저장').click(); });
    expect(savedRequirements.map(row => row.id)).toEqual(['req_1', 'req_5', 'req_2', 'req_4', 'req_3']);
});

it('행의 편집 확정 버튼으로 그룹을 바꿔도 바로 같은 그룹에 모인다', async () => {
    await mountMixedGroups();
    await act(async () => { container.querySelectorAll<HTMLButtonElement>('button[title="수정"]')[2].click(); });
    await fill('input[list="cat_autocomplete"]', '안정성');
    await fill('input[list="subcat_autocomplete"]', '보호');
    await act(async () => { container.querySelector<HTMLButtonElement>('button[title="저장"]')!.click(); });
    expect(displayedRequirements()).toEqual(['빠른 주문', '빠른 조회', '안전한 보관', '쉬운 입력', '오류 방지']);
    await act(async () => { buttonByText('저장').click(); });
    expect(savedRequirements.map(row => row.id)).toEqual(['req_1', 'req_5', 'req_2', 'req_3', 'req_4']);
});

it('새 행의 필수 값이 빠졌으면 기존 목록만 저장한 것처럼 처리하지 않는다', async () => {
    await mountMixedGroups();
    await act(async () => { buttonByText('행 추가').click(); });
    await fill('input[placeholder="항목 * (Enter로 추가)"]', '그룹 미입력 항목');
    await act(async () => { buttonByText('저장').click(); });
    expect(posted).toHaveLength(0);
    expect(container.textContent).toContain('카테고리와 요구사항을 입력하세요.');
    expect(container.querySelector<HTMLInputElement>('input[placeholder="항목 * (Enter로 추가)"]')?.value).toBe('그룹 미입력 항목');
});

it('빈 표의 첫 요구사항도 상단 저장으로 추가할 수 있다', async () => {
    savedRequirements = [];
    await act(async () => { root.render(createElement(RequirementsTable, { projectId: 'fixture-project' })); });
    await act(async () => { buttonByText('행 추가').click(); });
    await fill('input[placeholder="항목 * (Enter로 추가)"]', '첫 요구사항');
    await fill('input[placeholder="1차 그룹 *"]', '품질');
    expect(buttonByText('저장').disabled).toBe(false);
    await act(async () => { buttonByText('저장').click(); });
    expect(savedRequirements).toEqual([expect.objectContaining({ category: '품질', subcategory: '', requirement: '첫 요구사항', order: 0 })]);
    expect(displayedRequirements()).toEqual(['첫 요구사항']);
});

afterEach(async () => {
    await act(async () => { root.unmount(); });
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('고객요구사항 인라인 편집과 저장', () => {
    it('편집을 연 채로 저장하면 방금 친 글자가 함께 전송된다', async () => {
        await act(async () => { root.render(createElement(RequirementsTable, { projectId: 'fixture-project' })); });

        // 첫 행의 편집을 연다(행 안의 버튼은 수정·삭제 순이라 title 로 고른다).
        const rows = [...container.querySelectorAll('tbody tr')];
        const editButton = rows[0].querySelector('button[title="수정"]') as HTMLButtonElement | null;
        expect(editButton, '수정 버튼이 있어야 합니다.').toBeTruthy();
        await act(async () => { editButton!.click(); });

        // 열린 입력에 새 문구를 친다(체크 버튼은 누르지 않는다).
        const input = container.querySelector('tbody tr input') as HTMLInputElement | null;
        expect(input, '편집 입력칸이 열려야 합니다.').toBeTruthy();
        await act(async () => {
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
            setter.call(input, '아주 빠른 주문');
            input!.dispatchEvent(new Event('input', { bubbles: true }));
        });

        await act(async () => { buttonByText('저장').click(); });

        expect(posted, '저장 요청이 한 번 가야 합니다.').toHaveLength(1);
        const sent = (posted[0].requirements as Array<{ id: string; requirement: string }>);
        const edited = sent.find((item) => item.id === 'req_1');
        expect(edited?.requirement, '편집한 문구가 그대로 전송돼야 합니다.').toBe('아주 빠른 주문');
    });
});
