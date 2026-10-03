// 워크시트 엑셀 다운로드 버튼의 요청, 중복 클릭 방지와 실패 안내를 검증한다.
// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import WorksheetExcelDownload from '../components/project/WorksheetExcelDownload';
import WorksheetImageExport from '../components/project/WorksheetImageExport';

afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function render(element: ReturnType<typeof createElement>) {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(element));
    return { container, root };
}

it('개별 양식의 저장된 내용만 요청하고 서버 파일명으로 다운로드한다', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, headers: new Headers({ 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent('시험_WS-2.xlsx')}` }), blob: async () => new Blob(['xlsx']) });
    vi.stubGlobal('fetch', fetcher);
    const createUrl = vi.fn().mockReturnValue('blob:excel');
    const revokeUrl = vi.fn();
    vi.stubGlobal('URL', class extends URL { static createObjectURL = createUrl; static revokeObjectURL = revokeUrl; });
    let name = '';
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { name = this.download; });
    const { container, root } = await render(createElement(WorksheetExcelDownload, { projectId: 'project-1', worksheetId: 'spec' }));
    expect(container.textContent).toContain('저장된 내용');
    await act(async () => container.querySelector('button')!.click());
    expect(fetcher).toHaveBeenCalledWith('/api/projects/project-1/export?format=xlsx&worksheet=spec', { cache: 'no-store' });
    expect(name).toBe('시험_WS-2.xlsx');
    expect(click).toHaveBeenCalledOnce();
    expect(revokeUrl).toHaveBeenCalledWith('blob:excel');
    expect(document.querySelector('a')).toBeNull();
    await act(async () => root.unmount());
});

it('전체 출력의 중복 클릭을 막고 실패를 안내한 뒤 재시도할 수 있다', async () => {
    let finish!: (value: unknown) => void;
    const fetcher = vi.fn().mockReturnValue(new Promise(resolve => { finish = resolve; }));
    vi.stubGlobal('fetch', fetcher);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const { container, root } = await render(createElement(WorksheetExcelDownload, { projectId: 'project-1' }));
    const button = container.querySelector('button')!;
    expect(button.textContent).toBe('전체 워크시트 엑셀');
    await act(async () => { button.click(); button.click(); });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith('/api/projects/project-1/export?format=xlsx', expect.anything());
    expect(button.disabled).toBe(true);
    await act(async () => finish({ ok: false, json: async () => ({ error: '접근 권한이 없습니다.' }) }));
    expect(container.querySelector('[role=alert]')!.textContent).toBe('접근 권한이 없습니다.');
    expect(button.disabled).toBe(false);
    expect(click).not.toHaveBeenCalled();
    await act(async () => root.unmount());
});

it('읽기 전용 워크시트에도 엑셀 버튼을 표시하고 보고서 캡처에는 버튼을 포함하지 않는다', async () => {
    const props = { worksheetId: 'spec', title: 'WS-2', readOnly: true, children: createElement('table') };
    const { container, root } = await render(createElement(WorksheetImageExport, { ...props, projectId: 'project-1' }));
    const button = [...container.querySelectorAll('button')].find(button => button.textContent === '엑셀 다운로드')!;
    expect(button.disabled).toBe(false);
    expect(button.closest('[data-capture-exclude]')).not.toBeNull();
    await act(async () => root.render(createElement(WorksheetImageExport, props)));
    expect(container.textContent).not.toContain('엑셀 다운로드');
    await act(async () => root.unmount());
});
