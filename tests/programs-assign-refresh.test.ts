// 한 프로그램에 멘티를 배정한 뒤 열려 있던 다른 프로그램의 배정 패널이 "불러오는 중..."에
// 멈추지 않고 후보를 다시 불러오는지 실제 React DOM 으로 확인한다(2026-10-25 코드 리뷰 B22).
// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ProgramsTab from '../components/admin/ProgramsTab';

let container: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn();
const program = (id: string, name: string) => ({
    id, name, organization: '기관', startsAt: '2026-09-01T00:00:00Z', endsAt: '2026-10-31T00:00:00Z',
    managerName: '담당자', managerEmail: 'manager@example.test', projectCount: 0, menteeCount: 0,
});
const response = (body: unknown, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body });
// 배정 전에는 m1 이 어디에도 없고, 배정 뒤에는 p1 소속이 된다.
let assigned = false;
const candidateCalls = (programId: string) => fetchMock.mock.calls.filter(([url]) => url === `/api/programs/${programId}/mentees?candidates=1`);

beforeEach(() => {
    assigned = false;
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation(async (url: string, options?: RequestInit) => {
        if (options?.method === 'POST' && url === '/api/programs/p1/mentees') {
            assigned = true;
            return response({ success: true, mentee: { id: 'm1', name: '멘티1', programName: '첫 프로그램' } });
        }
        if (url === '/api/programs') return response({ programs: [program('p1', '첫 프로그램'), program('p2', '둘째 프로그램')] });
        if (url === '/api/programs/p1/mentees?candidates=1') {
            return response({ candidates: assigned ? [] : [{ id: 'm1', name: '멘티1', programId: null, programName: null }] });
        }
        if (url === '/api/programs/p2/mentees?candidates=1') {
            return response({ candidates: [{ id: 'm1', name: '멘티1', programId: assigned ? 'p1' : null, programName: assigned ? '첫 프로그램' : null }] });
        }
        return response({});
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
});

const panelText = (programId: string) => container.querySelector(`#programs-assign-toggle-${programId}`)!
    .closest('.card')?.textContent ?? '';

it('배정한 뒤에도 열려 있던 다른 프로그램의 후보를 다시 불러와 새 소속을 보인다', async () => {
    await act(async () => root.render(createElement(ProgramsTab, { canCreate: true, canDelete: true })));
    await act(async () => container.querySelector<HTMLButtonElement>('#programs-assign-toggle-p1')!.click());
    await act(async () => container.querySelector<HTMLButtonElement>('#programs-assign-toggle-p2')!.click());
    expect(panelText('p2')).toContain('소속 없음');

    await act(async () => {
        const select = container.querySelector<HTMLSelectElement>('#programs-assign-select-p1')!;
        select.value = 'm1';
        select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => container.querySelector<HTMLButtonElement>('#programs-assign-submit-p1')!.click());

    expect(container.textContent).toContain('멘티1 님을 배정했습니다.');
    expect(panelText('p2')).not.toContain('불러오는 중...');
    expect(panelText('p2')).toContain('현재: 첫 프로그램');
    expect(candidateCalls('p2')).toHaveLength(2);
    expect(panelText('p1')).toContain('배정할 수 있는 멘티가 없습니다.');
});

it('닫혀 있던 프로그램은 배정 직후 불러오지 않고 열 때 불러온다', async () => {
    await act(async () => root.render(createElement(ProgramsTab, { canCreate: true, canDelete: true })));
    await act(async () => container.querySelector<HTMLButtonElement>('#programs-assign-toggle-p1')!.click());
    await act(async () => {
        const select = container.querySelector<HTMLSelectElement>('#programs-assign-select-p1')!;
        select.value = 'm1';
        select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => container.querySelector<HTMLButtonElement>('#programs-assign-submit-p1')!.click());
    expect(candidateCalls('p2')).toHaveLength(0);

    await act(async () => container.querySelector<HTMLButtonElement>('#programs-assign-toggle-p2')!.click());

    expect(candidateCalls('p2')).toHaveLength(1);
    expect(panelText('p2')).toContain('현재: 첫 프로그램');
});
