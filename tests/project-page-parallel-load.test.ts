// 프로젝트 홈이 첫 화면에 필요한 요청 다섯 개를 차례로가 아니라 한꺼번에 보내는지, 그리고
// 필수인 개요와 선택인 건수 요청의 실패를 구분하는지 실제 React DOM 으로 확인한다
// (2026-10-25 코드 리뷰 L5).
// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ProjectDetailPage from '../app/project/[id]/page';

vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'project' }), useRouter: () => ({ push: vi.fn() }) }));
vi.mock('next/link', () => ({ default: (props: any) => createElement('a', props) }));
vi.mock('../components/ThemeToggle', () => ({ default: () => null }));
vi.mock('../components/project/WorksheetComments', () => ({ default: () => null }));
vi.mock('../components/project/MentorWorksheetAnalysis', () => ({ default: () => null }));

const project = { id: 'project', name: '스마트 화분', description: '설명', createdAt: '2026-09-01', role: 'OWNER', memberCount: 3 };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const STARTUP_URLS = [
    '/api/projects',
    '/api/projects/project/overview',
    '/api/projects/project/requirements',
    '/api/projects/project/kano/analysis',
    '/api/projects/project/spec',
];

let container: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn();

function respond(url: string): Response {
    if (url === '/api/projects') return json({ projects: [project] });
    if (url.endsWith('/overview')) return json({ project });
    if (url.endsWith('/requirements')) return json({ requirements: [{ id: 'r1' }, { id: 'r2' }] });
    if (url.endsWith('/kano/analysis')) return json({ analysis: [], totalResponses: 7 });
    if (url.endsWith('/spec')) return json({ specFunctions: [{ id: 's1' }, { id: 's2' }, { id: 's3' }] });
    return json({});
}

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

it('첫 화면 요청 다섯 개를 응답을 기다리지 않고 한꺼번에 보낸다', async () => {
    // 어떤 요청도 아직 응답하지 않은 상태에서 다섯 개가 모두 나갔는지 본다. 예전에는 첫 응답을
    // 받기 전까지 두 번째 요청이 나가지 않았다.
    const pending: Array<{ url: string; resolve: (response: Response) => void }> = [];
    fetchMock.mockImplementation((url: string) => new Promise<Response>((resolve) => pending.push({ url, resolve })));

    await act(async () => root.render(createElement(ProjectDetailPage)));

    expect(pending.map((request) => request.url).sort()).toEqual([...STARTUP_URLS].sort());

    await act(async () => {
        for (const request of pending) request.resolve(respond(request.url));
    });
    expect(container.textContent).toContain('스마트 화분');
    // 팀원 수는 목록에서만 온다. 개요로 덮을 때도 목록 값을 이어받아야 한다.
    expect(container.textContent).toContain('3명');
    expect(container.textContent).toContain('3개');
    expect(container.textContent).toContain('2개');
    expect(container.textContent).toContain('7개');
});

it('개요를 볼 권한이 없으면 건수와 상관없이 권한 오류를 보인다', async () => {
    fetchMock.mockImplementation(async (url: string) => (url.endsWith('/overview') ? json({ error: 'denied' }, 403) : respond(url)));

    await act(async () => root.render(createElement(ProjectDetailPage)));

    expect(container.textContent).toContain('이 프로젝트에 접근할 권한이 없습니다.');
    expect(container.textContent).not.toContain('스마트 화분');
});

it('건수 요청이 실패해도 프로젝트 화면은 뜨고 그 건수만 0 으로 보인다', async () => {
    fetchMock.mockImplementation(async (url: string) => {
        if (url.endsWith('/kano/analysis')) throw new TypeError('network down');
        if (url.endsWith('/spec')) return json({ error: 'boom' }, 500);
        return respond(url);
    });

    await act(async () => root.render(createElement(ProjectDetailPage)));

    expect(container.textContent).toContain('스마트 화분');
    expect(container.textContent).not.toContain('프로젝트를 불러오지 못했습니다');
    expect(container.textContent).toContain('2개');
    expect(container.textContent).toContain('응답 대기 중');
    expect(container.textContent).toContain('아직 작성되지 않음');
});
