// 소개문은 「설문 질문 구성」 맨 앞에서 입력·저장하고, 양식 확인은 저장된 값으로 완성된 양식만 보여 주는지 검증한다.
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
const values = { technology: '성형 기술', productType: '분리판', companyName: '창업 기업', representativeName: '홍길동', offering: '제작 서비스' };

const button = (text: string) => [...container.querySelectorAll('button')].find(item => item.textContent?.trim() === text)!;
const click = async (text: string) => { await act(async () => { button(text).click(); }); };
const introPatches = () => fetchMock.mock.calls.filter(([url, init]) => url === endpoint && init?.method === 'PATCH');
async function fill(key: string, value: string) {
    const input = container.querySelector<HTMLInputElement>(`#kano-intro-${key}`)!;
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
}
async function mountManager() {
    await act(async () => { root.render(createElement(KanoManager, { projectId: 'project' })); });
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

it('설문 질문 구성 맨 앞에서 다섯 빈칸을 입력하면 완성 문장을 보여 주고 질문 저장으로 함께 저장한다', async () => {
    await mountManager();
    const card = [...container.querySelectorAll('.card')].find(item => item.textContent?.includes('설문 질문 구성'))!;
    expect(card.querySelector('fieldset legend')?.textContent).toBe('설문지 소개문');
    for (const [key, value] of Object.entries(values)) await fill(key, value);
    expect(container.querySelector('[data-testid="kano-intro-preview"]')!.textContent).toContain('「성형 기술」 기술을 활용하여 다양한 「분리판」제품을');
    await click('질문 저장');
    expect(introPatches()).toEqual([[endpoint, expect.objectContaining({ body: JSON.stringify({ introduction: values }) })]]);
    expect(saved).toEqual(values);
    await act(async () => root.render(null));
    await mountManager();
    for (const [key, value] of Object.entries(values)) {
        expect(container.querySelector<HTMLInputElement>(`#kano-intro-${key}`)!.value).toBe(value);
    }
});

it('소개문을 고치지 않은 질문 저장은 소개문을 쓰지 않는다', async () => {
    await mountManager();
    await click('질문 저장');
    expect(introPatches()).toHaveLength(0);
});

it('소개문 저장이 실패하면 입력을 유지하고 같은 내용으로 다시 저장할 수 있다', async () => {
    await mountManager();
    await fill('technology', '유지할 기술명');
    saveStatus = 500;
    await click('질문 저장');
    expect(container.querySelector<HTMLInputElement>('#kano-intro-technology')!.value).toBe('유지할 기술명');
    expect(saved.technology).toBe('');
    saveStatus = 200;
    await click('질문 저장');
    expect(saved.technology).toBe('유지할 기술명');
});

it('읽기 전용 역할은 소개문을 입력할 수 없다', async () => {
    canEdit = false;
    await mountManager();
    expect(container.querySelector<HTMLInputElement>('#kano-intro-technology')!.closest('fieldset')!.disabled).toBe(true);
});

it('양식 확인은 저장된 소개문으로 완성된 양식을 입력 칸 없이 보여 준다', async () => {
    saved = { ...values };
    await act(async () => { root.render(createElement(KanoOfflineFormPreview, { projectId: 'project', onClose })); });
    const html = container.querySelector('iframe')!.srcdoc;
    expect(html).toContain('「성형 기술」 기술을 활용하여 다양한 「분리판」제품을');
    expect(html).not.toContain('kano-intro-');
    expect(container.querySelectorAll('input')).toHaveLength(0);
    expect(container.querySelector('a')?.getAttribute('href')).toBe(endpoint);
    await click('닫기');
    expect(onClose).toHaveBeenCalledOnce();
});

it('WS-6 오프라인 탭의 양식 확인에서 HTML 미리보기를 연다', async () => {
    await mountManager();
    await click('오프라인 응답파일 업로드');
    await click('양식 확인');
    const dialog = container.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain('오프라인 양식 확인');
    expect(dialog.querySelectorAll('input')).toHaveLength(0);
    expect(container.querySelector('iframe')!.srcdoc).toContain('고객니즈조사 설문지');
});
