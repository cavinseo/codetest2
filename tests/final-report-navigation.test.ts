// 보고서 교정 중 뒤로·앞으로가기 취소와 재개가 편집 및 목적지 이력을 보존하는지 검증한다.
// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import FinalReportPage from '../app/project/[id]/report/page';

const m = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'project' }), useRouter: () => m }));
vi.mock('next/link', () => ({ default: (props: any) => createElement('a', props) }));
vi.mock('../components/project/FitnessWrapper', () => ({ default: () => null }));
vi.mock('../components/project/QFDMatrix', () => ({ default: () => null }));
vi.mock('../components/project/KanoSatisfactionGraph', () => ({ default: () => null }));
vi.mock('../components/project/FinalReportPreview', () => ({ default: ({ blocks, onEdit }: any) => createElement('textarea', {
    'aria-label': '보고서 교정', value: blocks[0].text,
    onChange: (event: { target: { value: string } }) => onEdit({ kind: 'text', blockIndex: 0, text: event.target.value }),
}) }));

const reportPath = '/project/project/report';
const destinations: Record<string, string> = { back: '/project/project?from=back#section', report: reportPath, forward: '/dashboard?from=forward' };
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
let container: HTMLDivElement;
let root: Root;
let navigation: EventTarget & { currentEntry: { key: string }; traverseTo: ReturnType<typeof vi.fn> };
let routing: ReturnType<typeof vi.fn<() => void>>;
const fetchMock = vi.fn();

function traverse(key: string, cancelable = true) {
    const event = Object.assign(new Event('navigate', { cancelable }), {
        navigationType: 'traverse', destination: { key, sameDocument: true, url: `${window.location.origin}${destinations[key]}` },
    });
    navigation.dispatchEvent(event);
    if (!event.defaultPrevented) {
        navigation.currentEntry = { key };
        window.history.replaceState({ key }, '', destinations[key]);
        window.dispatchEvent(new PopStateEvent('popstate', { state: { key } }));
    }
    return event;
}
beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    window.history.replaceState({ key: 'report' }, '', reportPath);
    navigation = Object.assign(new EventTarget(), { currentEntry: { key: 'report' }, traverseTo: vi.fn((key: string) => {
        traverse(key);
        return { finished: Promise.resolve() };
    }) });
    vi.stubGlobal('navigation', navigation);
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function () { this.open = true; } });
    fetchMock.mockImplementation(async (url: string) => json(url === '/api/projects/project/report' ? {
        version: 1, hasPublishedReport: false, hasUnpublishedChanges: false, publishedAt: null, updatedAt: null,
        canEdit: true, mentorName: '멘토', view: 'draft', draft: {
            document: { title: '보고서', blocks: [{ kind: 'paragraph', text: '기존 교정' }] }, previewNeedsRefresh: false,
        },
    } : {}));
    vi.stubGlobal('fetch', fetchMock);
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    routing = vi.fn();
    window.addEventListener('popstate', routing);
});
afterEach(async () => {
    await act(async () => root.unmount());
    window.removeEventListener('popstate', routing);
    container.remove();
    vi.restoreAllMocks();
    vi.resetAllMocks();
    vi.unstubAllGlobals();
});
async function edit() {
    await act(async () => root.render(createElement(FinalReportPage)));
    const input = container.querySelector<HTMLTextAreaElement>('[aria-label="보고서 교정"]')!;
    expect(input).not.toBeNull();
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, '저장 전 교정');
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
}
async function click(text: string) {
    const button = [...container.querySelectorAll('button')].find(node => node.textContent?.trim() === text);
    expect(button).toBeDefined();
    await act(async () => button!.click());
}

it.each(['back', 'forward'])('%s 이동을 취소하면 URL·교정을 보존하고 다시 확인하면 원래 이력으로 이동한다', async key => {
    await edit();
    const pushState = vi.spyOn(window.history, 'pushState');
    await act(async () => { expect(traverse(key).defaultPrevented).toBe(true); });
    expect(window.location.pathname).toBe(reportPath);
    expect(container.querySelector('dialog')?.open).toBe(true);
    await click('취소');
    expect(container.querySelector('dialog')).toBeNull();
    expect(container.querySelector<HTMLTextAreaElement>('[aria-label="보고서 교정"]')?.value).toBe('저장 전 교정');
    expect(navigation.traverseTo).not.toHaveBeenCalled();
    expect(routing).not.toHaveBeenCalled();
    await act(async () => { traverse(key); });
    await click('저장하지 않고 이동');
    expect(navigation.traverseTo).toHaveBeenCalledWith(key);
    expect(`${window.location.pathname}${window.location.search}${window.location.hash}`).toBe(destinations[key]);
    expect(routing).toHaveBeenCalledTimes(1);
    expect(pushState).not.toHaveBeenCalled();
    expect(m.push).not.toHaveBeenCalled();
});

it.each(['back', 'forward'])('취소 불가능한 %s popstate도 현재 이력으로 복귀하고 확인 후 원래 목적지를 재개한다', async key => {
    await edit();
    const pushState = vi.spyOn(window.history, 'pushState');
    await act(async () => { traverse(key, false); });
    expect(window.location.pathname).toBe(reportPath);
    expect(routing).not.toHaveBeenCalled();
    expect(container.querySelector('dialog')?.open).toBe(true);
    await click('저장하지 않고 이동');
    expect(navigation.traverseTo.mock.calls.map(([key]) => key)).toEqual(['report', key]);
    expect(`${window.location.pathname}${window.location.search}${window.location.hash}`).toBe(destinations[key]);
    expect(routing).toHaveBeenCalledTimes(1);
    expect(pushState).not.toHaveBeenCalled();
});

it.each(['back', 'forward'])('%s 복원 Promise 뒤에 popstate가 도착해도 원래 목적지 key를 유지한다', async key => {
    await edit();
    navigation.traverseTo.mockImplementationOnce((restoredKey: string) => {
        navigation.currentEntry = { key: restoredKey };
        window.history.replaceState({ key: restoredKey }, '', destinations[restoredKey]);
        return { finished: Promise.resolve() };
    });
    await act(async () => { traverse(key, false); });
    expect(window.location.pathname).toBe(reportPath);
    await act(async () => { window.dispatchEvent(new PopStateEvent('popstate', { state: { key: 'report' } })); });
    expect(routing).not.toHaveBeenCalled();
    expect(container.querySelector<HTMLTextAreaElement>('[aria-label="보고서 교정"]')?.value).toBe('저장 전 교정');
    await click('저장하지 않고 이동');
    expect(navigation.traverseTo.mock.calls.map(([key]) => key)).toEqual(['report', key]);
    expect(`${window.location.pathname}${window.location.search}${window.location.hash}`).toBe(destinations[key]);
    expect(routing).toHaveBeenCalledTimes(1);
});

it('저장된 보고서는 뒤로가기 확인 없이 이동한다', async () => {
    await edit();
    await click('초안 저장');
    await act(async () => { expect(traverse('back').defaultPrevented).toBe(false); });
    expect(container.querySelector('dialog')).toBeNull();
    expect(routing).toHaveBeenCalledTimes(1);
});

it('Navigation API가 없는 브라우저도 popstate 취소 시 교정을 보존하고 확인한 URL로 이동한다', async () => {
    vi.stubGlobal('navigation', undefined);
    await edit();
    const navigate = async () => act(async () => {
        window.history.replaceState({}, '', destinations.forward);
        window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
    });
    await navigate();
    expect(window.location.pathname).toBe(reportPath);
    await click('취소');
    expect(container.querySelector<HTMLTextAreaElement>('[aria-label="보고서 교정"]')?.value).toBe('저장 전 교정');
    await navigate();
    await click('저장하지 않고 이동');
    expect(m.replace).toHaveBeenCalledWith(destinations.forward);
});

it('일반 내부 링크도 같은 확인을 거쳐 원래 목적지로 이동한다', async () => {
    await edit();
    await act(async () => container.querySelector<HTMLAnchorElement>('a[href="/project/project"]')!.click());
    expect(container.querySelector('dialog')?.open).toBe(true);
    await click('저장하지 않고 이동');
    expect(m.push).toHaveBeenCalledWith('/project/project');
});

it('확인한 이동이 실패해도 교정 내용과 미저장 경고를 유지한다', async () => {
    await edit();
    await act(async () => { traverse('back'); });
    navigation.traverseTo.mockReturnValueOnce({ finished: Promise.reject(new Error('navigation failed')) });
    await click('저장하지 않고 이동');
    expect(container.querySelector<HTMLTextAreaElement>('[aria-label="보고서 교정"]')?.value).toBe('저장 전 교정');
    expect(container.textContent).toContain('이동하지 못했습니다. 현재 입력은 유지됩니다.');
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
});
