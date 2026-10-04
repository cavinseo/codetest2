// WS-2의 빈 세세부기술 열 접기와 펼치기가 입력·저장 데이터를 보존하는지 검증한다.
// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import SpecTable from '../components/project/SpecTable';
import type { SpecFunctionLike } from '../lib/spec-table-utils';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

let container: HTMLDivElement;
let root: Root;
let specs: SpecFunctionLike[];
const savedPayloads: unknown[] = [];
const collapsedByProject = new Map<string, boolean>();
const button = (label: string) => [...container.querySelectorAll('button')].find(item => item.textContent?.trim() === label)!;
const detailInputs = () => container.querySelectorAll<HTMLInputElement>('input[list="detail-options-project"]');
async function click(label: string) { await act(async () => { button(label).click(); }); }
async function mount() { await act(async () => { root.render(createElement(SpecTable, { projectId: 'project' })); }); }

beforeEach(() => {
    specs = [
        { id: 'core', level: 'CORE', name: '장애 대응', order: 0 },
        { id: 'sub', level: 'SUB', parentId: 'core', name: '원인 분석', technology: 'PLC 로그', order: 1 },
    ];
    savedPayloads.length = 0;
    collapsedByProject.clear();
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'PATCH') {
            const collapsed = JSON.parse(String(init.body)).specDetailCollapsed;
            collapsedByProject.set(String(url).split('/').at(-2)!, collapsed);
            return new Response(JSON.stringify({ specDetailCollapsed: collapsed }));
        }
        if (init?.method === 'POST') {
            savedPayloads.push(JSON.parse(String(init.body)));
            return new Response(JSON.stringify({ success: true }));
        }
        return new Response(JSON.stringify(String(url).endsWith('/spec') ? { specFunctions: specs, specDetailCollapsed: collapsedByProject.get(String(url).split('/').at(-2)!) ?? false }
            : { projects: [{ id: 'project', name: 'AI PLC 관리 장비', role: 'OWNER' }] }));
    }));
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

it('접기와 펼치기 선택을 저장하여 다시 열어도 유지한다', async () => {
    await mount();
    await click('세세부기술 접기');
    expect(collapsedByProject.get('project')).toBe(true);
    await act(async () => { root.unmount(); });
    root = createRoot(container);
    await mount();
    expect(button('세세부기술 펼치기')).toBeTruthy();
    await click('세세부기술 펼치기');
    expect(collapsedByProject.get('project')).toBe(false);
    await act(async () => { root.unmount(); });
    root = createRoot(container);
    await mount();
    expect(button('세세부기술 접기')).toBeTruthy();
});

afterEach(async () => {
    await act(async () => { root.unmount(); });
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

it('빈 열을 접고 펼쳐도 적용기술과 저장 내용이 같고 접기 자체는 저장하지 않는다', async () => {
    await mount();
    await click('저장');
    await click('세세부기술 접기');
    expect(detailInputs()).toHaveLength(0);
    expect(container.querySelectorAll('thead th')).toHaveLength(5);
    expect(container.querySelector<HTMLInputElement>('input[list="technology-options-project"]')?.value).toBe('PLC 로그');
    expect(savedPayloads).toHaveLength(1);
    await click('저장');
    expect(savedPayloads[1]).toEqual(savedPayloads[0]);
    await click('세세부기술 펼치기');
    expect(detailInputs()).toHaveLength(1);
    expect(button('세세부기술 접기').getAttribute('aria-expanded')).toBe('true');
});

it('접힌 동안은 세세부기술을 추가하지 않고 펼친 뒤 새 내용을 저장한다', async () => {
    await mount();
    await click('세세부기술 접기');
    expect(button('+D').disabled).toBe(true);
    await click('+D');
    expect(detailInputs()).toHaveLength(0);
    await click('세세부기술 펼치기');
    await click('+D');
    expect(detailInputs()).toHaveLength(2);
    await act(async () => {
        const input = detailInputs()[1];
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '고장 전후 기록');
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(button('세세부기술 접기').disabled).toBe(true);
    await click('저장');
    expect(savedPayloads[0]).toMatchObject({ specFunctions: expect.arrayContaining([
        expect.objectContaining({ level: 'DETAIL', name: '고장 전후 기록' }),
        expect.objectContaining({ level: 'SUB', technology: 'PLC 로그' }),
    ]) });
});

it('한 행이라도 세세부기술 내용이 있으면 접을 수 없다', async () => {
    specs.push({ id: 'detail', level: 'DETAIL', parentId: 'sub', name: '고장 전후 기록', technology: '기록 장치', order: 2 });
    await mount();
    expect(button('세세부기술 접기').disabled).toBe(true);
    await click('세세부기술 접기');
    expect(detailInputs()[0].value).toBe('고장 전후 기록');
    expect(container.querySelectorAll('thead th')).toHaveLength(6);
});

it('공백만 있는 세세부기술도 접을 수 있고 적용기술을 유지한다', async () => {
    specs.push({ id: 'detail', level: 'DETAIL', parentId: 'sub', name: ' \t ', technology: '기록 장치', order: 2 });
    await mount();
    await click('세세부기술 접기');
    expect(detailInputs()).toHaveLength(0);
    expect(container.querySelector<HTMLInputElement>('input[list="technology-options-project"]')?.value).toBe('기록 장치');
});

it('데이터가 없는 표에서도 접힌 열 수에 맞게 빈 상태를 표시한다', async () => {
    specs = [];
    await mount();
    await click('세세부기술 접기');
    expect(container.querySelector('tbody td')?.getAttribute('colspan')).toBe('5');
    await click('세세부기술 펼치기');
    expect(container.querySelector('tbody td')?.getAttribute('colspan')).toBe('6');
});

it('접은 뒤 내용이 있는 데이터를 불러오면 펼치고 마지막 내용을 지워도 입력 칸을 유지한다', async () => {
    await mount();
    await click('세세부기술 접기');
    specs.push({ id: 'detail', level: 'DETAIL', parentId: 'sub', name: '불러온 기록', technology: '기록 장치', order: 2 });
    await act(async () => { root.render(createElement(SpecTable, { projectId: 'next-project' })); });
    const input = container.querySelector<HTMLInputElement>('input[list="detail-options-next-project"]')!;
    expect(input.value).toBe('불러온 기록');
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '');
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(container.contains(input)).toBe(true);
    expect(button('세세부기술 접기').disabled).toBe(false);
});
