// WS-13 화면과 저장이 WS-11 일부 개선목록보다 고객요구사항 기준 순서를 우선하는지 검증한다.
// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import TechRoadmapTable from '../components/project/TechRoadmapTable';

const savedRows = [
    { id: 'roadmap-a', category: '고객 요구 A', techItem: '개선기능 A', currentLevel: '구현계획 A', targetLevel: '목표 고객 A', q1: '설계 A', q2: '개발 A', q3: '시험 A', q4: '출시 A', owner: '담당 A', order: 0 },
    { id: 'roadmap-b', category: '고객 요구 B', techItem: '개선기능 B', currentLevel: '구현계획 B', targetLevel: '목표 고객 B', q1: '설계 B', q2: '개발 B', q3: '시험 B', q4: '출시 B', owner: '담당 B', order: 1 },
];
const requirements = [
    { id: 'req-a', category: '1차 A', subcategory: '2차 A', requirement: '고객 요구 A', order: 0 },
    { id: 'req-b', category: '1차 B', subcategory: '2차 B', requirement: '고객 요구 B', order: 1 },
];
const improvements = [{ id: 'improvement-b', type: 'need', content: '고객 요구 B', improvementRate: '2', devProportion: '50%', order: 0 }];
const fetchMock = vi.fn();
let posted: Array<Record<string, unknown>>;
let container: HTMLDivElement;
let root: Root;

const displayed = () => [...container.querySelectorAll('tbody tr')].map(row => [...row.querySelectorAll<HTMLInputElement>('input')].map(input => input.value));
const expectedInputs = savedRows.map(row => [row.category, row.techItem, row.currentLevel, row.targetLevel]);

beforeEach(async () => {
    posted = [];
    fetchMock.mockImplementation(async (url: string, options?: RequestInit) => {
        if (options?.method === 'POST') {
            expect(url).toBe('/api/projects/fixture-project/tech-roadmap');
            const body = JSON.parse(String(options.body));
            posted.push(body);
            return new Response(JSON.stringify({ rows: body.rows.map((row: typeof savedRows[number]) => ({ ...row, id: savedRows.find(saved => saved.category === row.category)?.id })) }), { status: 200 });
        }
        if (url === '/api/projects/fixture-project/tech-roadmap') return new Response(JSON.stringify({ rows: savedRows }), { status: 200 });
        if (url === '/api/projects/fixture-project/improvements') return new Response(JSON.stringify({ items: improvements }), { status: 200 });
        if (url === '/api/projects/fixture-project/requirements') return new Response(JSON.stringify({ requirements }), { status: 200 });
        throw new Error(`실제 API 호출 금지: ${url}`);
    });
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('fetch', fetchMock);
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root.render(createElement(TechRoadmapTable, { projectId: 'fixture-project' })));
});

afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
});

it('WS-11 개선목록이 B만 있어도 저장된 A·B 행은 WS-5 순서와 작성값으로 표시한다', () => {
    expect(displayed()).toEqual(expectedInputs);
    expect(container.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(posted).toEqual([]);
    expect(savedRows.map(row => row.category)).toEqual(['고객 요구 A', '고객 요구 B']);
});

it('그대로 저장해도 A·B 순서와 숨겨진 분기·담당자 내용을 함께 보존한다', async () => {
    const save = [...container.querySelectorAll('button')].find(button => button.textContent?.trim() === '저장');
    expect(save).toBeDefined();
    await act(async () => save!.click());
    expect(posted).toHaveLength(1);
    expect(posted[0]).toEqual({ rows: savedRows.map(({ id: _id, ...row }) => row) });
    expect(displayed()).toEqual(expectedInputs);
    expect(container.textContent).toContain('저장되었습니다.');
});
