// 적합도 화면이 불러오기 실패를 숨기고 기본값으로 저장해 실제 점수를 덮어쓰지 않는지
// 실제 React DOM 으로 확인한다(2026-10-25 코드 리뷰 B2).
// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import AttributeFitnessPage from '../app/project/[id]/attributes/fitness/page';

vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'project' }) }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn();
const json = (data: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(data), { status }));
const attributes = { attributes: [{ id: 'attr_1', attribute: '내구성', order: 0 }] };
const saved = { fitnesses: [{ id: 'fit_1', projectId: 'project', attributeId: 'attr_1', importance: 9, currentLevel: 8, targetLevel: 10, note: '' }] };
const posts = () => fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');
// 단독 페이지는 overview 로 편집 권한을 확인한다(B16). 기본은 소유자.
let projectRole = 'OWNER';
const withRole = (handler: (url: string) => Promise<Response>) => (url: string) =>
    url.endsWith('/overview') ? json({ project: { role: projectRole } }) : handler(url);
const buttons = (text: string) => [...container.querySelectorAll('button')].filter(item => item.textContent?.trim() === text);

beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
    projectRole = 'OWNER';
    act(() => root.unmount());
    container.remove();
    fetchMock.mockReset();
    vi.unstubAllGlobals();
});

async function mount() {
    await act(async () => { root.render(createElement(AttributeFitnessPage)); });
}

it('저장된 적합도를 불러오지 못하면 편집·저장 대신 재시도를 보인다', async () => {
    fetchMock.mockImplementation(withRole((url: string) => url.endsWith('/fitness') ? json({ error: '실패' }, 500) : json(attributes)));
    await mount();

    expect(container.querySelector('[role="alert"]')?.textContent).toContain('불러오지 못했습니다');
    expect(buttons('저장')).toHaveLength(0);
    expect(buttons('적합도 저장')).toHaveLength(0);
    expect(posts()).toHaveLength(0);
});

it('네트워크 오류도 같은 재시도 화면으로 막는다', async () => {
    fetchMock.mockImplementation(() => Promise.reject(new TypeError('Failed to fetch')));
    await mount();

    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(buttons('저장')).toHaveLength(0);
});

it('다시 불러오기에 성공하면 저장된 점수로 편집 화면을 연다', async () => {
    let fitnessFails = true;
    fetchMock.mockImplementation(withRole((url: string) => {
        if (!url.endsWith('/fitness')) return json(attributes);
        return fitnessFails ? json({ error: '실패' }, 500) : json(saved);
    }));
    await mount();
    fitnessFails = false;
    await act(async () => { buttons('다시 불러오기')[0].click(); });

    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(buttons('저장')).toHaveLength(1);
    expect(container.textContent).toContain('내구성');
    expect(container.textContent).toContain('저장됨');
});

// 2026-10-25 코드 리뷰 B16: 조회 전용 회원에게도 편집 화면이 열려 저장하면 403 으로 입력을 잃었다.
it('조회 전용 회원에게는 읽기 전용으로 열고 저장을 막는다', async () => {
    projectRole = 'COACH';
    fetchMock.mockImplementation(withRole((url: string) => json(url.endsWith('/fitness') ? saved : attributes)));
    await mount();

    expect(container.textContent).toContain('읽기 전용입니다');
    expect(container.querySelector('fieldset')?.disabled).toBe(true);
    const save = buttons('저장')[0];
    expect(save.disabled).toBe(true);
    await act(async () => { save.click(); });
    expect(posts()).toHaveLength(0);
});

it('편집 권한이 있으면 안내 없이 편집을 연다', async () => {
    fetchMock.mockImplementation(withRole((url: string) => json(url.endsWith('/fitness') ? saved : attributes)));
    await mount();

    expect(container.textContent).not.toContain('읽기 전용입니다');
    expect(container.querySelector('fieldset')?.disabled).toBe(false);
    expect(buttons('저장')[0].disabled).toBe(false);
});
