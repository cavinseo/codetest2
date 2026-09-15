// 이름이 없는 회원의 목록 표시·검색·삭제 대상 식별을 실제 React DOM으로 검증한다.
// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import MembersTab, { type User } from '../components/admin/MembersTab';

let container: HTMLDivElement;
let root: Root;

const member = (id: string, name: string | null): User => ({
    id, name, email: `${id}@example.test`, role: 'MENTEE', isAdmin: false,
    status: 'APPROVED', accessExpiresAt: null, mustChangePassword: false,
    createdAt: '2026-09-15T00:00:00Z', updatedAt: '2026-09-15T00:00:00Z',
    programId: null, programName: null,
});

async function renderMembers(members: User[]) {
    const onRequestDelete = vi.fn();
    await act(async () => {
        root.render(createElement(MembersTab, {
            members, onRequestDelete, onApprove: vi.fn(), onSetRole: vi.fn(),
            onExtendAccess: vi.fn(), onCreate: vi.fn(), onReload: vi.fn(),
        }));
    });
    return onRequestDelete;
}

async function search(value: string) {
    const input = container.querySelector<HTMLInputElement>('#admin-member-search')!;
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
}

beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true, json: async () => ({ programs: [] }),
    }));
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(async () => {
    await act(async () => { root.unmount(); });
    container.remove();
    vi.unstubAllGlobals();
});

it.each([null, ''])('이름이 %s인 회원도 표시하고 삭제 확인 대상으로 ID를 전달한다', async (name) => {
    const onRequestDelete = await renderMembers([member('unprofiled', name)]);
    const row = container.querySelector('tbody tr')!;
    expect(row.textContent).toContain('이름 미등록');
    expect(row.textContent).toContain('unprofiled@example.test');
    await act(async () => {
        container.querySelector<HTMLButtonElement>('#admin-delete-user-unprofiled')!.click();
    });
    expect(onRequestDelete).toHaveBeenCalledWith({ id: 'unprofiled', name: 'unprofiled@example.test' });
});

it('이름이 없는 회원이 섞여 있어도 ID와 이름으로 검색하고 결과 없음에서 복귀한다', async () => {
    await renderMembers([member('unprofiled', null), member('named', '홍길동')]);
    await search('UNPROFILED');
    expect(container.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(container.querySelector('tbody')!.textContent).toContain('unprofiled@example.test');
    await search('길동');
    expect(container.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(container.querySelector('tbody')!.textContent).toContain('홍길동');
    await search('없는 회원');
    expect(container.textContent).toContain('검색 결과가 없습니다');
    await search('');
    expect(container.querySelectorAll('tbody tr')).toHaveLength(2);
});

it('멘토의 프로젝트 개설 허용 상태를 표시하고 선택한 멘토만 활성화한다', async () => {
    await renderMembers([{ ...member('mentor', null), role: 'MENTOR', mentorProjectCreationEnabled: false }, member('mentee', null)]);
    const button = container.querySelector<HTMLButtonElement>('button[aria-pressed="false"][aria-label*="프로젝트 생성"]')!;
    expect(button).not.toBeNull();
    expect(button.textContent).toContain('사용중지');
    await act(async () => button.click());
    expect(fetch).toHaveBeenCalledWith('/api/admin/users', expect.objectContaining({
        method: 'PATCH', body: JSON.stringify({ userId: 'mentor', action: 'setMentorProjectCreation', enabled: true }),
    }));
    expect(container.textContent).toContain('프로젝트 생성을 활성화했습니다.');
});
