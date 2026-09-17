// 역할별 로그인 선택과 멘티 초대코드 인증 요청을 실제 React DOM으로 검증한다.
// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import LoginPage from '../app/login/page';

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }));
vi.mock('next/link', () => ({ default: (props: any) => createElement('a', props) }));
vi.mock('@/components/ThemeToggle', () => ({ default: () => null }));

let container: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn();

function response(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

async function renderLogin(query = '') {
    window.history.replaceState({}, '', `/login${query}`);
    await act(async () => { root.render(createElement(LoginPage)); });
}

function button(text: string) {
    const found = [...container.querySelectorAll('button')].find((node) => node.textContent?.trim() === text);
    expect(found, `${text} 버튼`).toBeDefined();
    return found!;
}

async function click(text: string) {
    await act(async () => { button(text).click(); });
}

async function enter(id: string, value: string) {
    const input = container.querySelector<HTMLInputElement>(`#${id}`);
    expect(input, `${id} 입력란`).not.toBeNull();
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
        input!.dispatchEvent(new Event('input', { bubbles: true }));
    });
}

async function submit(twice = false) {
    await act(async () => {
        const form = container.querySelector('form')!;
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        if (twice) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
}

beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation(async () => response({ success: true, needsProfile: false, mustChangePassword: false }));
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(async () => {
    await act(async () => { root.unmount(); });
    container.remove();
    window.history.replaceState({}, '', '/');
    vi.resetAllMocks();
    vi.unstubAllGlobals();
});

it('프로그램 매니저·멘토·멘티 선택을 순서대로 표시하고 기존 비밀번호 로그인을 기본으로 유지한다', async () => {
    await renderLogin();
    expect([...container.querySelectorAll('[aria-pressed]')].map((node) => node.textContent)).toEqual(['프로그램 매니저', '멘토', '멘티']);
    expect(button('멘토').getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('#password')).not.toBeNull();
    expect(container.querySelector('a[href="/api/auth/google/login?role=MENTOR"]')).not.toBeNull();
    await enter('email', 'mentor@example.test');
    await enter('password', 'test-password');
    await submit();
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({
        body: JSON.stringify({ email: 'mentor@example.test', password: 'test-password', role: 'MENTOR' }),
    }));
    expect(pushMock).toHaveBeenCalledWith('/dashboard');
});

it('프로그램 매니저 선택 역할을 비밀번호 요청과 Google 로그인 URL에 전달한다', async () => {
    await renderLogin();
    await click('프로그램 매니저');
    expect(button('프로그램 매니저').getAttribute('aria-pressed')).toBe('true');
    await enter('email', 'manager@example.test');
    await enter('password', 'test-password');
    await submit();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ email: 'manager@example.test', password: 'test-password', role: 'PROGRAM_MANAGER' });
    expect(container.querySelector('a[href="/api/auth/google/login?role=PROGRAM_MANAGER"]')).not.toBeNull();
});

it('멘티를 선택하면 이메일·초대코드를 기본 표시하고 비밀번호와 Google 링크를 숨긴다', async () => {
    await renderLogin();
    await click('멘티');
    expect(button('멘티').getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('label[for="email"]')?.textContent?.trim()).toBe('이메일');
    expect(container.querySelector('#inviteCode')).not.toBeNull();
    expect(container.querySelector('#password')).toBeNull();
    expect(container.querySelector('a[href^="/api/auth/google/login"]')).toBeNull();
});

it('초대 링크로 진입하면 멘티·초대코드 로그인을 선택한다', async () => {
    await renderLogin('?mode=invite');
    expect(button('멘티').getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('#inviteCode')).not.toBeNull();
});

it.each([
    [{ needsProfile: true }, '/onboarding'],
    [{ mustChangePassword: true }, '/onboarding'],
    [{ needsProfile: false, mustChangePassword: false }, '/dashboard'],
])('초대코드로 요청하고 응답 %j에 따라 %s로 이동한다', async (flags, destination) => {
    fetchMock.mockResolvedValue(response({ success: true, ...flags }));
    await renderLogin('?mode=invite');
    await enter('email', 'mentee@example.test');
    await enter('inviteCode', 'KSQF-TEST-CODE');
    await submit();
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/invite-login', expect.objectContaining({
        method: 'POST', body: JSON.stringify({ email: 'mentee@example.test', inviteCode: 'KSQF-TEST-CODE' }),
    }));
    expect(pushMock).toHaveBeenCalledWith(destination);
});

it('멘티도 기존 계정 비밀번호로 로그인할 수 있고 다시 선택하면 초대코드로 돌아온다', async () => {
    await renderLogin('?mode=invite');
    await click('비밀번호 로그인');
    expect(container.querySelector('#password')).not.toBeNull();
    expect(container.querySelector('a[href="/api/auth/google/login?role=MENTEE"]')).not.toBeNull();
    await enter('email', 'mentee@example.test');
    await enter('password', 'test-password');
    await submit();
    expect(fetchMock.mock.calls[0][0]).toBe('/api/auth/login');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ email: 'mentee@example.test', password: 'test-password', role: 'MENTEE' });
    await click('멘토');
    await click('멘티');
    expect(container.querySelector('#inviteCode')).not.toBeNull();
});

it('실패하면 입력을 보존하고 방식 또는 역할을 전환하면 지난 오류를 지운다', async () => {
    fetchMock.mockImplementation(async () => response({ error: '초대코드를 확인해 주세요.' }, 403));
    await renderLogin('?mode=invite');
    await enter('email', 'mentee@example.test');
    await enter('inviteCode', 'KSQF-WRONG-CODE');
    await submit();
    expect(container.textContent).toContain('초대코드를 확인해 주세요.');
    expect(container.querySelector<HTMLInputElement>('#inviteCode')!.value).toBe('KSQF-WRONG-CODE');
    expect(container.querySelector<HTMLInputElement>('#email')!.value).toBe('mentee@example.test');
    expect(pushMock).not.toHaveBeenCalled();
    await click('비밀번호 로그인');
    expect(container.textContent).not.toContain('초대코드를 확인해 주세요.');
    await enter('password', 'test-password');
    await submit();
    expect(container.textContent).toContain('초대코드를 확인해 주세요.');
    await click('프로그램 매니저');
    expect(container.textContent).not.toContain('초대코드를 확인해 주세요.');
});

it('처리 중 중복 제출·역할·방식·입력 변경을 막고 실패 후 다시 입력할 수 있다', async () => {
    let resolve!: (value: Response) => void;
    fetchMock.mockImplementation(() => new Promise<Response>((done) => { resolve = done; }));
    await renderLogin('?mode=invite');
    await enter('email', 'mentee@example.test');
    await enter('inviteCode', 'KSQF-TEST-CODE');
    await submit(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect([...container.querySelectorAll('button')].every((node) => node.disabled)).toBe(true);
    expect([...container.querySelectorAll('input')].every((node) => node.disabled)).toBe(true);
    await click('멘토');
    await click('비밀번호 로그인');
    expect(container.querySelector('#inviteCode')).not.toBeNull();
    await act(async () => { resolve(response({ error: '다시 시도하세요.' }, 503)); });
    expect(button('멘토').disabled).toBe(false);
    expect(container.querySelector<HTMLInputElement>('#inviteCode')!.disabled).toBe(false);
    await click('멘토');
    expect(container.querySelector('#password')).not.toBeNull();
});

it('비밀번호 처리 중 Google 로그인을 시작하지 않는다', async () => {
    let resolve!: (value: Response) => void;
    fetchMock.mockImplementation(() => new Promise<Response>((done) => { resolve = done; }));
    await renderLogin();
    await enter('email', 'mentor@example.test');
    await enter('password', 'test-password');
    await submit();
    const link = container.querySelector<HTMLAnchorElement>('a[href="/api/auth/google/login?role=MENTOR"]')!;
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    await act(async () => { link.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(true);
    expect(link.getAttribute('aria-disabled')).toBe('true');
    await act(async () => { resolve(response({ error: '실패' }, 403)); });
});

it('기존 승인 대기 안내와 Google 오류를 유지한다', async () => {
    await renderLogin('?signup=pending&error=google_denied');
    expect(container.textContent).toContain('가입이 접수되었습니다. 관리자 승인 후 로그인할 수 있습니다.');
    expect(container.textContent).toContain('Google 로그인을 취소했습니다.');
});

it('연결 후 Google 로그인에서 돌아오면 첫 초대 코드 로그인 안내와 입력란을 표시한다', async () => {
    await renderLogin('?error=invite_required');
    expect(button('멘티').getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('#inviteCode')).not.toBeNull();
    expect(container.querySelector('#password')).toBeNull();
    expect(container.textContent).toContain('처음에는 초대 메일의 코드로 로그인하세요.');
});

it('비밀번호 로그인에서 첫 코드 로그인이 필요하면 이메일을 유지하고 초대 코드 입력으로 전환한다', async () => {
    fetchMock.mockResolvedValueOnce(response({ code: 'INVITE_LOGIN_REQUIRED', error: '연결된 초대 코드로 첫 로그인을 완료하세요.' }, 403));
    await renderLogin(); await click('멘티'); await click('비밀번호 로그인');
    await enter('email', 'mentee@example.test'); await enter('password', 'test-password'); await submit();
    expect(container.querySelector<HTMLInputElement>('#email')!.value).toBe('mentee@example.test');
    expect(container.querySelector('#inviteCode')).not.toBeNull();
    expect(container.querySelector('#password')).toBeNull();
    expect(container.textContent).toContain('연결된 초대 코드로 첫 로그인을 완료하세요.');
    expect(pushMock).not.toHaveBeenCalled();
});

it.each([
    ['role_mismatch', '선택한 로그인 역할과 계정 역할이 일치하지 않습니다. 계정에 맞는 역할을 선택하세요.'],
    ['account_role_invalid', '계정 역할 정보가 올바르지 않습니다. 관리자에게 문의하세요.'],
    ['google_role', '로그인 역할을 다시 선택해 주세요.'],
])('Google 오류 %s를 안내한다', async (code, message) => {
    await renderLogin(`?error=${code}`);
    expect(container.textContent).toContain(message);
});

it('로그인 화면을 떠난 뒤 도착한 성공 응답이 현재 화면을 바꾸지 않는다', async () => {
    let resolve!: (value: Response) => void;
    fetchMock.mockImplementation(() => new Promise<Response>((done) => { resolve = done; }));
    await renderLogin('?mode=invite');
    await enter('email', 'mentee@example.test');
    await enter('inviteCode', 'KSQF-TEST-CODE');
    await submit();
    await act(async () => { root.render(null); });
    await act(async () => { resolve(response({ success: true, needsProfile: true })); });
    expect(pushMock).not.toHaveBeenCalled();
});
it('최초 등록 응답을 받으면 이름 필수 입력을 표시하고 빈 이름으로 등록하지 않는다', async () => {
    fetchMock.mockResolvedValueOnce(response({ code: 'INVITE_NAME_REQUIRED', error: '등록을 완료하려면 이름을 입력하세요.' }, 400));
    await renderLogin('?mode=invite');
    await enter('email', 'mentee@example.test');
    await enter('inviteCode', 'KSQF-TEST-CODE');
    await submit();
    const name = container.querySelector<HTMLInputElement>('#inviteName')!;
    expect(name.required).toBe(true);
    expect(document.activeElement).toBe(name);
    expect(pushMock).not.toHaveBeenCalled();
    await enter('inviteName', '  ');
    await submit();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('이름을 입력하세요.');
    await enter('inviteName', ' 홍길동 ');
    fetchMock.mockResolvedValueOnce(response({ success: true, needsProfile: true }));
    await submit();
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ email: 'mentee@example.test', inviteCode: 'KSQF-TEST-CODE', name: '홍길동' });
    expect(pushMock).toHaveBeenCalledWith('/onboarding');
});

it('이름이 있는 기존 멘티는 이름 입력 단계 없이 로그인한다', async () => {
    await renderLogin('?mode=invite');
    await enter('email', 'complete@example.test');
    await enter('inviteCode', 'KSQF-TEST-CODE');
    await submit();
    expect(container.querySelector('#inviteName')).toBeNull();
    expect(pushMock).toHaveBeenCalledWith('/dashboard');
});

it.each(['email', 'inviteCode'])('%s가 바뀌면 이전 코드의 이름 등록 단계를 초기화한다', async field => {
    fetchMock.mockResolvedValueOnce(response({ code: 'INVITE_NAME_REQUIRED', error: '이름을 입력하세요.' }, 400));
    await renderLogin('?mode=invite');
    await enter('email', 'first@example.test');
    await enter('inviteCode', 'FIRST-CODE');
    await submit();
    await enter('inviteName', '첫 이름');
    await enter(field, field === 'email' ? 'other@example.test' : 'OTHER-CODE');
    expect(container.querySelector('#inviteName')).toBeNull();
    await submit();
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).not.toHaveProperty('name');
});
