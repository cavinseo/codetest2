// 저장 안 된 변경이 있을 때 새로고침·링크·뒤로 가기를 막는 공통 훅을 실제 React DOM 으로
// 확인한다(2026-10-25 코드 리뷰 D6 — QFD 표와 멘토 분석의 중복을 합침).
// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { useLeaveGuard, type LeaveGuardOptions } from '../components/project/useLeaveGuard';

let container: HTMLDivElement;
let root: Root;
let confirmMock: MockInstance<typeof window.confirm>;
const MESSAGE = '저장하지 않고 이동할까요?';

function Probe(props: LeaveGuardOptions) {
    useLeaveGuard(props);
    return createElement('div', null,
        createElement('a', { href: '/elsewhere', id: 'link' }, '다른 곳'),
        createElement('a', { href: '/file.xlsx', id: 'download', download: '' }, '받기'),
        createElement('a', { href: '/new-tab', id: 'blank', target: '_blank' }, '새 탭'),
    );
}

async function render(props: Partial<LeaveGuardOptions> = {}) {
    await act(async () => {
        root.render(createElement(Probe, { enabled: true, message: MESSAGE, ...props }));
    });
}

/**
 * 링크를 눌렀을 때 이동이 막혔는지(true) 돌려준다. 훅을 지나온 클릭은 여기서 기본 동작을 끊어
 * jsdom 이 실제로 이동하려 들지 않게 한다. 훅이 막은 클릭은 전파가 멈춰 여기까지 오지 않는다.
 */
function click(id: string, init: MouseEventInit = {}) {
    let blocked = true;
    const record = (event: Event) => { blocked = event.defaultPrevented; event.preventDefault(); };
    document.addEventListener('click', record);
    container.querySelector(`#${id}`)!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init }));
    document.removeEventListener('click', record);
    return blocked;
}

function unload() {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
}

beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    confirmMock = vi.spyOn(window, 'confirm').mockReturnValue(false);
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
});

afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('useLeaveGuard (D6)', () => {
    it('변경이 있으면 새로고침을 막고, 링크는 확인에서 취소하면 막는다', async () => {
        await render();
        expect(unload()).toBe(true);

        confirmMock.mockReturnValue(false);
        expect(click('link')).toBe(true);
        expect(confirmMock).toHaveBeenCalledWith(MESSAGE);

        confirmMock.mockReturnValue(true);
        expect(click('link')).toBe(false);
    });

    it('꺼져 있으면 아무것도 막지 않는다', async () => {
        await render({ enabled: false });

        expect(unload()).toBe(false);
        expect(click('link')).toBe(false);
        expect(confirmMock).not.toHaveBeenCalled();
    });

    it('isDirty 가 false 면 묻지 않고 보낸다', async () => {
        const isDirty = vi.fn(() => false);
        await render({ isDirty });

        expect(unload()).toBe(false);
        expect(click('link')).toBe(false);
        expect(confirmMock).not.toHaveBeenCalled();

        isDirty.mockReturnValue(true);
        confirmMock.mockReturnValue(false);
        expect(unload()).toBe(true);
        expect(click('link')).toBe(true);
    });

    it('새 탭·다운로드·보조키 클릭은 이 페이지를 떠나지 않으므로 묻지 않는다', async () => {
        await render();

        expect(click('download')).toBe(false);
        expect(click('blank')).toBe(false);
        expect(click('link', { ctrlKey: true })).toBe(false);
        expect(click('link', { button: 1 })).toBe(false);
        expect(confirmMock).not.toHaveBeenCalled();
    });

    it('뒤로 가기를 취소하면 주소를 되돌리고, 다른 popstate 처리로 넘기지 않는다', async () => {
        const pushState = vi.spyOn(window.history, 'pushState');
        const later = vi.fn();
        window.addEventListener('popstate', later);
        await render();

        confirmMock.mockReturnValue(false);
        window.dispatchEvent(new PopStateEvent('popstate'));
        expect(pushState).toHaveBeenCalledWith(null, '', window.location.href);
        expect(later).not.toHaveBeenCalled();

        confirmMock.mockReturnValue(true);
        window.dispatchEvent(new PopStateEvent('popstate'));
        expect(later).toHaveBeenCalledOnce();
        expect(pushState).toHaveBeenCalledOnce();

        window.removeEventListener('popstate', later);
    });

    it('confirmBack 을 주면 confirm 대신 그것으로 뒤로 가기를 묻는다(멘토 분석의 대화상자)', async () => {
        const pushState = vi.spyOn(window.history, 'pushState');
        const confirmBack = vi.fn(() => false);
        await render({ confirmBack });

        window.dispatchEvent(new PopStateEvent('popstate'));
        expect(confirmBack).toHaveBeenCalledOnce();
        expect(confirmMock).not.toHaveBeenCalled();
        expect(pushState).toHaveBeenCalledOnce();

        confirmBack.mockReturnValue(true);
        window.dispatchEvent(new PopStateEvent('popstate'));
        expect(pushState).toHaveBeenCalledOnce();
    });

    it('화면이 사라지면 리스너를 걷어낸다', async () => {
        await render();
        await act(async () => root.render(createElement('div')));

        expect(unload()).toBe(false);
    });
});
