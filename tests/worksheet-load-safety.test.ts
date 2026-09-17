// 워크시트 조회 실패 시 빈 데이터 저장을 차단하고 재시도 후 기존 데이터를 보존하는지 검증한다.
// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DevPlanTable from '../components/project/DevPlanTable';
import TechRoadmapTable from '../components/project/TechRoadmapTable';
import TargetSpecTable from '../components/project/TargetSpecTable';
import AssetsTable from '../components/project/AssetsTable';
import FundingTable from '../components/project/FundingTable';
import RequirementsTable from '../components/project/RequirementsTable';
import SpecTable from '../components/project/SpecTable';
import ImprovementsTable from '../components/project/ImprovementsTable';
import SalesTable from '../components/project/SalesTable';
import ProductAttributesTable from '../components/project/ProductAttributesTable';
import FitnessWrapper from '../components/project/FitnessWrapper';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const worksheets = [
    { Component: DevPlanTable, endpoint: 'dev-plan', row: { id: 'saved', task: '기존 개발 계획', order: 0 } },
    { Component: TechRoadmapTable, endpoint: 'tech-roadmap', row: { id: 'saved', techItem: '기존 기술', order: 0 } },
    { Component: TargetSpecTable, endpoint: 'target-spec', row: { id: 'saved', specItem: '기존 사양', order: 0 } },
];
let container: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn();
const button = (label: string) => [...container.querySelectorAll('button')].find(item => item.textContent === label);
const writes = () => fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST');
beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('alert', vi.fn());
    vi.spyOn(console, 'error').mockImplementation(() => {});
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

const relatedWorksheets = [
    { Component: AssetsTable, endpoint: 'assets', data: { assets: [{ id: 'saved', type: 'CORE', content: '기존 자료', order: 0 }] } },
    { Component: FundingTable, endpoint: 'funding', data: { plans: [{ id: 'saved', category: '인건비', item: '기존 자료', year1: 10, year2: 20, year3: 30, order: 0 }], sources: [] } },
    { Component: RequirementsTable, endpoint: 'requirements', data: { requirements: [{ id: 'saved', category: '기능', subcategory: '', requirement: '기존 자료', order: 0 }] } },
    { Component: SpecTable, endpoint: 'spec', data: { specFunctions: [{ id: 'saved', level: 'CORE', name: '기존 자료', order: 0 }] } },
    { Component: ImprovementsTable, endpoint: 'improvements', data: { items: [{ id: 'saved', type: 'need', content: '기존 자료', improvementRate: '1', devProportion: '10', order: 0 }] } },
    { Component: SalesTable, endpoint: 'sales', data: { rows: [{ id: 'saved', period: 'Y', customer: '기존 자료', amount: 10, order: 0 }] } },
    { Component: ProductAttributesTable, endpoint: 'attributes', data: { attributes: [{ id: 'saved', productName: '기존 자료', attribute: '품질', order: 0 }] } },
    { Component: FitnessWrapper, endpoint: 'fitness-matrix', data: { fitnessMatrix: { marketsJson: '[]', matrixJson: '{}', managerComment: '기존 자료' } } },
];

describe.each(relatedWorksheets)('$endpoint 동일한 조회 실패 보호', ({ Component, endpoint, data }) => {
    it.each(['http', 'network', 'json', 'missing-data'])('%s 실패 뒤 저장을 차단하고 재시도 후 기존 자료를 저장한다', async failure => {
        let recovered = false;
        fetchMock.mockImplementation(async (url: string, options?: { method: string }) => {
            if (!url.endsWith(endpoint)) return { ok: true, json: async () => ({
                projects: [], requirements: [], specFunctions: [],
                attributes: [{ id: 'saved', attribute: '품질', order: 0 }],
            }) };
            if (recovered || options?.method === 'POST') return { ok: true, json: async () => data };
            if (failure === 'network') throw new Error('offline');
            return { ok: failure !== 'http', json: async () => {
                if (failure === 'json') throw new SyntaxError('invalid JSON');
                return {};
            } };
        });
        await act(async () => root.render(createElement(Component, { projectId: 'project-a' })));
        expect(container.querySelector('[role="alert"]')).not.toBeNull();
        expect(button('저장')).toBeUndefined();
        expect(writes()).toHaveLength(0);
        recovered = true;
        await act(async () => button('다시 불러오기')!.click());
        expect(container.querySelector('[role="alert"]')).toBeNull();
        expect(button('저장')?.disabled).toBe(false);
        await act(async () => button('저장')!.click());
        expect(writes()).toHaveLength(1);
        expect(writes()[0][1].body).toContain('기존 자료');
    });
});

it('적합도 내부 JSON이 손상된 경우 새 기본값으로 덮어쓰지 않는다', async () => {
    fetchMock.mockImplementation(async (url: string) => ({ ok: true, json: async () => url.endsWith('attributes')
        ? { attributes: [{ id: 'saved', attribute: '품질', order: 0 }] }
        : { fitnessMatrix: { marketsJson: '{broken', matrixJson: '{}' } },
    }));
    await act(async () => root.render(createElement(FitnessWrapper, { projectId: 'project-a' })));
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(button('저장')).toBeUndefined();
    expect(writes()).toHaveLength(0);
});

it.each([false, true])('제품 속성 엑셀의 연결 자료 삭제 확인 %s에 따라 반영한다', async confirmed => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(confirmed);
    fetchMock.mockImplementation(async (url: string, options?: { method: string; body: FormData }) => {
        if (options?.method === 'POST') {
            if (!options.body.has('confirmCascade')) return {
                ok: false, status: 409, json: async () => ({ needsCascadeConfirm: true, error: '적합도 6건이 함께 삭제됩니다.' }),
            };
            return { ok: true, json: async () => ({ appliedCounts: { productAttributes: 1 } }) };
        }
        return { ok: true, json: async () => ({ attributes: [], specFunctions: [], projects: [] }) };
    });
    await act(async () => root.render(createElement(ProductAttributesTable, { projectId: 'project-a' })));
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, 'files', { configurable: true, value: [new File(['test'], 'attributes.xlsx')] });
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
    await act(async () => button('기존 데이터 지우고 업로드')!.click());
    expect(confirm).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('적합도 6건'));
    expect(writes()).toHaveLength(confirmed ? 2 : 1);
    if (confirmed) expect((writes()[1][1].body as FormData).get('confirmCascade')).toBe('true');
});
afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    fetchMock.mockReset();
});

describe.each(worksheets)('$endpoint 조회 실패 보호', ({ Component, endpoint, row }) => {
    it.each(['http', 'network', 'json', 'missing-rows'])('%s 오류 뒤 저장을 차단하고 재시도로 기존 행을 복구한다', async failure => {
        let recovered = false;
        fetchMock.mockImplementation(async (url: string) => {
            if (!url.endsWith(endpoint)) return { ok: true, json: async () => ({ items: [] }) };
            if (recovered) return { ok: true, json: async () => ({ rows: [row], suggestions: [], asIsRows: [] }) };
            if (failure === 'network') throw new Error('offline');
            return { ok: failure !== 'http', json: async () => {
                if (failure === 'json') throw new SyntaxError('invalid JSON');
                return {};
            } };
        });
        await act(async () => root.render(createElement(Component, { projectId: 'project-a' })));
        expect(container.querySelector('[role="alert"]')).not.toBeNull();
        expect(button('저장')).toBeUndefined();
        expect(writes()).toHaveLength(0);
        recovered = true;
        await act(async () => button('다시 불러오기')!.click());
        expect(container.querySelector('[role="alert"]')).toBeNull();
        expect(button('저장')?.disabled).toBe(false);
        await act(async () => button('저장')!.click());
        expect(writes()).toHaveLength(1);
        expect(JSON.parse(writes()[0][1].body).rows).toHaveLength(1);
    });

    it('정상 조회한 빈 워크시트는 편집과 저장을 허용한다', async () => {
        fetchMock.mockResolvedValue({ ok: true, json: async () => ({ rows: [], items: [], suggestions: [], asIsRows: [] }) });
        await act(async () => root.render(createElement(Component, { projectId: 'project-a' })));
        expect(button('저장')?.disabled).toBe(false);
        expect(container.querySelector('[role="alert"]')).toBeNull();
    });

    it('프로젝트 전환 후 새 조회가 끝날 때까지 이전 프로젝트를 저장할 수 없다', async () => {
        fetchMock.mockResolvedValue({ ok: true, json: async () => ({ rows: [row], items: [], suggestions: [], asIsRows: [] }) });
        await act(async () => root.render(createElement(Component, { projectId: 'project-a' })));
        fetchMock.mockImplementation(() => new Promise(() => {}));
        await act(async () => root.render(createElement(Component, { projectId: 'project-b' })));
        expect(button('저장')).toBeUndefined();
        expect(writes()).toHaveLength(0);
    });
});
