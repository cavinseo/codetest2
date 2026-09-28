// 개요 저장 시 미편집 null과 사용자가 지운 빈 문자열을 실제 입력 흐름에서 구분한다.
// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ProjectDetailPage from '../app/project/[id]/page';
import { hasProductOverviewSource } from '../lib/final-report-document';

vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'project' }), useRouter: () => ({ push: vi.fn() }) }));
vi.mock('next/link', () => ({ default: (props: any) => createElement('a', props) }));
vi.mock('../components/ThemeToggle', () => ({ default: () => null }));
vi.mock('../components/project/WorksheetComments', () => ({ default: () => null }));
vi.mock('../components/project/MentorWorksheetAnalysis', () => ({ default: () => null }));

const empty = { productName: null, marketDefinition: null, targetCustomer: null, productImageDataUrl: null, productImageWidthPx: null, productImageHeightPx: null };
let project: Record<string, unknown>;
let container: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn();
const optimizeImage = vi.hoisted(() => vi.fn());
vi.mock('../lib/final-report-image', () => ({ optimizeReportImage: optimizeImage }));
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jx1cAAAAASUVORK5CYII=';
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    optimizeImage.mockResolvedValue({ dataUrl: png, widthPx: 1, heightPx: 1 });
    project = { id: 'project', name: '기존 프로젝트', description: '기존 설명', createdAt: '2026-09-01', role: 'OWNER', ...empty };
    fetchMock.mockImplementation(async (url: string, options?: RequestInit) => {
        if (url === '/api/projects') return json({ projects: [project] });
        if (url.endsWith('/overview')) {
            if (options?.method === 'PATCH') project = { ...project, ...JSON.parse(String(options.body)) };
            return json({ project });
        }
        return json({ requirements: [], specFunctions: [], analysis: [], totalResponses: 0 });
    });
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
async function click(text: string) {
    const button = [...container.querySelectorAll('button')].find(button => button.textContent?.trim() === text);
    expect(button).toBeDefined();
    await act(async () => button!.click());
}
async function input(element: HTMLInputElement | HTMLTextAreaElement, text: string) {
    await act(async () => {
        const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, text);
        element.dispatchEvent(new Event('input', { bubbles: true }));
    });
}
function savedBody() {
    return JSON.parse(String(fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH')![1].body));
}

it('프로젝트명만 고쳐 저장해도 개요 null을 보존하며 보고서는 개요의 미입력 상태를 따른다', async () => {
    await act(async () => root.render(createElement(ProjectDetailPage)));
    await click('수정');
    const name = [...container.querySelectorAll('input')].find(element => element.value === '기존 프로젝트')!;
    await input(name, '새 프로젝트명');
    await click('저장');
    expect(savedBody()).toMatchObject({ ...empty, name: '새 프로젝트명' });
    expect(hasProductOverviewSource(savedBody())).toBe(true);
});

it('제품 정보를 입력했다 직접 지우면 빈 문자열로 저장해 보고서의 명시적 삭제를 보존한다', async () => {
    await act(async () => root.render(createElement(ProjectDetailPage)));
    await click('수정');
    const fields = ['제품(서비스) 명', '시장정의', '목표 고객'];
    for (const field of fields) {
        const label = [...container.querySelectorAll('label')].find(node => node.textContent?.trim() === field)!;
        const textarea = label.querySelector('textarea')!;
        await input(textarea, '임시 입력');
        await input(textarea, '');
    }
    await click('저장');
    expect(savedBody()).toMatchObject({ productName: '', marketDefinition: '', targetCustomer: '' });
    expect(hasProductOverviewSource(savedBody())).toBe(true);
});

async function chooseImages(count: number, type = 'image/png') {
    const picker = container.querySelector<HTMLInputElement>('input[accept="image/png,image/jpeg"]')!;
    expect(picker.multiple).toBe(true);
    await act(async () => {
        Object.defineProperty(picker, 'files', { configurable: true, value: Array.from({ length: count }, (_, i) => new File(['image'], `${i}.png`, { type })) });
        picker.dispatchEvent(new Event('change', { bubbles: true }));
    });
}
const shownImages = () => container.querySelectorAll('img[alt^="관련이미지 "]');

it('기존 제품 이미지에 두 장을 추가해 저장하면 세 장을 유지하고 개별 삭제 후 다시 추가할 수 있다', async () => {
    project = { ...project, productImageDataUrl: png, productImageWidthPx: 1, productImageHeightPx: 1 };
    await act(async () => root.render(createElement(ProjectDetailPage)));
    expect(container.textContent).toContain('관련이미지 올리기');
    expect(container.textContent).toContain('제품 이미지와 BM(비즈니스 모델) 이미지를 최대 3개까지 올려 주세요.');
    expect(shownImages()).toHaveLength(1);
    await click('수정');
    await chooseImages(2);
    expect(shownImages()).toHaveLength(3);
    expect(container.querySelector<HTMLInputElement>('input[accept="image/png,image/jpeg"]')?.disabled).toBe(true);
    await click('저장');
    expect(savedBody().relatedImages).toHaveLength(3);
    await act(async () => root.unmount());
    root = createRoot(container);
    await act(async () => root.render(createElement(ProjectDetailPage)));
    expect(shownImages()).toHaveLength(3);
    await click('수정');
    await click('관련이미지 2 삭제');
    expect(shownImages()).toHaveLength(2);
    await chooseImages(1);
    expect(shownImages()).toHaveLength(3);
});

it('최대 개수를 넘거나 잘못된 파일을 선택하면 기존 이미지를 유지한다', async () => {
    project = { ...project, productImageDataUrl: png, productImageWidthPx: 1, productImageHeightPx: 1 };
    await act(async () => root.render(createElement(ProjectDetailPage)));
    await click('수정');
    await chooseImages(3);
    expect(container.textContent).toContain('관련이미지는 최대 3개까지 올릴 수 있습니다.');
    expect(optimizeImage).not.toHaveBeenCalled();
    expect(shownImages()).toHaveLength(1);
    await chooseImages(1, 'image/svg+xml');
    expect(container.textContent).toContain('PNG 또는 JPEG 이미지를 선택하세요.');
    expect(shownImages()).toHaveLength(1);
    optimizeImage.mockRejectedValueOnce(new Error('이미지 읽기 실패'));
    await chooseImages(2);
    expect(container.textContent).toContain('이미지 읽기 실패');
    expect(shownImages()).toHaveLength(1);
});

it('관련이미지를 모두 삭제해 저장하고 다시 열어도 기존 이미지가 되살아나지 않는다', async () => {
    project = { ...project, productImageDataUrl: png, productImageWidthPx: 1, productImageHeightPx: 1 };
    await act(async () => root.render(createElement(ProjectDetailPage)));
    await click('수정');
    await click('관련이미지 1 삭제');
    await click('저장');
    expect(savedBody()).toMatchObject({ relatedImages: [], productImageDataUrl: null, productImageWidthPx: null, productImageHeightPx: null });
    expect(shownImages()).toHaveLength(0);
    await click('수정');
    expect(shownImages()).toHaveLength(0);
});

it('읽기 전용 사용자에게는 관련이미지 선택과 삭제 버튼이 없다', async () => {
    project = { ...project, role: 'VIEWER', relatedImages: [{ dataUrl: png, widthPx: 1, heightPx: 1 }] };
    await act(async () => root.render(createElement(ProjectDetailPage)));
    expect(shownImages()).toHaveLength(1);
    expect(container.querySelector('input[type="file"]')).toBeNull();
    expect(container.textContent).not.toContain('관련이미지 1 삭제');
});
