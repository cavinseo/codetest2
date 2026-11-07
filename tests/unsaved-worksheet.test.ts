// 워크시트 표의 미저장 판정(불러온 상태·저장한 상태 기준)과 탭 전환 알림, 떠날 때 경고를 검증한다.
// @vitest-environment jsdom
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useUnsavedWorksheet, WorksheetDirtyContext } from '../components/project/useUnsavedWorksheet';

let container: HTMLDivElement;
let root: Root;
let api: { setValue: (value: string) => void; setReady: (ready: boolean) => void; markSaved: () => void; isDirty: boolean };

function Sheet({ initialReady }: { initialReady: boolean }) {
    const [value, setValue] = useState('불러온 값');
    const [ready, setReady] = useState(initialReady);
    const { isDirty, markSaved } = useUnsavedWorksheet({ rows: [value] }, ready);
    api = { setValue, setReady, markSaved, isDirty };
    return null;
}

async function render(report = vi.fn(), initialReady = true) {
    await act(async () => {
        root.render(createElement(WorksheetDirtyContext.Provider, { value: report }, createElement(Sheet, { initialReady })));
    });
    return report;
}

function beforeUnloadPrevented() {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
}

beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(async () => {
    await act(async () => { root.unmount(); });
    container.remove();
    vi.unstubAllGlobals();
});

it('불러온 직후는 깨끗하고 편집하면 미저장으로 알리며 떠날 때 막는다', async () => {
    const report = await render();
    expect(api.isDirty).toBe(false);
    expect(beforeUnloadPrevented()).toBe(false);

    await act(async () => api.setValue('고친 값'));
    expect(api.isDirty).toBe(true);
    expect(report).toHaveBeenLastCalledWith(expect.any(String), true);
    expect(beforeUnloadPrevented()).toBe(true);
});

it('편집을 원래대로 되돌리면 다시 깨끗하다', async () => {
    await render();
    await act(async () => api.setValue('고친 값'));
    await act(async () => api.setValue('불러온 값'));
    expect(api.isDirty).toBe(false);
});

it('저장 응답으로 상태를 바꾼 뒤 markSaved 하면 그 상태가 새 기준이 된다', async () => {
    const report = await render();
    await act(async () => api.setValue('고친 값'));
    await act(async () => {
        api.setValue('서버가 정리한 값');
        api.markSaved();
    });
    expect(api.isDirty).toBe(false);
    expect(report).toHaveBeenLastCalledWith(expect.any(String), false);
    await act(async () => api.setValue('또 고친 값'));
    expect(api.isDirty).toBe(true);
});

it('다시 불러오는 동안은 판정하지 않고 다 불러온 상태를 새 기준으로 삼는다', async () => {
    await render(vi.fn(), false);
    await act(async () => api.setValue('아직 불러오는 중'));
    expect(api.isDirty).toBe(false);
    await act(async () => api.setReady(true));
    expect(api.isDirty).toBe(false);

    await act(async () => api.setValue('고친 값'));
    await act(async () => api.setReady(false));
    expect(api.isDirty).toBe(false);
    await act(async () => {
        api.setValue('다시 불러온 값');
        api.setReady(true);
    });
    expect(api.isDirty).toBe(false);
});

it('탭 전환으로 표가 사라지면 미저장 알림을 거둔다', async () => {
    const report = await render();
    await act(async () => api.setValue('고친 값'));
    await act(async () => { root.render(createElement(WorksheetDirtyContext.Provider, { value: report }, null)); });
    expect(report).toHaveBeenLastCalledWith(expect.any(String), false);
    expect(beforeUnloadPrevented()).toBe(false);
});

it('프로젝트 화면 밖(단독 워크시트 페이지)에서도 떠날 때 막는다', async () => {
    await act(async () => { root.render(createElement(Sheet, { initialReady: true })); });
    await act(async () => api.setValue('고친 값'));
    expect(beforeUnloadPrevented()).toBe(true);
});

it('markSaved 는 다음 렌더를 기다리지 않고 바로 저장됨을 알려 저장 직후 탭 이동이 경고 없이 된다', async () => {
    const report = await render();
    await act(async () => api.setValue('고친 값'));
    report.mockClear();
    api.markSaved();
    expect(report).toHaveBeenCalledWith(expect.any(String), false);
});

it('한 탭 안의 표 둘은 서로의 미저장 알림을 지우지 않는다', async () => {
    const dirty = new Set<string>();
    const report = (id: string, value: boolean) => { if (value) dirty.add(id); else dirty.delete(id); };
    let second: typeof api | undefined;
    function Pair({ showSecond }: { showSecond: boolean }) {
        return createElement('div', null, createElement(Sheet, { initialReady: true }), showSecond ? createElement(Second) : null);
    }
    function Second() {
        const [value, setValue] = useState('가중치');
        const { isDirty, markSaved } = useUnsavedWorksheet(value, true);
        second = { setValue, setReady: () => {}, markSaved, isDirty };
        return null;
    }
    await act(async () => { root.render(createElement(WorksheetDirtyContext.Provider, { value: report }, createElement(Pair, { showSecond: false }))); });
    await act(async () => api.setValue('고친 질문'));
    expect(dirty.size).toBe(1);
    await act(async () => { root.render(createElement(WorksheetDirtyContext.Provider, { value: report }, createElement(Pair, { showSecond: true }))); });
    expect(second?.isDirty).toBe(false);
    expect(dirty.size).toBe(1);
});
