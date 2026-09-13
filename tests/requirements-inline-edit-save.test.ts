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

function fetchMock(input: RequestInfo | URL, init?: RequestInit) {
    const url = String(input);
    if (init?.method === 'POST') {
        posted.push(JSON.parse(String(init.body)) as Record<string, unknown>);
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ success: true }) } as Response);
    }
    const payload = url.endsWith('/attributes') ? { attributes: [] } : { requirements };
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
