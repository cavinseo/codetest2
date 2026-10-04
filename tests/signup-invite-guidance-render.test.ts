// 초대 대상자의 중복 가입 예방 안내와 초대 로그인 이동을 실제 React DOM으로 검증한다.
// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import SignupPage from '../app/signup/page';

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }));
vi.mock('next/link', () => ({ default: (props: any) => createElement('a', props) }));
vi.mock('@/components/ThemeToggle', () => ({ default: () => null }));

let container: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn();
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function enter(id: string, value: string) {
    const input = container.querySelector<HTMLInputElement>(`#${id}`)!;
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
}

async function submit() {
    await act(async () => { container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
}

beforeEach(async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('fetch', fetchMock);
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
    await act(async () => { root.render(createElement(SignupPage)); });
});

afterEach(async () => {
    await act(async () => { root.unmount(); });
    container.remove(); vi.resetAllMocks(); vi.unstubAllGlobals();
});

it('초대 메일 수신자는 별도 가입 없이 초대 로그인하고 기존 가입자는 관리자 연결을 요청하도록 안내한다', () => {
    expect(container.textContent).toContain('초대 메일을 받았다면 별도 가입 없이');
    expect(container.textContent).toContain('이미 가입했다면 관리자에게 기존 회원 연결을 요청하세요.');
    expect(container.querySelector('a[href="/login?mode=invite"]')).not.toBeNull();
});

it('유효 초대 응답이면 가입 입력을 보존하고 초대 코드 로그인 링크를 오류와 함께 제공한다', async () => {
    fetchMock.mockResolvedValueOnce(response({ code: 'INVITE_LOGIN_REQUIRED', error: '초대 메일의 코드로 로그인하세요.' }, 409));
    await enter('name', '기존 멘티'); await enter('email', 'mentee@example.test'); await enter('password', 'test-password'); await enter('confirmPassword', 'test-password');
    await submit();
    const guidance = [...container.querySelectorAll('a')].find(element => element.textContent === '초대 코드로 로그인하기');
    expect(guidance?.getAttribute('href')).toBe('/login?mode=invite');
    expect(container.textContent).toContain('초대 메일의 코드로 로그인하세요.');
    expect(container.querySelector<HTMLInputElement>('#email')!.value).toBe('mentee@example.test');
    expect(pushMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValueOnce(response({ error: '입력한 정보를 확인하세요.' }, 400));
    await submit();
    expect([...container.querySelectorAll('a')].find(element => element.textContent === '초대 코드로 로그인하기')).toBeUndefined();
});

it('초대가 없는 일반 가입의 기존 승인 대기 이동은 유지한다', async () => {
    fetchMock.mockResolvedValueOnce(response({ pendingApproval: true }));
    await enter('email', 'new@example.test'); await enter('password', 'test-password'); await enter('confirmPassword', 'test-password');
    await submit();
    expect(pushMock).toHaveBeenCalledWith('/login?signup=pending');
});

it('멘토를 선택하면 초대 입력을 감추고 이전 코드를 지워 일반 가입만 전송한다', async () => {
    await enter('inviteCode', 'KSQF-ABCD-EFGH-JKMN');
    await act(async () => {
        const select = container.querySelector<HTMLSelectElement>('select')!;
        select.value = 'MENTOR';
        select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(container.querySelector('#inviteCode')).toBeNull();
    expect(container.querySelector('a[href="/login?mode=invite"]')).toBeNull();
    expect(container.textContent).toContain('멘토는 초대 코드 없이 가입');
    expect(container.textContent).toContain('프로그램 매니저');
    fetchMock.mockResolvedValueOnce(response({ pendingApproval: true }));
    await enter('email', 'mentor@example.test'); await enter('password', 'test-password'); await enter('confirmPassword', 'test-password');
    await submit();
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.role).toBe('MENTOR');
    expect(body).not.toHaveProperty('inviteCode');
    await act(async () => {
        const select = container.querySelector<HTMLSelectElement>('select')!;
        select.value = 'MENTEE';
        select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(container.querySelector<HTMLInputElement>('#inviteCode')!.value).toBe('');
});
