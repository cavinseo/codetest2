// 양식 확인에서 소개문 저장·재열기·실패 재시도 및 미저장 보호를 검증한다.
// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import KanoOfflineFormPreview from '../components/KanoOfflineFormPreview';
import KanoManager from '../components/project/KanoManager';
import { EMPTY_KANO_INTRODUCTION } from '../lib/kano-survey-introduction';

let container: HTMLDivElement;
let root: Root;
let saved = { ...EMPTY_KANO_INTRODUCTION };
let canEdit = true;
let saveStatus = 200;
const onClose = vi.fn();
const fetchMock = vi.fn();
const endpoint = '/api/projects/project/kano/offline-form';
const requirements = [{ id: 'req', requirement: '안전', category: '품질', order: 0 }];

const button = (text: string) => [...container.querySelectorAll('button')].find(item => item.textContent?.trim() === text)!;
const click = async (text: string) => { await act(async () => { button(text).click(); }); };
async function fill(key: string, value: string) {
    const input = container.querySelector<HTMLInputElement>(`#offline-intro-${key}`)!;
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
}
async function mount() {
    await act(async () => { root.render(createElement(KanoOfflineFormPreview, { projectId: 'project', onClose })); });
}

beforeEach(() => {
    saved = { ...EMPTY_KANO_INTRODUCTION };
    canEdit = true;
    saveStatus = 200;
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    fetchMock.mockImplementation(async (url, init) => {
        if (init?.method === 'PATCH') {
            if (saveStatus === 200) saved = JSON.parse(init.body).introduction;
            return new Response(JSON.stringify(saveStatus === 200 ? { introduction: saved } : { error: '저장에 실패했습니다.' }), { status: saveStatus });
        }
        const data = String(url).includes('offline-form') ? { projectId: 'project', projectName: '프로젝트', requirements, introduction: saved, canEdit }
            : { project: { name: '프로젝트' }, requirements, invitations: [], respondents: [] };
        return new Response(JSON.stringify(data), { status: 200 });
    });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
});

afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.resetAllMocks();
    vi.unstubAllGlobals();
});

it('다섯 빈칸을 미리보기와 저장 요청에 반영하고 다시 열면 저장값을 보여 준다', async () => {
    await mount();
    const values = { technology: '성형 기술', productType: '분리판', companyName: '창업 기업', representativeName: '홍길동', offering: '제작 서비스' };
    for (const [key, value] of Object.entries(values)) await fill(key, value);
    expect(container.querySelector('iframe')!.srcdoc).toContain('「성형 기술」 기술을 활용하여 다양한 「분리판」제품을');
    expect(button('오프라인 HTML 받기').disabled).toBe(true);
    await click('소개문 저장');
    expect(fetchMock).toHaveBeenCalledWith(endpoint, expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ introduction: values }) }));
    expect(container.querySelector('a')?.getAttribute('href')).toBe(endpoint);
    expect(container.textContent).toContain('저장했습니다.');
    await act(async () => root.render(null));
    await mount();
    for (const [key, value] of Object.entries(values)) {
        expect(container.querySelector<HTMLInputElement>(`#offline-intro-${key}`)!.value).toBe(value);
    }
});

it('저장 실패 시 입력을 유지하고 같은 내용으로 재시도할 수 있다', async () => {
    await mount();
    await fill('technology', '유지할 기술명');
    saveStatus = 500;
    await click('소개문 저장');
    expect(container.querySelector('[role="alert"]')!.textContent).toBe('저장에 실패했습니다.');
    expect(container.querySelector<HTMLInputElement>('#offline-intro-technology')!.value).toBe('유지할 기술명');
    expect(container.querySelector('a')).toBeNull();
    saveStatus = 200;
    await click('소개문 저장');
    expect(saved.technology).toBe('유지할 기술명');
});

it('미저장 상태에서 닫기를 취소하면 입력을 보존한다', async () => {
    await mount();
    await fill('companyName', '보존할 회사');
    await click('닫기');
    expect(window.confirm).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
    vi.mocked(window.confirm).mockReturnValue(true);
    await click('닫기');
    expect(onClose).toHaveBeenCalledOnce();
});

it('읽기 전용 역할은 입력과 저장을 할 수 없다', async () => {
    canEdit = false;
    await mount();
    expect(container.querySelector('fieldset')!.disabled).toBe(true);
    expect(button('소개문 저장')).toBeUndefined();
    expect(container.querySelector('a')).not.toBeNull();
});

it('WS-6 오프라인 탭의 양식 확인에서 편집 가능한 HTML 미리보기를 연다', async () => {
    await act(async () => root.render(createElement(KanoManager, { projectId: 'project' })));
    await click('오프라인 응답파일 업로드');
    await click('양식 확인');
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain('오프라인 양식 확인');
    expect(container.querySelectorAll('[id^="offline-intro-"]')).toHaveLength(5);
    expect(container.querySelector('iframe')!.srcdoc).toContain('고객니즈조사 설문지');
});
