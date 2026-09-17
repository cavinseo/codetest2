// 다중 초대 발급과 관리자 코드 열람을 실제 React DOM으로 검증한다.
// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import InvitesTab from '../components/admin/InvitesTab';

let container: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn();
const postMock = vi.fn();
const deleteMock = vi.fn();
const patchMock = vi.fn();
const linkPreviewMock = vi.fn();
const linkPostMock = vi.fn();
const invite = {
    id: 'existing', code: 'EXISTING-CODE', email: 'existing@example.test',
    programId: 'program_1', programName: '기존 프로그램', expiresAt: '2099-01-01T00:00:00Z',
    programEndsAt: '2099-12-31T14:59:59.999Z',
    accessDurationDays: 90, usedAt: null,
};
const programs = [{ id: 'program_1', name: '기존 프로그램', organization: '기관', endsAt: invite.programEndsAt }];
const linkPreview = {
    inviteId: invite.id, email: invite.email,
    member: { id: 'member_1', name: '기존 멘티', status: 'PENDING', programName: null, accessExpiresAt: null },
    program: { id: 'program_1', name: '기존 프로그램' }, inviteExpiresAt: invite.expiresAt,
    accessExpiresAt: invite.expiresAt, resetPassword: true, previewToken: 'preview-state',
};

function response(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

async function renderInvites() {
    await act(async () => { root.render(createElement(InvitesTab)); });
}

async function enterEmails(value: string) {
    const input = container.querySelector<HTMLTextAreaElement>('#invites-email')!;
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
}

async function enterExpiry(value = '2026-12-31', selector = '#invites-expires-at') {
    const input = container.querySelector<HTMLInputElement>(selector)!;
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
}

async function click(selector: string) {
    await act(async () => { container.querySelector<HTMLButtonElement>(selector)!.click(); });
}

async function issue() {
    await act(async () => {
        container.querySelector<HTMLButtonElement>('#invites-issue-submit')!.click();
    });
}

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => { resolve = done; });
    return { promise, resolve };
}

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-16T15:30:00Z'));
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function (this: HTMLDialogElement) { this.open = true; } });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function (this: HTMLDialogElement) { this.open = false; } });
    postMock.mockImplementation(async () => response({ success: true, emailSent: true, code: 'NEW-CODE' }));
    deleteMock.mockImplementation(async () => response({ success: true }));
    patchMock.mockImplementation(async (body) => response({ success: true, invite: { id: body.id, expiresAt: `${body.expiresAt}T14:59:59.999Z` } }));
    linkPreviewMock.mockImplementation(async () => response({ preview: linkPreview }));
    linkPostMock.mockImplementation(async () => response({ success: true }));
    fetchMock.mockImplementation(async (url: string, options?: RequestInit) => {
        if (url.endsWith('/link')) return options?.method === 'POST'
            ? linkPostMock(JSON.parse(options.body as string)) : linkPreviewMock();
        if (options?.method === 'POST') return postMock(JSON.parse(options.body as string));
        if (options?.method === 'DELETE') return deleteMock(JSON.parse(options.body as string));
        if (options?.method === 'PATCH') return patchMock(JSON.parse(options.body as string));
        return response(url === '/api/programs' ? { programs } : { invites: [invite], canLinkExistingMember: true });
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(async () => {
    await act(async () => { root.unmount(); });
    container.remove();
    vi.resetAllMocks();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

it('여러 줄 이메일 입력란을 표시한다', async () => {
    await renderInvites();
    expect(container.querySelector('#invites-email')?.tagName).toBe('TEXTAREA');
});

it('기한만 저장해도 첫 로그인 전 코드는 미사용 상태를 유지한다', async () => {
    patchMock.mockResolvedValueOnce(response({ success: true, invite: {
        id: invite.id, expiresAt: '2099-02-01T14:59:59.999Z', usedAt: null,
    } }));
    await renderInvites();
    await click('#invites-expiry-existing');
    await enterExpiry('2099-02-01', '#invites-expiry-input-existing');
    await click('#invites-expiry-save-existing');

    expect(container.querySelector('table')!.textContent).not.toContain('사용됨');
    expect(container.querySelector('#invites-revoke-existing')).not.toBeNull();
    expect(container.querySelector('#invites-link-existing')).not.toBeNull();
    expect(container.querySelector('#invites-expiry-existing')!.textContent).toContain('2099-02-01');
});

it('기존 회원 연결은 관리자 권한과 유효한 미연결 초대에만 표시한다', async () => {
    fetchMock.mockImplementation(async (url: string) => response(url === '/api/programs' ? { programs } : {
        canLinkExistingMember: true, invites: [invite,
            { ...invite, id: 'used', usedAt: '2026-09-01T00:00:00Z' },
            { ...invite, id: 'linked', usedById: 'member_1' },
            { ...invite, id: 'expired', expiresAt: '2020-01-01T00:00:00Z' },
        ],
    }));
    await renderInvites();
    expect(container.querySelector('#invites-link-existing')).not.toBeNull();
    for (const id of ['used', 'linked', 'expired']) expect(container.querySelector(`#invites-link-${id}`)).toBeNull();
    expect(container.querySelector('table')!.textContent).toContain('첫 접속 대기');
    await act(async () => { root.render(null); });
    fetchMock.mockImplementation(async (url: string) => response(url === '/api/programs' ? { programs } : { invites: [invite], canLinkExistingMember: false }));
    await renderInvites();
    expect(container.querySelector('#invites-link-existing')).toBeNull();
});

it('회원과 기한·기존 자료 보존·로그인 해제 영향을 확인하기 전에는 연결할 수 없다', async () => {
    await renderInvites();
    await click('#invites-link-existing');
    expect(container.querySelector<HTMLDialogElement>('dialog')!.open).toBe(true);
    expect(document.activeElement?.id).toBe('invite-member-link-title');
    for (const text of ['기존 멘티', invite.email, '승인 대기 → 승인', '미배정', '기존 프로그램', '2099-01-01', '기존 프로젝트·작성 자료', '비밀번호를 무효화', '기존 로그인은 모두 해제', '최초 접속 기한 안에']) {
        expect(container.querySelector('dialog')!.textContent).toContain(text);
    }
    expect(container.querySelector<HTMLButtonElement>('#invite-member-link-submit')!.disabled).toBe(true);
    expect(container.querySelector<HTMLButtonElement>('#invites-expiry-existing')!.disabled).toBe(true);
    await click('#invite-member-link-submit');
    expect(linkPostMock).not.toHaveBeenCalled();
    await click('#invite-member-link-close');
    expect(container.querySelector('dialog')).toBeNull();
    expect(container.querySelector<HTMLButtonElement>('#invites-expiry-existing')!.disabled).toBe(false);
    expect(document.activeElement?.id).toBe('invites-link-existing');
});

it('승인된 회원은 비밀번호 유지와 로그인 해제 영향을 안내한다', async () => {
    linkPreviewMock.mockResolvedValueOnce(response({ preview: { ...linkPreview, resetPassword: false, member: { ...linkPreview.member, status: 'APPROVED', programName: '기존 프로그램' } } }));
    await renderInvites(); await click('#invites-link-existing');
    expect(container.querySelector('dialog')!.textContent).toContain('기존 비밀번호는 유지됩니다.');
    expect(container.querySelector('dialog')!.textContent).not.toContain('비밀번호를 무효화');
    expect(container.querySelector('dialog')!.textContent).toContain('기존 로그인은 모두 해제');
});

it('신원 확인 후 연결을 한 번만 보내고 응답 전 닫기·회수·기한 변경을 막는다', async () => {
    const pending = deferred<Response>();
    linkPostMock.mockImplementationOnce(() => pending.promise);
    await renderInvites(); await click('#invites-link-existing'); await click('#invite-member-link-confirm');
    await act(async () => {
        const button = container.querySelector<HTMLButtonElement>('#invite-member-link-submit')!;
        button.click(); button.click();
    });
    expect(linkPostMock).toHaveBeenCalledExactlyOnceWith({ memberId: 'member_1', previewToken: 'preview-state', confirmIdentity: true });
    for (const selector of ['#invite-member-link-close', '#invite-member-link-confirm', '#invite-member-link-submit', '#invites-revoke-existing', '#invites-expiry-existing']) {
        expect(container.querySelector<HTMLInputElement>(selector)!.disabled, selector).toBe(true);
    }
    await act(async () => { container.querySelector('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true })); });
    expect(container.querySelector('dialog')).not.toBeNull();
    fetchMock.mockImplementation(async (url: string) => response(url === '/api/programs' ? { programs } : { invites: [{ ...invite, usedById: 'member_1' }], canLinkExistingMember: true }));
    await act(async () => { pending.resolve(response({ success: true })); });
    expect(container.querySelector('dialog')).toBeNull();
    expect(container.querySelector('table')!.textContent).toContain('첫 접속 대기');
    expect(container.querySelector('#invites-link-existing')).toBeNull();
    expect(container.querySelector('[role="status"]')!.textContent).toContain('기존 회원을 연결했습니다.');
});

it.each(['http', 'network'])('연결 %s 실패는 미리보기와 확인을 초기화하고 다시 확인해야 재시도한다', async (failure) => {
    if (failure === 'http') linkPostMock.mockResolvedValueOnce(response({ error: '회원 정보가 변경되었습니다.' }, 409));
    else linkPostMock.mockRejectedValueOnce(new Error('network unavailable'));
    await renderInvites(); await click('#invites-link-existing'); await click('#invite-member-link-confirm'); await click('#invite-member-link-submit');
    expect(container.querySelector('#invite-member-link-submit')).toBeNull();
    expect(container.querySelector('dialog [role="alert"]')!.textContent).toContain(failure === 'http' ? '회원 정보가 변경' : '연결 결과를 확인하지');
    expect(linkPostMock).toHaveBeenCalledTimes(1);
    await click('#invite-member-link-retry');
    expect(linkPreviewMock).toHaveBeenCalledTimes(2);
    expect(container.querySelector<HTMLInputElement>('#invite-member-link-confirm')!.checked).toBe(false);
    expect(container.querySelector<HTMLButtonElement>('#invite-member-link-submit')!.disabled).toBe(true);
});

it('연결 미리보기 오류를 안내하고 취소된 조회 응답은 다시 연 대화상자에 반영하지 않는다', async () => {
    linkPreviewMock.mockResolvedValueOnce(response({ error: '연결할 기존 회원이 없습니다.' }, 404));
    await renderInvites(); await click('#invites-link-existing');
    expect(container.querySelector('dialog [role="alert"]')!.textContent).toContain('연결할 기존 회원이 없습니다.');
    const pending = deferred<Response>();
    linkPreviewMock.mockImplementationOnce(() => pending.promise);
    await click('#invite-member-link-retry'); await click('#invite-member-link-close'); await click('#invites-link-existing');
    await act(async () => { pending.resolve(response({ preview: { ...linkPreview, email: 'stale@example.test' } })); });
    expect(container.querySelector('dialog')!.textContent).toContain(invite.email);
    expect(container.querySelector('dialog')!.textContent).not.toContain('stale@example.test');
});

it('연결된 첫 접속 대기 회원의 이용만료일을 넘기는 연장을 막고 회수 영향을 안내한다', async () => {
    fetchMock.mockImplementation(async (url: string) => response(url === '/api/programs' ? { programs } : {
        invites: [{ ...invite, usedById: 'member_1', accessExpiresAt: '2099-03-01T14:59:59.999Z' }], canLinkExistingMember: true,
    }));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await renderInvites(); await click('#invites-expiry-existing'); await enterExpiry('2099-04-01', '#invites-expiry-input-existing');
    expect(container.querySelector<HTMLInputElement>('#invites-expiry-input-existing')!.max).toBe('2099-03-01');
    expect(container.querySelector<HTMLButtonElement>('#invites-expiry-save-existing')!.disabled).toBe(true);
    expect(container.querySelector('[role="alert"]')!.textContent).toContain('회원 이용만료일');
    await click('#invites-revoke-existing');
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('연결된 회원의 첫 접속도 차단됩니다.'));
    expect(deleteMock).not.toHaveBeenCalled();
});

it('기존 발급 코드가 관리자 목록에 표시된다', async () => {
    await renderInvites();
    expect(container.querySelector('table')!.textContent).toContain('EXISTING-CODE');
});

it('매니저의 코드 없는 응답도 발급 성공으로 표시하고 재발송을 안내한다', async () => {
    fetchMock.mockImplementation(async (url: string, options?: RequestInit) => {
        if (options?.method === 'POST') return response({ success: true, emailSent: false });
        return response(url === '/api/programs' ? { programs } : { invites: [{ ...invite, code: undefined }] });
    });
    await renderInvites();
    expect(container.querySelector('table')!.textContent).toContain('관리자만 열람 가능');
    expect(container.textContent).not.toContain('EXISTING-CODE');
    await enterEmails('mentee@example.com');
    await enterExpiry();
    await issue();
    expect(container.textContent).toContain('코드 발급 완료');
    expect(container.textContent).toContain('목록에서 메일을 재발송하거나 관리자에게 문의하세요.');
    expect(container.textContent).not.toContain('직접 전달하세요');
    expect(container.querySelector<HTMLTextAreaElement>('#invites-email')!.value).toBe('');
    expect(container.querySelector('#invites-resend-existing')).not.toBeNull();
});

it('유효 이메일 여러 개를 중복 없이 발급하고 잘못된 입력은 남긴다', async () => {
    await renderInvites();
    await enterEmails('ONE@example.com\ntwo@example.com;one@EXAMPLE.com, not-email');
    await enterExpiry();
    expect(container.textContent).toContain('not-email');
    expect(container.textContent).toMatch(/중복/);
    await issue();
    expect(postMock.mock.calls.map(([body]) => body)).toEqual([
        { email: 'one@example.com', role: 'MENTEE', programId: 'program_1', expiresAt: '2026-12-31' },
        { email: 'two@example.com', role: 'MENTEE', programId: 'program_1', expiresAt: '2026-12-31' },
    ]);
    expect(container.querySelector<HTMLTextAreaElement>('#invites-email')!.value).toBe('not-email');
    expect(container.textContent).toContain('NEW-CODE');
});

it('메일 성공·메일 실패·HTTP 실패를 구분하고 발급된 코드와 실패 입력을 보존한다', async () => {
    postMock.mockResolvedValueOnce(response({ success: true, emailSent: true, code: 'SENT-CODE' }));
    postMock.mockResolvedValueOnce(response({ success: true, emailSent: false, code: 'MANUAL-CODE' }));
    postMock.mockResolvedValueOnce(response({ error: '이미 가입된 이메일입니다.' }, 409));
    await renderInvites();
    await enterEmails('sent@example.com mailfailed@example.com httpfailed@example.com');
    await enterExpiry();
    await issue();
    expect(postMock).toHaveBeenCalledTimes(3);
    expect(container.textContent).toContain('SENT-CODE');
    expect(container.textContent).toContain('MANUAL-CODE');
    expect(container.textContent).toContain('이미 가입된 이메일입니다.');
    expect(container.querySelector<HTMLTextAreaElement>('#invites-email')!.value).toBe('httpfailed@example.com');
    expect(container.querySelector<HTMLButtonElement>('#invites-issue-submit')!.disabled).toBe(false);
});

it('발급 응답을 기다리는 동안 입력·프로그램·추가 발급·회수를 잠그고 요청을 순서대로 보낸다', async () => {
    const first = deferred<Response>();
    postMock.mockImplementationOnce(() => first.promise);
    await renderInvites();
    await enterEmails('first@example.com second@example.com');
    await enterExpiry();
    await issue();
    expect(postMock).toHaveBeenCalledTimes(1);
    expect(container.querySelector<HTMLTextAreaElement>('#invites-email')!.disabled).toBe(true);
    expect(container.querySelector<HTMLSelectElement>('#invites-program')!.disabled).toBe(true);
    expect(container.querySelector<HTMLInputElement>('#invites-expires-at')!.disabled).toBe(true);
    expect(container.querySelector<HTMLButtonElement>('#invites-expiry-existing')!.disabled).toBe(true);
    expect(container.querySelector<HTMLButtonElement>('#invites-issue-submit')!.disabled).toBe(true);
    expect(container.querySelector<HTMLButtonElement>('#invites-revoke-existing')!.disabled).toBe(true);
    await issue();
    await act(async () => { container.querySelector<HTMLButtonElement>('#invites-revoke-existing')!.click(); });
    expect(deleteMock).not.toHaveBeenCalled();
    expect(postMock).toHaveBeenCalledTimes(1);
    await act(async () => { first.resolve(response({ success: true, emailSent: true, code: 'FIRST-CODE' })); });
    expect(postMock).toHaveBeenCalledTimes(2);
    expect(container.querySelector<HTMLTextAreaElement>('#invites-email')!.disabled).toBe(false);
    expect(container.querySelector<HTMLTextAreaElement>('#invites-email')!.value).toBe('');
    expect(container.querySelector<HTMLSelectElement>('#invites-program')!.disabled).toBe(false);
    expect(container.querySelector<HTMLButtonElement>('#invites-revoke-existing')!.disabled).toBe(false);
});

it('회수 응답을 기다리는 동안 신규 발급을 막고 회수 완료 후 풀어 준다', async () => {
    const pending = deferred<Response>();
    deleteMock.mockImplementationOnce(() => pending.promise);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await renderInvites();
    await enterEmails('next@example.com');
    await enterExpiry();
    await act(async () => { container.querySelector<HTMLButtonElement>('#invites-revoke-existing')!.click(); });
    expect(deleteMock).toHaveBeenCalledWith({ id: 'existing' });
    expect(container.querySelector<HTMLButtonElement>('#invites-issue-submit')!.disabled).toBe(true);
    expect(container.querySelector<HTMLTextAreaElement>('#invites-email')!.disabled).toBe(true);
    await issue();
    expect(postMock).not.toHaveBeenCalled();
    await act(async () => { pending.resolve(response({ success: true })); });
    expect(container.querySelector<HTMLButtonElement>('#invites-issue-submit')!.disabled).toBe(false);
    expect(container.querySelector<HTMLTextAreaElement>('#invites-email')!.value).toBe('next@example.com');
});

it('101명 입력은 발급을 시작하지 않으며 원문을 보존한다', async () => {
    await renderInvites();
    const input = Array.from({ length: 101 }, (_, index) => `mentee${index}@example.com`).join('\n');
    await enterEmails(input);
    await enterExpiry();
    expect(container.querySelector<HTMLButtonElement>('#invites-issue-submit')!.disabled).toBe(true);
    expect(container.textContent).toContain('100');
    await issue();
    expect(postMock).not.toHaveBeenCalled();
    expect(container.querySelector<HTMLTextAreaElement>('#invites-email')!.value).toBe(input);
});

it('유효 주소가 없으면 발급하지 않는다', async () => {
    await renderInvites();
    await enterEmails('invalid, another-invalid');
    await enterExpiry();
    expect(container.querySelector<HTMLButtonElement>('#invites-issue-submit')!.disabled).toBe(true);
    await issue();
    expect(postMock).not.toHaveBeenCalled();
});

it('현재 프로그램이 없어도 기존 코드 목록은 읽을 수 있다', async () => {
    fetchMock.mockImplementation(async (url: string) => response(url === '/api/programs'
        ? { programs: [] } : { invites: [invite] }));
    await renderInvites();
    expect(container.querySelector('table')?.textContent).toContain('EXISTING-CODE');
    expect(container.textContent).toContain('프로그램');
    expect(container.querySelector<HTMLButtonElement>('#invites-issue-submit')?.disabled ?? true).toBe(true);
});

it.each(['http', 'network'])('프로그램 목록 %s 실패가 초대 코드 열람을 가리지 않는다', async (failure) => {
    fetchMock.mockImplementation(async (url: string) => {
        if (url !== '/api/programs') return response({ invites: [invite] });
        if (failure === 'network') throw new Error('program network unavailable');
        return response({ error: '프로그램 조회 실패' }, 500);
    });
    await renderInvites();
    expect(container.querySelector('table')?.textContent).toContain('EXISTING-CODE');
    expect(container.textContent).toMatch(/프로그램.*불러오지/);
    expect(container.querySelector<HTMLButtonElement>('#invites-issue-submit')?.disabled ?? true).toBe(true);
});

it('사용되거나 만료된 코드도 목록에서 확인할 수 있다', async () => {
    fetchMock.mockImplementation(async (url: string) => response(url === '/api/programs' ? { programs } : {
        invites: [invite,
            { ...invite, id: 'used', code: 'USED-CODE', usedAt: '2026-09-01T00:00:00Z' },
            { ...invite, id: 'expired', code: 'EXPIRED-CODE', expiresAt: '2020-01-01T00:00:00Z' },
        ],
    }));
    await renderInvites();
    expect(container.querySelector('table')!.textContent).toContain('USED-CODE');
    expect(container.querySelector('table')!.textContent).toContain('EXPIRED-CODE');
    expect(container.querySelector('#invites-revoke-used')).toBeNull();
    expect(container.querySelector('#invites-revoke-expired')).toBeNull();
});

it('발급 도중 화면을 벗어나면 미처리 주소에 대한 요청을 시작하지 않는다', async () => {
    const first = deferred<Response>();
    postMock.mockImplementationOnce(() => first.promise);
    await renderInvites();
    await enterEmails('first@example.com second@example.com');
    await enterExpiry();
    await issue();
    await act(async () => { root.render(null); });
    await act(async () => { first.resolve(response({ success: true, emailSent: true, code: 'FIRST-CODE' })); });
    expect(postMock).toHaveBeenCalledTimes(1);
});

it('같은 렌더링 사이에 발급 버튼을 두 번 눌러도 같은 주소를 중복 발급하지 않는다', async () => {
    const pending = deferred<Response>();
    postMock.mockImplementationOnce(() => pending.promise);
    await renderInvites();
    await enterEmails('once@example.com');
    await enterExpiry();
    await act(async () => {
        const button = container.querySelector<HTMLButtonElement>('#invites-issue-submit')!;
        button.click();
        button.click();
    });
    expect(postMock).toHaveBeenCalledTimes(1);
    await act(async () => { pending.resolve(response({ success: true, emailSent: true, code: 'ONCE-CODE' })); });
    expect(postMock).toHaveBeenCalledTimes(1);
});

it('목록 재조회가 실패해도 성공 코드를 유지하고 성공 주소를 입력에 되돌리지 않는다', async () => {
    await renderInvites();
    await enterEmails('sent@example.com');
    await enterExpiry();
    fetchMock.mockImplementation(async (url: string, options?: RequestInit) => {
        if (options?.method === 'POST') return postMock(JSON.parse(options.body as string));
        if (url === '/api/programs') return response({ programs });
        throw new Error('reload unavailable');
    });
    await issue();
    expect(container.textContent).toContain('NEW-CODE');
    expect(container.querySelector('table')!.textContent).toContain('EXISTING-CODE');
    expect(container.textContent).toContain('초대 코드 목록을 불러오지 못했습니다.');
    expect(container.querySelector<HTMLTextAreaElement>('#invites-email')!.value).toBe('');
    expect(container.querySelector<HTMLTextAreaElement>('#invites-email')!.disabled).toBe(false);
    expect(postMock).toHaveBeenCalledTimes(1);
});

it('모든 발급의 네트워크 응답이 실패하면 주소를 보존하고 자동으로 다시 발급하지 않는다', async () => {
    postMock.mockRejectedValue(new Error('network unavailable'));
    await renderInvites();
    await enterEmails('one@example.com\ntwo@example.com');
    await enterExpiry();
    await issue();
    expect(postMock).toHaveBeenCalledTimes(2);
    expect(container.querySelector<HTMLTextAreaElement>('#invites-email')!.value).toBe('one@example.com\ntwo@example.com');
    expect(container.querySelector<HTMLButtonElement>('#invites-issue-submit')!.disabled).toBe(false);
    expect(container.textContent).toContain('실패 2건');
});

it('선택을 바꾼 프로그램에 모든 주소를 발급하고 재조회 후에도 선택을 유지한다', async () => {
    const selectable = [...programs, { id: 'program_2', name: '두 번째 프로그램', organization: '다른 기관', endsAt: '2098-10-31T14:59:59.999Z' }];
    fetchMock.mockImplementation(async (url: string, options?: RequestInit) => {
        if (options?.method === 'POST') return postMock(JSON.parse(options.body as string));
        return response(url === '/api/programs' ? { programs: selectable } : { invites: [invite] });
    });
    await renderInvites();
    await act(async () => {
        const select = container.querySelector<HTMLSelectElement>('#invites-program')!;
        select.value = 'program_2';
        select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await enterEmails('one@example.com two@example.com');
    await enterExpiry();
    await issue();
    expect(postMock.mock.calls.map(([body]) => body.programId)).toEqual(['program_2', 'program_2']);
    expect(container.querySelector<HTMLSelectElement>('#invites-program')!.value).toBe('program_2');
    expect(container.querySelector<HTMLInputElement>('#invites-expires-at')!.max).toBe('2098-10-31');
});

it('신규 이용 기한은 빈 필수 입력이며 한국 시간 오늘과 프로그램 종료일을 범위로 표시한다', async () => {
    await renderInvites();
    await enterEmails('mentee@example.com');
    const input = container.querySelector<HTMLInputElement>('#invites-expires-at')!;
    expect(input.type).toBe('date');
    expect(input.value).toBe('');
    expect(input.required).toBe(true);
    expect(input.min).toBe('2026-09-17');
    expect(input.max).toBe('2099-12-31');
    expect(container.textContent).toContain('최초 접속');
    expect(container.textContent).toContain('회원관리에서 더 길게 조정');
    expect(container.textContent).toContain('한국 시간');
    expect(container.querySelector<HTMLButtonElement>('#invites-issue-submit')!.disabled).toBe(true);
    await issue();
    expect(postMock).not.toHaveBeenCalled();
    await enterExpiry('2026-09-17');
    expect(container.querySelector<HTMLButtonElement>('#invites-issue-submit')!.disabled).toBe(false);
});

it.each([
    ['2026-09-16', '오늘 이후'],
    ['2100-01-01', '프로그램 종료일'],
])('신규 기한 %s는 범위 안내와 함께 발급을 차단한다', async (date, error) => {
    await renderInvites();
    await enterEmails('mentee@example.com');
    await enterExpiry(date);
    expect(container.querySelector<HTMLButtonElement>('#invites-issue-submit')!.disabled).toBe(true);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(error);
    await issue();
    expect(postMock).not.toHaveBeenCalled();
});

it.each([
    ['대기', '2098-12-31T15:30:00Z', null, '2099-01-01'],
    ['만료', '2020-01-01T15:30:00Z', null, '2020-01-02'],
    ['사용됨', '2098-12-31T15:30:00Z', '2026-09-01T00:00:00Z', '2099-01-01'],
])('%s 코드의 한국 시간 날짜를 눌러 수정하고 취소할 수 있다', async (status, expiresAt, usedAt, date) => {
    fetchMock.mockImplementation(async (url: string) => response(url === '/api/programs' ? { programs } : {
        invites: [{ ...invite, expiresAt, usedAt }],
    }));
    await renderInvites();
    expect(container.querySelector('#invites-expiry-existing')?.textContent).toBe(date);
    await click('#invites-expiry-existing');
    const input = container.querySelector<HTMLInputElement>('#invites-expiry-input-existing')!;
    expect(input.value).toBe(date);
    expect(input.min).toBe('2026-09-17');
    expect(input.max).toBe('2099-12-31');
    await enterExpiry('2099-02-01', '#invites-expiry-input-existing');
    await click('#invites-expiry-cancel-existing');
    expect(container.querySelector('#invites-expiry-input-existing')).toBeNull();
    expect(container.querySelector('#invites-expiry-existing')?.textContent).toBe(date);
    expect(container.querySelector('table')?.textContent).toContain(status);
    expect(patchMock).not.toHaveBeenCalled();
});

it('만료 코드의 기한을 저장하면 코드 유지와 대기 상태를 즉시 표시하고 메일을 보내지 않는다', async () => {
    fetchMock.mockImplementation(async (url: string, options?: RequestInit) => {
        if (options?.method === 'PATCH') return patchMock(JSON.parse(options.body as string));
        return response(url === '/api/programs' ? { programs } : { invites: [{ ...invite, expiresAt: '2020-01-01T00:00:00Z' }] });
    });
    await renderInvites();
    await click('#invites-expiry-existing');
    await enterExpiry('2026-12-31', '#invites-expiry-input-existing');
    await click('#invites-expiry-save-existing');
    expect(patchMock).toHaveBeenCalledExactlyOnceWith({ id: 'existing', expiresAt: '2026-12-31' });
    expect(container.querySelector('#invites-expiry-existing')?.textContent).toBe('2026-12-31');
    expect(container.querySelector('table')?.textContent).toContain('EXISTING-CODE');
    expect(container.querySelector('table')?.textContent).toContain('대기');
    expect(container.querySelector('table')?.textContent).not.toContain('만료');
    expect(container.querySelector('#invites-resend-existing')).not.toBeNull();
    expect(fetchMock.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false);
});

it.each(['http', 'network'])('기한 저장 %s 실패 후 원래 기한과 수정 입력을 보존하여 재시도할 수 있다', async (failure) => {
    if (failure === 'http') patchMock.mockResolvedValueOnce(response({ error: '현재 기한보다 이후 날짜를 선택하세요.' }, 400));
    else patchMock.mockRejectedValueOnce(new Error('network unavailable'));
    await renderInvites();
    await click('#invites-expiry-existing');
    await enterExpiry('2099-02-01', '#invites-expiry-input-existing');
    await click('#invites-expiry-save-existing');
    expect(container.querySelector<HTMLInputElement>('#invites-expiry-input-existing')!.value).toBe('2099-02-01');
    expect(container.querySelector<HTMLButtonElement>('#invites-expiry-save-existing')!.disabled).toBe(false);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(failure === 'http' ? '현재 기한보다' : '기한 저장');
    expect(patchMock).toHaveBeenCalledTimes(1);
    await click('#invites-expiry-cancel-existing');
    expect(container.querySelector('#invites-expiry-existing')?.textContent).toBe('2099-01-01');
    await click('#invites-expiry-existing');
    await enterExpiry('2099-02-01', '#invites-expiry-input-existing');
    await click('#invites-expiry-save-existing');
    expect(container.querySelector('#invites-expiry-existing')?.textContent).toBe('2099-02-01');
});

it('기한 저장을 두 번 눌러도 한 번만 요청하고 완료 전 모든 변경 동작을 잠근다', async () => {
    const pending = deferred<Response>();
    patchMock.mockImplementationOnce(() => pending.promise);
    await renderInvites();
    await enterEmails('mentee@example.com');
    await enterExpiry();
    await click('#invites-expiry-existing');
    await enterExpiry('2099-02-01', '#invites-expiry-input-existing');
    await act(async () => {
        const button = container.querySelector<HTMLButtonElement>('#invites-expiry-save-existing')!;
        button.click();
        button.click();
    });
    expect(patchMock).toHaveBeenCalledTimes(1);
    for (const selector of ['#invites-email', '#invites-program', '#invites-expires-at', '#invites-issue-submit',
        '#invites-expiry-input-existing', '#invites-expiry-save-existing', '#invites-expiry-cancel-existing',
        '#invites-revoke-existing', '#invites-resend-existing']) {
        expect(container.querySelector<HTMLInputElement>(selector)!.disabled, selector).toBe(true);
    }
    await click('#invites-revoke-existing');
    await click('#invites-resend-existing');
    await issue();
    expect(deleteMock).not.toHaveBeenCalled();
    expect(postMock).not.toHaveBeenCalled();
    await act(async () => { pending.resolve(response({ success: true, invite: { id: 'existing', expiresAt: '2099-02-01T14:59:59.999Z' } })); });
    expect(container.querySelector('#invites-expiry-existing')?.textContent).toBe('2099-02-01');
    expect(container.querySelector<HTMLButtonElement>('#invites-issue-submit')!.disabled).toBe(false);
});
