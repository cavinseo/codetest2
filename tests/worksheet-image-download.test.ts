// 로딩 완료 대기와 읽기 전용 워크시트의 그림 다운로드 동작을 검증한다.
// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { toCanvas } from 'html-to-image';
import WorksheetImageExport from '../components/project/WorksheetImageExport';
import { captureWorksheetNode, waitForWorksheetReady, worksheetImageFileName } from '../lib/worksheet-capture';

vi.mock('html-to-image', () => ({ toCanvas: vi.fn() }));
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it('데이터 로딩 완료 후에만 진행하고 오류 화면은 거부한다', async () => {
    vi.useFakeTimers();
    const node = document.createElement('div');
    node.innerHTML = '<span data-worksheet-state="loading"></span>';
    document.body.append(node);
    let ready = false;
    const pending = waitForWorksheetReady(node, 'QFD').then(() => { ready = true; });
    await vi.advanceTimersByTimeAsync(100);
    expect(ready).toBe(false);
    node.innerHTML = '<table><tr><td>9</td></tr></table>';
    await vi.advanceTimersByTimeAsync(100);
    await pending;
    expect(ready).toBe(true);
    node.innerHTML = '<div data-worksheet-state="error">조회 실패</div>';
    await expect(waitForWorksheetReady(node, 'QFD')).rejects.toThrow('불러오지 못했습니다');
});

it('로딩 시간 초과나 화면 이탈은 빈 이미지를 내려받지 않는다', async () => {
    const node = document.createElement('div');
    document.body.append(node);
    node.innerHTML = '<span class="animate-spin"></span>';
    await expect(waitForWorksheetReady(node, 'WS', 0)).rejects.toThrow('불러오는 중');
    node.remove();
    await expect(waitForWorksheetReady(node, 'WS')).rejects.toThrow('화면이 변경');
});

it('읽기 전용 내용도 PNG로 다운로드하고 다운로드 버튼은 캡처에 포함하지 않는다', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.mocked(toCanvas).mockImplementation(async node => {
        expect(node.textContent).toContain('현재 결과');
        return { width: 200, height: 100, toDataURL: () => 'data:image/png;base64,AA==' } as HTMLCanvasElement;
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
        expect(this.download).toBe('WS-5 요구사항.png');
        expect(this.href).toBe('data:image/png;base64,AA==');
    });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const props = {
        title: 'WS-5 요구사항', worksheetId: 'requirements', readOnly: true,
        children: createElement('input', { value: '현재 결과', readOnly: true }),
    };
    await act(async () => root.render(createElement(WorksheetImageExport, props)));
    const button = container.querySelector('button')!;
    expect(button.disabled).toBe(false);
    await act(async () => button.click());
    const target = vi.mocked(toCanvas).mock.calls.at(-1)![0];
    expect(target.textContent).not.toContain('그림 다운로드');
    expect(target.querySelector('input')?.value).toBe('현재 결과');
    expect(click).toHaveBeenCalledOnce();
    await act(async () => root.unmount());
});

it('그림의 실제 형식과 안전한 파일명을 사용한다', () => {
    expect(worksheetImageFileName('QFD/결과', 'data:image/jpeg;base64,AA')).toBe('QFD_결과.jpg');
});

it('긴 선택값과 입력값을 글자로 펼치고 캡처 실패 후에도 원래 입력 요소를 복구한다', async () => {
    const node = document.createElement('div');
    node.innerHTML = '<select><option value="a">첫 값</option><option value="b">아주 긴 기술 이름과 전체 결과</option></select><textarea></textarea>';
    document.body.append(node);
    const select = node.querySelector('select')!;
    const textarea = node.querySelector('textarea')!;
    select.value = 'b';
    textarea.value = '현재 편집 값\n두 번째 줄';
    vi.mocked(toCanvas).mockImplementation(async target => {
        expect(target.querySelector('select')).toBeNull();
        expect(target.textContent).toContain('아주 긴 기술 이름과 전체 결과');
        expect(target.textContent).toContain('현재 편집 값\n두 번째 줄');
        throw new Error('이미지 변환 실패');
    });
    await expect(captureWorksheetNode(node)).rejects.toThrow('캡처에 실패');
    expect(node.querySelector('select')).toBe(select);
    expect(node.querySelector('textarea')).toBe(textarea);
    expect(select.value).toBe('b');
    expect(textarea.value).toBe('현재 편집 값\n두 번째 줄');
    expect(node.className).toBe('');
});

it('SVG 내부 축 글자는 인라인 인쇄색으로 캡처하고 원래 색상으로 복구한다', async () => {
    const node = document.createElement('div');
    node.innerHTML = '<svg><g data-capture-chart-label fill="white"><text>만족 계수</text></g></svg>';
    const label = node.querySelector('text')!;
    document.body.append(node);
    vi.mocked(toCanvas).mockImplementation(async () => {
        expect(label.style.getPropertyValue('fill')).toBe('#334155');
        return { width: 100, height: 100, toDataURL: () => 'data:image/png;base64,AA==' } as HTMLCanvasElement;
    });
    await captureWorksheetNode(node);
    expect(label.getAttribute('style')).toBeNull();
    expect(node.querySelector('g')?.getAttribute('fill')).toBe('white');
});

it('스펙표 상위 상자의 세로 제한을 모두 해제하고 마지막 행까지 펼친 뒤 원래 스타일을 복구한다', async () => {
    const node = document.createElement('div');
    node.style.cssText = 'height: 300px; max-height: 300px; overflow: hidden;';
    node.innerHTML = '<fieldset style="height: 200px; max-height: 200px; overflow: clip;"><div class="overflow-x-auto" style="max-height: 180px"><table><tbody><tr><td>첫 스펙</td></tr><tr><td>마지막 스펙</td></tr></tbody></table></div></fieldset>';
    document.body.append(node);
    const fieldset = node.querySelector('fieldset')!;
    const scroller = node.querySelector<HTMLElement>('.overflow-x-auto')!;
    const styles = [node, fieldset, scroller].map(element => element.getAttribute('style'));
    vi.mocked(toCanvas).mockImplementation(async target => {
        for (const element of [target, fieldset, scroller]) {
            expect(element.style.getPropertyValue('height')).toBe('auto');
            expect(element.style.getPropertyValue('max-height')).toBe('none');
            expect(element.style.getPropertyValue('overflow')).toBe('visible');
        }
        expect(target.querySelector('tbody tr:last-child')!.textContent).toBe('마지막 스펙');
        return { width: 100, height: 900, toDataURL: () => 'data:image/png;base64,AA==' } as HTMLCanvasElement;
    });
    await captureWorksheetNode(node);
    expect([node, fieldset, scroller].map(element => element.getAttribute('style'))).toEqual(styles);
});
