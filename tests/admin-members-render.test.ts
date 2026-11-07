// 이름이 없는 회원의 목록 표시·검색·삭제 대상 식별을 실제 React DOM으로 검증한다.
// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MembersTab, { type User } from '../components/admin/MembersTab';
import { ALL_PROGRAMS, clearStoredProgramFilter } from '../lib/member-program-filter';

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

describe('프로그램별 보기', () => {
    const programs = [{ id: 'a', name: '가 프로그램', organization: '기관' }, { id: 'b', name: '나 프로그램', organization: '기관' }];
    const roster: User[] = [
        { ...member('mentee-a', '가 멘티'), programId: 'a' },
        { ...member('mentee-b', '나 멘티'), programId: 'b' },
        { ...member('mentor-a', '가 멘토'), role: 'MENTOR', relatedProgramIds: ['a'] },
        { ...member('manager-b', '나 매니저'), role: 'PROGRAM_MANAGER', relatedProgramIds: ['b'] },
        { ...member('admin', '관리자'), role: 'ADMIN', relatedProgramIds: [] },
    ];
    const rows = () => [...container.querySelectorAll('tbody tr')].map(row => row.querySelector('p')!.textContent);
    const filterSelect = () => container.querySelector<HTMLSelectElement>('#admin-member-program-filter')!;
    const choose = async (value: string) => {
        await act(async () => {
            Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(filterSelect(), value);
            filterSelect().dispatchEvent(new Event('change', { bubbles: true }));
        });
    };

    beforeEach(() => {
        window.localStorage.clear();
        vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ programs }) } as Response);
    });

    it('처음에는 전체를 보여주고 프로그램을 고르면 그 멘티·멘토·매니저만 남기며 역할별 수도 함께 바뀐다', async () => {
        await renderMembers(roster);
        expect(filterSelect().value).toBe(ALL_PROGRAMS);
        expect(rows()).toHaveLength(5);

        await choose('a');
        expect(rows()).toEqual(['가 멘티', '가 멘토']);
        expect(container.querySelector('#admin-member-filter-ALL')!.textContent).toContain('2');
        expect(container.querySelector('#admin-member-filter-MENTOR')!.textContent).toContain('1');
        expect(container.querySelector('#admin-member-filter-PROGRAM_MANAGER')!.textContent).toContain('0');

        await choose('b');
        expect(rows()).toEqual(['나 멘티', '나 매니저']);
        expect(container.querySelector('tbody')!.textContent).toContain('나 프로그램');
    });

    it('화면을 벗어났다 돌아와도 선택을 유지하고, 로그아웃으로 지우면 전체로 돌아간다', async () => {
        await renderMembers(roster);
        await choose('a');
        await act(async () => { root.unmount(); });

        root = createRoot(container);
        await renderMembers(roster);
        expect(filterSelect().value).toBe('a');
        expect(rows()).toEqual(['가 멘티', '가 멘토']);
        await act(async () => { root.unmount(); });

        clearStoredProgramFilter();
        root = createRoot(container);
        await renderMembers(roster);
        expect(filterSelect().value).toBe(ALL_PROGRAMS);
        expect(rows()).toHaveLength(5);
    });

    it('저장된 프로그램이 사라졌으면 전체를 보여준다', async () => {
        window.localStorage.setItem('admin-program-filter', 'deleted');
        await renderMembers(roster);
        expect(filterSelect().value).toBe(ALL_PROGRAMS);
        expect(rows()).toHaveLength(5);
    });

    it('프로그램 목록을 받지 못하면 저장값으로 목록을 거르지 않는다', async () => {
        window.localStorage.setItem('admin-program-filter', 'a');
        vi.mocked(fetch).mockRejectedValue(new Error('offline'));
        await renderMembers(roster);
        expect(rows()).toHaveLength(5);
    });

    it('해당 회원이 없는 프로그램은 그 사실을 안내한다', async () => {
        await renderMembers([roster[0]]);
        await choose('b');
        expect(container.textContent).toContain('선택한 프로그램에 해당하는 회원이 없습니다');
    });
});
