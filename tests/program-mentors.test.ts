// 복수 멘티 배정의 선택 범위, 기존 배정 보존과 부분 실패 처리를 검증한다.
// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ProgramMentors from '../components/admin/ProgramMentors';

let container: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn();
const mentor = { id: 'mentor', name: '멘토 하나', email: 'mentor@example.com', role: 'MENTOR' };
const previous = { id: 'previous', name: '기존 멘토', email: 'previous@example.com', role: 'MENTOR' };
let rows: Array<{ id: string; name: string; email: string; mentorAssignment: null | { mentorId: string; mentor: typeof mentor } }>;
let failedIds: string[];
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const writes = () => fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');
function button(label: string) {
    const found = [...container.querySelectorAll('button')].find(b => b.textContent?.trim() === label);
    expect(found, label).toBeDefined();
    return found!;
}
async function click(label: string) { await act(async () => { button(label).click(); }); }
async function selectMentee(name: string) {
    await act(async () => { container.querySelector<HTMLInputElement>(`input[aria-label="${name} 선택"]`)!.click(); });
}
async function chooseMentor(id = 'mentor') {
    await act(async () => {
        const select = container.querySelector('select')!;
        select.value = id;
        select.dispatchEvent(new Event('change', { bubbles: true }));
    });
}
async function open() {
    await act(async () => { root.render(createElement(ProgramMentors, { programId: 'program' })); });
    await click('멘토 배정 관리');
}
beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    failedIds = [];
    rows = ['가', '나', '다'].map((name, i) => ({ id: `m${i + 1}`, name: `멘티 ${name}`, email: `m${i + 1}@example.com`, mentorAssignment: i === 2 ? { mentorId: previous.id, mentor: previous } : null }));
    fetchMock.mockImplementation(async (input, init) => {
        const url = String(input);
        if (url === '/api/programs/program/mentees') return json({ mentees: rows });
        if (url.endsWith('?candidates=1')) return json({ candidates: [mentor, previous] });
        const id = url.split('/')[3];
        if (failedIds.includes(id)) return json({ error: '배정 권한을 확인하세요.' }, 403);
        if (init?.method === 'POST') {
            const target = JSON.parse(init.body).userId === mentor.id ? mentor : previous;
            rows = rows.map(row => row.id === id ? { ...row, mentorAssignment: { mentorId: target.id, mentor: target } } : row);
            return json({ success: true });
        }
        if (init?.method === 'DELETE') {
            rows = rows.map(row => row.id === id ? { ...row, mentorAssignment: null } : row);
            return json({ success: true });
        }
        throw new Error('Unexpected request');
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});
afterEach(async () => {
    await act(async () => { root.unmount(); });
    container.remove();
    vi.restoreAllMocks();
    vi.resetAllMocks();
    vi.unstubAllGlobals();
});
it('선택한 두 멘티를 한 멘토에게 배정하고 미선택 멘티의 기존 배정을 보존한다', async () => {
    await open();
    await chooseMentor();
    await selectMentee('멘티 가');
    await selectMentee('멘티 나');
    await click('선택한 2명에게 배정');
    expect(writes().map(([url, init]) => [url, JSON.parse(init.body)])).toEqual([
        ['/api/mentees/m1/mentor', { userId: 'mentor' }], ['/api/mentees/m2/mentor', { userId: 'mentor' }],
    ]);
    expect(rows.map(row => row.mentorAssignment?.mentorId)).toEqual(['mentor', 'mentor', 'previous']);
    expect(container.textContent).toContain('2명을 배정했습니다.');
    expect(window.confirm).not.toHaveBeenCalled();
});
it('다른 멘토를 교체할 때만 확인하고 취소하면 배정을 유지한다', async () => {
    await open();
    await chooseMentor();
    await selectMentee('멘티 다');
    vi.mocked(window.confirm).mockReturnValue(false);
    await click('선택한 1명에게 배정');
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('멘티 다의 기존 멘토'));
    expect(writes()).toHaveLength(0);
    expect(rows[2].mentorAssignment?.mentorId).toBe('previous');
    vi.mocked(window.confirm).mockReturnValue(true);
    await click('선택한 1명에게 배정');
    expect(rows[2].mentorAssignment?.mentorId).toBe('mentor');
});
it('일부 배정 실패 시 성공 항목을 유지하고 실패 항목만 재시도한다', async () => {
    failedIds = ['m2'];
    await open();
    await chooseMentor();
    await selectMentee('멘티 가');
    await selectMentee('멘티 나');
    await click('선택한 2명에게 배정');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('멘티 나: 배정 권한을 확인하세요.');
    expect(rows[0].mentorAssignment?.mentorId).toBe('mentor');
    expect(rows[1].mentorAssignment).toBeNull();
    failedIds = [];
    await click('선택한 1명에게 배정');
    expect(writes().map(([url]) => url)).toEqual(['/api/mentees/m1/mentor', '/api/mentees/m2/mentor', '/api/mentees/m2/mentor']);
});
it('이미 같은 멘토가 배정된 멘티는 다시 쓰지 않고 추가 멘티만 배정한다', async () => {
    rows[0].mentorAssignment = { mentorId: 'mentor', mentor };
    await open();
    await chooseMentor();
    await selectMentee('멘티 가');
    await selectMentee('멘티 나');
    await click('선택한 1명에게 배정');
    expect(writes().map(([url]) => url)).toEqual(['/api/mentees/m2/mentor']);
    expect(rows[0].mentorAssignment?.mentorId).toBe('mentor');
});
it('멘티 한 명의 배정 해제는 같은 멘토의 다른 멘티에게 영향을 주지 않는다', async () => {
    rows[0].mentorAssignment = rows[1].mentorAssignment = { mentorId: 'mentor', mentor };
    await open();
    await act(async () => { container.querySelector<HTMLButtonElement>('[aria-label="멘티 가 멘토 배정 해제"]')!.click(); });
    expect(rows[0].mentorAssignment).toBeNull();
    expect(rows[1].mentorAssignment?.mentorId).toBe('mentor');
    expect(container.textContent).toContain('멘티 가의 멘토 배정을 해제했습니다.');
});
it('멘토 또는 멘티를 고르지 않으면 배정할 수 없다', async () => {
    await open();
    expect(button('선택한 0명에게 배정').disabled).toBe(true);
    await selectMentee('멘티 가');
    expect(button('선택한 1명에게 배정').disabled).toBe(true);
    await chooseMentor();
    expect(button('선택한 1명에게 배정').disabled).toBe(false);
});
it('멘토 목록 조회가 실패하면 배정 화면을 잠근다', async () => {
    fetchMock.mockImplementation(async () => json({ error: '목록 권한이 없습니다.' }, 403));
    await open();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('목록 권한이 없습니다.');
    expect(container.querySelector('select')).toBeNull();
    expect(writes()).toHaveLength(0);
});
