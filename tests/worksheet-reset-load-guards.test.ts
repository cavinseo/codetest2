// 워크시트가 불러오기 실패 상태에서 저장된 데이터를 덮어쓰지 않고, 서버가 거절한 초기화를
// 성공처럼 보이지 않는지 실제 React DOM 으로 확인한다(2026-10-25 코드 리뷰 B9·B10).
// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProductAttributesTable from '../components/project/ProductAttributesTable';
import TechTreeTable from '../components/project/TechTreeTable';

let container: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn();
const json = (data: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(data), { status }));
const buttons = (label: string) => [...container.querySelectorAll('button')].filter(item => item.textContent?.trim() === label);
const writes = () => fetchMock.mock.calls.filter(([, init]) => init?.method && init.method !== 'GET');
const hasFieldValue = (value: string) => [...container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea')]
    .some(field => field.value === value);
const toastText = () => container.querySelector('[role="status"]')?.textContent ?? '';

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

describe('제품속성서 초기화 (B10)', () => {
    const attribute = {
        id: 'attr_1', productName: '제품', customerName: '고객', marketSegment: 'B2B', customerNeed: '튼튼함',
        benefit: '오래 씀', attribute: '내구성', techCapability: '', order: 0,
    };

    function mockLoad(deleteResponse: () => Promise<Response>) {
        fetchMock.mockImplementation((url: string, init?: RequestInit) => {
            if (init?.method === 'DELETE') return deleteResponse();
            if (url.endsWith('/attributes')) return json({ attributes: [attribute] });
            if (url.endsWith('/spec')) return json({ specFunctions: [] });
            return json({ projects: [{ id: 'project', name: '프로젝트' }] });
        });
    }

    async function confirmReset() {
        await act(async () => { root.render(createElement(ProductAttributesTable, { projectId: 'project' })); });
        await act(async () => { buttons('리셋')[0].click(); });
        expect(container.textContent).toContain('제품속성서 초기화');
        await act(async () => { buttons('초기화').at(-1)!.click(); });
    }

    it('서버가 거절하면 표와 확인 창을 그대로 두고 서버 문구를 보인다', async () => {
        mockLoad(() => json({ error: '편집 권한이 없습니다.' }, 403));
        await confirmReset();

        expect(toastText()).toContain('편집 권한이 없습니다.');
        expect(toastText()).not.toContain('초기화되었습니다');
        expect(hasFieldValue('내구성')).toBe(true);
        expect(container.textContent).toContain('제품속성서 초기화');
    });

    it('서버가 지웠을 때만 표를 비우고 성공을 알린다', async () => {
        mockLoad(() => json({ success: true, removed: 1 }));
        await confirmReset();

        expect(toastText()).toContain('초기화되었습니다.');
        expect(hasFieldValue('내구성')).toBe(false);
        expect(container.textContent).not.toContain('제품속성서 초기화');
    });
});

describe('기능기술체계도 불러오기 실패 (B9)', () => {
    function mockLoad(treeFails: () => boolean) {
        fetchMock.mockImplementation((url: string, init?: RequestInit) => {
            if (init?.method === 'POST') return json({ entries: [] });
            if (url.endsWith('/tech-tree')) {
                return treeFails()
                    ? json({ error: '실패' }, 500)
                    : json({ entries: [{ id: 'saved', customerVoice: '더 빠르게', coreSpec: '구동', subSpec: '', techCharacteristic: '', order: 0 }] });
            }
            if (url.endsWith('/spec')) return json({ specFunctions: [] });
            if (url.endsWith('/requirements')) return json({ requirements: [] });
            return json({ requirements: [] });
        });
    }

    it('저장된 체계도를 불러오지 못하면 편집·저장·자동 생성 대신 재시도를 보인다', async () => {
        mockLoad(() => true);
        await act(async () => { root.render(createElement(TechTreeTable, { projectId: 'project' })); });

        expect(container.querySelector('[role="alert"]')?.textContent).toContain('불러오지 못했습니다');
        expect(buttons('저장')).toHaveLength(0);
        expect(buttons('자동 생성')).toHaveLength(0);
        expect(writes()).toHaveLength(0);
    });

    it('다시 불러오기에 성공하면 저장된 체계도로 편집 화면을 연다', async () => {
        let treeFails = true;
        mockLoad(() => treeFails);
        await act(async () => { root.render(createElement(TechTreeTable, { projectId: 'project' })); });
        treeFails = false;
        await act(async () => { buttons('다시 불러오기')[0].click(); });

        expect(container.querySelector('[role="alert"]')).toBeNull();
        expect(hasFieldValue('더 빠르게') || container.textContent?.includes('더 빠르게')).toBe(true);
        expect(writes()).toHaveLength(0);
    });
});
