// 결과보고서 캡처 화면의 조회 실패 차단과 원본 다시 불러오기를 검증한다.
// @vitest-environment jsdom
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import FinalReportPage from '../app/project/[id]/report/page';
import { CAPTURED_WORKSHEET_TITLES } from '../lib/final-report-document';

const m = vi.hoisted(() => ({
    fitnessError: false,
    fitnessMounts: 0,
    qfdMounts: 0,
    capture: vi.fn(),
    optimize: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'project' }), useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock('next/link', () => ({ default: (props: any) => createElement('a', props) }));
vi.mock('../components/project/FitnessWrapper', () => {
    function MockFitness() {
        useEffect(() => { m.fitnessMounts += 1; }, []);
        return m.fitnessError ? createElement('div', { role: 'alert' }, '데이터를 불러오지 못했습니다. 다시 불러온 후 편집해 주세요.') : createElement('div', null, '적합도');
    }
    return { default: MockFitness };
});
vi.mock('../components/project/QFDMatrix', () => {
    function MockQfd() {
        useEffect(() => { m.qfdMounts += 1; }, []);
        return createElement('div', null, 'QFD');
    }
    return { default: MockQfd };
});
vi.mock('../components/project/KanoSatisfactionGraph', () => ({ default: () => createElement('div', null, 'Kano') }));
vi.mock('../lib/worksheet-capture', async importOriginal => ({
    ...await importOriginal<typeof import('../lib/worksheet-capture')>(),
    captureWorksheetNode: (...args: unknown[]) => m.capture(...args),
}));
vi.mock('../lib/final-report-image', () => ({ optimizeReportImage: (...args: unknown[]) => m.optimize(...args) }));

let container: HTMLDivElement;
let root: Root;
const report = {
    version: 0, hasPublishedReport: false, hasUnpublishedChanges: false, publishedAt: null, updatedAt: null,
    canEdit: true, mentorName: '멘토', view: 'draft', draft: null,
};
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
const fetchMock = vi.fn(async (url: string) => json(url === '/api/projects/project/report' ? report
    : url.endsWith('/overview') ? { project: { name: '프로젝트' } } : {}));

beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('fetch', fetchMock);
    m.fitnessError = false;
    m.fitnessMounts = 0;
    m.qfdMounts = 0;
    m.capture.mockReset().mockResolvedValue({ pngDataUrl: 'data:image/png;base64,AA==', widthPx: 1, heightPx: 1 });
    m.optimize.mockReset().mockResolvedValue({ dataUrl: 'data:image/png;base64,AA==', widthPx: 1, heightPx: 1 });
    fetchMock.mockReset().mockImplementation(async (url: string) => json(url === '/api/projects/project/report' ? report
        : url.endsWith('/overview') ? { project: { name: '프로젝트' } } : {}));
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
});

afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
});

async function render() {
    await act(async () => root.render(createElement(FinalReportPage)));
    expect(m.fitnessMounts).toBe(1);
    expect(m.qfdMounts).toBe(1);
}

async function click(label: string) {
    const button = [...container.querySelectorAll('button')].find(node => node.textContent?.trim() === label);
    expect(button).toBeDefined();
    expect(button!.disabled).toBe(false);
    await act(async () => button!.click());
}

it('WS-4 조회 실패 화면은 이미지로 캡처하지 않는다', async () => {
    m.fitnessError = true;
    fetchMock.mockImplementation(async (url: string) => json(url === '/api/projects/project/report' ? report
        : url.endsWith('/overview') ? { project: { name: '프로젝트' } }
            : url.endsWith('/export') ? { fitnessMatrix: { marketsJson: '[]', matrixJson: '{}' } } : {}));
    await render();
    await click('미리보기 만들기');

    expect(m.capture).not.toHaveBeenCalled();
    expect(container.textContent).toContain('제품/서비스 속성 적합도 화면을 불러오지 못했습니다.');
});

it('워크시트 다시 불러오기는 WS-4와 QFD 캡처 화면도 새로 조회한다', async () => {
    await render();
    await click('워크시트 다시 불러오기');

    expect(m.fitnessMounts).toBe(2);
    expect(m.qfdMounts).toBe(2);
});

it('요구사항이 있어도 Kano 응답이 없으면 빈 그래프를 보고서 결과로 캡처하지 않는다', async () => {
    fetchMock.mockImplementation(async (url: string) => json(url === '/api/projects/project/report' ? report
        : url.endsWith('/overview') ? { project: { name: '프로젝트' } }
            : url.endsWith('/kano/analysis') ? { requirements: [{ requirementId: 'req', responseCount: 0, better: 0, worse: 0, kanoWeight: 0, timkoCategory: '' }] } : {}));
    await render();
    await click('미리보기 만들기');
    expect(m.capture).not.toHaveBeenCalled();
    expect(container.querySelector('[data-report-cover]')).not.toBeNull();
    expect(container.textContent).toContain('Kano 응답이 없어 분석 결과 그림은 미작성 상태입니다.');
});

it('그림 반영 후 초안 저장은 실제 캡처 세 장과 교정 내용 및 재생성 필요 상태를 보존한다', async () => {
    const document = {
        title: '교정한 보고서', fileName: '교정.docx', blocks: [
            { kind: 'paragraph', text: '사용자가 교정한 분석 내용' },
            ...Object.values(CAPTURED_WORKSHEET_TITLES).map(title => ({
                kind: 'image', title, pngDataUrl: 'data:image/png;base64,old', widthMm: 100, heightMm: 100, landscape: false,
            })),
        ],
    };
    const free = { productImageDataUrl: null, productImageWidthPx: null, productImageHeightPx: null,
        marketDefinition: '보완한 시장', targetCustomer: '', finalSpecExplanation: '', improvedProductName: '', improvedProductDescription: '' };
    let saved: any;
    fetchMock.mockImplementation(async (url: string, options?: any) => {
        if (url === '/api/projects/project/report') {
            if (options?.method === 'PUT') saved = JSON.parse(options.body);
            return json({ ...report, draft: { free, document, previewNeedsRefresh: true } });
        }
        return json(url.endsWith('/overview') ? { project: { name: '프로젝트' } } : {});
    });
    m.capture.mockImplementation(async (node: HTMLElement) => ({ pngDataUrl: `data:image/png;base64,${node.dataset.worksheetId}`, widthPx: 1280, heightPx: 800 }));
    m.optimize.mockImplementation(async (dataUrl: string) => ({ dataUrl, widthPx: 1280, heightPx: 800 }));
    await render();
    await click('워크시트 그림 반영');
    expect(m.capture).toHaveBeenCalledTimes(3);
    await click('초안 저장');
    expect(saved.draft.document.blocks[0]).toEqual(document.blocks[0]);
    expect(saved.draft.document.blocks.slice(1).map((block: any) => block.pngDataUrl)).toEqual(
        Object.keys(CAPTURED_WORKSHEET_TITLES).map(id => `data:image/png;base64,${id}`),
    );
    expect(saved.draft.previewNeedsRefresh).toBe(true);
    expect(saved.draft.free).toEqual(free);
    expect(container.querySelectorAll('figure a[download]')).toHaveLength(3);
});

it('기존 샘플 보고서에 빠진 WS-4 그림은 그림 반영으로 복구하고 교정한 분석을 유지한다', async () => {
    const document = { title: '결과보고서', fileName: '결과보고서.docx', blocks: [
        { kind: 'cover', title: '결과보고서', projectName: '프로젝트', companyName: '회사', coachName: '멘토', outputDate: '2026.10.04' },
        { kind: 'heading', text: '제품/서비스 속성 적합도 (WS-4)', level: 2 },
        { kind: 'paragraph', tone: 'analysis', text: 'WS-4 멘토 분석(보고)' },
        { kind: 'paragraph', text: '사용자가 교정한 WS-4 분석' },
        { kind: 'paragraph', tone: 'notice', text: '속성 적합도 행렬이 저장되어 있지 않습니다. 평가 결과 그림은 미작성 상태입니다.' },
        { kind: 'heading', text: '제품/서비스 진단표', level: 2 },
    ] };
    let saved: any;
    fetchMock.mockImplementation(async (url: string, options?: any) => {
        if (url.endsWith('/report')) {
            if (options?.method === 'PUT') saved = JSON.parse(options.body);
            return json({ ...report, draft: { document, previewNeedsRefresh: false } });
        }
        return json(url.endsWith('/export') ? { fitnessMatrix: { marketsJson: '[]', matrixJson: '{}' } } : {});
    });
    await render();
    await click('워크시트 그림 반영');
    expect(m.capture).toHaveBeenCalledTimes(1);
    expect(m.capture.mock.calls[0][0].dataset.worksheetId).toBe('fitness');
    await click('초안 저장');
    expect(saved.draft.document.blocks[3]).toEqual(document.blocks[3]);
    expect(saved.draft.document.blocks[4]).toMatchObject({ kind: 'image', title: CAPTURED_WORKSHEET_TITLES.fitness });
    expect(saved.draft.document.blocks[5]).toEqual(document.blocks[5]);
    expect(saved.draft.previewNeedsRefresh).toBe(false);
});
