// 비밀번호 폼의 확인 방식·중복 제출·독립 저장과 결과 안내를 DOM으로 검증한다.
// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import PasswordChangeForm from '../components/member/PasswordChangeForm';

let container: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn();
async function render(canVerifyPasswordWithInviteCode = false) {
    await act(async () => root.render(createElement(PasswordChangeForm, { canVerifyPasswordWithInviteCode })));
}
function input(name: string) { return container.querySelector<HTMLInputElement>(`input[name="${name}"]`)!; }
async function fill(name: string, value: string) {
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input(name), value);
        input(name).dispatchEvent(new Event('input', { bubbles: true }));
    });
}
async function submit() {
    await act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
}
async function fillNew() { await fill('newPassword', 'newpassword'); await fill('confirmPassword', 'newpassword'); }
beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ message: '비밀번호를 변경했습니다. 다른 기기의 로그인은 해제됩니다.' }) });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});
afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
});

it('일반 회원에게 현재 비밀번호 확인을 표시하고 새 비밀번호를 검증한다', async () => {
    await render();
    expect(input('currentPassword').type).toBe('password');
    expect(input('inviteCode')).toBeNull();
    expect(input('currentPassword').labels?.length).toBe(1);
    await submit();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('현재 비밀번호를 입력');
    expect(fetchMock).not.toHaveBeenCalled();
    await fill('currentPassword', 'oldpassword');
    await fill('newPassword', 'short');
    await submit();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('최소 8자');
    expect(fetchMock).not.toHaveBeenCalled();
});
it('일반 회원 성공 시 비밀 입력만 초기화하고 세션 안내를 표시한다', async () => {
    await render();
    await fill('currentPassword', 'oldpassword');
    await fillNew();
    await submit();
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/password', expect.objectContaining({
        method: 'POST', body: JSON.stringify({ verificationMethod: 'password', currentPassword: 'oldpassword', newPassword: 'newpassword', confirmPassword: 'newpassword' }),
    }));
    expect(input('currentPassword').value).toBe('');
    expect(input('newPassword').value).toBe('');
    expect(input('confirmPassword').value).toBe('');
    expect(container.querySelector('[role="status"]')?.textContent).toContain('다른 기기');
});
it('코드 가능한 멘티는 초대 확인이 기본이며 선택한 확인수단만 전송한다', async () => {
    await render(true);
    expect(input('inviteCode').type).toBe('password');
    expect(input('currentPassword')).toBeNull();
    expect(container.textContent).toContain('이용 기간');
    await fill('inviteCode', 'KSQF-ABCD-EFGH-JKMN');
    await fillNew();
    await act(async () => container.querySelector<HTMLInputElement>('input[value="password"]')!.click());
    await fill('currentPassword', 'oldpassword');
    await submit();
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.verificationMethod).toBe('password');
    expect(body.inviteCode).toBeUndefined();
});
it('코드 확인 성공 시 새 비밀번호와 코드 입력을 지운다', async () => {
    await render(true);
    await fill('inviteCode', 'KSQF-ABCD-EFGH-JKMN');
    await fillNew();
    await submit();
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.verificationMethod).toBe('invite');
    expect(body.currentPassword).toBeUndefined();
    expect(input('inviteCode').value).toBe('');
    expect(input('newPassword').value).toBe('');
});
it('서버 실패는 입력을 보존하고 오류를 표시한다', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: '현재 비밀번호가 올바르지 않습니다.' }) });
    await render();
    await fill('currentPassword', 'wrongpassword');
    await fillNew();
    await submit();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('올바르지 않습니다');
    expect(input('currentPassword').value).toBe('wrongpassword');
    expect(input('newPassword').value).toBe('newpassword');
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(false);
});
it('저장 중에는 두 번째 제출과 확인수단 전환을 막는다', async () => {
    let resolve!: (response: unknown) => void;
    fetchMock.mockImplementation(() => new Promise((done) => { resolve = done; }));
    await render(true);
    await fill('inviteCode', 'KSQF-ABCD-EFGH-JKMN');
    await fillNew();
    await act(async () => {
        const form = container.querySelector('form')!;
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
    expect(container.querySelector<HTMLInputElement>('input[value="password"]')?.disabled).toBe(true);
    await act(async () => resolve({ ok: true, json: async () => ({ message: '변경했습니다.' }) }));
});
