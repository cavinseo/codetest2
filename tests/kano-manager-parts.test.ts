// Kano 화면에서 떼어 낸 초대 창·분석 탭·응답 수집 상태를 실제 React DOM 으로 돌려 본다
// (2026-10-25 코드 리뷰 L1).
// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import KanoInviteModal from '../components/project/KanoInviteModal';
import KanoAnalysisPanel from '../components/project/KanoAnalysisPanel';
import KanoManager from '../components/project/KanoManager';
import { useKanoResponseCollection } from '../components/project/useKanoResponseCollection';

vi.mock('next/link', () => ({ default: ({ children, ...props }: { children: ReactNode; href: string }) => createElement('a', props, children) }));

let container: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn();
const showToast = vi.fn();
const json = (data: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(data), { status }));

const button = (text: string) => {
    const found = [...container.querySelectorAll('button')].find((item) => item.textContent?.trim() === text);
    expect(found, text).toBeDefined();
    return found!;
};
const click = (text: string) => act(async () => button(text).click());
async function type(element: HTMLInputElement | HTMLTextAreaElement, text: string) {
    await act(async () => {
        const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, text);
        element.dispatchEvent(new Event('input', { bubbles: true }));
    });
}
const submit = () => act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));

beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('fetch', fetchMock);
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
});

afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.resetAllMocks();
    vi.unstubAllGlobals();
});

describe('KanoInviteModal', () => {
    const onClose = vi.fn();
    const onInvited = vi.fn(async () => undefined);
    const render = (open: boolean) => act(async () => root.render(createElement(KanoInviteModal, {
        projectId: 'p1', open, onClose, onInvited, showToast,
    })));

    it('닫혀 있으면 아무것도 그리지 않는다', async () => {
        await render(false);

        expect(container.innerHTML).toBe('');
    });

    it('한 명을 초대하면 내역을 다시 불러오고 창을 닫는다', async () => {
        fetchMock.mockImplementation(() => json({ message: '초대했습니다.' }));
        await render(true);
        await type(container.querySelector<HTMLInputElement>('input[type="email"]')!, 'a@example.com');
        await submit();

        expect(fetchMock).toHaveBeenCalledWith('/api/projects/p1/kano/invite', expect.objectContaining({ method: 'POST' }));
        expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual({ email: 'a@example.com' });
        expect(onInvited).toHaveBeenCalledOnce();
        expect(onClose).toHaveBeenCalledOnce();
        expect(showToast).toHaveBeenCalledWith('초대했습니다.', 'success');
    });

    it('일괄 초대는 비어 있으면 보내지 않고, 다시 열어도 고른 방식이 남는다', async () => {
        await render(true);
        await click('여러 명 한번에');
        await submit();

        expect(fetchMock).not.toHaveBeenCalled();
        expect(container.textContent).toContain('초대할 이메일을 입력하거나 명단 파일을 선택하세요.');

        await render(false);
        await render(true);
        expect(container.querySelector('textarea')).not.toBeNull();
    });

    it('일괄 초대 결과를 창 안에 보인다', async () => {
        fetchMock.mockImplementation(() => json({
            results: [{ email: 'a@example.com', status: 'invited' }, { email: 'b@example', status: 'skipped', reason: '잘못된 주소' }],
            summary: { invited: 1, skipped: 1, failed: 0, emailSent: 1 },
        }));
        await render(true);
        await click('여러 명 한번에');
        await type(container.querySelector('textarea')!, 'a@example.com\nb@example');
        await submit();

        expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual({ text: 'a@example.com\nb@example' });
        expect(container.textContent).toContain('초대 1명');
        expect(container.textContent).toContain('— 잘못된 주소');
        expect(onClose).not.toHaveBeenCalled();
    });
});

describe('KanoAnalysisPanel', () => {
    it('응답이 없으면 설문 관리로 보내는 버튼만 보인다', async () => {
        const onGoToManage = vi.fn();
        await act(async () => root.render(createElement(KanoAnalysisPanel, {
            projectId: 'p1', analysis: { totalResponses: 0, uniqueRespondents: 0, requirements: [] }, requirements: [],
            respondentData: [], analysisViewMode: 'charts', setAnalysisViewMode: vi.fn(), onGoToManage,
            handleResetResponses: vi.fn(), isResettingResponses: false, loadData: vi.fn(async () => undefined),
        })));

        expect(container.textContent).toContain('아직 응답이 없습니다');
        await click('설문 관리로 이동');
        expect(onGoToManage).toHaveBeenCalledOnce();
    });
});

describe('useKanoResponseCollection', () => {
    let collection: ReturnType<typeof useKanoResponseCollection>;
    function Harness() {
        collection = useKanoResponseCollection({ projectId: 'p1', projectName: '스마트 화분', loadData: vi.fn(async () => undefined), showToast });
        return null;
    }

    it('만든 설문지는 응답 리셋 때 버리고, 수집 방식을 바꾸면 고른 파일을 비운다', async () => {
        fetchMock.mockImplementation(() => json({ formUrl: 'https://forms.example/f', formId: 'form_1', questionCount: 3 }));
        await act(async () => root.render(createElement(Harness)));
        await act(async () => collection.handleCreateGoogleForm());

        expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual({ projectName: '스마트 화분' });
        expect(collection.createdFormId).toBe('form_1');
        await act(async () => collection.forgetCreatedForm());
        expect([collection.createdFormId, collection.createdFormUrl]).toEqual(['', '']);

        await act(async () => {
            collection.setExcelFile(new File(['x'], 'a.xlsx'));
            collection.setPendingUpload('excel');
        });
        await act(async () => collection.handleCollectModeChange('offline'));
        expect([collection.collectMode, collection.excelFile, collection.pendingUpload]).toEqual(['offline', null, null]);
    });

    it('설문지가 없으면 응답을 가져오지 않는다', async () => {
        await act(async () => root.render(createElement(Harness)));
        await act(async () => collection.handleImportResponses());

        expect(fetchMock).not.toHaveBeenCalled();
        expect(showToast).toHaveBeenCalledWith('먼저 Google Forms 설문지를 생성하세요.', 'error');
    });
});

it('분석 탭에 다녀와도 고른 응답 수집 방식이 남는다', async () => {
    fetchMock.mockImplementation((url: string) => {
        if (url.endsWith('/requirements')) return json({ requirements: [{ id: 'r1', category: '사용성', requirement: '빠른 주문', order: 0 }] });
        if (url.endsWith('/kano/invitations')) return json({ invitations: [] });
        if (url === '/api/settings') return json({ google: { configured: false } });
        if (url === '/api/projects/p1') return json({ project: { name: '프로젝트' } });
        return json({ error: '없음' }, 404);
    });
    await act(async () => root.render(createElement(KanoManager, { projectId: 'p1' })));
    // 처음 불러오기는 요청 여섯 개를 차례로 기다린다.
    for (let i = 0; i < 5; i++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    await click('오프라인 응답파일 업로드');
    expect(container.textContent).toContain('오프라인 HTML 받기');

    await click('분석 결과');
    expect(container.textContent).toContain('아직 응답이 없습니다');
    await click('설문 관리로 이동');

    expect(container.textContent).toContain('오프라인 HTML 받기');
});
