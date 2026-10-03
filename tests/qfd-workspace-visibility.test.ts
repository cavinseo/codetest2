// 프로젝트 WS-9의 접기·펼치기가 읽기 권한에서도 작동하고 편집 권한을 유지하는지 검증한다.
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

const technicals = [
    { id: 'tech-1', name: '측정 속도', groupIndex: 0, columnOrder: 0, unit: 'ms', targetValue: '10' },
    { id: 'tech-2', name: '측정 정확도', groupIndex: 1, columnOrder: 1, unit: '%', targetValue: '99' },
];
const requirements = [{ id: 'req', category: '품질', requirement: '정확한 측정' }];
let container: HTMLDivElement;
let root: Root;
let role: string;
let fetchMock: ReturnType<typeof vi.fn>;

function button(label: string) {
    const found = [...container.querySelectorAll('button')].find(element => element.textContent?.trim() === label);
    expect(found, `${label} 버튼`).toBeDefined();
    return found!;
}

beforeEach(() => {
    role = 'OWNER';
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(init?.method || 'GET').toBe('GET');
        const pathname = String(input);
        const project = { id: 'project', name: 'WS-9 보기 검증', role, createdAt: '2026-10-03' };
        const body = pathname === '/api/projects' ? { projects: [project] }
            : pathname.endsWith('/overview') ? { project }
            : pathname.endsWith('/requirements') ? { requirements }
            : pathname.endsWith('/qfd/technical') ? { technicalCharacteristics: technicals, canWrite: role === 'OWNER' }
            : pathname.endsWith('/qfd/analysis') ? {
                requirements: [{ requirementId: 'req', weight: 2, weightPercent: 100, selfScore: 0, competitorScore: 0, planQuality: 0, improvementRate: 0, absoluteImportance: 2, qualityImportancePercent: 100, rank: 1 }],
                technicals: technicals.map(tech => ({ technicalCharId: tech.id, name: tech.name, totalScore: 0, rank: 0, importancePercent: 0 })),
            }
            : pathname.endsWith('/tech-tree') ? { entries: technicals.map(tech => ({ subSpec: tech.name, coreSpec: '정밀 측정' })) }
            : { specFunctions: [], totalResponses: 0, relationships: [], benchmarks: [], technicalBenchmarks: [] };
        return new Response(JSON.stringify(body), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
});

afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
});

it.each(['OWNER', 'VIEWER', 'COACH'])('%s도 WS-9 기술특성을 접고 펼치며 저장 내용을 보존한다', async currentRole => {
    role = currentRole;
    const original = structuredClone(technicals);
    await act(async () => root.render(createElement(ProjectDetailWorkspace, { initialTab: 'qfd' })));
    expect(container.querySelector('[aria-label="측정 속도 세부기능"]')).toBeNull();
    const expand = button('기술상태펼치기');
    expect(expand.matches(':disabled')).toBe(false);
    await act(async () => expand.click());

    const name = container.querySelector<HTMLSelectElement>('[aria-label="측정 속도 세부기능"]')!;
    expect(name).not.toBeNull();
    expect(name.value).toBe('측정 속도');
    expect(container.querySelector('[aria-label="측정 정확도 세부기능"]')).not.toBeNull();
    expect(name.matches(':disabled')).toBe(role !== 'OWNER');
    if (role === 'OWNER') expect(button('+ 그룹').matches(':disabled')).toBe(false);
    else expect([...container.querySelectorAll('button')].some(element => element.textContent?.trim() === '+ 그룹')).toBe(false);
    if (role !== 'OWNER') {
        for (const input of container.querySelectorAll('input, select, textarea')) {
            expect(input.matches(':disabled')).toBe(true);
        }
    }
    await act(async () => button('기술상태 접기').click());
    expect(container.querySelector('[aria-label="측정 속도 세부기능"]')).toBeNull();
    await act(async () => button('기술상태펼치기').click());
    expect(container.querySelector<HTMLSelectElement>('[aria-label="측정 속도 세부기능"]')!.value).toBe('측정 속도');
    expect(technicals).toEqual(original);
    expect(fetchMock.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true);
});
