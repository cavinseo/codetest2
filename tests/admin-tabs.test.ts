// 관리자 화면에서 떼어 낸 프로젝트 관리 탭·비밀번호 변경 탭을 실제 React DOM 으로 돌려 본다
// (2026-10-25 코드 리뷰 L4).
// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminProjectsTab, { type AdminProject } from '../components/admin/AdminProjectsTab';
import AdminPasswordTab from '../components/admin/AdminPasswordTab';

vi.mock('next/link', () => ({ default: ({ children, ...props }: { children: ReactNode; href: string }) => createElement('a', props, children) }));
vi.mock('@/components/admin/MentorAssign', () => ({ default: ({ projectId }: { projectId: string }) => createElement('p', null, `배정 패널 ${projectId}`) }));
vi.mock('@/components/admin/ProjectTransfer', () => ({ default: () => null }));

let container: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn();

const project = (id: string, name: string, programId: string, ownerName: string): AdminProject => ({
    id, name, programId, ownerName, ownerId: `owner_${id}`, ownerEmail: `${id}@example.com`,
    createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', reqCount: 1, responseCount: 2, memberCount: 3,
});
const projects = [project('p1', '스마트 화분', 'prog_a', '김멘티'), project('p2', '배달 로봇', 'prog_b', '이멘티')];
const programs = [{ id: 'prog_a', name: '가 프로그램', organization: '기관 A' }, { id: 'prog_b', name: '나 프로그램', organization: '기관 B' }];

async function setValue(element: HTMLInputElement | HTMLSelectElement, value: string) {
    await act(async () => {
        if (element instanceof HTMLSelectElement) {
            element.value = value;
            element.dispatchEvent(new Event('change', { bubbles: true }));
            return;
        }
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, value);
        element.dispatchEvent(new Event('input', { bubbles: true }));
    });
}
const names = () => [...container.querySelectorAll('h3')].map((heading) => heading.textContent);

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

describe('AdminProjectsTab', () => {
    const onDelete = vi.fn();
    const onTransferred = vi.fn(async () => undefined);
    const render = (canAssignMentor = true) => act(async () => root.render(createElement(AdminProjectsTab, {
        projects, programs, role: 'ADMIN', canAssignMentor, onDelete, onTransferred,
    })));

    it('이름·소유자로 찾고 프로그램으로 좁힌다', async () => {
        await render();
        expect(names()).toEqual(['스마트 화분', '배달 로봇']);

        await setValue(container.querySelector<HTMLInputElement>('#admin-project-search')!, '이멘티');
        expect(names()).toEqual(['배달 로봇']);

        await setValue(container.querySelector<HTMLInputElement>('#admin-project-search')!, '');
        await setValue(container.querySelector<HTMLSelectElement>('#admin-project-program-filter')!, 'prog_a');
        expect(names()).toEqual(['스마트 화분']);

        await setValue(container.querySelector<HTMLInputElement>('#admin-project-search')!, '없는 이름');
        expect(container.textContent).toContain('선택한 조건에 맞는 프로젝트가 없습니다.');
    });

    it('삭제를 누르면 그 프로젝트를 넘기고, 멘토 배정 패널은 프로젝트마다 따로 열린다', async () => {
        await render();

        await act(async () => container.querySelector<HTMLButtonElement>('#admin-delete-project-p2')!.click());
        expect(onDelete).toHaveBeenCalledWith(projects[1]);

        await act(async () => container.querySelector<HTMLButtonElement>('#admin-mentor-assign-toggle-p1')!.click());
        expect(container.textContent).toContain('배정 패널 p1');
        expect(container.textContent).not.toContain('배정 패널 p2');
    });

    it('멘토 배정 권한이 없으면 배정 버튼을 보이지 않는다', async () => {
        await render(false);

        expect(container.querySelector('#admin-mentor-assign-toggle-p1')).toBeNull();
    });
});

describe('AdminPasswordTab', () => {
    const fields = () => ['currentPassword', 'newPassword', 'confirmPassword']
        .map((key) => container.querySelector<HTMLInputElement>(`#admin-${key}`)!);
    const submit = () => act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));

    it('규칙에 맞지 않으면 요청하지 않고 이유를 보인다', async () => {
        await act(async () => root.render(createElement(AdminPasswordTab)));
        const [current, next, confirm] = fields();
        await setValue(current, 'old-password');
        await setValue(next, 'new-password-1');
        await setValue(confirm, 'new-password-2');
        await submit();

        expect(fetchMock).not.toHaveBeenCalled();
        expect(container.querySelector('#admin-password-message')!.textContent).toBe('새 비밀번호와 확인 값이 다릅니다.');
    });

    it('바꾸면 입력을 비우고 서버의 안내를 보인다', async () => {
        fetchMock.mockResolvedValue(new Response(JSON.stringify({ message: '비밀번호를 변경했습니다.' }), { status: 200 }));
        await act(async () => root.render(createElement(AdminPasswordTab)));
        const [current, next, confirm] = fields();
        await setValue(current, 'old-password');
        await setValue(next, 'new-password-1');
        await setValue(confirm, 'new-password-1');
        await submit();

        expect(fetchMock).toHaveBeenCalledWith('/api/admin/password', expect.objectContaining({ method: 'POST' }));
        expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual({
            currentPassword: 'old-password', newPassword: 'new-password-1', confirmPassword: 'new-password-1',
        });
        expect(container.querySelector('#admin-password-message')!.textContent).toBe('비밀번호를 변경했습니다.');
        expect(fields().map((field) => field.value)).toEqual(['', '', '']);
    });
});
