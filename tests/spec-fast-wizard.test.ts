// AS-IS 스펙표에서 떼어 낸 FAST 작성 지원 창을 실제 React DOM 으로 돌려 본다
// (2026-10-25 코드 리뷰 L3). 안내 → 입력 → 검토 → 결과표 수정 → 확정의 흐름과, 닫았다 다시 열 때
// 적던 세부설명이 남는지 확인한다.
// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import SpecFastWizard, { type SpecFastWizardProps } from '../components/project/SpecFastWizard';

let container: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn();
const onApply = vi.fn();
const onClose = vi.fn();
const showToast = vi.fn();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const project = { name: '스마트 화분', description: '물을 알아서 주는 화분', detailedDescription: '' };

function render(open: boolean) {
    const props: SpecFastWizardProps = { projectId: 'p1', project, existingRowCount: 4, open, onClose, onApply, showToast };
    return act(async () => root.render(createElement(SpecFastWizard, props)));
}

const button = (text: string) => {
    const found = [...container.querySelectorAll('button')].find((item) => item.textContent?.trim() === text);
    expect(found, text).toBeDefined();
    return found!;
};
const click = (text: string) => act(async () => button(text).click());
const textareas = () => [...container.querySelectorAll('textarea')];
const cellInputs = () => [...container.querySelectorAll<HTMLInputElement>('tbody input')];
async function type(element: HTMLInputElement | HTMLTextAreaElement, text: string) {
    await act(async () => {
        const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, text);
        element.dispatchEvent(new Event('input', { bubbles: true }));
    });
}

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

it('닫혀 있으면 아무것도 그리지 않는다', async () => {
    await render(false);

    expect(container.innerHTML).toBe('');
});

it('입력부터 결과표 수정·확정까지 거쳐 고친 행을 스펙표로 넘긴다', async () => {
    fetchMock.mockResolvedValue(json({
        provider: 'rule',
        specFunctions: [
            { id: 'c', level: 'CORE', name: '급수', order: 0 },
            { id: 's', level: 'SUB', parentId: 'c', name: '수분 감지', order: 1 },
            { id: 'd1', level: 'DETAIL', parentId: 's', name: '토양 센서', technology: '정전용량', order: 2 },
            { id: 'd2', level: 'DETAIL', parentId: 's', name: '무게 센서', technology: '로드셀', order: 3 },
        ],
        issues: [{ severity: 'warning', message: '적용기술이 비어 있는 행이 있습니다.' }],
        contextSummary: { productAttributeCount: 2, customerNeedCount: 5, existingSpecCount: 4 },
    }));
    await render(false);
    await render(true);

    // 안내 화면은 프로젝트와 기존 스펙표 행 수를 보여 준다.
    expect(container.textContent).toContain('스마트 화분');
    expect(container.textContent).toContain('4행');
    await click('입력 시작');

    // 세부설명은 개요의 설명으로 미리 채워진다.
    expect(textareas()[0].value).toBe('물을 알아서 주는 화분');
    await type(textareas()[1], '자동 급수, 수분 알림');
    await click('입력 내용 검토');
    expect(container.textContent).toContain('자동 급수, 수분 알림');
    await click('FAST 결과표 제시');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/projects/p1/spec/generate');
    expect(JSON.parse(String(init.body))).toMatchObject({
        mode: 'draft',
        additionalDescription: '물을 알아서 주는 화분',
        structuredInput: { productService: '스마트 화분', currentFunctions: '자동 급수, 수분 알림' },
    });
    expect(container.textContent).toContain('적용기술이 비어 있는 행이 있습니다.');
    expect(container.textContent).toContain('기본 엔진');

    // 두 행이 한 핵심 칸을 나눠 쓰므로 그 칸을 고치면 두 행이 함께 바뀐다.
    await type(cellInputs()[0], '자동 급수');
    await click('확정 후 표에 반영');

    expect(onApply).toHaveBeenCalledOnce();
    expect(onApply.mock.calls[0][0].map((row: { core: string; sub: string; detail: string; technology: string }) => [row.core, row.sub, row.detail, row.technology]))
        .toEqual([
            ['자동 급수', '수분 감지', '토양 센서', '정전용량'],
            ['자동 급수', '수분 감지', '무게 센서', '로드셀'],
        ]);
    expect(showToast).toHaveBeenLastCalledWith('FAST 양식 2행을 표에 반영했습니다. 저장 버튼을 눌러 확정하세요.', 'success');
});

it('세부설명이나 원하는 기능이 비면 생성하지 않는다', async () => {
    await render(false);
    await render(true);
    await click('입력 시작');
    await type(textareas()[0], '   ');
    await click('입력 내용 검토');
    await click('FAST 결과표 제시');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith('세부설명과 원하는 기능을 모두 입력하세요.', 'error');
});

it('닫았다 다시 열면 첫 단계로 돌아가되 적던 세부설명은 남는다', async () => {
    await render(false);
    await render(true);
    await click('입력 시작');
    await type(textareas()[0], '직접 고친 세부설명');
    await click('취소');
    expect(onClose).toHaveBeenCalledOnce();

    await render(false);
    await render(true);
    expect(container.textContent).toContain('작성에 필요한 내용 안내.');
    await click('입력 시작');
    expect(textareas()[0].value).toBe('직접 고친 세부설명');
});
