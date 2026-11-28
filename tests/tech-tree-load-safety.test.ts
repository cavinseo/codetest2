// 기능기술체계의 조회 실패·재시도·개정값 전달과 충돌 시 입력 보존을 검증한다.
// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import TechTreeTable from '../components/project/TechTreeTable';
let root: Root;
let container: HTMLDivElement;
const fetchMock = vi.fn();
const revision = 'a'.repeat(64);
const entry = { id: 'saved', customerVoice: '기존 고객의 소리', coreSpec: '핵심', subSpec: '세부', techCharacteristic: '기술', order: 0 };
const button = (text: string) => [...container.querySelectorAll('button')].find(item => item.textContent?.trim() === text);
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const related = (url: string) => url.endsWith('/spec') ? { specFunctions: [] } : { requirements: [] };
beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); fetchMock.mockReset(); });
it.each(['http','network','json','missing-entries','missing-revision','related-http'])('%s 조회 실패 뒤 편집을 막고 재시도하면 기존 데이터와 개정값으로 저장한다', async failure => {
    let recovered = false;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (init?.method === 'POST') return json({ entries: [entry], revision: 'b'.repeat(64) });
        if (!recovered && failure === 'related-http' && url.endsWith('/spec')) return json({}, 500);
        if (!url.endsWith('/tech-tree')) return json(related(url));
        if (recovered) return json({ entries: [entry], revision });
        if (failure === 'network') throw Error('offline');
        if (failure === 'json') return new Response('{');
        if (failure === 'missing-entries') return json({ revision });
        if (failure === 'missing-revision') return json({ entries: [entry] });
        return json({ entries: [entry], revision }, failure === 'http' ? 500 : 200);
    });
    await act(async () => root.render(createElement(TechTreeTable, { projectId: 'p' })));
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(button('행 추가')).toBeUndefined(); expect(button('저장')).toBeUndefined();
    recovered = true; await act(async () => button('다시 불러오기')!.click());
    expect(container.querySelector('[role="alert"]')).toBeNull();
    await act(async () => button('저장')!.click());
    const writes = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');
    expect(writes).toHaveLength(1);
    expect(writes[0][1].headers['If-Match']).toBe(revision);
    expect(JSON.parse(writes[0][1].body).entries[0].customerVoice).toBe(entry.customerVoice);
});
it('409 충돌을 안내하고 작성 중인 행을 유지한다', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => init?.method === 'POST' ? json({ error: '다른 화면에서 변경되었습니다.' }, 409) : json(url.endsWith('/tech-tree') ? { entries: [entry], revision } : related(url)));
    await act(async () => root.render(createElement(TechTreeTable, { projectId: 'p' })));
    await act(async () => button('행 추가')!.click());
    const before = container.querySelectorAll('input').length;
    await act(async () => button('저장')!.click());
    expect(container.textContent).toContain('다른 화면에서 변경되었습니다.');
    expect(container.querySelectorAll('input')).toHaveLength(before);
});
