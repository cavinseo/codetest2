// 워크시트 표의 실패 알림이 초록색 성공 알림으로 보이지 않는지 확인한다(2026-10-25 코드 리뷰 B24).
// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TechRoadmapTable from '../components/project/TechRoadmapTable';

let container: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn();
const json = (data: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(data), { status }));
const button = (text: string) => [...container.querySelectorAll('button')].find((item) => item.textContent?.trim() === text)!;

beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('fetch', fetchMock);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.resetAllMocks();
    vi.unstubAllGlobals();
});

describe('향후목표고객 저장 알림', () => {
    function mockApi(saveStatus: number) {
        fetchMock.mockImplementation((url: string, init?: RequestInit) => {
            if (init?.method === 'POST') return saveStatus === 200 ? json({ rows: [] }) : json({ error: '실패' }, saveStatus);
            if (url.endsWith('/tech-roadmap')) return json({ rows: [] });
            return json({ items: [] });
        });
    }

    it('저장이 실패하면 오류 알림으로 보인다', async () => {
        mockApi(500);
        await act(async () => { root.render(createElement(TechRoadmapTable, { projectId: 'project' })); });
        await act(async () => button('저장').click());

        const toast = container.querySelector('[role="status"]')!;
        expect(toast.textContent).toContain('저장에 실패했습니다.');
        expect(toast.className).toContain('toast-error');
        expect(toast.className).not.toContain('toast-success');
    });

    it('저장에 성공하면 성공 알림으로 보인다', async () => {
        mockApi(200);
        await act(async () => { root.render(createElement(TechRoadmapTable, { projectId: 'project' })); });
        await act(async () => button('저장').click());

        expect(container.querySelector('[role="status"]')!.className).toContain('toast-success');
    });
});

// 네 표 모두 실패·안내 문구를 종류 없이 띄워 기본값인 성공(초록)으로 보였다. 회귀를 막는다.
describe.each(['SalesTable', 'ImprovementsTable', 'TargetSpecTable', 'TechRoadmapTable'])('%s 의 실패 알림', (name) => {
    it('실패·불가 문구에는 모두 error 종류를 붙인다', () => {
        const source = readFileSync(resolve(process.cwd(), 'components', 'project', `${name}.tsx`), 'utf8');
        const calls = [...source.matchAll(/showToast\(([^)]*)\)/g)].map((match) => match[1]);
        const failures = calls.filter((args) => /실패|못했|없습니다|이미 추가/.test(args));

        expect(failures.length).toBeGreaterThan(0);
        for (const args of failures) expect(args).toMatch(/,\s*'error'\s*$/);
    });
});
