// 대시보드가 프로젝트 목록을 못 불러왔을 때 "프로젝트가 없습니다"로 보이지 않는지 실제
// React DOM 으로 확인한다(2026-10-25 코드 리뷰 B19).
// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import DashboardPage from '../app/dashboard/page';

vi.mock('next/link', () => ({ default: ({ children, ...props }: { children: ReactNode; href: string }) => createElement('a', props, children) }));
vi.mock('@/components/ThemeToggle', () => ({ default: () => null }));

let container: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn();
const json = (data: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(data), { status }));
const project = {
    id: 'project_1', name: '기존 프로젝트', updatedAt: '2026-10-01T00:00:00Z', programId: 'program_1', programName: '프로그램',
    memberCount: 1, surveyCount: 0, qfdMatrixCount: 0, role: 'OWNER',
};

function mockApi(projects: () => Promise<Response>) {
    fetchMock.mockImplementation((url: string) => {
        if (url === '/api/projects') return projects();
        if (url === '/api/me/profile') return json({ role: 'MENTEE', name: '멘티', canAccessAdmin: false });
        if (url === '/api/project-requests') return json({ requests: [], ownedProjectCount: 0 });
        return json({});
    });
}

const button = (text: string) => [...container.querySelectorAll('button')].find((item) => item.textContent?.trim() === text);

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

async function open() {
    await act(async () => { root.render(createElement(DashboardPage)); });
}

it('목록 조회가 실패하면 빈 목록 안내 대신 실패와 다시 불러오기를 보인다', async () => {
    mockApi(() => json({ error: '실패' }, 500));
    await open();

    expect(container.querySelector('[role="alert"]')?.textContent).toContain('프로젝트 목록을 불러오지 못했습니다');
    expect(container.textContent).not.toContain('프로젝트가 없습니다');
    expect(button('첫 프로젝트 만들기')).toBeUndefined();
});

it('네트워크 오류도 빈 목록으로 보이지 않는다', async () => {
    mockApi(() => Promise.reject(new TypeError('Failed to fetch')));
    await open();

    expect(container.textContent).toContain('프로젝트 목록을 불러오지 못했습니다');
    expect(container.textContent).not.toContain('프로젝트가 없습니다');
});

it('다시 불러오기에 성공하면 기존 프로젝트를 보여 준다', async () => {
    let fails = true;
    mockApi(() => (fails ? json({ error: '실패' }, 500) : json({ projects: [project] })));
    await open();
    fails = false;

    await act(async () => button('다시 불러오기')!.click());

    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).toContain('기존 프로젝트');
});

it('불러오는 동안에는 빈 목록 안내를 띄우지 않는다', async () => {
    mockApi(() => new Promise<Response>(() => undefined));
    await open();

    expect(container.textContent).not.toContain('프로젝트가 없습니다');
});

it('정말 비어 있을 때만 빈 목록 안내를 보인다', async () => {
    mockApi(() => json({ projects: [] }));
    await open();

    expect(container.textContent).toContain('프로젝트가 없습니다');
    expect(container.querySelector('[role="alert"]')).toBeNull();
});
