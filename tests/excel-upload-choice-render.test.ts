// 업로드 화면에서 선택한 추가·교체 정책과 취소·연관 데이터 확인 흐름을 검증한다.
// @vitest-environment jsdom
import { act, createElement, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import SpecTable from '../components/project/SpecTable';
import ProductAttributesTable from '../components/project/ProductAttributesTable';
import RequirementsTable from '../components/project/RequirementsTable';
import KanoManager from '../components/project/KanoManager';
import ImportPage from '../app/project/[id]/import/page';

vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'project' }), useRouter: () => ({ push: vi.fn() }) }));

let container: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn();
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const preview = {
    success: true, workbook: { fileName: 'upload.xlsx', fileSize: 1, totalSheets: 1, availableSheets: ['고객요구사항도출표'] },
    sheetsProcessed: 1, recognizedSheets: [], sheetPreviews: [], counts: {}, warnings: [], errors: [],
};
const requests = () => fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');
const writes = () => requests().filter(([, init]) => (init.body as FormData).get('action') !== 'preview');
const button = (text: string) => {
    const found = [...container.querySelectorAll('button')].find(item => item.textContent?.trim() === text);
    expect(found, text).toBeDefined();
    return found!;
};
async function click(text: string) { await act(async () => { button(text).click(); }); }
async function selectFile(selector = 'input[type="file"]', name = 'upload.xlsx') {
    const input = container.querySelector<HTMLInputElement>(selector)!;
    expect(input).not.toBeNull();
    await act(async () => {
        Object.defineProperty(input, 'files', { value: [new File(['fixture'], name)], configurable: true });
        input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    return input;
}
async function mount(component: ComponentType<{ projectId: string }>) {
    await act(async () => { root.render(createElement(component, { projectId: 'project' })); });
}
async function openWorkbook() {
    await act(async () => { root.render(createElement(ImportPage)); });
    await selectFile();
    await click('엑셀 분석');
    await click('분석 결과를 시스템에 반영');
}
async function openKano(offline = false) {
    await mount(KanoManager);
    if (offline) await click('오프라인 응답파일 업로드');
    await selectFile(offline ? 'input[accept=".html,.htm"]' : 'input[accept=".xlsx,.xls"]', offline ? 'response.html' : 'upload.xlsx');
    await click('업로드');
}
beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(window, 'prompt').mockReturnValue(null);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fetchMock.mockImplementation(async (url, init) => {
        if (init?.method === 'POST') {
            if (String(url).endsWith('/import')) return json({ ...preview, applied: init.body.get('action') === 'apply' });
            return json({ success: true, specFunctions: [], message: '반영 완료', results: [] });
        }
        if (String(url).endsWith('/kano/analysis')) return json({}, 404);
        return json({ projects: [{ id: 'project', name: '프로젝트', role: 'OWNER' }], specFunctions: [], attributes: [],
            requirements: [{ id: 'req', category: '품질', subcategory: '', requirement: '속도', order: 0 }], invitations: [], respondents: [] });
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});
afterEach(async () => {
    await act(async () => { root.unmount(); });
    container.remove();
    vi.restoreAllMocks();
    vi.resetAllMocks();
    vi.unstubAllGlobals();
});

const screens = [
    { name: 'WS-2', open: async () => { await mount(SpecTable); await selectFile(); }, endpoint: '/spec/upload-excel' },
    { name: 'WS-3', open: async () => { await mount(ProductAttributesTable); await selectFile(); }, endpoint: '/import' },
    { name: 'WS-5', open: async () => { await mount(RequirementsTable); await selectFile(); }, endpoint: '/import' },
    { name: 'Kano 엑셀', open: () => openKano(), endpoint: '/kano/upload-excel' },
    { name: 'Kano HTML', open: () => openKano(true), endpoint: '/kano/upload-offline' },
    { name: '전체 워크북', open: openWorkbook, endpoint: '/import' },
];

it('Google Forms 탭에서 Kano 설문지 Apps Script 파일을 받을 수 있다', async () => {
    await mount(KanoManager);
    const googleTab = [...container.querySelectorAll('button')].find(item => item.textContent?.includes('Google Forms 연동'))!;
    await act(async () => { googleTab.click(); });

    const scriptLink = container.querySelector<HTMLAnchorElement>('a[href="/api/projects/project/kano/form-script"]');
    expect(scriptLink).not.toBeNull();
    expect(scriptLink?.textContent).toContain('Kano 설문지 Apps Script 받기');
});

for (const screen of screens) {
    it.each([['기존 데이터에 추가', 'append'], ['기존 데이터 지우고 업로드', 'replace']])(`${screen.name}에서 %s 선택을 서버에 전달한다`, async (label, policy) => {
        await screen.open();
        expect(window.prompt).not.toHaveBeenCalled();
        expect(writes()).toHaveLength(0);
        await click(label);
        expect(writes()).toHaveLength(1);
        expect(String(writes()[0][0])).toContain(screen.endpoint);
        const form = writes()[0][1].body as FormData;
        expect(form.get('writePolicy')).toBe(policy);
        expect(form.getAll(screen.name === 'Kano HTML' ? 'files' : 'file')).toHaveLength(1);
    });
    it(`${screen.name}에서 취소하면 업로드하지 않는다`, async () => {
        await screen.open();
        await click('취소');
        expect(writes()).toHaveLength(0);
        expect(container.textContent).not.toContain('기존 데이터 지우고 업로드');
    });
    it(`${screen.name}에서 업로드 중 다시 선택해도 중복 요청하지 않는다`, async () => {
        await screen.open();
        let finishUpload!: (response: Response) => void;
        fetchMock.mockImplementationOnce(() => new Promise<Response>(resolve => { finishUpload = resolve; }));
        await click('기존 데이터 지우고 업로드');
        const prompt = container.querySelector('section[aria-busy="true"]')!;
        expect(prompt).not.toBeNull();
        for (const choice of prompt.querySelectorAll('button')) {
            expect(choice.disabled).toBe(true);
            await act(async () => { choice.click(); });
        }
        expect(writes()).toHaveLength(1);
        if (screen.name === '전체 워크북') expect(button('파일 제거').disabled).toBe(true);
        await act(async () => { finishUpload(json({ ...preview, applied: true, specFunctions: [], results: [] })); });
        expect(container.querySelector('section[aria-busy="true"]')).toBeNull();
    });
}

it.each([false, true])('Kano 응답자별 교체는 전체 덮어쓰기와 구분한다 (HTML=%s)', async offline => {
    await openKano(offline);
    await click('같은 응답자의 기존 응답만 교체');
    const form = writes()[0][1].body as FormData;
    expect(form.get('writePolicy')).toBe('append');
    expect(form.get('replaceExistingRespondents')).toBe('true');
});

it.each([
    ['WS-5', true], ['WS-5', false], ['전체 워크북', true], ['전체 워크북', false],
] as const)('%s 연관 데이터 삭제 경고에서 확인=%s 선택을 보존한다', async (screenName, confirm) => {
    vi.mocked(window.confirm).mockReturnValue(confirm);
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url, init) => {
        if (init?.method === 'POST' && init.body.get('action') !== 'preview' && !init.body.get('confirmCascade')) {
            return json({ error: 'Kano 응답도 삭제됩니다.', needsCascadeConfirm: true }, 409);
        }
        return original(url, init);
    });
    await screens.find(screen => screen.name === screenName)!.open();
    await click('기존 데이터 지우고 업로드');
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Kano 응답도 삭제됩니다.'));
    expect(writes()).toHaveLength(confirm ? 2 : 1);
    if (confirm) {
        const form = writes()[1][1].body as FormData;
        expect(form.get('writePolicy')).toBe('replace');
        expect(form.get('confirmCascade')).toBe('true');
    }
});
