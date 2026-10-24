// 승인 관리 카드가 비었을 때와 생성 창의 즉시 신청을 검증한다 — 빈 카드와 거절 문구만으로는
// 신청이 어디서 들어오는지 알 수 없다는 사용자 제보(2026-10-20)의 회귀 방지다.
// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import ProjectRequestsPanel, { ProjectApprovalRequestBox } from '../components/ProjectRequestsPanel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    root = null;
    container = null;
    vi.unstubAllGlobals();
});

const respond = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));
async function mount(element: ReturnType<typeof createElement>) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => { root!.render(element); });
    return container;
}
const row = (status: string) => ({ id: `r-${status}`, reason: '사유', status, usedAt: null, reviewNote: null, mentee: { name: '멘티' }, program: { name: '프로그램' } });

it('승인 대기 신청이 없으면 신청 경로를 안내한다', async () => {
    vi.stubGlobal('fetch', vi.fn(() => respond({ requests: [row('APPROVED')], ownedProjectCount: null })));
    const view = await mount(createElement(ProjectRequestsPanel, { reviewer: true }));
    expect(view.textContent).toContain('승인 대기 중인 신청이 없습니다');
    expect(view.textContent).not.toContain('대기 1건');
});

it('승인 대기 신청이 있으면 건수와 승인 버튼을 보이고 안내는 숨긴다', async () => {
    vi.stubGlobal('fetch', vi.fn(() => respond({ requests: [row('PENDING'), row('REJECTED')], ownedProjectCount: null })));
    const view = await mount(createElement(ProjectRequestsPanel, { reviewer: true }));
    expect(view.textContent).toContain('대기 1건');
    expect(view.textContent).not.toContain('승인 대기 중인 신청이 없습니다');
    expect([...view.querySelectorAll('button')].map(b => b.textContent)).toContain('승인');
});

it('조회가 실패하면 빈 목록 안내 대신 오류를 보인다', async () => {
    vi.stubGlobal('fetch', vi.fn(() => respond({ error: '조회 권한이 없습니다.' }, 403)));
    const view = await mount(createElement(ProjectRequestsPanel, { reviewer: true }));
    expect(view.querySelector('[role="alert"]')?.textContent).toBe('조회 권한이 없습니다.');
    expect(view.textContent).not.toContain('승인 대기 중인 신청이 없습니다');
});

it('생성 창의 신청 칸은 입력한 사유로 신청을 접수하고 완료를 알린다', async () => {
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) => respond({ request: { id: 'r1' } }, 201));
    vi.stubGlobal('fetch', fetchMock);
    const onRequested = vi.fn();
    const view = await mount(createElement(ProjectApprovalRequestBox, { defaultReason: '「A」 추가 개설', onRequested }));
    await act(async () => { view.querySelector('button')!.click(); });
    expect(fetchMock).toHaveBeenCalledWith('/api/project-requests', expect.objectContaining({ method: 'POST' }));
    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toEqual({ reason: '「A」 추가 개설' });
    expect(onRequested).toHaveBeenCalledOnce();
});

it('신청이 거절되면 서버 문구를 보이고 완료로 처리하지 않는다', async () => {
    vi.stubGlobal('fetch', vi.fn(() => respond({ error: '이미 승인 대기 중인 신청이 있습니다.' }, 409)));
    const onRequested = vi.fn();
    const view = await mount(createElement(ProjectApprovalRequestBox, { defaultReason: '사유', onRequested }));
    await act(async () => { view.querySelector('button')!.click(); });
    expect(view.querySelector('[role="alert"]')?.textContent).toBe('이미 승인 대기 중인 신청이 있습니다.');
    expect(onRequested).not.toHaveBeenCalled();
});

it('사유가 비어 있으면 신청 버튼을 막는다', async () => {
    const view = await mount(createElement(ProjectApprovalRequestBox, { defaultReason: '', onRequested: vi.fn() }));
    expect(view.querySelector('button')!.disabled).toBe(true);
});
