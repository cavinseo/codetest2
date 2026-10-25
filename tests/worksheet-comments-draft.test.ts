// 다른 의견을 지워도 작성 중이던 의견이 사라지지 않는지 실제 React DOM 으로 확인한다
// (2026-10-25 코드 리뷰 B23).
// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import WorksheetComments from '../components/project/WorksheetComments';

let container: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn();
const json = (data: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(data), { status }));
const comment = (id: string, content: string) => ({ id, content, authorId: 'me', author: { name: '멘토' }, createdAt: '2026-10-01T00:00:00Z' });
let comments = [comment('c1', '첫 의견'), comment('c2', '둘째 의견')];

const textarea = () => container.querySelector('textarea')!;
const buttons = (text: string) => [...container.querySelectorAll('button')].filter((item) => item.textContent?.trim() === text);
async function type(value: string) {
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(textarea(), value);
        textarea().dispatchEvent(new Event('input', { bubbles: true }));
    });
}

beforeEach(async () => {
    comments = [comment('c1', '첫 의견'), comment('c2', '둘째 의견')];
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('confirm', () => true);
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
        if (init?.method === 'DELETE') {
            const { id } = JSON.parse(init.body as string);
            comments = comments.filter((item) => item.id !== id);
            return json({ success: true });
        }
        return json({ comments, canComment: true, userId: 'me' });
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => { root.render(createElement(WorksheetComments, { projectId: 'project', worksheetId: 'sales' })); });
});

afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.resetAllMocks();
    vi.unstubAllGlobals();
});

it('새 의견을 쓰는 중에 다른 의견을 지워도 쓰던 내용이 남는다', async () => {
    await type('아직 저장 안 한 의견');

    await act(async () => buttons('삭제')[0].click());

    expect(container.textContent).not.toContain('첫 의견');
    expect(textarea().value).toBe('아직 저장 안 한 의견');
});

it('다른 의견을 고치는 중에 또 다른 의견을 지워도 수정 중인 상태를 유지한다', async () => {
    await act(async () => buttons('수정')[1].click());
    await type('둘째 의견 고침');

    await act(async () => buttons('삭제')[0].click());

    expect(container.textContent).toContain('의견 수정');
    expect(textarea().value).toBe('둘째 의견 고침');
});

it('고치던 의견을 지우면 새 의견 작성으로 돌아가되 쓰던 내용은 남긴다', async () => {
    await act(async () => buttons('수정')[0].click());
    await type('첫 의견 고침');

    await act(async () => buttons('삭제')[0].click());

    expect(container.textContent).toContain('의견 작성');
    expect(container.textContent).not.toContain('의견 수정');
    expect(textarea().value).toBe('첫 의견 고침');
});
