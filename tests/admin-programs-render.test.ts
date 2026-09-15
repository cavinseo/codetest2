// 프로그램 수정·삭제 버튼과 저장 실패·중복 제출·삭제 차단을 실제 DOM으로 검증한다.
// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ProgramsTab from '../components/admin/ProgramsTab';

let container: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn();
const row = { id: 'p1', name: '기존 프로그램', organization: '기존 기관', startsAt: '2026-09-01T00:00:00Z', endsAt: '2026-10-31T00:00:00Z', managerName: '담당자', managerEmail: 'manager@example.test', projectCount: 1, menteeCount: 2 };
const response = (body: unknown, ok = true) => ({ ok, json: async () => body });
async function render(canDelete = true) {
    await act(async () => root.render(createElement(ProgramsTab, { canCreate: canDelete, canDelete })));
}
async function click(selector: string) {
    await act(async () => container.querySelector<HTMLButtonElement>(selector)!.click());
}
async function fill(selector: string, value: string) {
    await act(async () => {
        const input = container.querySelector<HTMLInputElement>(selector)!;
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
}
beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation(async (url: string, options?: RequestInit) => {
        if (options?.method === 'PATCH') return response({ program: { id: row.id, ...JSON.parse(options.body as string) } });
        if (url === '/api/programs') return response({ programs: [row] });
        if (url.includes('managers')) return response({ managers: [] });
        if (url === '/api/project-requests') return response({ requests: [] });
        if (url === '/api/programs/p1') return response({ program: { id: row.id, name: row.name, canDelete: false, projectCount: 1, menteeCount: 2, inviteCount: 1, requestCount: 0, blockReason: '연결된 프로젝트와 멘티를 먼저 옮겨 주세요.' } });
        throw new Error(`Unexpected fetch ${url}`);
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function (this: HTMLDialogElement) { this.open = true; } });
    container = document.createElement('div'); document.body.appendChild(container);
    root = createRoot(container);
});
afterEach(async () => {
    await act(async () => root.unmount());
    container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); fetchMock.mockReset();
});

it('관리자 카드에서 내용 수정과 삭제를 제공하고 기존 네 필드를 채운다', async () => {
    await render();
    expect(container.querySelector('#programs-delete-p1')).not.toBeNull();
    await click('#programs-edit-p1');
    expect(container.querySelector<HTMLInputElement>('#programs-name')!.value).toBe(row.name);
    expect(container.querySelector<HTMLInputElement>('#programs-organization')!.value).toBe(row.organization);
    expect(container.querySelector<HTMLInputElement>('#programs-starts-at')!.value).toBe('2026-09-01');
    expect(container.querySelector<HTMLInputElement>('#programs-ends-at')!.value).toBe('2026-10-31');
    expect(container.textContent).not.toContain('담당 프로그램 매니저');
});

it('프로그램 매니저 화면에는 수정만 제공하며 삭제·개설은 노출하지 않는다', async () => {
    await render(false);
    expect(container.querySelector('#programs-delete-p1')).toBeNull();
    expect(container.querySelector('#programs-create-toggle')).toBeNull();
    await click('#programs-edit-p1');
    expect(container.textContent).toContain('변경사항 저장');
});

it('수정 저장은 프로그램 ID로 PATCH하고 담당자·연결 건수를 유지한 채 카드를 갱신한다', async () => {
    await render(); await click('#programs-edit-p1'); await fill('#programs-name', '수정된 프로그램');
    await click('#programs-create-submit');
    const call = fetchMock.mock.calls.find(([, options]) => options?.method === 'PATCH')!;
    expect(call[0]).toBe('/api/programs/p1');
    expect(JSON.parse(call[1].body)).toEqual({ name: '수정된 프로그램', organization: row.organization, startsAt: '2026-09-01', endsAt: '2026-10-31' });
    expect(container.querySelector('h4')!.textContent).toBe('수정된 프로그램');
    expect(container.textContent).toContain('멘티 2명');
    expect(container.textContent).toContain(row.managerEmail);
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/programs')).toHaveLength(1);
});

it('저장 실패 시 작성 내용을 보존하고 재시도를 허용한다', async () => {
    await render(); await click('#programs-edit-p1'); await fill('#programs-name', '보존할 입력');
    fetchMock.mockResolvedValueOnce(response({ error: '저장 오류' }, false));
    await click('#programs-create-submit');
    expect(container.querySelector<HTMLInputElement>('#programs-name')!.value).toBe('보존할 입력');
    expect(container.querySelector('h4')!.textContent).toBe(row.name);
    expect(container.textContent).toContain('저장 오류');
    expect(container.querySelector<HTMLButtonElement>('#programs-create-submit')!.disabled).toBe(false);
});

it('연속 저장 클릭은 한 번만 전송하고 응답 전에는 폼을 잠근다', async () => {
    await render(); await click('#programs-edit-p1');
    let finish!: (value: unknown) => void;
    fetchMock.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const button = container.querySelector<HTMLButtonElement>('#programs-create-submit')!;
    await act(async () => { button.click(); button.click(); });
    expect(fetchMock.mock.calls.filter(([, options]) => options?.method === 'PATCH')).toHaveLength(1);
    expect(container.querySelector<HTMLFieldSetElement>('fieldset')!.disabled).toBe(true);
    await act(async () => finish(response({ program: row })));
});

it('연결 자료가 있으면 삭제 사유를 표시하며 삭제 요청을 보내지 않는다', async () => {
    await render(); await click('#programs-delete-p1');
    expect(container.querySelector('dialog')!.textContent).toContain('연결된 프로젝트와 멘티');
    const confirm = Array.from(container.querySelectorAll<HTMLButtonElement>('dialog button')).find(b => b.textContent === '삭제 확인')!;
    expect(confirm.disabled).toBe(true);
    await act(async () => confirm.click());
    expect(fetchMock.mock.calls.some(([, options]) => options?.method === 'DELETE')).toBe(false);
});
