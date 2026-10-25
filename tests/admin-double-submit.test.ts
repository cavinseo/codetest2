// 관리자 화면에서 기간 연장·프로젝트 삭제를 연달아 눌러도 요청이 한 번만 나가는지
// 실제 React DOM 으로 확인한다(2026-10-25 코드 리뷰 B17).
// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import AdminModePage from '../app/admin/page';

vi.mock('next/link', () => ({ default: ({ children, ...props }: { children: ReactNode; href: string }) => createElement('a', props, children) }));
vi.mock('@/components/ThemeToggle', () => ({ default: () => null }));
vi.mock('@/components/admin/MentorAssign', () => ({ default: () => null }));
vi.mock('@/components/admin/ProjectTransfer', () => ({ default: () => null }));

let container: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn();
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const member = {
    id: 'mentee_1', name: '멘티', email: 'mentee@example.test', role: 'MENTEE', isAdmin: false,
    status: 'APPROVED', accessExpiresAt: '2026-12-01T00:00:00.000Z', mustChangePassword: false,
    createdAt: '2026-09-15T00:00:00Z', updatedAt: '2026-09-15T00:00:00Z', programId: null, programName: null,
};
const project = {
    id: 'project_1', name: '삭제할 프로젝트', ownerId: 'mentee_1', programId: 'program_1',
    createdAt: '2026-09-15T00:00:00Z', updatedAt: '2026-09-15T00:00:00Z',
    ownerEmail: null, ownerName: null, reqCount: 0, responseCount: 0, memberCount: 1,
};

function load(path: string) {
    if (path.endsWith('/stats')) {
        return response({ totalProjects: 1, totalUsers: 1, totalRequirements: 0, totalResponses: 0, kanoDistribution: {}, recentProjects: [] });
    }
    if (path.endsWith('/admin/users')) return response({ users: [member] });
    if (path.endsWith('/admin/projects')) return response({ projects: [project], programs: [] });
    if (path.endsWith('/api/programs')) return response({ programs: [] });
    return response({ role: 'ADMIN' });
}

const writes = (method: string) => fetchMock.mock.calls.filter(([, init]) => init?.method === method);
const button = (text: string) => [...container.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent?.trim() === text)!;
const tab = (prefix: string) => [...container.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent?.trim().startsWith(prefix))!;

beforeEach(async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('fetch', fetchMock);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    fetchMock.mockImplementation(async (path: string) => load(path));
    await act(async () => { root.render(createElement(AdminModePage)); });
});

afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.resetAllMocks();
    vi.unstubAllGlobals();
});

it('「N일 연장」을 응답 전에 두 번 눌러도 연장 요청은 한 번만 보낸다', async () => {
    await act(async () => tab('회원 관리').click());
    let finish!: (value: Response) => void;
    fetchMock.mockImplementation((path: string, init?: RequestInit) => init?.method === 'PATCH'
        ? new Promise<Response>((resolve) => { finish = resolve; })
        : load(path));
    const extend = container.querySelector<HTMLButtonElement>('#admin-extend-access-mentee_1')!;

    await act(async () => { extend.click(); extend.click(); });

    expect(writes('PATCH')).toHaveLength(1);
    expect(container.querySelector<HTMLButtonElement>('#admin-extend-access-mentee_1')!.disabled).toBe(true);

    await act(async () => { finish(response({ user: { accessExpiresAt: '2027-03-01T00:00:00.000Z' } })); });

    // 응답을 받은 뒤에는 다시 누를 수 있다.
    expect(container.querySelector<HTMLButtonElement>('#admin-extend-access-mentee_1')!.disabled).toBe(false);
});

it('연장 요청이 네트워크 오류로 끝나도 버튼 잠금을 푼다', async () => {
    await act(async () => tab('회원 관리').click());
    fetchMock.mockImplementation(async (path: string, init?: RequestInit) => {
        if (init?.method === 'PATCH') throw new TypeError('Failed to fetch');
        return load(path);
    });

    await act(async () => container.querySelector<HTMLButtonElement>('#admin-extend-access-mentee_1')!.click());

    expect(container.textContent).toContain('기간 연장에 실패했습니다');
    expect(container.querySelector<HTMLButtonElement>('#admin-extend-access-mentee_1')!.disabled).toBe(false);
});

it('프로젝트 삭제 확정을 연달아 눌러도 삭제 요청은 한 번만 보낸다', async () => {
    await act(async () => tab('프로젝트 관리').click());
    await act(async () => container.querySelector<HTMLButtonElement>('#admin-delete-project-project_1')!.click());
    await act(async () => button('계속').click());
    let finish!: (value: Response) => void;
    fetchMock.mockImplementation((path: string, init?: RequestInit) => init?.method === 'DELETE'
        ? new Promise<Response>((resolve) => { finish = resolve; })
        : load(path));
    const confirm = container.querySelector<HTMLButtonElement>('#admin-confirm-delete-btn')!;

    await act(async () => { confirm.click(); confirm.click(); });

    expect(writes('DELETE')).toHaveLength(1);
    expect(container.querySelector<HTMLButtonElement>('#admin-confirm-delete-btn')!.disabled).toBe(true);

    await act(async () => { finish(response({ deletedProject: '삭제할 프로젝트' })); });

    expect(container.querySelector('#admin-confirm-delete-btn')).toBeNull();
    expect(container.textContent).toContain('"삭제할 프로젝트"와 모든 연관 데이터를 삭제했습니다.');
});
