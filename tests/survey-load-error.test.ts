// 설문 링크를 열 수 없을 때 만료·이미 응답·없음·일시 오류를 구분해 보이는지 실제 React
// DOM 으로 확인한다(2026-10-25 코드 리뷰 B18).
// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import SurveyPage from '../app/survey/[token]/page';

vi.mock('next/navigation', () => ({ useParams: () => ({ token: 'token_1' }), useRouter: () => ({ push: vi.fn() }) }));
vi.mock('next/link', () => ({ default: ({ children, ...props }: { children: ReactNode; href: string }) => createElement('a', props, children) }));
vi.mock('@/components/ThemeToggle', () => ({ default: () => null }));

let container: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn();
const json = (data: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(data), { status }));
const alertBox = () => container.querySelector('[role="alert"]');
const retryButton = () => [...container.querySelectorAll('button')].find((item) => item.textContent?.trim() === '다시 시도');

beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('fetch', fetchMock);
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

async function open() {
    await act(async () => { root.render(createElement(SurveyPage)); });
}

it.each([
    [410, '설문 링크가 만료되었습니다.', '설문 링크가 만료되었습니다'],
    [400, '이미 응답을 완료하셨습니다.', '이미 응답한 설문입니다'],
    [404, '유효하지 않은 설문 링크입니다.', '설문을 찾을 수 없습니다'],
])('%i 이면 "%s" 를 그 상황의 제목과 함께 보인다', async (status, serverMessage, title) => {
    fetchMock.mockReturnValue(json({ error: serverMessage }, status));
    await open();

    expect(fetchMock).toHaveBeenCalledWith('/api/survey/token_1');
    expect(alertBox()?.querySelector('h2')?.textContent).toBe(title);
    expect(alertBox()?.textContent).toContain(serverMessage);
    // 다시 시도해도 결과가 같은 상황이라 재시도 버튼을 두지 않는다.
    expect(retryButton()).toBeUndefined();
});

it('서버 오류는 일시적 실패로 보고 다시 시도하면 설문을 연다', async () => {
    fetchMock.mockReturnValueOnce(json({ error: '설문 조회 실패' }, 500));
    await open();

    expect(alertBox()?.querySelector('h2')?.textContent).toBe('설문을 불러오지 못했습니다');
    expect(alertBox()?.textContent).not.toContain('찾을 수 없습니다');

    fetchMock.mockReturnValueOnce(json({
        projectName: '테스트 프로젝트',
        requirements: [{ id: 'req_1', category: '사용성', requirement: '빠른 주문', order: 0 }],
    }));
    await act(async () => retryButton()!.click());

    expect(alertBox()).toBeNull();
    expect(container.textContent).toContain('테스트 프로젝트');
    expect(container.textContent).toContain('빠른 주문');
});

it('네트워크 오류도 다시 시도할 수 있는 실패로 보인다', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await open();

    expect(alertBox()?.querySelector('h2')?.textContent).toBe('설문을 불러오지 못했습니다');
    expect(retryButton()).toBeDefined();
});
