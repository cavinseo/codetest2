// WS-5에서 여는 Kano 주소가 프로젝트의 WS-6 화면을 표시하는지 확인합니다.
// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import KanoSurveyPage from '../app/project/[id]/kano/page';
import ProjectWorksheetMenu from '../components/project/ProjectWorksheetMenu';

vi.mock('next/navigation', () => ({
    useParams: () => ({ id: 'project' }),
    usePathname: () => '/project/project/kano',
    useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('next/link', () => ({ default: (props: any) => createElement('a', props) }));
vi.mock('../components/project/KanoManager', () => ({ default: () => createElement('div', { 'data-testid': 'kano-manager' }, 'Kano 설문') }));
vi.mock('../components/project/MentorWorksheetAnalysis', () => ({ default: () => null }));
vi.mock('../components/project/WorksheetComments', () => ({ default: () => null }));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        const project = { id: 'project', name: 'AI PLC 관리 장비', description: '설명', createdAt: '2026-09-01', role: 'OWNER' };
        const data = url === '/api/projects' ? { projects: [project] }
            : url.endsWith('/overview') ? { project }
                : { requirements: [], specFunctions: [], totalResponses: 0 };
        return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
});

afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
});

it('Kano 주소에서 별도 좁은 페이지 대신 프로젝트 제목과 WS-6 탭을 표시한다', async () => {
    await act(async () => root.render(createElement(KanoSurveyPage)));

    expect(container.querySelector('h1')?.textContent).toBe('AI PLC 관리 장비');
    expect(container.querySelector('.nav-tab-active')?.textContent).toContain('[WS-6] KANO 질문지');
    expect(container.querySelector('[data-testid="kano-manager"]')).not.toBeNull();
    expect(container.querySelector('main')?.className).toContain('max-w-[1800px]');
    expect(container.textContent).not.toContain('[WS-6] Kano 설문 관리');
});

it('Kano 화면에서는 별도 워크시트 상단 메뉴를 중복 표시하지 않는다', async () => {
    await act(async () => root.render(createElement(ProjectWorksheetMenu, { projectId: 'project' })));
    expect(container.innerHTML).toBe('');
});
