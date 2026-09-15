// 사용자 정보 화면에서 회원정보와 비밀번호의 입력·저장이 서로 독립적인지 검증한다.
// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ProfilePage from '../app/profile/page';

vi.mock('../components/member/PersonalAiConnection', () => ({ default: () => null }));
vi.mock('../components/ThemeToggle', () => ({ default: () => null }));
let container: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn();
const reply = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation(async (url: string, options?: RequestInit) => {
        if (options?.method === 'POST') return reply({ success: true, message: '비밀번호를 변경했습니다.' });
        if (options?.method === 'PUT') return reply({ success: true, name: '수정한 이름' });
        if (url === '/api/me/affiliation') return reply({ role: 'MENTEE', program: null, mentors: [], programs: [] });
        return reply({ role: 'MENTEE', name: '사용자', email: 'user@example.test', canVerifyPasswordWithInviteCode: true,
            profile: { organization: '기존기관', phone: '010-1234-5678', companyName: '기업', industry: '제조', privacyConsentAt: '2026-01-01' } });
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});
afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    fetchMock.mockReset();
    vi.unstubAllGlobals();
});
async function fill(selector: string, value: string) {
    const input = container.querySelector<HTMLInputElement>(selector)!;
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
}

it('비밀번호 저장은 작성 중인 회원정보를 보존하고 비밀번호 API만 호출한다', async () => {
    await act(async () => root.render(createElement(ProfilePage)));
    await fill('#profile-name', '수정한 이름');
    await fill('input[name="inviteCode"]', 'KSQF-ABCD-EFGH-JKMN');
    await fill('input[name="newPassword"]', 'newpassword');
    await fill('input[name="confirmPassword"]', 'newpassword');
    await act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(container.querySelector<HTMLInputElement>('#profile-name')?.value).toBe('수정한 이름');
    expect(container.querySelector<HTMLInputElement>('input[name="newPassword"]')?.value).toBe('');
    expect(fetchMock.mock.calls.filter(([, options]) => options?.method)).toHaveLength(1);
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe('/api/admin/password');
    expect(container.querySelector('[role="status"]')?.textContent).toContain('비밀번호를 변경했습니다');
});

it('회원정보 저장은 작성 중인 비밀번호를 보존하고 비밀값을 프로필 API로 보내지 않는다', async () => {
    await act(async () => root.render(createElement(ProfilePage)));
    await fill('#profile-name', '수정한 이름');
    await fill('input[name="newPassword"]', 'unsavedpassword');
    await act(async () => container.querySelector<HTMLButtonElement>('#profile-save')!.click());
    expect(container.querySelector<HTMLInputElement>('input[name="newPassword"]')?.value).toBe('unsavedpassword');
    expect(fetchMock.mock.calls.filter(([, options]) => options?.method)).toHaveLength(1);
    const [url, options] = fetchMock.mock.calls.at(-1)!;
    expect(url).toBe('/api/me/profile');
    expect(options.method).toBe('PUT');
    expect(options.body).not.toContain('unsavedpassword');
    expect(container.querySelector('[role="status"]')).toBeNull();
});
