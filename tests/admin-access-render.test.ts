// 관리자 화면이 인증 확인 전과 실패 시 관리 메뉴를 노출하지 않는지 검증한다.
// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import AdminModePage from '../app/admin/page';

vi.mock('next/link', () => ({ default: ({ children, ...props }: { children: ReactNode; href: string }) => createElement('a', props, children) }));
vi.mock('@/components/ThemeToggle', () => ({ default: () => null }));

let container: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn();
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const success = (url: string) => response(url.endsWith('/stats')
    ? { totalProjects: 0, totalUsers: 0, totalRequirements: 0, totalResponses: 0, kanoDistribution: {}, recentProjects: [] }
    : url.endsWith('/users') ? { users: [] } : url.endsWith('/projects') ? { projects: [], programs: [] } : { role: 'ADMIN' });
const render = () => act(async () => { root.render(createElement(AdminModePage)); });
const expectNoControls = () => {
    expect(container.querySelector('#admin-refresh-btn')).toBeNull();
    expect(container.textContent).not.toContain('회원 관리 (');
    expect(container.textContent).not.toContain('프로젝트 관리 (');
};

beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('fetch', fetchMock);
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});

afterEach(async () => {
    await act(async () => root.unmount());
    container.remove(); vi.resetAllMocks(); vi.unstubAllGlobals();
});

it('응답을 기다리는 동안 관리 메뉴를 표시하지 않는다', async () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    await render();
    expectNoControls();
    expect(container.querySelector('[role="status"]')?.textContent).toContain('확인');
});

it.each(['/api/admin/stats', '/api/admin/users', '/api/admin/projects', '/api/me/profile'])('%s가 401이면 로그인 화면만 표시한다', async url => {
    fetchMock.mockImplementation(async (path: string) => path === url ? response({ error: 'Login required.' }, 401) : success(path));
    await render();
    expectNoControls();
    expect(container.textContent).toContain('관리자 권한이 있는 계정으로 로그인하세요');
});

it('권한이 없으면 접근 거부 화면만 표시한다', async () => {
    fetchMock.mockResolvedValue(response({ error: 'Admin access required.' }, 403));
    await render();
    expectNoControls();
    expect(container.textContent).toContain('관리자 권한이 없습니다');
});

it.each(['서버 오류', '네트워크 오류', '응답 해석 실패'])('%s 시 메뉴를 감추고 재시도 성공 후에만 표시한다', async failure => {
    if (failure === '네트워크 오류') fetchMock.mockRejectedValue(new Error('offline'));
    else if (failure === '응답 해석 실패') fetchMock.mockImplementation(async () => new Response('invalid json'));
    else fetchMock.mockImplementation(async () => response({ error: 'failed' }, 500));
    await render();
    expectNoControls();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('확인하지 못했습니다');
    fetchMock.mockImplementation(async (path: string) => success(path));
    await act(async () => { [...container.querySelectorAll('button')].find(button => button.textContent === '다시 시도')!.click(); });
    expect(container.querySelector('#admin-refresh-btn')).not.toBeNull();
    expect(container.textContent).toContain('회원 관리 (0)');
});

it('정상 접근 후 세션이 만료되면 새로고침으로 관리 메뉴가 다시 감춰진다', async () => {
    fetchMock.mockImplementation(async (path: string) => success(path));
    await render();
    expect(container.querySelector('#admin-refresh-btn')).not.toBeNull();
    fetchMock.mockImplementation(async () => response({ error: 'Login required.' }, 401));
    await act(async () => container.querySelector<HTMLButtonElement>('#admin-refresh-btn')!.click());
    expectNoControls();
    expect(container.textContent).toContain('관리자 권한이 있는 계정으로 로그인하세요');
});
