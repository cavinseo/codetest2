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
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
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

it('프로젝트명만 고쳐 저장하면 제품 개요 null을 보존해 보고서 기존 입력을 계속 사용한다', async () => {
    await act(async () => root.render(createElement(ProjectDetailPage)));
    await click('수정');
    const name = [...container.querySelectorAll('input')].find(element => element.value === '기존 프로젝트')!;
    await input(name, '새 프로젝트명');
    await click('저장');
    expect(savedBody()).toMatchObject({ ...empty, name: '새 프로젝트명' });
    expect(hasProductOverviewSource(savedBody())).toBe(false);
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
