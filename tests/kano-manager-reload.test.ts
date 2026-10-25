// Kano 화면이 저장 뒤 다시 불러오는 동안 화면 전체를 로딩으로 바꾸지 않아 완료 알림과
// 편집 화면이 그대로 남는지 실제 React DOM 으로 확인한다(2026-10-25 코드 리뷰 B20).
// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import KanoManager from '../components/project/KanoManager';

vi.mock('next/link', () => ({ default: ({ children, ...props }: { children: ReactNode; href: string }) => createElement('a', props, children) }));

let container: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn();
const json = (data: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(data), { status }));
const requirements = [{ id: 'req_1', category: '사용성', subcategory: '속도', requirement: '빠른 주문', order: 0 }];
let holdRequirements = false;
let releaseRequirements: (() => void) | null = null;

function api(url: string, init?: RequestInit) {
    if (init?.method === 'POST') return json({ success: true, count: 1 });
    if (url.endsWith('/requirements')) {
        if (!holdRequirements) return json({ requirements });
        return new Promise<Response>((resolve) => {
            releaseRequirements = () => resolve(new Response(JSON.stringify({ requirements }), { status: 200 }));
        });
    }
    if (url.endsWith('/kano/invitations')) return json({ invitations: [] });
    if (url === '/api/settings') return json({ google: { configured: false } });
    if (url.endsWith('/project')) return json({ project: { name: '프로젝트' } });
    // 분석·응답자 목록은 이 테스트와 무관해 비워 둔다(없으면 화면이 그 영역을 그리지 않는다).
    return json({ error: '없음' }, 404);
}

const button = (text: string) => [...container.querySelectorAll('button')].find((item) => item.textContent?.trim() === text);

beforeEach(() => {
    holdRequirements = false;
    releaseRequirements = null;
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation(api);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.resetAllMocks();
    vi.unstubAllGlobals();
});

it('처음 열 때만 화면 전체 로딩을 보인다', async () => {
    holdRequirements = true;
    await act(async () => { root.render(createElement(KanoManager, { projectId: 'project' })); });

    expect(container.textContent).toContain('로딩 중...');

    await act(async () => releaseRequirements!());

    expect(container.textContent).not.toContain('로딩 중...');
    expect(button('질문 저장')).toBeDefined();
});

it('질문 저장 뒤 다시 불러오는 동안 편집 화면과 완료 알림을 그대로 둔다', async () => {
    await act(async () => { root.render(createElement(KanoManager, { projectId: 'project' })); });
    expect(button('질문 저장')).toBeDefined();

    holdRequirements = true;
    await act(async () => button('질문 저장')!.click());

    // 다시 불러오기가 끝나지 않았어도 전체 로딩으로 바뀌지 않는다.
    expect(container.textContent).not.toContain('로딩 중...');
    expect(button('질문 저장')).toBeDefined();
    expect(container.textContent).toContain('Kano 설문 질문이 저장되었습니다!');

    await act(async () => releaseRequirements!());

    expect(container.textContent).not.toContain('로딩 중...');
    expect(container.textContent).toContain('Kano 설문 질문이 저장되었습니다!');
});
