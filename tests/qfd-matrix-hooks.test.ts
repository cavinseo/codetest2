// QFD 표에서 떼어 낸 기술특성 초안 훅과 경쟁 비교 점수 훅을 실제 React 로 돌려 본다
// (2026-10-25 코드 리뷰 L2).
// @vitest-environment jsdom
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useQfdTechnicalDrafts } from '../components/project/useQfdTechnicalDrafts';
import { useQfdBenchmarks, type Benchmark } from '../components/project/useQfdBenchmarks';

let container: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn();
const loadData = vi.fn(async () => undefined);
const showToast = vi.fn();
const ok = () => Promise.resolve(new Response('{}', { status: 200 }));
const fail = (error: string) => Promise.resolve(new Response(JSON.stringify({ error }), { status: 400 }));
const bodies = () => fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init.body)));

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

describe('useQfdTechnicalDrafts', () => {
    const tech = { id: 't1', name: '수분 감지', unit: 'mm', targetValue: '10' };
    let drafts: ReturnType<typeof useQfdTechnicalDrafts>;
    function Harness({ projectId }: { projectId: string }) {
        drafts = useQfdTechnicalDrafts({
            projectId,
            technicalBenchmarks: [{ technicalCharId: 't1', company: 'self', value: '8' }],
            loadData,
            showToast,
        });
        return null;
    }
    const render = (projectId = 'p1') => act(async () => root.render(createElement(Harness, { projectId })));

    it('단위를 보낸 직후 목표치를 고쳐도 아직 반영 안 된 새 단위를 함께 보낸다(B21)', async () => {
        fetchMock.mockImplementation(ok);
        await render();
        await act(async () => drafts.setTechFieldDraft('t1', 'unit', ' cm '));
        expect(drafts.getTechFieldValue(tech, 'unit')).toBe(' cm ');

        // 첫 저장의 다시 불러오기가 끝나지 않아 tech 는 여전히 옛 단위를 들고 있다.
        loadData.mockImplementationOnce(() => new Promise(() => undefined));
        await act(async () => { void drafts.commitTechField(tech, 'unit'); });
        await act(async () => drafts.setTechFieldDraft('t1', 'targetValue', '20'));
        await act(async () => drafts.commitTechField(tech, 'targetValue'));

        expect(bodies()).toEqual([
            { id: 't1', name: '수분 감지', unit: 'cm', targetValue: '10' },
            { id: 't1', name: '수분 감지', unit: 'cm', targetValue: '20' },
        ]);
        expect(showToast).toHaveBeenCalledWith('설계 목표치을(를) 저장했습니다.');
    });

    it('저장이 실패하면 입력한 값을 칸에 되돌려 놓는다', async () => {
        fetchMock.mockImplementation(() => fail('권한이 없습니다.'));
        await render();
        await act(async () => drafts.setTechFieldDraft('t1', 'targetValue', '30'));
        await act(async () => drafts.commitTechField(tech, 'targetValue'));

        expect(drafts.getTechFieldValue(tech, 'targetValue')).toBe('30');
        expect(showToast).toHaveBeenCalledWith('권한이 없습니다.', 'error');
        expect(loadData).not.toHaveBeenCalled();
    });

    it('값이 그대로면 보내지 않고 초안만 치운다', async () => {
        await render();
        await act(async () => drafts.setTechBenchmarkDraft('t1', 'self', ' 8 '));
        await act(async () => drafts.commitTechBenchmark(tech, 'self', '자사'));

        expect(fetchMock).not.toHaveBeenCalled();
        expect(drafts.getTechBenchmarkValue(tech, 'self')).toBe('8');
    });

    it('워크시트 저장 요청을 모으고, 지운 기술특성과 프로젝트 이동 때 초안을 버린다', async () => {
        const other = { id: 't2', name: '급수', unit: '', targetValue: '' };
        await render();
        await act(async () => {
            drafts.setTechFieldDraft('t1', 'unit', 'cm ');
            drafts.setTechBenchmarkDraft('t1', 'rival', ' 9');
            drafts.setTechBenchmarkDraft('t2', 'self', '1');
        });

        expect(drafts.worksheetDraftSaves([tech, other], ['self', 'rival'])).toEqual([
            { path: 'technical', method: 'PATCH', body: { id: 't1', name: '수분 감지', unit: 'cm', targetValue: '10' } },
            { path: 'technical-benchmarks', method: 'POST', body: { technicalCharId: 't1', company: 'rival', value: '9' } },
            { path: 'technical-benchmarks', method: 'POST', body: { technicalCharId: 't2', company: 'self', value: '1' } },
        ]);

        await act(async () => drafts.forgetTechDrafts(['t1']));
        expect(drafts.worksheetDraftSaves([tech, other], ['self', 'rival'])).toHaveLength(1);

        await render('p2');
        expect(drafts.worksheetDraftSaves([tech, other], ['self', 'rival'])).toEqual([]);
    });
});

describe('useQfdBenchmarks', () => {
    const setIsSavingBenchmarks = vi.fn();
    const hasUnsavedRelationships = vi.fn(() => false);
    let benchmarks: ReturnType<typeof useQfdBenchmarks>;
    let data: Benchmark[];
    function Harness() {
        const [benchmarksData, setBenchmarksData] = useState<Benchmark[]>([
            { requirementId: 'r1', company: 'self', score: 3 },
            { requirementId: 'r1', company: '가사', score: 2 },
        ]);
        data = benchmarksData;
        benchmarks = useQfdBenchmarks({
            projectId: 'p1', requirements: [{ id: 'r1' }, { id: 'r2' }], benchmarksData, setBenchmarksData,
            loadData, showToast, hasUnsavedRelationships, setIsSavingBenchmarks,
        });
        return null;
    }
    const render = () => act(async () => root.render(createElement(Harness)));

    it('저장한 점수 위에 고친 점수를 보이고, 저장하면 비운다', async () => {
        fetchMock.mockImplementation(ok);
        await render();
        expect(benchmarks.competitorColumns).toEqual(['가사']);
        expect(benchmarks.getBenchmark('r1', 'self')).toBe(3);

        await act(async () => benchmarks.setBenchmark('r1', 'self', 5));
        expect(benchmarks.getBenchmark('r1', 'self')).toBe(5);
        await act(async () => benchmarks.saveBenchmarks());

        expect(bodies()).toEqual([{ requirementId: 'r1', company: 'self', score: 5 }]);
        expect(setIsSavingBenchmarks.mock.calls).toEqual([[true], [false]]);
        expect(benchmarks.pendingBenchmarks).toEqual({});
        expect(loadData).toHaveBeenCalledOnce();
    });

    it('관계 강도가 저장되지 않았으면 비교 점수를 저장하지 않는다', async () => {
        hasUnsavedRelationships.mockReturnValue(true);
        await render();
        await act(async () => benchmarks.setBenchmark('r1', 'self', 1));
        await act(async () => benchmarks.saveBenchmarks());

        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('경쟁사를 더하면 요구사항마다 0점을 만들고, "경쟁사"는 기본 열 이름으로 받는다', async () => {
        fetchMock.mockImplementation(ok);
        await render();
        await act(async () => benchmarks.setNewCompetitorName('경쟁사'));
        await act(async () => benchmarks.handleAddCompetitor());

        expect(bodies()).toEqual([
            { requirementId: 'r1', company: 'competitor', score: 0 },
            { requirementId: 'r2', company: 'competitor', score: 0 },
        ]);
        expect(benchmarks.competitorColumns).toEqual(['가사', 'competitor']);
        expect(benchmarks.newCompetitorName).toBe('');

        await act(async () => benchmarks.setNewCompetitorName(' 가사 '));
        await act(async () => benchmarks.handleAddCompetitor());
        expect(showToast).toHaveBeenLastCalledWith('이미 추가된 경쟁사입니다.', 'error');
    });

    it('경쟁사 열을 지우면 그 회사의 점수와 고친 점수를 함께 버린다', async () => {
        fetchMock.mockImplementation(ok);
        vi.stubGlobal('confirm', vi.fn(() => true));
        await render();
        await act(async () => {
            benchmarks.setBenchmark('r1', '가사', 4);
            benchmarks.setBenchmark('r1', 'self', 4);
        });
        await act(async () => benchmarks.handleRemoveCompetitor('가사'));

        expect(fetchMock).toHaveBeenCalledWith('/api/projects/p1/qfd/benchmarks?company=%EA%B0%80%EC%82%AC', { method: 'DELETE' });
        expect(data.map((item) => item.company)).toEqual(['self']);
        expect(benchmarks.pendingBenchmarks).toEqual({ 'r1::self': 4 });
        expect(benchmarks.removingCompetitor).toBeNull();
    });
});
