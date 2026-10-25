// 워크시트 공용 불러오기 훅(2026-10-25 코드 리뷰 D1)이 표마다 복사돼 있던 동작 —
// 로딩·실패·재시도, 다른 프로젝트로 넘어간 뒤 늦게 온 응답 버리기 — 을 그대로 지키는지 확인한다.
// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useWorksheetLoad, type WorksheetLoader } from '../components/project/useWorksheetLoad';

let container: HTMLDivElement;
let root: Root;

function Probe({ projectId, load, onError }: { projectId: string; load: WorksheetLoader; onError?: (error: unknown) => void }) {
    const { isLoading, loadFailed, isReady, retry } = useWorksheetLoad(projectId, load, onError);
    return createElement('div', null,
        createElement('span', { id: 'state' }, `${isLoading ? 'loading' : 'idle'}|${loadFailed ? 'failed' : 'ok'}|${isReady ? 'ready' : 'not-ready'}`),
        createElement('button', { type: 'button', onClick: retry }, '재시도'));
}

const state = () => container.querySelector('#state')!.textContent;
async function render(props: Parameters<typeof Probe>[0]) {
    await act(async () => { root.render(createElement(Probe, props)); });
}

function deferred() {
    let resolve!: () => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
});

it('불러오는 동안은 편집할 수 없고, 끝나면 편집 가능 상태가 된다', async () => {
    const pending = deferred();
    await render({ projectId: 'p1', load: () => pending.promise });
    expect(state()).toBe('loading|ok|not-ready');

    await act(async () => pending.resolve());
    expect(state()).toBe('idle|ok|ready');
});

it('실패하면 실패 상태와 onError 를 알리고, 재시도에 성공하면 편집 가능해진다', async () => {
    const onError = vi.fn();
    const load = vi.fn<WorksheetLoader>().mockRejectedValueOnce(new Error('조회 실패')).mockResolvedValueOnce(undefined);
    await render({ projectId: 'p1', load, onError });
    expect(state()).toBe('idle|failed|not-ready');
    expect(onError).toHaveBeenCalledWith(new Error('조회 실패'));

    await act(async () => container.querySelector('button')!.click());

    expect(load).toHaveBeenCalledTimes(2);
    expect(state()).toBe('idle|ok|ready');
});

it('성공한 뒤 재시도가 실패하면 편집 가능 상태로 남지 않는다', async () => {
    const load = vi.fn<WorksheetLoader>().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('두 번째 실패'));
    await render({ projectId: 'p1', load });
    expect(state()).toBe('idle|ok|ready');

    await act(async () => container.querySelector('button')!.click());

    expect(state()).toBe('idle|failed|not-ready');
});

it('다른 프로젝트로 넘어가면 이전 프로젝트의 늦은 응답은 무시하고 새 프로젝트를 불러온다', async () => {
    const first = deferred();
    const activeFlags: Array<() => boolean> = [];
    const load = vi.fn<WorksheetLoader>((isActive) => {
        activeFlags.push(isActive);
        return activeFlags.length === 1 ? first.promise : Promise.resolve();
    });
    await render({ projectId: 'p1', load });
    await render({ projectId: 'p2', load });
    expect(state()).toBe('idle|ok|ready');

    // 늦게 온 p1 의 실패가 p2 화면을 실패로 바꾸지 않는다.
    await act(async () => first.reject(new Error('늦은 실패')));

    expect(activeFlags[0]()).toBe(false);
    expect(activeFlags[1]()).toBe(true);
    expect(state()).toBe('idle|ok|ready');
});

it('렌더할 때마다 다시 불러오지 않는다', async () => {
    const load = vi.fn<WorksheetLoader>().mockResolvedValue(undefined);
    await render({ projectId: 'p1', load });
    await render({ projectId: 'p1', load: async () => load(() => true) });

    expect(load).toHaveBeenCalledTimes(1);
});
