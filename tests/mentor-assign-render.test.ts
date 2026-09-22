// 단일 멘토 배정 화면의 매니저 겸임과 실패·취소 시 기존 상태 보존을 검증한다.
// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import MentorAssign from '../components/admin/MentorAssign';

const manager = { id: 'manager', name: '담당 매니저', email: 'manager@example.com', role: 'PROGRAM_MANAGER' };
const fetchMock = vi.fn();
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
let assignedMentors: Array<{ id: string; userId: string; user: typeof manager }>;
let assignmentEndpoint: string;
let container: HTMLDivElement;
let root: Root;
const writeRequests = () => fetchMock.mock.calls.filter(([, options]) => options?.method);

async function click(label: string) {
    const button = [...container.querySelectorAll('button')].find(button => button.textContent?.trim() === label);
    expect(button, label).toBeDefined();
    await act(async () => button!.click());
}

async function selectManager() {
    await act(async () => {
        const select = container.querySelector('select')!;
        select.value = manager.id;
        select.dispatchEvent(new Event('change', { bubbles: true }));
    });
}

async function render(scope: 'mentee' | 'project' = 'mentee') {
    assignmentEndpoint = scope === 'mentee' ? '/api/mentees/mentee/mentor' : '/api/projects/project/mentors';
    await act(async () => root.render(createElement(MentorAssign, scope === 'mentee' ? { menteeId: 'mentee' } : { projectId: 'project' })));
}

beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    assignedMentors = [];
    fetchMock.mockImplementation(async (url: string, options?: RequestInit) => {
        if (url.endsWith('?candidates=1')) return json({ candidates: [manager] });
        if (options?.method === 'POST') assignedMentors = [{ id: 'mentee', userId: manager.id, user: manager }];
        if (options?.method === 'DELETE') assignedMentors = [];
        return json(options?.method ? { success: true } : { mentors: assignedMentors });
    });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
});

afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.resetAllMocks();
    vi.unstubAllGlobals();
});

it.each(['mentee', 'project'] as const)('%s 화면에서 프로그램 매니저를 배정하고 해제한 목록을 다시 표시한다', async scope => {
    await render(scope);
    expect(container.querySelector('option[value="manager"]')?.textContent).toBe('담당 매니저 (프로그램 매니저)');
    await selectManager();
    await click('배정');
    expect(container.querySelector('li')?.textContent).toContain(manager.name);
    expect(container.querySelector('select')?.value).toBe('');
    await click('해제');
    expect(container.textContent).toContain('배정된 멘토가 없습니다.');
    expect(container.textContent).toContain('해제했습니다.');
    expect(writeRequests().map(([url, options]) => [url, options.method, JSON.parse(String(options.body))])).toEqual([
        [assignmentEndpoint, 'POST', { userId: manager.id }],
        [assignmentEndpoint, 'DELETE', { userId: manager.id }],
    ]);
});

it('서버가 배정을 거절하면 오류를 표시하고 목록을 다시 조회한다', async () => {
    await render();
    await selectManager();
    fetchMock.mockResolvedValueOnce(json({ error: '배정 권한이 변경되었습니다.' }, 403));
    await click('배정');
    expect(container.textContent).toContain('배정 권한이 변경되었습니다.');
    expect(container.textContent).toContain('배정된 멘토가 없습니다.');
    expect(container.querySelector('select')?.value).toBe('');
    expect(fetchMock.mock.calls.slice(-2).map(([url]) => url)).toEqual([assignmentEndpoint, `${assignmentEndpoint}?candidates=1`]);
});

it('통신 실패는 선택한 매니저를 유지해 다시 배정할 수 있다', async () => {
    await render();
    await selectManager();
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    await click('배정');
    expect(container.textContent).toContain('배정에 실패했습니다. 연결을 확인하세요.');
    expect(container.querySelector('select')?.value).toBe(manager.id);
    await click('배정');
    expect(container.querySelector('li')?.textContent).toContain(manager.name);
});

it('기존 멘토 교체를 취소하면 배정 요청을 보내지 않는다', async () => {
    assignedMentors = [{ id: 'mentee', userId: manager.id, user: manager }];
    await render();
    await selectManager();
    vi.mocked(window.confirm).mockReturnValue(false);
    await click('배정');
    expect(writeRequests()).toHaveLength(0);
    expect(container.querySelector('li')?.textContent).toContain(manager.name);
});

it('해제 응답이 JSON이 아니어도 기존 배정을 유지하고 기본 오류를 표시한다', async () => {
    assignedMentors = [{ id: 'mentee', userId: manager.id, user: manager }];
    await render();
    fetchMock.mockResolvedValueOnce(new Response('server error', { status: 500 }));
    await click('해제');
    expect(container.textContent).toContain('해제에 실패했습니다.');
    expect(container.querySelector('li')?.textContent).toContain(manager.name);
});
