// 회원 이용만료일의 클릭 편집·취소·검증·저장 실패 복구를 실제 화면에서 검증한다.
// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import MemberExpiryCell from '../components/admin/MemberExpiryCell';

let container: HTMLDivElement;
let root: Root;
const onSaved = vi.fn();
const member = { id: 'member', email: 'member@example.test', accessExpiresAt: '2026-10-31T14:59:59.999Z', inviteExpiresAt: '2026-09-30T14:59:59.999Z' };
const fetchMock = vi.fn();
const button = (label: string) => [...container.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent === label)!;
async function enter(value: string) {
    const input = container.querySelector('input')!;
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
}
async function edit() { await act(async () => container.querySelector<HTMLButtonElement>('button')!.click()); }
beforeEach(async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true, user: { accessExpiresAt: '2026-12-31T14:59:59.999Z' } }) });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root.render(createElement('table', null,
        createElement('tbody', null, createElement('tr', null, createElement(MemberExpiryCell, { member, onSaved }))))));
});
afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.resetAllMocks();
});

it('만료일을 누르면 한국 날짜로 편집하고 취소하면 저장하지 않는다', async () => {
    expect(container.textContent).toBe('2026-10-31');
    await edit();
    expect(container.querySelector('input')!.value).toBe('2026-10-31');
    expect(container.querySelector('input')!.min).toBe('2026-09-30');
    await enter('2026-12-31');
    await act(async () => button('취소').click());
    expect(container.textContent).toBe('2026-10-31');
    expect(fetchMock).not.toHaveBeenCalled();
});
it('초대보다 긴 날짜를 저장하고 목록을 갱신한다', async () => {
    await edit();
    await enter('2026-12-31');
    await act(async () => button('저장').click());
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith('/api/admin/users', expect.objectContaining({
        method: 'PATCH', body: JSON.stringify({ userId: member.id, action: 'setAccessExpiry', accessExpiresAt: '2026-12-31' }),
    }));
    expect(onSaved).toHaveBeenCalledOnce();
    expect(container.querySelector('input')).toBeNull();
});
it.each(['', '2026-09-29'])('빈 날짜 또는 초대보다 이른 날짜 %s는 저장할 수 없다', async value => {
    await edit();
    await enter(value);
    expect(button('저장').disabled).toBe(true);
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
});
it('서버 거절 후 입력을 유지하고 다시 저장할 수 있다', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: '초대 코드 기한이 변경되었습니다.' }) });
    await edit();
    await enter('2026-12-31');
    await act(async () => button('저장').click());
    expect(container.querySelector('[role="alert"]')!.textContent).toContain('초대 코드');
    expect(container.querySelector('input')!.value).toBe('2026-12-31');
    expect(button('저장').disabled).toBe(false);
    expect(onSaved).not.toHaveBeenCalled();
    await act(async () => button('저장').click());
    expect(onSaved).toHaveBeenCalledOnce();
});
it('저장 중 날짜 변경과 중복 저장을 막고 통신 오류 뒤 복구한다', async () => {
    let reject!: (error: Error) => void;
    fetchMock.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
    await edit();
    await act(async () => { const save = button('저장'); save.click(); save.click(); });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(container.querySelector('input')!.disabled).toBe(true);
    expect(button('취소').disabled).toBe(true);
    await act(async () => reject(new Error('offline')));
    expect(button('저장').disabled).toBe(false);
    expect(container.querySelector('[role="alert"]')!.textContent).toContain('연결 상태');
});
