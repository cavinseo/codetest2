// 실제 Kano 관리 화면에서 초대 삭제의 확인·응답 보호·중복 잠금·프로젝트 전환을 검증한다.
// @vitest-environment jsdom
import { act, createElement, type AnchorHTMLAttributes } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import KanoManager from '../components/project/KanoManager';

vi.mock('next/link', () => ({ default: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => createElement('a', props) }));
const fetchMock = vi.fn();
const requirement = { id: 'req_1', requirement: '저장 검증', category: '기능', order: 0 };
const pending = { id: 'inv_pending', email: 'pending@example.test', token: 'token-pending', expiresAt: '2027-01-01', respondedAt: null, canDelete: true as boolean | undefined };
const completed = { ...pending, id: 'inv_completed', email: 'completed@example.test', respondedAt: '2026-10-01', canDelete: false };
const imported = { ...pending, id: 'inv_imported', email: 'imported@example.test', canDelete: false };
const bInvitation = { ...pending, id: 'inv_b', email: 'b@example.test' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
let invitations: Record<string, Array<typeof pending | typeof completed>>;
let responses: Record<string, { email: string; respondedAt: string; answers: { requirementId: string; positiveAnswer: number; negativeAnswer: number; kanoCategory: string }[] }[]>;
let mentor: boolean;
let writable: boolean;
let delayedInvitations: ((projectId: string) => Promise<Response> | undefined) | undefined;
let deletion: ((path: string, init: RequestInit) => Promise<Response>) | undefined;
let container: HTMLDivElement;
let root: Root;
function button(prefix: string) {
    const target = [...container.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.trim().startsWith(prefix));
    expect(target, prefix).toBeDefined();
    return target!;
}
function invitationButton(email = pending.email) {
    const target = container.querySelector<HTMLButtonElement>(`button[aria-label="${email} 초대 삭제"]`);
    expect(target, email).not.toBeNull();
    return target!;
}
async function mount(projectId = 'project_a') { await act(async () => root.render(createElement(KanoManager, { projectId }))); }
async function click(prefix: string) { await act(async () => button(prefix).click()); }
async function remove(email = pending.email) { await act(async () => invitationButton(email).click()); }
const deletes = () => fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE');
beforeEach(() => {
    vi.clearAllMocks();
    mentor = false;
    writable = true;
    delayedInvitations = undefined;
    deletion = undefined;
    invitations = { project_a: [pending, completed, imported], project_b: [bInvitation] };
    responses = { project_a: [{ email: completed.email, respondedAt: '2026-10-01', answers: [{ requirementId: 'req_1', positiveAnswer: 1, negativeAnswer: 5, kanoCategory: 'O' }] }], project_b: [] };
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fetchMock.mockImplementation(async (input, init = {}) => {
        const url = new URL(String(input), 'https://app.example.test');
        const projectId = url.pathname.split('/')[3];
        if (init.method === 'DELETE') {
            if (deletion) return deletion(url.pathname, init);
            if (url.pathname.endsWith('/kano/invitations')) {
                const { invitationId } = JSON.parse(String(init.body));
                invitations[projectId] = invitations[projectId].filter(inv => inv.id !== invitationId);
                return json({ success: true, message: '초대 기록을 삭제했습니다.' });
            }
            if (url.pathname.endsWith('/kano/responses')) {
                responses[projectId] = [];
                return json({ success: true });
            }
            throw new Error(`예상하지 못한 DELETE ${url.pathname}`);
        }
        if (url.pathname.endsWith('/requirements')) return json({ requirements: [requirement] });
        if (url.pathname.endsWith('/kano/invitations')) return delayedInvitations?.(projectId) ?? json({ invitations: invitations[projectId].map(inv => writable ? inv : { ...inv, token: undefined, canDelete: false }) });
        if (url.pathname.endsWith('/kano/responses')) return json({ respondents: responses[projectId], canDelete: writable });
        if (url.pathname.endsWith('/kano/analysis')) return json({ canRead: mentor, canEdit: mentor, totalResponses: responses[projectId].length, uniqueRespondents: responses[projectId].length, requirements: [] });
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

it.each([['소유 멘티', false], ['배정 멘토', true]] as const)('%s는 미응답 초대만 삭제할 수 있고 접수 응답은 보호한다', async (_label, assignedMentor) => {
    mentor = assignedMentor;
    await mount();
    expect(invitationButton().disabled).toBe(false);
    expect(invitationButton(completed.email).disabled).toBe(true);
    expect(invitationButton(imported.email).disabled).toBe(true);
    expect(container.textContent).toContain('접수된 응답이 있어 삭제할 수 없습니다.');
    await remove(completed.email);
    await remove(imported.email);
    expect(window.confirm).not.toHaveBeenCalled();
    expect(deletes()).toHaveLength(0);
});
it('조회 전용 역할에는 초대 삭제 조작을 표시하지 않는다', async () => {
    writable = false;
    await mount();
    expect(container.querySelector('button[aria-label$=" 초대 삭제"]')).toBeNull();
    expect(deletes()).toHaveLength(0);
});
it('삭제 가능 여부를 받지 못한 초대는 확인창이나 삭제 요청을 시작하지 않는다', async () => {
    invitations.project_a[0] = { ...pending, canDelete: undefined };
    await mount();
    expect(invitationButton().disabled).toBe(true);
    await remove();
    expect(window.confirm).not.toHaveBeenCalled();
    expect(deletes()).toHaveLength(0);
});
it('확인 취소는 요청과 초대·응답을 보존한다', async () => {
    await mount();
    vi.mocked(window.confirm).mockReturnValue(false);
    await remove();
    expect(deletes()).toHaveLength(0);
    expect(container.textContent).toContain(pending.email);
    expect(window.confirm).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(/pending@example\.test[\s\S]*초대 기록[\s\S]*설문 링크[\s\S]*무효/));
    expect(responses.project_a).toHaveLength(1);
});
it('확인하면 정확한 초대 ID만 요청하고 다른 초대·접수 응답을 보존한다', async () => {
    await mount();
    await remove();
    expect(deletes()).toEqual([['/api/projects/project_a/kano/invitations', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invitationId: pending.id }) }]]);
    expect(container.textContent).not.toContain(pending.email);
    expect(container.textContent).toContain(completed.email);
    expect(container.textContent).toContain(imported.email);
    expect(responses.project_a).toHaveLength(1);
    await click('응답자별 보기');
    expect(container.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(container.textContent).toContain(completed.email);
});
it('삭제 실패는 초대를 보존하고 오류 후 같은 ID로 재시도한다', async () => {
    await mount();
    deletion = async () => json({ error: '초대 삭제 실패입니다.' }, 500);
    await remove();
    expect(container.textContent).toContain(pending.email);
    expect(container.querySelector('[role="status"]')?.textContent).toContain('초대 삭제 실패입니다.');
    expect(invitationButton().disabled).toBe(false);
    deletion = undefined;
    await remove();
    expect(deletes()).toHaveLength(2);
    expect(deletes()[1][1].body).toBe(deletes()[0][1].body);
    expect(container.textContent).not.toContain(pending.email);
});
it('초대 삭제와 legacy 리셋을 같은 tick에 누르면 한 요청만 보내고 현재 탭을 잠근다', async () => {
    mentor = true;
    await mount();
    let finish!: (res: Response) => void;
    deletion = () => new Promise<Response>(resolve => { finish = resolve; });
    await act(async () => {
        const target = invitationButton();
        target.click();
        target.click();
        button('응답 데이터 리셋').click();
        button('초대 내역 리셋').click();
    });
    expect(deletes()).toHaveLength(1);
    expect(window.confirm).toHaveBeenCalledTimes(1);
    for (const prefix of ['설문 관리', '응답자별 보기', '분석 결과', '응답 결과 보기', '응답 데이터 리셋', '초대 내역 리셋']) expect(button(prefix).disabled).toBe(true);
    expect(invitationButton().disabled).toBe(true);
    await act(async () => finish(json({ error: '잠금 해제 검증' }, 500)));
    expect(invitationButton().disabled).toBe(false);
});
it.each(['응답 데이터 리셋', '초대 내역 리셋'])('legacy %s가 시작되면 같은 tick의 개별 초대 삭제를 차단한다', async first => {
    await mount();
    let finish!: (res: Response) => void;
    deletion = () => new Promise<Response>(resolve => { finish = resolve; });
    await act(async () => {
        button(first).click();
        invitationButton().click();
    });
    expect(deletes()).toHaveLength(1);
    expect(deletes()[0][0]).toContain('/kano/responses');
    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(invitationButton().disabled).toBe(true);
    await act(async () => finish(json({ error: '리셋 실패' }, 500)));
});
it('삭제 성공 뒤 초대 재조회가 실패해도 삭제한 행을 복원하거나 오래된 행으로 다시 삭제하지 않는다', async () => {
    const otherPending = { ...pending, id: 'inv_other_pending', email: 'other-pending@example.test' };
    invitations.project_a.push(otherPending);
    await mount();
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((input, init) => String(input).endsWith('/kano/invitations') && init?.method !== 'DELETE' && deletes().length > 0
        ? Promise.resolve(json({ error: '재조회 실패' }, 500)) : original(input, init));
    await remove();
    expect(container.querySelector(`button[aria-label="${pending.email} 초대 삭제"]`)).toBeNull();
    expect(container.textContent).toContain(completed.email);
    expect(container.textContent).toContain(otherPending.email);
    expect(invitationButton(otherPending.email).disabled).toBe(true);
    await remove(otherPending.email);
    expect(invitationButton(imported.email).disabled).toBe(true);
    expect(deletes()).toHaveLength(1);
});
it('B의 초대 GET이 실패해도 A 초대가 B 경로의 삭제 대상으로 노출되지 않는다', async () => {
    await mount();
    delayedInvitations = projectId => projectId === 'project_b' ? Promise.resolve(json({ error: 'B 조회 실패' }, 500)) : undefined;
    await mount('project_b');
    expect(container.textContent).not.toContain(pending.email);
    expect(container.textContent).not.toContain(completed.email);
    expect(container.querySelector('button[aria-label$=" 초대 삭제"]')).toBeNull();
    expect(deletes()).toHaveLength(0);
});
it('프로젝트 전환 시 A 초대 행을 B 삭제 대상으로 남기지 않는다', async () => {
    await mount();
    await mount('project_b');
    expect(container.textContent).not.toContain(pending.email);
    expect(invitationButton(bInvitation.email).disabled).toBe(false);
    await remove(bInvitation.email);
    expect(deletes()[0][0]).toBe('/api/projects/project_b/kano/invitations');
    expect(JSON.parse(String(deletes()[0][1].body))).toEqual({ invitationId: bInvitation.id });
    expect(invitations.project_a).toHaveLength(3);
});
it('늦은 A 초대 GET은 B 목록과 삭제 권한을 덮어쓰지 않는다', async () => {
    let finishA!: (res: Response) => void;
    delayedInvitations = projectId => projectId === 'project_a' ? new Promise<Response>(resolve => { finishA = resolve; }) : undefined;
    await mount();
    await mount('project_b');
    await act(async () => finishA(json({ invitations: invitations.project_a })));
    expect(container.textContent).toContain(bInvitation.email);
    expect(container.textContent).not.toContain(pending.email);
    expect(invitationButton(bInvitation.email).disabled).toBe(false);
});
it.each([200, 500])('A 초대 DELETE의 늦은 상태 %s는 B 화면·응답·오류를 바꾸거나 A를 재조회하지 않는다', async status => {
    await mount();
    let finishA!: (res: Response) => void;
    deletion = () => new Promise<Response>(resolve => { finishA = resolve; });
    await remove();
    await mount('project_b');
    expect(button('설문 관리').disabled).toBe(false);
    expect(invitationButton(bInvitation.email).disabled).toBe(true);
    const aReads = () => fetchMock.mock.calls.filter(([url, init]) => String(url).includes('/project_a/') && init?.method !== 'DELETE').length;
    const before = aReads();
    await act(async () => finishA(json(status === 200 ? { success: true } : { error: 'A 삭제 오류' }, status)));
    expect(container.textContent).toContain(bInvitation.email);
    expect(container.textContent).not.toContain(pending.email);
    expect(container.textContent).not.toContain('A 삭제 오류');
    expect(invitationButton(bInvitation.email).disabled).toBe(false);
    expect(aReads()).toBe(before);
    expect(deletes()).toHaveLength(1);
    expect(responses.project_a).toHaveLength(1);
});
