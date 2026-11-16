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

async function editRequirement(text: string) {
    const row = [...container.querySelectorAll('tbody tr')].find(row => row.children[1].textContent === text)!;
    expect(row).toBeTruthy();
    await act(async () => { row.querySelector<HTMLButtonElement>('button[title="수정"]')!.click(); });
}

it('처음 불러올 때도 2차→1차 그룹으로 묶어 가운데 병합하고 저장 시 모든 ID와 내용을 보존한다', async () => {
    savedRequirements = [
        { id: 'r1', category: '정비', subcategory: '무인 공장', requirement: '정비 첫째', order: 0 },
        { id: 'r2', category: '품질', subcategory: '신뢰', requirement: '품질 첫째', order: 1 },
        { id: 'r3', category: '운용', subcategory: '무인 공장', requirement: '운용 첫째', order: 2 },
        { id: 'r4', category: '정비', subcategory: '무인 공장', requirement: '정비 둘째', order: 3 },
        { id: 'r5', category: '정비', subcategory: '신뢰', requirement: '정비 셋째', order: 4 },
    ];
    const original = structuredClone(savedRequirements);
    await act(async () => { root.render(createElement(RequirementsTable, { projectId: 'fixture-project' })); });
    expect(displayedRequirements()).toEqual(['정비 첫째', '정비 둘째', '운용 첫째', '품질 첫째', '정비 셋째']);
    expect(posted).toHaveLength(0);
    const rows = [...container.querySelectorAll('tbody tr')];
    expect(rows[0].querySelector<HTMLTableCellElement>('td[data-group-level="primary"]')?.rowSpan).toBe(2);
    expect(rows[0].querySelector<HTMLTableCellElement>('td[data-group-level="secondary"]')?.rowSpan).toBe(3);
    expect(rows[2].querySelector<HTMLTableCellElement>('td[data-group-level="primary"]')?.rowSpan).toBe(1);
    expect(rows[2].querySelector('td[data-group-level="secondary"]')).toBeNull();
    for (const cell of container.querySelectorAll('td[data-group-level]')) {
        expect(cell.classList.contains('align-middle')).toBe(true);
        expect(cell.classList.contains('text-center')).toBe(true);
    }
    await editRequirement('정비 둘째');
    expect(container.querySelector<HTMLInputElement>('input[list="cat_autocomplete"]')?.value).toBe('정비');
    expect(container.querySelector<HTMLInputElement>('input[list="subcat_autocomplete"]')?.value).toBe('무인 공장');
    await act(async () => { container.querySelector<HTMLButtonElement>('button[title="취소"]')!.click(); });
    await act(async () => { buttonByText('저장').click(); });
    expect(savedRequirements.map(row => row.id)).toEqual(['r1', 'r4', 'r3', 'r2', 'r5']);
    for (const row of original) expect(savedRequirements.find(saved => saved.id === row.id)).toEqual({ ...row, order: savedRequirements.findIndex(saved => saved.id === row.id) });
});

it('미분류 항목을 분류한 뒤에도 그룹값은 유지하고 중복 그룹명은 한 번만 표시한다', async () => {
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

    const visibleGroups = () => [...container.querySelectorAll('tbody tr')].map(row =>
        [...row.querySelectorAll<HTMLTableCellElement>('td[data-group-level]')].map(cell => [cell.dataset.groupLevel, cell.textContent?.trim(), cell.rowSpan]));
    expect(visibleGroups()).toEqual([
        [['primary', '새 1차', 1], ['secondary', '새 2차', 1]],
        [['primary', '미분류', 1], ['secondary', '—', 1]],
        [['primary', '미분류', 2], ['secondary', '기존 2차', 2]],
        [],
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
    expect(visibleGroups()).toEqual([
        [['primary', '새 1차', 1], ['secondary', '새 2차', 1]],
        [['primary', '미분류', 1], ['secondary', '—', 1]],
        [['primary', '미분류', 2], ['secondary', '기존 2차', 2]],
        [],
    ]);
});

it('2번 항목을 기존 그룹으로 옮겨도 편집칸과 다른 그룹을 유지한다', async () => {
    savedRequirements = [
        { id: 'req_1', category: '최소인력 운용', subcategory: '무인 공장', requirement: '첫째', order: 0 },
        { id: 'req_2', category: '미분류', subcategory: '', requirement: '둘째', order: 1 },
        { id: 'req_3', category: '예방정비', subcategory: '', requirement: '셋째', order: 2 },
        { id: 'req_4', category: '미분류', subcategory: '', requirement: '넷째', order: 3 },
        { id: 'req_5', category: '미분류', subcategory: '', requirement: '다섯째', order: 4 },
    ];
    await act(async () => { root.render(createElement(RequirementsTable, { projectId: 'fixture-project' })); });
    await act(async () => { container.querySelectorAll<HTMLButtonElement>('button[title="수정"]')[1].click(); });
    await fill('input[list="cat_autocomplete"]', '최소인력 운용');
    await fill('input[list="subcat_autocomplete"]', '무인 공장');
    await act(async () => { buttonByText('저장').click(); });
    expect(savedRequirements.map(row => [row.id, row.category, row.subcategory])).toEqual([
        ['req_1', '최소인력 운용', '무인 공장'],
        ['req_2', '최소인력 운용', '무인 공장'],
        ['req_3', '예방정비', ''],
        ['req_4', '미분류', ''],
        ['req_5', '미분류', ''],
    ]);
    const rows = [...container.querySelectorAll('tbody tr')];
    expect(rows[0].querySelector<HTMLTableCellElement>('td[data-group-level="primary"]')?.rowSpan).toBe(2);
    expect(rows[0].querySelector<HTMLTableCellElement>('td[data-group-level="secondary"]')?.rowSpan).toBe(2);
    expect(rows[1].querySelectorAll('td[data-group-level]')).toHaveLength(0);
    expect(rows[3].querySelector<HTMLTableCellElement>('td[data-group-level="primary"]')?.rowSpan).toBe(2);
    await act(async () => { rows[1].querySelector<HTMLButtonElement>('button[title="수정"]')!.click(); });
    expect(container.querySelector<HTMLTableCellElement>('tbody tr:first-child td[data-group-level="primary"]')?.rowSpan).toBe(1);
    expect(container.querySelector<HTMLTableCellElement>('tbody tr:nth-child(2) td[data-group-level="primary"]')?.rowSpan).toBe(1);
    expect(container.querySelector<HTMLInputElement>('input[list="cat_autocomplete"]')?.value).toBe('최소인력 운용');
    expect(container.querySelector<HTMLInputElement>('input[list="subcat_autocomplete"]')?.value).toBe('무인 공장');
    await act(async () => { container.querySelector<HTMLButtonElement>('button[title="취소"]')!.click(); });
    expect(container.querySelector<HTMLTableCellElement>('tbody tr:first-child td[data-group-level="primary"]')?.rowSpan).toBe(2);
});

it('편집 중 저장하면 새 그룹으로 묶고 저장한 순서를 다시 불러와도 유지한다', async () => {
    await mountMixedGroups();
    await editRequirement('쉬운 입력');
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
    expect(savedRequirements.map(row => row.requirement)).toEqual(['빠른 주문', '빠른 조회', '새로운 빠른 검색', '안전한 보관', '오류 방지', '쉬운 입력']);
    expect(savedRequirements.map(row => row.order)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(savedRequirements.filter(row => mixedGroups.some(existing => existing.id === row.id))).toHaveLength(5);
    expect(displayedRequirements()).toEqual(savedRequirements.map(row => row.requirement));
});

it('저장이 실패하면 편집 내용과 기존 순서를 남기고 재시도할 수 있다', async () => {
    await mountMixedGroups();
    await editRequirement('쉬운 입력');
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
    await editRequirement('쉬운 입력');
    await fill('input[list="cat_autocomplete"]', '안정성');
    await fill('input[list="subcat_autocomplete"]', '보호');
    await act(async () => { container.querySelector<HTMLButtonElement>('button[title="편집 반영"]')!.click(); });
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

    it('다른 행으로 편집을 옮겨도 기존 입력을 보존하고 함께 저장한다', async () => {
        await act(async () => { root.render(createElement(RequirementsTable, { projectId: 'fixture-project' })); });
        await editRequirement('빠른 주문');
        await fill('tbody tr input', '빠르게 주문');
        await editRequirement('안전한 보관');
        await fill('tbody tr input', '안전하게 보관');
        await act(async () => { buttonByText('저장').click(); });
        expect(savedRequirements.map(row => row.requirement)).toEqual(['빠르게 주문', '안전하게 보관']);
    });

    it('기존 행의 한글 조합 중 Enter는 편집을 확정하지 않는다', async () => {
        await act(async () => { root.render(createElement(RequirementsTable, { projectId: 'fixture-project' })); });
        await editRequirement('빠른 주문');
        const input = container.querySelector<HTMLInputElement>('tbody tr input')!;
        await act(async () => {
            input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
            input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, keyCode: 229, bubbles: true }));
        });
        expect(container.contains(input)).toBe(true);
    });

    it('새 행의 한글 조합 중 Enter는 행을 추가하지 않는다', async () => {
        await act(async () => { root.render(createElement(RequirementsTable, { projectId: 'fixture-project' })); });
        await act(async () => { buttonByText('행 추가').click(); });
        await fill('input[placeholder="항목 * (Enter로 추가)"]', '새 요구사항');
        await fill('input[placeholder="1차 그룹 *"]', '품질');
        const input = container.querySelector<HTMLInputElement>('input[placeholder="1차 그룹 *"]')!;
        await act(async () => {
            input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
            input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, keyCode: 229, bubbles: true }));
        });
        expect(container.contains(input)).toBe(true);
        expect(savedRequirements).toEqual(requirements);
    });

    it.each(['tbody tr input', 'input[list="cat_autocomplete"]'])('기존 행의 필수값을 비우면 저장하지 않는다 (%s)', async selector => {
        await act(async () => { root.render(createElement(RequirementsTable, { projectId: 'fixture-project' })); });
        await editRequirement('빠른 주문');
        await fill(selector, '   ');
        await act(async () => { buttonByText('저장').click(); });
        expect(posted).toHaveLength(0);
        expect(container.textContent).toContain('1차 그룹과 요구사항을 입력하세요.');
    });

    it('마지막 항목 삭제도 명시적 전체 삭제로 저장한다', async () => {
        savedRequirements = [requirements[0]];
        await act(async () => { root.render(createElement(RequirementsTable, { projectId: 'fixture-project' })); });
        await act(async () => { container.querySelector<HTMLButtonElement>('button[title="삭제"]')!.click(); });
        expect(buttonByText('저장').disabled).toBe(false);
        await act(async () => { buttonByText('저장').click(); });
        expect(posted[0]).toMatchObject({ requirements: [], deleteAll: true });
        expect(savedRequirements).toEqual([]);
    });

    it('저장하지 않은 입력이 있을 때 브라우저 이탈 경고를 요청한다', async () => {
        await act(async () => { root.render(createElement(RequirementsTable, { projectId: 'fixture-project' })); });
        await editRequirement('빠른 주문');
        await fill('tbody tr input', '수정 중인 요구사항');
        const event = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(true);
    });

    it('상위 워크시트에 미저장 상태를 알리고 저장 성공 후 해제한다', async () => {
        const dirtyChanges: boolean[] = [];
        await act(async () => { root.render(createElement(RequirementsTable, {
            projectId: 'fixture-project', onDirtyChange: dirty => dirtyChanges.push(dirty),
        })); });
        await editRequirement('빠른 주문');
        await fill('tbody tr input', '저장 전 수정');
        expect(dirtyChanges.at(-1)).toBe(true);
        await act(async () => { buttonByText('저장').click(); });
        expect(dirtyChanges.at(-1)).toBe(false);
    });
});
