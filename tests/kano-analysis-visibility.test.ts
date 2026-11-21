// Kano 분석 권한에 따라 워크시트·탭·수정 기능이 노출되고 상세 조회가 제한되는지 검증한다.
// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectDetailWorkspace } from '../app/project/[id]/page';
import KanoManager from '../components/project/KanoManager';
import ProjectWorksheetMenu from '../components/project/ProjectWorksheetMenu';

vi.mock('next/navigation', () => ({
    useParams: () => ({ id: 'project' }),
    usePathname: () => '/project/project/requirements',
    useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('next/link', () => ({ default: (props: any) => createElement('a', props) }));
vi.mock('../components/ThemeToggle', () => ({ default: () => null }));
vi.mock('../components/project/MentorWorksheetAnalysis', () => ({ default: () => null }));
vi.mock('../components/project/WorksheetComments', () => ({ default: () => null }));
vi.mock('../components/project/WorksheetImageExport', () => ({ default: ({ children }: any) => children }));
vi.mock('../components/Kano2DChart', () => ({ default: () => createElement('output', { 'data-testid': 'timko-chart' }, 'TIMKO 결과') }));
vi.mock('../components/project/KanoSatisfactionGraph', () => ({ default: ({ analysis }: any) => createElement('output', { 'data-testid': 'ws7-analysis' }, JSON.stringify(analysis)) }));
vi.mock('../components/project/KanoAggregationTable', () => ({
    default: ({ projectId, analysis }: any) => createElement('div', {
        'data-testid': 'aggregate',
        'data-edit-project': projectId ?? '',
    }, JSON.stringify(analysis), projectId && createElement('button', { type: 'button' }, '가중치 저장')),
}));

const fetchMock = vi.fn();
let access = { canRead: false, canEdit: false };
let projectRole = 'OWNER';
let container: HTMLDivElement;
let root: Root;
const requirement = {
    id: 'req-1', category: '품질', subcategory: '안정성', requirement: '안전하게 운용한다', order: 0,
};
const analysis = {
    totalResponses: 3,
    uniqueRespondents: 2,
    requirements: [{
        requirementId: requirement.id,
        responseCount: 3,
        better: 0.67,
        worse: -1,
        aggregated: { M: 1, O: 2, A: 0, I: 0, R: 0, Q: 0, total: 3, dominantCategory: 'O' },
        quadrant: 'O', kanoWeight: 2, timkoCategory: '일원',
    }],
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
});

function detailedAnalysisCalls() {
    return fetchMock.mock.calls.filter(([url, init]) => {
        const parsed = new URL(String(url), 'http://localhost');
        return parsed.pathname.endsWith('/kano/analysis')
            && parsed.searchParams.get('view') !== 'summary'
            && (!init?.method || init.method === 'GET');
    });
}

async function renderWorkspace(initialTab = 'kano') {
    await act(async () => root.render(createElement(ProjectDetailWorkspace, { initialTab })));
}

async function clickButton(text: string) {
    const button = [...container.querySelectorAll('button')].find(item => item.textContent?.trim().startsWith(text));
    expect(button, text).toBeDefined();
    await act(async () => button!.click());
}

beforeEach(() => {
    access = { canRead: false, canEdit: false };
    projectRole = 'OWNER';
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation(async (input) => {
        const url = new URL(String(input), 'http://localhost');
        const project = {
            id: 'project', name: '권한 검증 프로젝트', role: projectRole, createdAt: '2026-10-12',
        };
        if (url.pathname.endsWith('/kano/analysis')) {
            return url.searchParams.get('view') === 'summary'
                ? json({ ...access, totalResponses: 3, uniqueRespondents: 2 })
                : access.canRead ? json({ ...analysis, ...access }) : json({ error: '분석 열람 권한이 없습니다.' }, 403);
        }
        if (url.pathname === '/api/projects') return json({ projects: [project] });
        if (url.pathname.endsWith('/overview') || url.pathname === '/api/projects/project') return json({ project });
        if (url.pathname.endsWith('/requirements')) return json({ requirements: [requirement] });
        if (url.pathname.endsWith('/kano/invitations')) return json({ invitations: [
            { id: 'inv-1', email: 'first@example.test', respondedAt: '2026-10-12', expiresAt: '2026-11-12' },
            { id: 'inv-2', email: 'second@example.test', respondedAt: '2026-10-12', expiresAt: '2026-11-12' },
        ] });
        return json({ specFunctions: [], respondents: [], google: { configured: false } });
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

describe('프로젝트의 WS-7 접근 표시', () => {
    it.each([
        ['멘티', 'OWNER'],
        ['미배정 프로그램 매니저', 'PROGRAM_MANAGER'],
    ])('%s는 WS-7 메뉴와 상세 조회가 없고 WS-6 설문을 계속 작성할 수 있다', async (_member, role) => {
        projectRole = role;
        await renderWorkspace();
        expect(container.textContent).toContain('[WS-6] KANO 질문지');
        expect(container.textContent).not.toContain('[WS-7] TIMKO/만족계수 그래프');
        expect(container.textContent).toContain('설문 질문 구성');
        expect(container.textContent).toContain(requirement.requirement);
        expect(detailedAnalysisCalls()).toHaveLength(0);
        expect(container.querySelector('[data-testid="ws7-analysis"]')).toBeNull();
        expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/kano/analysis?view=summary'))).toBe(true);
    });

    it('멘티가 WS-7 주소로 바로 들어와도 상세 결과를 먼저 요청하지 않는다', async () => {
        await renderWorkspace('kano-aggregation');
        expect(detailedAnalysisCalls()).toHaveLength(0);
        expect(container.querySelector('[data-testid="ws7-analysis"]')).toBeNull();
        expect(container.querySelector('[data-testid="aggregate"]')).toBeNull();
        expect(container.textContent).not.toContain('[WS-7] TIMKO/만족계수 그래프');
    });

    it('배정 멘토는 WS-7을 열고 현재 프로젝트의 가중치를 수정할 수 있다', async () => {
        access = { canRead: true, canEdit: true };
        projectRole = 'EDITOR';
        await renderWorkspace();
        await clickButton('[WS-7] TIMKO/만족계수 그래프');
        expect(detailedAnalysisCalls().length).toBeGreaterThan(0);
        const rows = JSON.parse(container.querySelector('[data-testid="ws7-analysis"]')!.textContent!);
        expect(rows[0]).toMatchObject({ requirementId: 'req-1', requirementName: requirement.requirement, responseCount: 3 });
        expect(container.querySelector('[data-testid="aggregate"]')?.getAttribute('data-edit-project')).toBe('project');
        expect(container.textContent).toContain('가중치 저장');
    });

    it('관리자는 WS-7 집계표를 읽지만 가중치 편집용 프로젝트 ID를 받지 않는다', async () => {
        access = { canRead: true, canEdit: false };
        projectRole = 'ADMIN';
        await renderWorkspace('kano-aggregation');
        expect(container.querySelector('[data-testid="ws7-analysis"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="aggregate"]')?.getAttribute('data-edit-project')).toBe('');
        expect(container.textContent).not.toContain('가중치 저장');
        expect(detailedAnalysisCalls().length).toBeGreaterThan(0);
    });
});

describe('Kano 관리 화면의 상세 분석 표시', () => {
    it('분석 초기 주소를 요청한 멘티는 설문 관리와 응답자 조회만 사용할 수 있다', async () => {
        await act(async () => root.render(createElement(KanoManager, { projectId: 'project', initialView: 'analysis' })));
        expect(container.textContent).toContain('설문 관리');
        expect(container.textContent).toContain('설문 질문 구성');
        expect(container.textContent).toContain('응답 완료');
        expect(container.textContent).toContain('2명');
        expect(container.textContent).not.toContain('분석 결과');
        expect(container.textContent).toContain('응답 결과 보기');
        expect(container.textContent).toContain('응답자별 보기');
        await clickButton('응답자별 보기');
        expect(container.querySelector('[data-timko-coefficients]')).toBeNull();
        expect(container.querySelector('[data-testid="aggregate"]')).toBeNull();
        expect(detailedAnalysisCalls()).toHaveLength(0);
    });

    it('배정 멘토는 설문 관리의 분석 탭과 응답 결과 버튼을 사용할 수 있다', async () => {
        access = { canRead: true, canEdit: true };
        await act(async () => root.render(createElement(KanoManager, { projectId: 'project' })));
        expect(container.textContent).toContain('응답 결과 보기');
        await clickButton('분석 결과');
        expect(container.querySelector('[data-testid="timko-chart"]')).not.toBeNull();
        expect(container.querySelector('[data-timko-coefficients]')?.textContent).toContain(requirement.requirement);
        expect(container.querySelector('[data-testid="aggregate"]')?.getAttribute('data-edit-project')).toBe('project');
    });

    it('관리자의 Kano 분석 화면도 집계 가중치 수정 기능이 없다', async () => {
        access = { canRead: true, canEdit: false };
        await act(async () => root.render(createElement(KanoManager, { projectId: 'project', initialView: 'analysis' })));
        expect(container.querySelector('[data-testid="aggregate"]')?.getAttribute('data-edit-project')).toBe('');
        expect(container.textContent).not.toContain('가중치 저장');
        expect(container.querySelector('[data-testid="timko-chart"]')).not.toBeNull();
        expect(container.querySelector('[data-timko-coefficients]')?.textContent).toContain(requirement.requirement);
    });
});

describe('개별 워크시트의 공통 이동 메뉴', () => {
    it.each([false, true])('분석 권한 %s에 맞게 Kano 분석 링크만 표시한다', async (canRead) => {
        access = { canRead, canEdit: canRead };
        await act(async () => root.render(createElement(ProjectWorksheetMenu, { projectId: 'project' })));
        expect(container.querySelector('a[href="/project/project/kano/analysis"]') !== null).toBe(canRead);
        expect(container.querySelector('a[href="/project/project/kano"]')).not.toBeNull();
    });
});
