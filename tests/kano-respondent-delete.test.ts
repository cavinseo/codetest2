// 실제 Kano 관리 화면에서 응답자 삭제 확인·권한·실패 보존과 프로젝트 전환을 검증한다.
// @vitest-environment jsdom
import { act, createElement, type AnchorHTMLAttributes } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import KanoManager from '../components/project/KanoManager';
import KanoRespondentTable from '../components/project/KanoRespondentTable';

vi.mock('next/link', () => ({ default: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => createElement('a', props) }));
const fetchMock = vi.fn();
const sharedEmail = 'shared@example.test';
const secondEmail = 'second@example.test';
const bEmail = 'project-b@example.test';
const requirement = { id: 'req_1', category: '품질', requirement: '안정적인 동작', order: 0 };
const respondent = (email: string) => ({ email, respondedAt: '2026-10-01T00:00:00Z', answers: [
    { requirementId: 'req_1', positiveAnswer: 1, negativeAnswer: 5, kanoCategory: 'O' },
] });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
let rows: Record<string, ReturnType<typeof respondent>[]>;
let access: Record<string, { canRead: boolean; canEdit: boolean; canDelete: boolean }>;
let deleteHandler: ((url: string, init: RequestInit) => Promise<Response>) | undefined;
let delayedResponses: ((projectId: string) => Promise<Response> | undefined) | undefined;
let container: HTMLDivElement;
let root: Root;

function button(prefix: string) {
    const match = [...container.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.trim().startsWith(prefix));
    expect(match, prefix).toBeDefined();
    return match!;
}
async function click(prefix: string) { await act(async () => { button(prefix).click(); }); }
async function mount(projectId = 'project_a') {
    await act(async () => root.render(createElement(KanoManager, { projectId })));
}
async function select(email = sharedEmail) {
    const input = container.querySelector<HTMLInputElement>(`input[aria-label="${email} 선택"]`);
    expect(input, email).not.toBeNull();
    await act(async () => { input!.click(); });
}
const deletes = () => fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE');
const detailCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/kano/analysis'));

beforeEach(() => {
    vi.clearAllMocks();
    rows = { project_a: [respondent(sharedEmail), respondent(secondEmail)], project_b: [respondent(sharedEmail), respondent(bEmail)] };
    access = { project_a: { canRead: false, canEdit: false, canDelete: true }, project_b: { canRead: false, canEdit: false, canDelete: true } };
    deleteHandler = undefined;
    delayedResponses = undefined;
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fetchMock.mockImplementation(async (input, init = {}) => {
        const url = new URL(String(input), 'https://app.example.test');
        const projectId = url.pathname.split('/')[3];
        if (init.method === 'DELETE') {
            if (deleteHandler) return deleteHandler(url.pathname, init);
            const emails = init.body ? JSON.parse(String(init.body)).respondentEmails : rows[projectId].map(row => row.email);
            rows[projectId] = rows[projectId].filter(row => !emails.includes(row.email));
            return json({ success: true, message: '응답을 삭제했습니다.' });
        }
        if (url.pathname.endsWith('/overview')) return json({ project: { name: projectId } });
        if (url.pathname.endsWith('/requirements')) return json({ requirements: [requirement] });
        if (url.pathname.endsWith('/kano/invitations')) return json({ invitations: [sharedEmail, secondEmail].map((email, index) => ({
            id: `inv_${index}`, email, expiresAt: '2027-01-01', respondedAt: rows[projectId].some(row => row.email === email) ? '2026-10-01' : null,
        })) });
        if (url.pathname.endsWith('/kano/responses')) {
            const delayed = delayedResponses?.(projectId);
            return delayed ?? json({ respondents: rows[projectId], canDelete: access[projectId].canDelete });
        }
        if (url.pathname.endsWith('/kano/analysis')) {
            const summary = { ...access[projectId], totalResponses: rows[projectId].length, uniqueRespondents: rows[projectId].length };
            if (url.searchParams.get('view') === 'summary') return json(summary);
            return json({ ...summary, requirements: [{ requirementId: 'req_1', responseCount: rows[projectId].length,
                better: 0.5, worse: -0.5, quadrant: 'O', aggregated: { M: 0, O: 2, A: 0, I: 0, R: 0, Q: 0, total: 2, dominantCategory: 'O' },
            }] });
        }
        return json({});
    });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
});
afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

it.each([['멘티', false], ['배정 멘토', true]] as const)('%s는 응답자 화면에서 선택·전체 삭제를 사용할 수 있다', async (_label, mentor) => {
    access.project_a.canRead = mentor;
    access.project_a.canEdit = mentor;
    await mount();
    await click('응답자별 보기');

    expect(container.textContent).toContain(sharedEmail);
    expect(button('선택 삭제').disabled).toBe(true);
    expect(button('전체 삭제').disabled).toBe(false);
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(3);
    expect(container.textContent).not.toContain('TIMKO 분석 차트');
    expect(container.textContent).not.toContain('가중치 저장');
    if (!mentor) expect(detailCalls()).toHaveLength(0);
});

it('선택 삭제와 전체 삭제를 취소하면 요청·목록·선택이 바뀌지 않는다', async () => {
    await mount();
    await click('응답자별 보기');
    await select();
    vi.mocked(window.confirm).mockReturnValue(false);
    await click('선택 삭제');
    await click('전체 삭제');

    expect(deletes()).toHaveLength(0);
    expect(container.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(container.querySelector<HTMLInputElement>(`input[aria-label="${sharedEmail} 선택"]`)!.checked).toBe(true);
    expect(window.confirm).toHaveBeenNthCalledWith(1, expect.stringMatching(/1명[\s\S]*복구할 수 없습니다[\s\S]*응답 완료 상태/));
    expect(window.confirm).toHaveBeenNthCalledWith(2, expect.stringMatching(/2명[\s\S]*복구할 수 없습니다[\s\S]*응답 완료 상태/));
});

it('선택 확인 후 이메일 payload로 삭제하고 목록·집계·초대를 다시 읽는다', async () => {
    await mount();
    await click('응답자별 보기');
    await select();
    await click('선택 삭제');

    expect(deletes()).toEqual([['/api/projects/project_a/kano/responses', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ respondentEmails: [sharedEmail] }),
    }]]);
    expect(container.textContent).not.toContain(sharedEmail);
    expect(container.textContent).toContain(secondEmail);
    expect(button('선택 삭제').disabled).toBe(true);
    for (const suffix of ['/kano/responses', '/kano/analysis?view=summary', '/kano/invitations']) {
        expect(fetchMock.mock.calls.filter(([url, init]) => String(url).endsWith(suffix) && init?.method !== 'DELETE')).toHaveLength(2);
    }
    expect(detailCalls()).toHaveLength(0);
});

it('전체 확인 후 본문 없는 DELETE를 보내고 빈 목록을 다시 표시한다', async () => {
    await mount();
    await click('응답자별 보기');
    await click('전체 삭제');

    expect(deletes()).toEqual([['/api/projects/project_a/kano/responses', { method: 'DELETE' }]]);
    expect(container.textContent).toContain('아직 제출된 개별 응답 내역이 없습니다.');
    expect(container.textContent).not.toContain(sharedEmail);
});

it('전체 선택은 모든 행을 선택하고 처리 중 버튼·선택과 중복 클릭을 잠근다', async () => {
    await mount();
    await click('응답자별 보기');
    await act(async () => { container.querySelector<HTMLInputElement>('input[aria-label="전체 응답자 선택"]')!.click(); });
    let finish!: (response: Response) => void;
    deleteHandler = () => new Promise<Response>(resolve => { finish = resolve; });
    await act(async () => { const target = button('선택 삭제'); target.click(); target.click(); });

    expect(deletes()).toHaveLength(1);
    expect([...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].every(input => input.disabled)).toBe(true);
    expect(button('선택 삭제').disabled).toBe(true);
    expect(button('전체 삭제').disabled).toBe(true);
    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(deletes()[0][1].body))).toEqual({ respondentEmails: [sharedEmail, secondEmail] });
    await act(async () => { finish(json({ success: true })); });
});

it('삭제 실패는 목록과 선택을 보존하고 오류 표시 후 같은 대상으로 재시도한다', async () => {
    await mount();
    await click('응답자별 보기');
    await select();
    deleteHandler = async () => json({ error: '삭제 실패입니다.' }, 500);
    await click('선택 삭제');

    expect(container.querySelector('[role="alert"]')?.textContent).toContain('삭제 실패입니다.');
    expect(container.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(container.querySelector<HTMLInputElement>(`input[aria-label="${sharedEmail} 선택"]`)!.checked).toBe(true);
    expect(button('선택 삭제').disabled).toBe(false);
    deleteHandler = undefined;
    await click('선택 삭제');
    expect(deletes()).toHaveLength(2);
    expect(deletes()[1][1].body).toBe(deletes()[0][1].body);
    expect(container.textContent).not.toContain(sharedEmail);
});

it.each(['응답자 탭', '분석 탭'])('%s의 선택 삭제 대기 중 탭 이동을 막고 실패 후 선택과 오류를 유지한다', async view => {
    access.project_a.canRead = true;
    access.project_a.canEdit = true;
    await mount();
    if (view === '분석 탭') {
        await click('분석 결과');
        const toggles = [...container.querySelectorAll('button')].filter(item => item.textContent?.trim() === '응답자별 보기');
        await act(async () => { toggles[toggles.length - 1].click(); });
    } else await click('응답자별 보기');
    await select();
    let finish!: (response: Response) => void;
    deleteHandler = () => new Promise<Response>(resolve => { finish = resolve; });
    await click('선택 삭제');

    expect(button('설문 관리').disabled).toBe(true);
    expect(button('분석 결과').disabled).toBe(true);
    expect([...container.querySelectorAll<HTMLButtonElement>('button')].filter(item => item.textContent?.trim() === '응답자별 보기').every(item => item.disabled)).toBe(true);
    await click('설문 관리');
    await click('분석 결과');
    if (view === '분석 탭') {
        expect(button('TIMKO').disabled).toBe(true);
        await click('TIMKO');
    }
    expect(deletes()).toHaveLength(1);
    expect(window.confirm).toHaveBeenCalledTimes(1);
    await act(async () => { finish(json({ error: '대기 중 삭제가 실패했습니다.' }, 500)); });

    expect(container.querySelector('[role="alert"]')?.textContent).toContain('대기 중 삭제가 실패했습니다.');
    expect(container.querySelector<HTMLInputElement>(`input[aria-label="${sharedEmail} 선택"]`)!.checked).toBe(true);
    expect(button('선택 삭제').disabled).toBe(false);
    expect(button('설문 관리').disabled).toBe(false);
});

it.each(['응답 데이터 리셋', '초대 내역 리셋'])('%s와 다른 legacy 리셋을 같은 tick에 눌러도 하나의 삭제 요청만 보낸다', async firstAction => {
    await mount();
    let finish!: (response: Response) => void;
    deleteHandler = () => new Promise<Response>(resolve => { finish = resolve; });
    await act(async () => {
        const responseReset = button('응답 데이터 리셋');
        const invitationReset = button('초대 내역 리셋');
        button(firstAction).click();
        responseReset.click();
        invitationReset.click();
    });

    expect(deletes()).toHaveLength(1);
    expect(deletes()[0][0]).toBe(`/api/projects/project_a/kano/responses${firstAction === '초대 내역 리셋' ? '?includeInvitations=true' : ''}`);
    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(button('응답 데이터 리셋').disabled).toBe(true);
    expect(button('초대 내역 리셋').disabled).toBe(true);
    expect(button('응답 결과 보기').disabled).toBe(true);
    await click('응답 결과 보기');
    expect(container.querySelector('tbody')).toBeNull();
    await act(async () => { finish(json({ error: '리셋 실패입니다.' }, 500)); });
    await click('응답자별 보기');
    expect(container.querySelectorAll('tbody tr')).toHaveLength(2);
});

it('초대 전체 리셋 성공 뒤 초대 재조회가 실패해도 삭제한 초대 목록을 비운다', async () => {
    await mount();
    expect(container.textContent).toContain(sharedEmail);
    const implementation = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((input, init) => {
        if (String(input).endsWith('/kano/invitations') && deletes().length > 0) {
            return Promise.resolve(json({ error: '초대 재조회에 실패했습니다.' }, 500));
        }
        return implementation(input, init);
    });
    await click('초대 내역 리셋');

    expect(deletes()).toEqual([['/api/projects/project_a/kano/responses?includeInvitations=true', { method: 'DELETE' }]]);
    expect(container.textContent).not.toContain(sharedEmail);
    expect(container.textContent).not.toContain(secondEmail);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/kano/invitations'))).toHaveLength(2);
});

it('삭제 성공 후 목록 재조회에 실패하면 오래된 응답 목록으로 추가 삭제할 수 없다', async () => {
    await mount();
    await click('응답자별 보기');
    await select();
    const implementation = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((input, init) => {
        if (String(input).endsWith('/kano/responses') && init?.method !== 'DELETE' && deletes().length > 0) {
            return Promise.resolve(json({ error: '재조회에 실패했습니다.' }, 500));
        }
        return implementation(input, init);
    });
    await click('선택 삭제');

    expect(container.querySelector('tbody')).toBeNull();
    expect([...container.querySelectorAll('button')].some(item => item.textContent?.trim() === '응답자별 보기')).toBe(false);
    expect(button('응답 데이터 리셋').disabled).toBe(true);
    await click('응답 데이터 리셋');
    expect(deletes()).toHaveLength(1);
});

it('실제 서버가 조회 전용으로 응답하면 삭제 조작을 표시하지 않는다', async () => {
    access.project_a.canDelete = false;
    await mount();
    await click('응답자별 보기');
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
    expect([...container.querySelectorAll('button')].some(item => item.textContent?.includes('삭제'))).toBe(false);
    expect(deletes()).toHaveLength(0);
});

it('다른 프로젝트로 옮기면 같은 이메일이 있어도 이전 선택을 버린다', async () => {
    await mount();
    await click('응답자별 보기');
    await select();
    await mount('project_b');
    await click('응답자별 보기');

    expect(container.textContent).toContain(bEmail);
    expect(button('선택 삭제').disabled).toBe(true);
    expect(container.querySelector<HTMLInputElement>(`input[aria-label="${sharedEmail} 선택"]`)!.checked).toBe(false);
    await select();
    await click('선택 삭제');
    expect(deletes()[0][0]).toBe('/api/projects/project_b/kano/responses');
    expect(rows.project_a).toHaveLength(2);
});

it('A 조회가 늦게 끝나도 B의 목록과 삭제 권한을 덮어쓰지 않는다', async () => {
    let finishA!: (response: Response) => void;
    delayedResponses = projectId => projectId === 'project_a'
        ? new Promise<Response>(resolve => { finishA = resolve; }) : undefined;
    await mount();
    access.project_b.canDelete = false;
    await mount('project_b');
    await click('응답자별 보기');
    await act(async () => { finishA(json({ respondents: rows.project_a, canDelete: true })); });

    expect(container.textContent).toContain(bEmail);
    expect(container.textContent).not.toContain(secondEmail);
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
    expect(deletes()).toHaveLength(0);
});

it.each([200, 500])('A 삭제 대기 중 B로 바꾸면 A의 완료 상태 %s가 B를 지우거나 A를 재조회하지 않는다', async status => {
    await mount();
    await click('응답자별 보기');
    await select();
    let finishA!: (response: Response) => void;
    deleteHandler = () => new Promise<Response>(resolve => { finishA = resolve; });
    await click('선택 삭제');
    await mount('project_b');
    await click('응답자별 보기');
    const aReads = () => fetchMock.mock.calls.filter(([url, init]) => String(url).includes('/project_a/') && init?.method !== 'DELETE').length;
    const before = aReads();
    await act(async () => { finishA(json(status === 200 ? { success: true } : { error: 'A 삭제 실패입니다.' }, status)); });

    expect(container.textContent).toContain(bEmail);
    expect(container.textContent).not.toContain('A 삭제 실패입니다.');
    expect(aReads()).toBe(before);
    expect(button('선택 삭제').disabled).toBe(true);
    expect(deletes()).toHaveLength(1);
});

it.each([['소유 멘티', false], ['배정 멘토', true]] as const)('%s는 A 삭제 대기 중 B 화면을 이동하되 B의 삭제는 잠긴다', async (_label, mentor) => {
    access.project_a.canRead = mentor;
    access.project_a.canEdit = mentor;
    access.project_b.canRead = mentor;
    access.project_b.canEdit = mentor;
    await mount();
    await click('응답자별 보기');
    await select();
    let finishA!: (response: Response) => void;
    deleteHandler = () => new Promise<Response>(resolve => { finishA = resolve; });
    await click('선택 삭제');
    await mount('project_b');

    expect(button('설문 관리').disabled).toBe(false);
    await click('설문 관리');
    expect(button('응답 데이터 리셋').disabled).toBe(true);
    expect(button('초대 내역 리셋').disabled).toBe(true);
    expect(button('응답 결과 보기').disabled).toBe(false);
    await click('응답 결과 보기');
    expect(container.textContent).toContain(bEmail);
    expect([...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].every(input => input.disabled)).toBe(true);
    expect(button('전체 삭제').disabled).toBe(true);
    if (mentor) {
        expect(button('분석 결과').disabled).toBe(false);
        await click('분석 결과');
        expect(button('TIMKO').disabled).toBe(false);
        await click('TIMKO');
        expect(container.textContent).toContain('TIMKO 분석 차트');
        const toggles = [...container.querySelectorAll<HTMLButtonElement>('button')].filter(item => item.textContent?.trim() === '응답자별 보기');
        expect(toggles[toggles.length - 1].disabled).toBe(false);
        await act(async () => { toggles[toggles.length - 1].click(); });
        expect(button('전체 삭제').disabled).toBe(true);
        expect([...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].every(input => input.disabled)).toBe(true);
        await click('응답자별 보기');
    } else expect(detailCalls()).toHaveLength(0);
    const aReads = () => fetchMock.mock.calls.filter(([url, init]) => String(url).includes('/project_a/') && init?.method !== 'DELETE').length;
    const before = aReads();
    await act(async () => { finishA(json({ success: true })); });

    expect(aReads()).toBe(before);
    expect(container.textContent).toContain(bEmail);
    expect(container.textContent).toContain(sharedEmail);
    expect(button('전체 삭제').disabled).toBe(false);
    expect(deletes()).toHaveLength(1);
    deleteHandler = undefined;
    await select();
    await click('선택 삭제');
    expect(deletes()[1][0]).toBe('/api/projects/project_b/kano/responses');
    expect(rows.project_b.map(row => row.email)).toEqual([bEmail]);
});

it('빈 응답 표에는 선택·삭제 버튼이 없다', async () => {
    await act(async () => root.render(createElement(KanoRespondentTable, {
        respondents: [], requirements: [requirement], canDelete: true, isDeleting: false, onDelete: vi.fn(),
    })));
    expect(container.textContent).toContain('아직 제출된 개별 응답 내역이 없습니다.');
    expect(container.querySelector('input, button')).toBeNull();
});
