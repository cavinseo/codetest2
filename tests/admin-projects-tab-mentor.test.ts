// 프로젝트 카드의 담당 멘토 표시와 배정·변경 버튼 문구를 실제 React DOM으로 검증한다.
// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import AdminProjectsTab, { type AdminProject } from '../components/admin/AdminProjectsTab';

vi.mock('../components/admin/ProjectTransfer', () => ({ default: () => null }));
vi.mock('../components/admin/MentorAssign', () => ({ default: () => null }));

let container: HTMLDivElement;
let root: Root;

const project = (id: string, mentorName: string | null): AdminProject => ({
    id, name: id, ownerId: 'owner', programId: 'program', createdAt: '2026-09-15T00:00:00Z', updatedAt: '2026-09-15T00:00:00Z',
    ownerEmail: null, ownerName: null, mentorName, reqCount: 0, responseCount: 0, memberCount: 1,
});

beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(async () => {
    await act(async () => { root.unmount(); });
    container.remove();
    vi.unstubAllGlobals();
});

it('멘토가 있으면 이름과 멘토 변경을, 없으면 멘토 배정만 보여준다', async () => {
    await act(async () => {
        root.render(createElement(AdminProjectsTab, {
            projects: [project('assigned', '김멘토'), project('empty', null)], programs: [], role: 'ADMIN', canAssignMentor: true,
            onDelete: vi.fn(), onTransferred: vi.fn(), onMentorChanged: vi.fn(),
        }));
    });
    const toggle = (id: string) => container.querySelector<HTMLButtonElement>(`#admin-mentor-assign-toggle-${id}`)!;
    expect(toggle('assigned').textContent).toBe('멘토 변경');
    expect(container.querySelector('#admin-project-mentor-assigned')!.textContent).toBe('담당 멘토 김멘토');
    expect(toggle('empty').textContent).toBe('멘토 배정');
    expect(container.querySelector('#admin-project-mentor-empty')).toBeNull();

    await act(async () => toggle('assigned').click());
    expect(toggle('assigned').textContent).toBe('멘토 변경 닫기');
});
