// QFD 관계 강도 자동 저장의 화면 유지와 요청 경합을 실제 React DOM으로 검수한다.
// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import QFDMatrix from '../components/project/QFDMatrix';

vi.mock('next/link', () => ({
    default: ({ children, href }: { children: ReactNode; href: string }) => createElement('a', { href }, children),
}));

type Strength = 'NONE' | 'WEAK' | 'MEDIUM' | 'STRONG';
type Relationship = { requirementId: string; technicalCharId: string; strength: Strength };
type PendingRequest = {
    path: string;
    method: string;
    body: Record<string, unknown>;
    settled: boolean;
    succeed: (payload?: unknown) => void;
    fail: (status?: number) => void;
    reject: () => void;
};

const requirements = [
    { id: 'r1', category: '사용성', subcategory: '속도', requirement: '빠른 처리' },
    { id: 'r2', category: '안정성', subcategory: '보호', requirement: '안전한 보관' },
];
const technicals = [
    { id: 't1', name: '처리 속도', unit: 'ms', targetValue: '100' },
    { id: 't2', name: '백업 주기', unit: 'h', targetValue: '1' },
];

function json(payload: unknown, status = 200) {
    return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
}

function fixture() {
    const saved = new Map<string, Relationship>();
    const requests: PendingRequest[] = [];
    const heldReads = new Map<string, number>();

    const analysis = (score?: number) => ({
        requirements: requirements.map((requirement) => ({
            requirementId: requirement.id, weight: 2, weightPercent: 50, selfScore: 0,
            competitorScore: 0, planQuality: 0, improvementRate: 0, absoluteImportance: 2,
            qualityImportancePercent: 50, rank: 1,
        })),
        technicals: technicals.map((tech) => ({
            technicalCharId: tech.id, name: tech.name, totalScore: score ?? [...saved.values()]
                .filter((item) => item.technicalCharId === tech.id)
                .reduce((total, item) => total + ({ NONE: 0, WEAK: 1, MEDIUM: 3, STRONG: 9 }[item.strength] * 2), 0),
            rank: 1, importancePercent: 50,
        })),
    });
    const payloadFor = (path: string) => {
        switch (path) {
            case 'requirements': return { requirements };
            case 'qfd/technical': return { technicalCharacteristics: technicals };
            case 'qfd/relationships': return { relationships: [...saved.values()].map((item) => ({ ...item })) };
            case 'qfd/analysis': return analysis();
            case 'qfd/benchmarks': return { benchmarks: [] };
            case 'tech-tree': return { entries: [] };
            case 'qfd/technical-benchmarks': return { technicalBenchmarks: [] };
            default: throw new Error(`허용하지 않은 fixture 조회: ${path}`);
        }
    };
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (!url.startsWith('/api/projects/fixture-project/')) throw new Error(`실제 API 호출 금지: ${url}`);
        const path = url.slice('/api/projects/fixture-project/'.length);
        const method = init?.method || 'GET';
        const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
        const snapshot = method === 'GET' ? payloadFor(path) : { success: true };
        return new Promise<Response>((resolve, reject) => {
            const request: PendingRequest = {
                path, method, body, settled: false,
                succeed(payload = snapshot) {
                    if (request.settled) throw new Error('이미 완료한 fixture 요청입니다.');
                    request.settled = true;
                    if (path === 'qfd/relationships' && method === 'POST') {
                        const relationship = body as Relationship;
                        saved.set(`${relationship.requirementId}:${relationship.technicalCharId}`, { ...relationship });
                    }
                    resolve(json(payload));
                },
                fail(status = 500) {
                    request.settled = true;
                    resolve(json({ error: 'fixture 저장 또는 조회 실패' }, status));
                },
                reject() {
                    request.settled = true;
                    reject(new Error('fixture network unavailable'));
                },
            };
            requests.push(request);
            if (method === 'GET') {
                const heldCount = heldReads.get(path) || 0;
                if (heldCount > 0) heldReads.set(path, heldCount - 1);
                else request.succeed();
            }
        });
    });
    return {
        saved, requests, analysis, fetchMock,
        hold(path: string, count = 1) { heldReads.set(path, (heldReads.get(path) || 0) + count); },
        pending(path?: string, method?: string) {
            return requests.filter((request) => !request.settled && (!path || request.path === path) && (!method || request.method === method));
        },
        posts() { return requests.filter((request) => request.path === 'qfd/relationships' && request.method === 'POST'); },
    };
}

let container: HTMLDivElement;
let root: Root;
let server: ReturnType<typeof fixture>;

async function mount(onDirtyChange?: (dirty: boolean) => void) {
    await act(async () => { root.render(createElement(QFDMatrix, { projectId: 'fixture-project', onDirtyChange })); });
}

function cell(row = 0, column = 0) {
    const selects = [...container.querySelectorAll('tbody tr')[row].querySelectorAll('select')];
    const relationships = selects.filter((select) => [...select.options].some((option) => option.value === 'STRONG'));
    expect(relationships[column], '관계 셀이 화면에 있어야 합니다.').toBeDefined();
    return relationships[column];
}

function button(label: string) {
    const found = [...container.querySelectorAll('button')].find((item) => item.textContent?.trim() === label || item.getAttribute('aria-label') === label);
    expect(found, `${label} 버튼이 있어야 합니다.`).toBeDefined();
    return found!;
}

async function selectValue(select: HTMLSelectElement, value: string) {
    await act(async () => {
        select.value = value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
    });
}

async function click(element: HTMLElement) {
    await act(async () => { element.click(); });
}

async function finish(request: PendingRequest, outcome: 'success' | 'http' | 'network' = 'success', payload?: unknown) {
    expect(request, '완료할 대기 요청이 있어야 합니다.').toBeDefined();
    await act(async () => {
        if (outcome === 'http') request.fail();
        else if (outcome === 'network') request.reject();
        else request.succeed(payload);
    });
}

async function analysisTick() {
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
}

async function drainSaves() {
    for (let attempt = 0; attempt < 20 && server.pending('qfd/relationships', 'POST').length; attempt += 1) {
        await finish(server.pending('qfd/relationships', 'POST')[0]);
    }
    expect(server.pending('qfd/relationships', 'POST')).toHaveLength(0);
    await analysisTick();
}

function importance(column = 0) {
    return container.querySelector('tfoot tr')?.children[column + 1]?.textContent;
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    localStorage.clear();
    server = fixture();
    vi.stubGlobal('fetch', server.fetchMock);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(async () => {
    await act(async () => { root.unmount(); });
    container.remove();
    const unexpectedErrors = vi.mocked(console.error).mock.calls.filter(([error]) => (
        !(error instanceof Error && error.message.startsWith('fixture '))
    ));
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    expect(unexpectedErrors, '예상한 fixture 오류 외에 React나 런타임 오류가 없어야 합니다.').toEqual([]);
});

describe('QFD 관계 강도 자동 저장', () => {
    it('저장 응답을 기다리는 동안 선택값을 즉시 반영하고 표와 입력 위치를 유지한다', async () => {
        await mount();
        const table = container.querySelector('table');
        const select = cell();
        const scroller = table!.parentElement!;
        scroller.scrollLeft = 180;
        select.focus();
        await selectValue(select, 'STRONG');
        expect(select.value).toBe('STRONG');
        expect(cell()).toBe(select);
        expect(container.querySelector('table')).toBe(table);
        expect(document.activeElement).toBe(select);
        expect(scroller.scrollLeft).toBe(180);
        expect(select.matches(':disabled')).toBe(false);
        expect(server.posts()).toHaveLength(1);
        expect(server.requests.filter((request) => request.method === 'GET')).toHaveLength(7);
        server.hold('qfd/analysis');
        await finish(server.posts()[0]);
        await analysisTick();
        expect(container.querySelector('table')).toBe(table);
        expect(cell()).toBe(select);
        expect(server.requests.filter((request) => request.method === 'GET' && request.path !== 'qfd/analysis')).toHaveLength(6);
    });

    it('같은 셀을 9→3→1로 바꾸면 서버 요청을 직렬화하고 마지막 값을 저장한다', async () => {
        await mount();
        await selectValue(cell(), 'STRONG');
        await selectValue(cell(), 'MEDIUM');
        await selectValue(cell(), 'WEAK');
        expect(cell().value).toBe('WEAK');
        expect(server.posts()).toHaveLength(1);
        await finish(server.posts()[0]);
        expect(cell().value).toBe('WEAK');
        expect(server.pending('qfd/relationships', 'POST')).toHaveLength(1);
        await drainSaves();
        expect(server.saved.get('r1:t1')?.strength).toBe('WEAK');
        expect(server.posts().at(-1)?.body.strength).toBe('WEAK');
        expect(importance()).toBe('2.00');
    });

    it('서로 다른 셀의 연속 입력을 유지하고 저장 묶음이 끝나면 분석만 갱신한다', async () => {
        await mount();
        const table = container.querySelector('table');
        await selectValue(cell(0, 0), 'STRONG');
        await selectValue(cell(1, 1), 'MEDIUM');
        expect(cell(0, 0).value).toBe('STRONG');
        expect(cell(1, 1).value).toBe('MEDIUM');
        expect(server.posts()).toHaveLength(1);
        await finish(server.posts()[0]);
        await analysisTick();
        expect(server.requests.filter((request) => request.path === 'qfd/analysis')).toHaveLength(1);
        await drainSaves();
        expect(server.saved.get('r1:t1')?.strength).toBe('STRONG');
        expect(server.saved.get('r2:t2')?.strength).toBe('MEDIUM');
        expect(importance(0)).toBe('18.00');
        expect(importance(1)).toBe('6.00');
        expect(container.querySelector('table')).toBe(table);
        expect(server.requests.filter((request) => request.method === 'GET')).toHaveLength(8);
    });

    it.each(['http', 'network'] as const)('%s 저장 오류는 해당 셀에 남고 재시도로 복구한다', async (outcome) => {
        await mount();
        const table = container.querySelector('table');
        await selectValue(cell(), 'STRONG');
        await selectValue(cell(1, 1), 'WEAK');
        await finish(server.posts()[0], outcome);
        expect(cell().value).toBe('STRONG');
        expect(cell().getAttribute('aria-invalid')).toBe('true');
        await drainSaves();
        expect(server.saved.get('r2:t2')?.strength).toBe('WEAK');
        expect(cell(1, 1).getAttribute('aria-invalid')).not.toBe('true');
        await click(button('빠른 처리 / 처리 속도 관계 저장 재시도'));
        expect(server.pending('qfd/relationships', 'POST')[0].body).toMatchObject({ strength: 'STRONG' });
        await drainSaves();
        expect(server.saved.get('r1:t1')?.strength).toBe('STRONG');
        expect(cell().getAttribute('aria-invalid')).not.toBe('true');
        expect(container.querySelector('table')).toBe(table);
    });

    it('과거 저장 실패가 같은 셀의 최신 입력을 실패 상태로 덮지 않는다', async () => {
        await mount();
        await selectValue(cell(), 'STRONG');
        await selectValue(cell(), 'WEAK');
        await finish(server.posts()[0], 'http');
        expect(cell().value).toBe('WEAK');
        expect(cell().getAttribute('aria-invalid')).not.toBe('true');
        await drainSaves();
        expect(server.saved.get('r1:t1')?.strength).toBe('WEAK');
        expect(cell().getAttribute('aria-invalid')).not.toBe('true');
    });

    it.each(['success', 'http', 'network'] as const)('분석 응답 순서가 역전되고 과거 요청이 %s여도 최신 분석 결과를 유지한다', async (outcome) => {
        await mount();
        server.hold('qfd/analysis', 2);
        await selectValue(cell(), 'STRONG');
        await drainSaves();
        const oldAnalysis = server.pending('qfd/analysis')[0];
        expect(oldAnalysis).toBeDefined();
        await selectValue(cell(), 'WEAK');
        await drainSaves();
        const latestAnalysis = server.pending('qfd/analysis').at(-1)!;
        expect(latestAnalysis).not.toBe(oldAnalysis);
        await finish(latestAnalysis, 'success', server.analysis(2));
        expect(importance()).toBe('2.00');
        await finish(oldAnalysis, outcome, server.analysis(18));
        expect(importance()).toBe('2.00');
        expect(container.textContent).not.toContain('분석 결과를 갱신하지 못했습니다.');
    });

    it('분석 조회 실패는 저장 성공과 구분해서 알리고 분석만 재시도한다', async () => {
        await mount();
        server.hold('qfd/analysis');
        await selectValue(cell(), 'STRONG');
        await drainSaves();
        await finish(server.pending('qfd/analysis')[0], 'http');
        expect(cell().value).toBe('STRONG');
        expect(cell().getAttribute('aria-invalid')).not.toBe('true');
        expect(container.textContent).toContain('분석 결과를 갱신하지 못했습니다.');
        const postCount = server.posts().length;
        const getCount = server.requests.filter((request) => request.method === 'GET').length;
        await click(button('분석 다시 불러오기'));
        await analysisTick();
        expect(importance()).toBe('18.00');
        expect(server.posts()).toHaveLength(postCount);
        expect(server.requests.filter((request) => request.method === 'GET')).toHaveLength(getCount + 1);
        expect(container.textContent).not.toContain('분석 결과를 갱신하지 못했습니다.');
    });

    it('입력 전에 시작한 전체 조회가 늦게 도착해도 최신 셀과 분석을 덮지 않는다', async () => {
        await mount();
        const table = container.querySelector('table');
        server.hold('qfd/relationships');
        await click(button('새로고침'));
        const staleRead = server.pending('qfd/relationships', 'GET')[0];
        expect(staleRead).toBeDefined();
        expect(container.querySelector('table')).toBe(table);
        await selectValue(cell(), 'STRONG');
        await drainSaves();
        expect(importance()).toBe('18.00');
        await finish(staleRead);
        expect(cell().value).toBe('STRONG');
        expect(importance()).toBe('18.00');
        expect(container.querySelector('table')).toBe(table);
    });

    it('전체 조회 성공과 실패 모두 실패한 셀의 초안과 재시도 버튼을 보존한다', async () => {
        await mount();
        const table = container.querySelector('table');
        await selectValue(cell(), 'STRONG');
        await finish(server.posts()[0], 'http');
        await click(button('새로고침'));
        expect(cell().value).toBe('STRONG');
        expect(cell().getAttribute('aria-invalid')).toBe('true');
        server.hold('requirements');
        await click(button('새로고침'));
        await finish(server.pending('requirements')[0], 'http');
        expect(container.querySelector('table')).toBe(table);
        expect(cell().value).toBe('STRONG');
        expect(cell().getAttribute('aria-invalid')).toBe('true');
        await click(button('빠른 처리 / 처리 속도 관계 저장 재시도'));
        await drainSaves();
        expect(server.saved.get('r1:t1')?.strength).toBe('STRONG');
    });

    it('저장 뒤 분석을 기다리다 시작한 전체 조회가 실패해도 최신 분석을 복구한다', async () => {
        await mount();
        server.hold('qfd/analysis');
        await selectValue(cell(), 'STRONG');
        await drainSaves();
        const supersededAnalysis = server.pending('qfd/analysis')[0];
        expect(supersededAnalysis).toBeDefined();
        server.hold('requirements');
        await click(button('새로고침'));
        await finish(server.pending('requirements')[0], 'http');
        expect(cell().value).toBe('STRONG');
        expect(importance()).toBe('18.00');
        expect(server.requests.filter((request) => request.path === 'qfd/analysis')).toHaveLength(4);
        await finish(supersededAnalysis, 'success', server.analysis(999));
        expect(importance()).toBe('18.00');
        expect(container.textContent).not.toContain('분석 결과를 갱신하지 못했습니다.');
    });

    it('저장 후 다시 마운트하면 서버의 최종 선택값을 불러온다', async () => {
        await mount();
        await selectValue(cell(), 'STRONG');
        await selectValue(cell(), 'MEDIUM');
        await selectValue(cell(), 'WEAK');
        await drainSaves();
        await act(async () => { root.unmount(); });
        root = createRoot(container);
        await mount();
        expect(cell().value).toBe('WEAK');
        expect(importance()).toBe('2.00');
    });

    it('저장이 끝난 셀은 새 전체 조회에서 서버의 다른 변경값을 받아들인다', async () => {
        await mount();
        await selectValue(cell(), 'STRONG');
        await drainSaves();
        server.saved.set('r1:t1', { requirementId: 'r1', technicalCharId: 't1', strength: 'MEDIUM' });
        await click(button('새로고침'));
        expect(cell().value).toBe('MEDIUM');
        expect(importance()).toBe('6.00');
    });

    it.each(['pending', 'failed'] as const)('관계가 %s 상태이면 초기화와 워크시트 저장을 막는다', async (state) => {
        await mount();
        await click(button('초기화'));
        await selectValue(cell(), 'STRONG');
        if (state === 'failed') await finish(server.posts()[0], 'http');
        const resetButtons = [...container.querySelectorAll('button')].filter((item) => item.textContent?.trim() === '초기화');
        expect(resetButtons).toHaveLength(2);
        for (const reset of resetButtons) {
            expect(reset.matches(':disabled')).toBe(true);
            await click(reset);
        }
        const save = container.querySelector<HTMLButtonElement>('[data-worksheet-save]')!;
        expect(save.matches(':disabled')).toBe(true);
        await click(save);
        expect(server.requests.filter((request) => request.method === 'DELETE')).toHaveLength(0);
        expect(server.posts()).toHaveLength(1);
        expect(cell().value).toBe('STRONG');
    });

    it.each(['pending', 'failed'] as const)('관계가 %s 상태이면 이미 열린 기술특성 삭제도 막는다', async (state) => {
        await mount();
        await click(button('처리 속도 열 삭제'));
        await selectValue(cell(), 'STRONG');
        if (state === 'failed') await finish(server.posts()[0], 'http');
        const deleteButton = button('삭제');
        expect(deleteButton.matches(':disabled')).toBe(true);
        await click(deleteButton);
        expect(server.requests.filter((request) => request.method === 'DELETE')).toHaveLength(0);
        expect(cell().value).toBe('STRONG');
    });

    it.each(['reset', 'delete', 'worksheet'] as const)('%s 작업이 먼저 진행 중이면 관계 셀을 비활성화한다', async (operation) => {
        await mount();
        if (operation === 'reset') {
            await click(button('초기화'));
            const resetButtons = [...container.querySelectorAll('button')].filter((item) => item.textContent?.trim() === '초기화');
            await click(resetButtons.at(-1)!);
        } else if (operation === 'delete') {
            await click(button('처리 속도 열 삭제'));
            await click(button('삭제'));
        } else {
            server.hold('requirements');
            await click(container.querySelector<HTMLButtonElement>('[data-worksheet-save]')!);
        }
        expect(cell().matches(':disabled')).toBe(true);
        expect(server.posts()).toHaveLength(0);
        for (const request of [...server.pending()]) await finish(request);
        expect(cell().matches(':disabled')).toBe(false);
        await selectValue(cell(), 'WEAK');
        await drainSaves();
        expect(server.saved.get('r1:t1')?.strength).toBe('WEAK');
    });

    it('초기화 요청 하나가 실패해도 다른 요청이 끝날 때까지 입력 잠금을 유지한다', async () => {
        await mount();
        await click(button('초기화'));
        const resetButtons = [...container.querySelectorAll('button')].filter((item) => item.textContent?.trim() === '초기화');
        await click(resetButtons.at(-1)!);
        const pending = server.pending();
        expect(pending).toHaveLength(2);
        await finish(pending[0], 'network');
        expect(cell().matches(':disabled')).toBe(true);
        expect(server.requests.filter((request) => request.method === 'GET')).toHaveLength(7);
        await finish(pending[1]);
        expect(cell().matches(':disabled')).toBe(false);
        expect(container.textContent).toContain('QFD 초기화에 실패했습니다. 다시 시도해주세요.');
        expect(container.textContent).not.toContain('QFD 매트릭스를 초기화했습니다.');
    });

    it('상위 화면에 미저장과 실패 상태를 알리고 저장 완료와 언마운트 때 해제한다', async () => {
        const onDirtyChange = vi.fn();
        await mount(onDirtyChange);
        expect(onDirtyChange).toHaveBeenLastCalledWith(false);
        await selectValue(cell(), 'STRONG');
        expect(onDirtyChange).toHaveBeenLastCalledWith(true);
        await finish(server.posts()[0], 'http');
        expect(onDirtyChange).toHaveBeenLastCalledWith(true);
        await click(button('빠른 처리 / 처리 속도 관계 저장 재시도'));
        await drainSaves();
        expect(onDirtyChange).toHaveBeenLastCalledWith(false);
        await selectValue(cell(), 'WEAK');
        expect(onDirtyChange).toHaveBeenLastCalledWith(true);
        await act(async () => { root.unmount(); });
        root = createRoot(container);
        expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    });

    it('언마운트 후 완료한 저장 응답은 대기하던 저장이나 분석 요청을 시작하지 않는다', async () => {
        await mount();
        await selectValue(cell(), 'STRONG');
        await selectValue(cell(1, 1), 'WEAK');
        const firstSave = server.posts()[0];
        await act(async () => { root.unmount(); });
        root = createRoot(container);
        await finish(firstSave);
        await analysisTick();
        expect(server.posts()).toHaveLength(1);
        expect(server.requests.filter((request) => request.path === 'qfd/analysis')).toHaveLength(1);
    });

    it.each(['pending', 'failed'] as const)('관계가 %s 상태이면 페이지 종료 경고를 요청하고 저장 뒤 해제한다', async (state) => {
        await mount();
        await selectValue(cell(), 'STRONG');
        if (state === 'failed') await finish(server.posts()[0], 'http');
        const leaving = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(leaving);
        expect(leaving.defaultPrevented).toBe(true);
        if (state === 'failed') await click(button('빠른 처리 / 처리 속도 관계 저장 재시도'));
        await drainSaves();
        const afterSave = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(afterSave);
        expect(afterSave.defaultPrevented).toBe(false);
    });

    it('미저장 셀이 있을 때 링크 이동을 취소하면 표와 입력을 유지한다', async () => {
        await mount();
        const table = container.querySelector('table');
        const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
        const anchor = document.createElement('a');
        anchor.href = '/projects/another-project';
        anchor.textContent = '다른 프로젝트';
        const navigate = vi.fn((event: Event) => event.preventDefault());
        anchor.addEventListener('click', navigate);
        container.appendChild(anchor);
        await selectValue(cell(), 'STRONG');
        await click(anchor);
        expect(confirm).toHaveBeenCalledTimes(1);
        expect(navigate).not.toHaveBeenCalled();
        expect(container.querySelector('table')).toBe(table);
        expect(cell().value).toBe('STRONG');
        await drainSaves();
        await click(anchor);
        expect(confirm).toHaveBeenCalledTimes(1);
        expect(navigate).toHaveBeenCalledTimes(1);
    });
});
