// WS-6 응답 변경 후 WS-7 재조회와 실패·지연 응답 처리를 검증한다.
// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ProjectDetailWorkspace } from '../app/project/[id]/page';

vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'project' }), useRouter: () => ({ push: vi.fn() }) }));
vi.mock('next/link', () => ({ default: (props: any) => createElement('a', props) }));
vi.mock('../components/ThemeToggle', () => ({ default: () => null }));
vi.mock('../components/project/MentorWorksheetAnalysis', () => ({ default: () => null }));
vi.mock('../components/project/WorksheetComments', () => ({ default: () => null }));
vi.mock('../components/project/WorksheetImageExport', () => ({ default: ({ children }: any) => children }));
vi.mock('../components/project/KanoSatisfactionGraph', () => ({ default: ({ analysis }: any) => createElement('output', { 'data-testid': 'ws7-rows' }, JSON.stringify(analysis)) }));
vi.mock('../components/project/KanoAggregationTable', () => ({ default: () => null }));

const fetchMock = vi.fn();
let responseCount = 1;
let requirementName = '안전';
let analysisFailure = false;
let container: HTMLDivElement;
let root: Root;
function analysis() {
    return { totalResponses: responseCount, uniqueRespondents: responseCount, requirements: responseCount === 0 ? [] : [{
        requirementId: 'req', responseCount, better: responseCount === 1 ? 0 : 0.5, worse: -1,
        aggregated: { M: 1, O: responseCount - 1, A: 0, I: 0, R: 0, Q: 0, total: responseCount, dominantCategory: 'M' },
        quadrant: 'M', kanoWeight: 1, timkoCategory: 'M',
    }] };
}
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
async function click(text: string) {
    const button = [...container.querySelectorAll('button')].find(item => item.textContent?.trim() === text);
    expect(button, text).toBeDefined();
    await act(async () => button!.click());
}
async function upload() {
    await act(async () => root.render(createElement(ProjectDetailWorkspace, { initialTab: 'kano' })));
    await click('오프라인 응답파일 업로드');
    const input = container.querySelector<HTMLInputElement>('input[accept=".html,.htm"]')!;
    await act(async () => {
        Object.defineProperty(input, 'files', { value: [new File(['fixture'], 'response.html', { type: 'text/html' })], configurable: true });
        input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await click('업로드');
    await click('기존 데이터에 추가');
    expect(responseCount).toBe(2);
    expect(fetchMock.mock.calls.some(([url, init]) => String(url).endsWith('/kano/upload-offline') && init?.method === 'POST')).toBe(true);
}
beforeEach(() => {
    responseCount = 1;
    requirementName = '안전';
    analysisFailure = false;
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation(async (url, init) => {
        const project = { id: 'project', name: '연계 점검', role: 'OWNER', createdAt: '2026-10-03' };
        if (String(url).endsWith('/kano/upload-offline') && init?.method === 'POST') {
            responseCount = 2;
            return json({ success: true, message: '응답 저장 완료', results: [] });
        }
        if (String(url).endsWith('/kano/analysis')) return analysisFailure ? new Response('{}', { status: 500 }) : json(analysis());
        if (url === '/api/projects') return json({ projects: [project] });
        if (String(url).endsWith('/overview')) return json({ project });
        return json({ requirements: [{ id: 'req', requirement: requirementName, category: '품질', order: 0 }], specFunctions: [], invitations: [], respondents: [] });
    });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
});
afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
});
it('WS-6에서 저장한 두 번째 응답이 WS-7 탭 이동 직후 보여야 한다', async () => {
    await upload();
    const before = fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/kano/analysis')).length;
    await click('[WS-7] TIMKO/만족계수 그래프');
    const after = fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/kano/analysis')).length;
    const rows = JSON.parse(container.querySelector('[data-testid="ws7-rows"]')!.textContent!);
    expect(rows[0].responseCount).toBe(responseCount);
    expect(rows[0].better).toBe(0.5);
    expect(after - before).toBe(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/projects/project/kano/analysis', expect.objectContaining({ cache: 'no-store' }));
});

it('응답을 모두 지운 후 WS-7에 다시 들어가면 이전 그래프를 남기지 않는다', async () => {
    await act(async () => root.render(createElement(ProjectDetailWorkspace, { initialTab: 'kano-aggregation' })));
    await click('[WS-6] KANO 질문지');
    responseCount = 0;
    await click('[WS-7] TIMKO/만족계수 그래프');
    expect(JSON.parse(container.querySelector('[data-testid="ws7-rows"]')!.textContent!)).toEqual([]);
});

it('WS-7 재진입 시 요구사항 이름도 최신 상태로 읽는다', async () => {
    await act(async () => root.render(createElement(ProjectDetailWorkspace, { initialTab: 'kano-aggregation' })));
    await click('[WS-6] KANO 질문지');
    requirementName = '변경된 안전 요구사항';
    await click('[WS-7] TIMKO/만족계수 그래프');
    const rows = JSON.parse(container.querySelector('[data-testid="ws7-rows"]')!.textContent!);
    expect(rows[0].requirementName).toBe(requirementName);
});

it('재조회 실패 시 과거 그래프를 숨기고 다시 불러올 수 있다', async () => {
    await act(async () => root.render(createElement(ProjectDetailWorkspace, { initialTab: 'kano-aggregation' })));
    await click('[WS-6] KANO 질문지');
    analysisFailure = true;
    await click('[WS-7] TIMKO/만족계수 그래프');
    expect(container.querySelector('[data-testid="ws7-rows"]')).toBeNull();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('분석 결과를 불러오지 못했습니다.');
    analysisFailure = false;
    responseCount = 2;
    await click('분석 다시 불러오기');
    const rows = JSON.parse(container.querySelector('[data-testid="ws7-rows"]')!.textContent!);
    expect(rows[0].responseCount).toBe(2);
});

it('떠난 탭의 느린 조회가 뒤늦게 끝나도 재진입 후 최신 결과를 덮어쓰지 않는다', async () => {
    await act(async () => root.render(createElement(ProjectDetailWorkspace, { initialTab: 'kano' })));
    const fallback = fetchMock.getMockImplementation()!;
    let resolveOld: (response: Response) => void = () => {};
    let pending = true;
    fetchMock.mockImplementation((url, init) => {
        if (pending && String(url).endsWith('/kano/analysis')) {
            pending = false;
            return new Promise<Response>(resolve => { resolveOld = resolve; });
        }
        return fallback(url, init);
    });
    const oldAnalysis = analysis();
    await click('[WS-7] TIMKO/만족계수 그래프');
    expect(container.querySelector('[data-testid="ws7-rows"]')).toBeNull();
    expect(container.textContent).toContain('분석 결과를 불러오는 중입니다.');
    await click('[WS-6] KANO 질문지');
    responseCount = 2;
    await click('[WS-7] TIMKO/만족계수 그래프');
    await act(async () => resolveOld(json(oldAnalysis)));
    expect(JSON.parse(container.querySelector('[data-testid="ws7-rows"]')!.textContent!)[0].responseCount).toBe(2);
});
it('프로젝트 화면을 다시 열면 WS-7이 저장된 최신 응답을 읽는다', async () => {
    await upload();
    await act(async () => root.render(null));
    await act(async () => root.render(createElement(ProjectDetailWorkspace, { initialTab: 'kano-aggregation' })));
    const rows = JSON.parse(container.querySelector('[data-testid="ws7-rows"]')!.textContent!);
    expect(rows[0]).toMatchObject({ responseCount: 2, better: 0.5, worse: -1 });
});
