// 복구한 초대 계정과 임시 비밀번호 계정이 온보딩의 남은 단계를 완료하는 흐름을 검증한다.
// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import OnboardingPage from '../app/onboarding/page';

const { router } = vi.hoisted(() => ({ router: { replace: vi.fn() } }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/components/ThemeToggle', () => ({ default: () => null }));

let container: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn();
const getProfile = vi.fn();
const savePassword = vi.fn();
const saveProfile = vi.fn();
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const member = {
    role: 'MENTEE', needsProfile: false, mustChangePassword: true, canVerifyPasswordWithInviteCode: true,
    profile: { organization: '기존 기관', phone: '010-1234-5678', companyName: '기존 회사', industry: '제조', privacyConsentAt: '2026-09-01' },
};
function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => { resolve = done; });
    return { promise, resolve };
}
async function render() { await act(async () => root.render(createElement(OnboardingPage))); }
async function fill(name: string, value: string) {
    const input = container.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
}
async function enterPassword(method = 'invite') {
    await fill(method === 'invite' ? 'inviteCode' : 'currentPassword', method === 'invite' ? 'KSQF-ABCD-EFGH-JKMN' : 'temporary-password');
    await fill('newPassword', 'new-password'); await fill('confirmPassword', 'new-password');
}
async function submitPassword() { await act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))); }
async function click(text: string) {
    const button = [...container.querySelectorAll<HTMLButtonElement>('button')].find(element => element.textContent === text)!;
    await act(async () => button.click());
}

beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('fetch', fetchMock);
    getProfile.mockImplementation(async () => response(member));
    savePassword.mockImplementation(async () => response({ success: true }));
    saveProfile.mockImplementation(async () => response({ success: true }));
    fetchMock.mockImplementation(async (url: string, options?: RequestInit) => {
        if (url === '/api/admin/password') return savePassword(JSON.parse(options!.body as string));
        if (options?.method === 'PUT') return saveProfile(JSON.parse(options.body as string));
        return getProfile();
    });
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => {
    await act(async () => root.unmount());
    container.remove(); vi.resetAllMocks(); vi.unstubAllGlobals();
});

it('복구 멘티는 알 수 없는 이전 비밀번호 없이 초대 코드로 새 비밀번호를 설정하고 이용을 시작한다', async () => {
    await render();
    expect(container.textContent).toContain('기존 비밀번호는 필요하지 않습니다.');
    expect(container.querySelector('input[name="currentPassword"]')).toBeNull();
    expect(container.querySelector('input[name="inviteCode"]')).not.toBeNull();
    await enterPassword(); await submitPassword();
    expect(savePassword).toHaveBeenCalledExactlyOnceWith({
        verificationMethod: 'invite', inviteCode: 'KSQF-ABCD-EFGH-JKMN', newPassword: 'new-password', confirmPassword: 'new-password',
    });
    expect(saveProfile).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledExactlyOnceWith('/dashboard');
});

it('일반 임시 비밀번호 계정은 현재 비밀번호 방식으로 기존 온보딩을 완료한다', async () => {
    getProfile.mockImplementation(async () => response({ ...member, role: 'MENTOR', canVerifyPasswordWithInviteCode: false }));
    await render();
    expect(container.textContent).toContain('메일로 받은 임시 비밀번호');
    expect(container.querySelector('input[name="inviteCode"]')).toBeNull();
    await enterPassword('password'); await submitPassword();
    expect(savePassword).toHaveBeenCalledExactlyOnceWith({
        verificationMethod: 'password', currentPassword: 'temporary-password', newPassword: 'new-password', confirmPassword: 'new-password',
    });
    expect(router.replace).toHaveBeenCalledExactlyOnceWith('/dashboard');
});

it('비밀번호를 먼저 바꿔도 미완성 프로필을 완료하기 전에는 이동하지 않고 기존 작성값을 보존한다', async () => {
    getProfile.mockImplementation(async () => response({ ...member, needsProfile: true }));
    await render(); await enterPassword(); await submitPassword();
    expect(container.querySelector('input[name="inviteCode"]')).toBeNull();
    expect(router.replace).not.toHaveBeenCalled();
    expect([...container.querySelectorAll<HTMLInputElement>('input')].map(input => input.value)).toContain('기존 기관');
    await click('저장하고 시작하기');
    expect(saveProfile).toHaveBeenCalledExactlyOnceWith({ organization: '기존 기관', phone: '010-1234-5678', companyName: '기존 회사', industry: '제조', privacyConsent: true });
    expect(router.replace).toHaveBeenCalledExactlyOnceWith('/dashboard');
});

it('프로필을 먼저 저장해도 강제 비밀번호 변경을 완료하기 전에는 이동하지 않는다', async () => {
    getProfile.mockImplementation(async () => response({ ...member, needsProfile: true }));
    await render(); await click('저장하고 시작하기');
    expect(router.replace).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain('저장하고 시작하기');
    await enterPassword(); await submitPassword();
    expect(router.replace).toHaveBeenCalledExactlyOnceWith('/dashboard');
});

it.each(['password', 'profile'])('프로필과 비밀번호를 동시에 저장하고 %s가 먼저 끝나도 두 완료 후 한 번만 이동한다', async first => {
    const password = deferred<Response>(); const profile = deferred<Response>();
    getProfile.mockImplementation(async () => response({ ...member, needsProfile: true }));
    savePassword.mockImplementationOnce(() => password.promise); saveProfile.mockImplementationOnce(() => profile.promise);
    await render(); await enterPassword(); await submitPassword(); await click('저장하고 시작하기');
    await act(async () => { (first === 'password' ? password : profile).resolve(response({ success: true })); });
    expect(router.replace).not.toHaveBeenCalled();
    await act(async () => { (first === 'password' ? profile : password).resolve(response({ success: true })); });
    expect(router.replace).toHaveBeenCalledExactlyOnceWith('/dashboard');
});

it.each(['http', 'network'])('회원 정보 %s 조회 실패는 완료로 오인하지 않고 재조회를 제공한다', async failure => {
    if (failure === 'http') getProfile.mockResolvedValueOnce(response({ error: '회원 정보 조회에 실패했습니다.' }, 500));
    else getProfile.mockRejectedValueOnce(new Error('회원 정보를 불러오지 못했습니다.'));
    await render();
    expect(container.querySelector('[role="alert"]')!.textContent).toContain('회원 정보');
    expect(container.querySelector('form')).toBeNull();
    expect(router.replace).not.toHaveBeenCalled();
    await click('회원 정보 다시 불러오기');
    expect(getProfile).toHaveBeenCalledTimes(2);
    expect(container.querySelector('input[name="inviteCode"]')).not.toBeNull();
});

it('비밀번호 변경 실패는 복구 단계를 완료 처리하지 않는다', async () => {
    savePassword.mockResolvedValueOnce(response({ error: '초대 코드를 확인하세요.' }, 403));
    await render(); await enterPassword(); await submitPassword();
    expect(container.querySelector('[role="alert"]')!.textContent).toContain('초대 코드를 확인하세요.');
    expect(container.querySelector('input[name="inviteCode"]')).not.toBeNull();
    expect(router.replace).not.toHaveBeenCalled();
});

it('화면을 떠난 뒤 도착한 비밀번호 변경 응답은 대시보드로 이동시키지 않는다', async () => {
    const pending = deferred<Response>(); savePassword.mockImplementationOnce(() => pending.promise);
    await render(); await enterPassword(); await submitPassword();
    await act(async () => root.render(null));
    await act(async () => pending.resolve(response({ success: true })));
    expect(router.replace).not.toHaveBeenCalled();
});
