// 대시보드에서 "전체·프로그램1·프로그램2…" 드롭다운으로 한 프로그램의 프로젝트만 골라 보는지
// 실제 React DOM 으로 확인한다(관리자·프로그램 매니저·멘토가 여러 프로그램을 볼 때).
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
const project = (id: string, name: string, programId: string, programName: string) => ({
    id, name, updatedAt: '2026-10-01T00:00:00Z', programId, programName,
    memberCount: 1, surveyCount: 0, qfdMatrixCount: 0, role: 'ADMIN',
});

function mockApi(projects: unknown[], role = 'ADMIN') {
    fetchMock.mockImplementation((url: string) => {
        if (url === '/api/projects') return json({ projects });
        if (url === '/api/me/profile') return json({ role, name: '사용자', canAccessAdmin: role === 'ADMIN' });
        if (url === '/api/programs') return json({ programs: [] });
        if (url === '/api/project-requests') return json({ requests: [], ownedProjectCount: 0 });
        return json({});
    });
}

const filter = () => container.querySelector<HTMLSelectElement>('#dashboard-program-filter');
const options = () => [...filter()!.options].map((option) => option.textContent);
async function choose(value: string) {
    await act(async () => {
        filter()!.value = value;
        filter()!.dispatchEvent(new Event('change', { bubbles: true }));
    });
}

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

const projects = [
    project('p1', '스마트 화분', 'prog_b', '나 프로그램'),
    project('p2', '배달 로봇', 'prog_a', '가 프로그램'),
    project('p3', '공유 주차', 'prog_b', '나 프로그램'),
];

it.each(['ADMIN', 'PROGRAM_MANAGER', 'MENTOR'])('%s 는 전체와 프로그램 이름순 드롭다운을 본다', async (role) => {
    mockApi(projects, role);
    await open();

    expect(options()).toEqual(['전체 (3개)', '가 프로그램 (1개)', '나 프로그램 (2개)']);
    expect(filter()!.value).toBe('');
    for (const name of ['스마트 화분', '배달 로봇', '공유 주차']) expect(container.textContent).toContain(name);
});

it('프로그램을 고르면 그 프로그램의 프로젝트만 보이고, 전체로 되돌릴 수 있다', async () => {
    mockApi(projects);
    await open();

    await choose('prog_b');
    expect(container.textContent).toContain('스마트 화분');
    expect(container.textContent).toContain('공유 주차');
    expect(container.textContent).not.toContain('배달 로봇');

    await choose('prog_a');
    expect(container.textContent).toContain('배달 로봇');
    expect(container.textContent).not.toContain('스마트 화분');

    await choose('');
    for (const name of ['스마트 화분', '배달 로봇', '공유 주차']) expect(container.textContent).toContain(name);
});

it('프로그램이 하나뿐이면 드롭다운을 보이지 않는다', async () => {
    mockApi([projects[0], projects[2]]);
    await open();

    expect(filter()).toBeNull();
    expect(container.textContent).toContain('스마트 화분');
    expect(container.textContent).toContain('공유 주차');
});
