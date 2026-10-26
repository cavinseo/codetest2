// 대시보드에서 떼어 낸 "새 프로젝트" 창을 실제 React DOM 으로 돌려 본다(2026-10-25 코드 리뷰 L8).
// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import NewProjectModal, { type NewProjectModalProps } from '../components/dashboard/NewProjectModal';
import type { MemberRole } from '../lib/member-roles';

let container: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn();
const onCreated = vi.fn();
const onClose = vi.fn();
const onApprovalRequested = vi.fn();
const onApprovalRequestIdChange = vi.fn();
const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

function render(props: Partial<NewProjectModalProps<{ id: string }>> & { role: MemberRole }) {
    return act(async () => root.render(createElement(NewProjectModal<{ id: string }>, {
        open: true,
        creationAllowed: true,
        ownsProject: false,
        approvalRequestId: '',
        onApprovalRequestIdChange,
        onClose,
        onCreated,
        onApprovalRequested,
        ...props,
    })));
}

const nameInput = () => container.querySelector<HTMLInputElement>('input[type="text"]')!;
const submitButton = () => [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('프로젝트 생성'))!;
const button = (text: string) => [...container.querySelectorAll('button')].find((item) => item.textContent?.trim() === text)!;
async function type(element: HTMLInputElement, text: string) {
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, text);
        element.dispatchEvent(new Event('input', { bubbles: true }));
    });
}
async function choose(select: HTMLSelectElement, value: string) {
    await act(async () => {
        select.value = value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
    });
}
async function submit() {
    await act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    await settle();
}
/** 이어지는 fetch(프로그램 → 그 프로그램의 멘티)가 모두 끝나기를 기다린다. */
async function settle() {
    for (let i = 0; i < 3; i++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('fetch', fetchMock);
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
});

afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.resetAllMocks();
    vi.unstubAllGlobals();
});

it('닫혀 있으면 아무것도 그리지 않는다', async () => {
    await render({ role: 'MENTEE', open: false });

    expect(container.innerHTML).toBe('');
});

it('관리자는 프로그램과 소유 멘티를 골라 만들고, 만든 프로젝트를 돌려받는다', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
        if (url === '/api/programs') return json({ programs: [{ id: 'prog_a', name: '가 프로그램', organization: '기관' }] });
        if (url === '/api/programs/prog_a/mentees') return json({ mentees: [{ id: 'mentee_1', name: '김멘티', email: 'm@example.com' }] });
        if (url === '/api/projects' && init?.method === 'POST') return json({ project: { id: 'proj_new' } });
        return json({});
    });
    await render({ role: 'ADMIN' });
    await settle();

    const [programSelect, menteeSelect] = [...container.querySelectorAll('select')];
    expect(programSelect.value).toBe('prog_a');
    await choose(menteeSelect, 'mentee_1');
    await type(nameInput(), '스마트 화분');
    await submit();

    const [, init] = fetchMock.mock.calls.find(([url, options]) => url === '/api/projects' && options?.method === 'POST')!;
    expect(JSON.parse(String(init.body))).toMatchObject({ name: '스마트 화분', programId: 'prog_a', ownerMenteeId: 'mentee_1' });
    expect(onCreated).toHaveBeenCalledWith({ id: 'proj_new' });
    expect(nameInput().value).toBe('');
});

it('이미 프로젝트를 가진 멘티는 승인 신청 칸이 뜨고 생성 버튼이 막힌다', async () => {
    await render({ role: 'MENTEE', ownsProject: true });

    expect(container.textContent).toContain('추가 개설에는 프로그램 매니저의 승인이 필요합니다');
    expect(submitButton().disabled).toBe(true);
    // 멘티는 고를 프로그램·소유자가 없어 목록을 부르지 않는다.
    expect(fetchMock).not.toHaveBeenCalled();
});

it('승인을 골라 연 멘티는 승인 칸 없이 그 승인으로 만든다', async () => {
    fetchMock.mockImplementation(() => json({ project: { id: 'proj_2' } }));
    await render({ role: 'MENTEE', ownsProject: true, approvalRequestId: 'req_1' });

    expect(container.textContent).not.toContain('추가 개설에는');
    await type(nameInput(), '두 번째');
    await submit();

    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual({ name: '두 번째', description: '', approvalRequestId: 'req_1' });
    expect(onApprovalRequestIdChange).toHaveBeenCalledWith('');
});

it('서버가 승인이 필요하다고 거절하면 멘티에게 바로 신청 칸을 보인다', async () => {
    fetchMock.mockImplementation(() => json({ error: '승인 필요', approvalRequired: true }, 403));
    await render({ role: 'MENTEE' });
    await type(nameInput(), '스마트 화분');
    await submit();

    expect(onCreated).not.toHaveBeenCalled();
    expect(container.textContent).toContain('추가 개설에는 프로그램 매니저의 승인이 필요합니다');
});

it('닫았다 다시 열어도 적던 이름이 남는다(승인 신청 뒤 이어 쓰기)', async () => {
    await render({ role: 'MENTEE' });
    await type(nameInput(), '적던 이름');
    await act(async () => button('취소').click());
    expect(onClose).toHaveBeenCalledOnce();

    // 취소는 입력을 지운다. 창 바깥에서 닫는 경우(승인 신청 뒤 등)는 입력이 남는다.
    await render({ role: 'MENTEE' });
    await type(nameInput(), '이어 쓸 이름');
    await render({ role: 'MENTEE', open: false });
    await render({ role: 'MENTEE', open: true });
    expect(nameInput().value).toBe('이어 쓸 이름');
});
