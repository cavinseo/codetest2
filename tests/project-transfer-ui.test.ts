// 프로젝트 이관의 영향 확인·충돌 재확인·조회 경합과 관리자 목록 갱신을 검증한다.
// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ProjectTransfer from '../components/admin/ProjectTransfer';
import AdminModePage from '../app/admin/page';
import type { User } from '../components/admin/MembersTab';

vi.mock('next/link', () => ({ default: ({ children, ...props }: { children: ReactNode; href: string }) => createElement('a', props, children) }));
vi.mock('@/components/ThemeToggle', () => ({ default: () => null }));
vi.mock('@/components/admin/MentorAssign', () => ({ default: () => createElement('p', null, '멘토 배정 패널') }));

let container: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn();
const onTransferred = vi.fn();
const candidate = { id: 'target', name: null, email: 'target@example.test', program: { id: 'new-program', name: '대상 프로그램' } };
const preview = {
    project: { id: 'project', name: '이관할 프로젝트', owner: { id: 'source', name: '원본 멘티', email: 'source@example.test' }, program: { id: 'old-program', name: '원본 프로그램' } },
    target: candidate,
    sourceMentor: { id: 'source-mentor', name: '원본 멘토', email: 'mentor@example.test' },
    currentTargetMentor: { id: 'target-mentor', name: '기존 멘토', email: 'previous@example.test' },
    nextMentor: { id: 'source-mentor', name: '원본 멘토', email: 'mentor@example.test' },
    targetProjectCount: 3, programChanged: true, mentorChanged: true, previewToken: 'confirmed-state',
};
const response = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
function button(text: string) {
    const found = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(element => element.textContent === text);
    if (!found) throw new Error(`Missing button ${text}`);
    return found;
}
async function click(text: string) { await act(async () => button(text).click()); }
async function select(value: string) {
    await act(async () => {
        const element = container.querySelector<HTMLSelectElement>('dialog select')!;
        element.value = value;
        element.dispatchEvent(new Event('change', { bubbles: true }));
    });
}
async function open() {
    await act(async () => root.render(createElement(ProjectTransfer, { projectId: 'project', onTransferred })));
    await click('멘티 변경');
}
async function showPreview() {
    await open(); await select('target'); await click('이관 영향 확인');
}
async function confirm() { await act(async () => container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click()); }

beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation(async (url: string, options?: RequestInit) => {
        if (options?.method === 'POST') return response({ success: true });
        return response(url.includes('?') ? { preview } : { candidates: [candidate, { ...candidate, id: 'second', email: 'second@example.test' }] });
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function (this: HTMLDialogElement) { this.open = true; } });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function (this: HTMLDialogElement) { this.open = false; } });
    container = document.createElement('div'); document.body.appendChild(container);
    root = createRoot(container);
});
afterEach(async () => {
    await act(async () => root.unmount());
    container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); fetchMock.mockReset(); onTransferred.mockReset();
});

it('소유자·프로그램·멘토 전후와 다른 프로젝트 영향 및 보존 범위를 표시한다', async () => {
    await showPreview();
    expect(container.querySelector('dialog')!.getAttribute('aria-labelledby')).toBe('project-transfer-title-project');
    for (const text of ['이관할 프로젝트', 'source@example.test', 'target@example.test', '원본 프로그램', '대상 프로그램', '기존 멘토', '원본 멘토', '다른 프로젝트 3개', '원본 멘티의 다른 프로젝트', '워크시트', '보고서', '개설 승인']) {
        expect(container.textContent).toContain(text);
    }
    expect(button('최종 이관 실행').disabled).toBe(true);
});

it('명시적 확인 후 한 번만 전송하고 완료 콜백으로 목록 갱신을 요청한다', async () => {
    await showPreview(); await confirm();
    let finish!: (value: unknown) => void;
    fetchMock.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const submit = button('최종 이관 실행');
    await act(async () => { submit.click(); submit.click(); });
    const posts = fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(posts[0][0]).toBe('/api/admin/projects/project/transfer');
    expect(JSON.parse(posts[0][1].body)).toEqual({ targetMenteeId: 'target', previewToken: 'confirmed-state', confirmed: true });
    await act(async () => container.querySelector('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true })));
    expect(container.querySelector('dialog')).not.toBeNull();
    await act(async () => finish(response({ success: true })));
    expect(onTransferred).toHaveBeenCalledOnce();
    expect(container.querySelector('dialog')).toBeNull();
    expect(document.activeElement).toBe(button('멘티 변경'));
});

it('409 응답은 기존 미리보기와 확인을 폐기하고 새 영향을 다시 확인하게 한다', async () => {
    await showPreview(); await confirm();
    fetchMock.mockResolvedValueOnce(response({ error: '멘토 배정이 변경되었습니다.' }, 409));
    await click('최종 이관 실행');
    expect(container.textContent).toContain('멘토 배정이 변경되었습니다.');
    expect(container.textContent).toContain('다시 확인');
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
    expect(onTransferred).not.toHaveBeenCalled();
    await click('이관 영향 확인');
    expect(container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(false);
    expect(button('최종 이관 실행').disabled).toBe(true);
});

it('후보 조회 실패를 표시하고 재시도 후 빈 목록을 안내한다', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network unavailable'));
    await open();
    expect(container.querySelector('[role="alert"]')!.textContent).toContain('불러오지 못했습니다');
    fetchMock.mockResolvedValueOnce(response({ candidates: [] }));
    await click('후보 다시 불러오기');
    expect(container.textContent).toContain('이관 가능한 멘티가 없습니다.');
    expect(button('이관 영향 확인').disabled).toBe(true);
});

it('미리보기 서버 오류와 이관 연결 실패를 표시하고 확인 상태를 초기화한다', async () => {
    await open(); await select('target');
    fetchMock.mockResolvedValueOnce(response({ error: '원본 멘토 배정을 정리하세요.' }, 400));
    await click('이관 영향 확인');
    expect(container.textContent).toContain('원본 멘토 배정을 정리하세요.');
    await click('이관 영향 확인'); await confirm();
    fetchMock.mockRejectedValueOnce(new Error('connection lost'));
    await click('최종 이관 실행');
    expect(container.textContent).toContain('이관 결과를 확인하지 못했습니다');
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
    expect(onTransferred).not.toHaveBeenCalled();
});

it('다른 멘티 선택 후 도착한 이전 미리보기는 적용하지 않는다', async () => {
    await open(); await select('target');
    let finish!: (value: unknown) => void;
    fetchMock.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await click('이관 영향 확인');
    await select('second');
    await act(async () => finish(response({ preview })));
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
    expect(container.querySelector<HTMLSelectElement>('select')!.value).toBe('second');
    expect(button('이관 영향 확인').disabled).toBe(false);
});

it('취소 시 포커스를 복원하고 닫힌 화면의 늦은 응답은 다음 조회에 섞지 않는다', async () => {
    let finish!: (value: unknown) => void;
    fetchMock.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await open();
    await act(async () => container.querySelector('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true })));
    expect(document.activeElement).toBe(button('멘티 변경'));
    fetchMock.mockResolvedValueOnce(response({ candidates: [] }));
    await click('멘티 변경');
    await act(async () => finish(response({ candidates: [candidate] })));
    expect(container.textContent).toContain('이관 가능한 멘티가 없습니다.');
});

it('원본 멘토가 없으면 대상 멘토 유지와 영향 없는 다른 프로젝트 수를 안내한다', async () => {
    await open(); await select('target');
    fetchMock.mockResolvedValueOnce(response({ preview: { ...preview, sourceMentor: null, nextMentor: preview.currentTargetMentor, mentorChanged: false, programChanged: false } }));
    await click('이관 영향 확인');
    expect(container.textContent).toContain('다른 프로젝트 3개의 담당 멘토는 그대로 유지됩니다.');
    expect(container.textContent).toContain('원본 멘티에게 배정된 멘토가 없어 대상의 기존 멘토를 유지합니다.');
});

it('실행은 성공했지만 후속 목록 갱신이 실패하면 재실행을 막고 성공 사실을 안내한다', async () => {
    onTransferred.mockRejectedValueOnce(new Error('refresh failed'));
    await showPreview(); await confirm(); await click('최종 이관 실행');
    expect(container.textContent).toContain('이관은 완료됐으나 목록을 갱신하지 못했습니다.');
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
    expect(button('이관 영향 확인').disabled).toBe(true);
    expect(container.querySelector<HTMLSelectElement>('select')!.disabled).toBe(true);
    expect(button('닫기').disabled).toBe(false);
});

async function renderAdmin(role = 'ADMIN', members: User[] = []) {
    let transferred = false;
    fetchMock.mockImplementation(async (url: string, options?: RequestInit) => {
        if (url === '/api/admin/stats') return response({ totalProjects: 1, totalUsers: 2, totalRequirements: 4, totalResponses: 5, kanoDistribution: {}, recentProjects: [] });
        if (url === '/api/admin/users') return response({ users: members });
        if (url === '/api/programs') return response({ programs: [] });
        if (url === '/api/admin/projects') return response({
            projects: [{ id: 'project', name: '이관할 프로젝트', ownerId: transferred ? 'target' : 'source', programId: transferred ? 'new-program' : 'old-program', createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z', ownerEmail: transferred ? candidate.email : 'source@example.test', ownerName: transferred ? null : '원본 멘티', reqCount: 4, responseCount: 5, memberCount: 2 }],
            programs: [{ id: 'old-program', name: '원본 프로그램', organization: '기관' }, { id: 'new-program', name: '대상 프로그램', organization: '기관' }],
        });
        if (url === '/api/me/profile') return response({ role });
        if (options?.method === 'POST') { transferred = true; return response({ success: true }); }
        return response(url.includes('?') ? { preview } : { candidates: [candidate] });
    });
    await act(async () => root.render(createElement(AdminModePage)));
    await click('프로젝트 관리 (1)');
}

it('관리자 카드에서 이관을 완료하면 프로젝트·통계를 다시 읽고 멘토 패널을 닫는다', async () => {
    await renderAdmin();
    await click('멘토 배정');
    expect(container.textContent).toContain('멘토 배정 패널');
    await click('멘티 변경'); await select('target'); await click('이관 영향 확인'); await confirm(); await click('최종 이관 실행');
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/admin/projects')).toHaveLength(2);
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/admin/stats')).toHaveLength(2);
    expect(container.textContent).toContain('target@example.test');
    expect(container.textContent).not.toContain('source@example.test');
    expect(container.textContent).not.toContain('멘토 배정 패널');
    expect(container.textContent).toContain('프로젝트를 새 멘티에게 이관했습니다.');
});

it('프로그램 매니저에게는 프로젝트 이관 버튼을 노출하지 않는다', async () => {
    await renderAdmin('PROGRAM_MANAGER');
    expect(container.querySelector('#admin-transfer-project-project')).toBeNull();
    expect(button('멘토 배정')).not.toBeNull();
});

it('멘티 삭제는 마지막으로 확인한 미리보기 토큰을 전송하고 충돌 시 갱신한다', async () => {
    await renderAdmin('ADMIN', [{ id: 'source', name: '원본 멘티', email: 'source@example.test', role: 'MENTEE', isAdmin: false, status: 'APPROVED', accessExpiresAt: null, mustChangePassword: false, createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z' }]);
    await click('회원 관리 (1)');
    await act(async () => container.querySelector<HTMLButtonElement>('#admin-delete-user-source')!.click());
    const deletionPreview = { transferProjects: [], invitations: 0, migrations: 0, inviteCodes: 0, previewToken: 'first-state' };
    fetchMock.mockResolvedValueOnce(response({ needsCascadeConfirm: true, preview: deletionPreview }, 409));
    await act(async () => container.querySelector<HTMLButtonElement>('#admin-confirm-delete-btn')!.click());
    await act(async () => container.querySelector<HTMLInputElement>('input[name="deletion-reason"][value="self_request"]')!.click());
    fetchMock.mockResolvedValueOnce(response({ needsCascadeConfirm: true, error: '프로젝트 소유자가 변경되었습니다.', preview: { ...deletionPreview, previewToken: 'second-state' } }, 409));
    await act(async () => container.querySelector<HTMLButtonElement>('#admin-confirm-delete-btn')!.click());
    expect(container.querySelector('[role="alert"]')!.textContent).toContain('프로젝트 소유자가 변경되었습니다.');
    fetchMock.mockResolvedValueOnce(response({ success: true }));
    await act(async () => container.querySelector<HTMLButtonElement>('#admin-confirm-delete-btn')!.click());
    const deletes = fetchMock.mock.calls.filter(([, options]) => options?.method === 'DELETE');
    expect(JSON.parse(deletes[0][1].body)).toEqual({ userId: 'source' });
    expect(JSON.parse(deletes[1][1].body)).toEqual({ userId: 'source', confirmCascade: true, reason: 'self_request', previewToken: 'first-state' });
    expect(JSON.parse(deletes[2][1].body)).toEqual({ userId: 'source', confirmCascade: true, reason: 'self_request', previewToken: 'second-state' });
});
