// 단독 워크시트 페이지의 편집 관문이 프로젝트 홈과 같은 역할 기준으로 표를 잠그는지
// 실제 React DOM 으로 확인한다(2026-10-25 코드 리뷰 B16).
// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WorksheetEditGuard from '../components/project/WorksheetEditGuard';

let container: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn();
const json = (data: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(data), { status }));

beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('fetch', fetchMock);
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
});

afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.resetAllMocks();
    vi.unstubAllGlobals();
});

async function render() {
    await act(async () => {
        root.render(createElement(WorksheetEditGuard, { projectId: 'project' }, createElement('button', { type: 'button' }, '저장')));
    });
}

const fieldset = () => container.querySelector('fieldset')!;

describe('WorksheetEditGuard (B16)', () => {
    it.each(['OWNER', 'EDITOR', 'ADMIN'])('%s 는 편집할 수 있다', async (role) => {
        fetchMock.mockReturnValue(json({ project: { role } }));
        await render();

        expect(fetchMock).toHaveBeenCalledWith('/api/projects/project/overview');
        expect(fieldset().disabled).toBe(false);
        expect(container.querySelector('[role="status"]')).toBeNull();
    });

    it('조회 전용 역할은 읽기 전용 안내와 함께 잠근다', async () => {
        fetchMock.mockReturnValue(json({ project: { role: 'COACH' } }));
        await render();

        expect(fieldset().disabled).toBe(true);
        expect(container.querySelector('[role="status"]')?.textContent).toContain('읽기 전용');
    });

    it('권한을 확인하지 못하면 잠그고 새로고침을 안내한다', async () => {
        fetchMock.mockReturnValue(json({ error: '실패' }, 500));
        await render();

        expect(fieldset().disabled).toBe(true);
        expect(container.querySelector('[role="status"]')?.textContent).toContain('권한을 확인하지 못해');
    });

    it('권한을 확인하는 동안에도 잠가 둔다', async () => {
        fetchMock.mockReturnValue(new Promise(() => undefined));
        await render();

        expect(fieldset().disabled).toBe(true);
        expect(container.querySelector('[role="status"]')).toBeNull();
    });
});
