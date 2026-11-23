// 만족/불만족 계수 그래프에서 번호가 원(겹친 점은 캡슐) 안에 그려지고, 번호를 누르면
// 아래 표의 해당 행으로 스크롤되어 강조되는지 검증한다.
// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import KanoSatisfactionGraph from '../components/project/KanoSatisfactionGraph';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const analysis = [
    { requirementId: 'r1', requirementName: '빠른 처리', better: 0.95, worse: -0.4, quadrant: 'ATTRACTIVE' },
    // r2·r3 은 좌표가 같아 한 캡슐로 묶인다.
    { requirementId: 'r2', requirementName: '쉬운 설정', better: 0.8, worse: -0.3, quadrant: 'ATTRACTIVE' },
    { requirementId: 'r3', requirementName: '안정성', better: 0.8, worse: -0.3, quadrant: 'ATTRACTIVE' },
    { requirementId: 'r4', requirementName: '가격', better: 0.2, worse: -0.9, quadrant: 'MUST_BE' },
];

let container: HTMLDivElement;
let root: Root;
const scrollIntoView = vi.fn();

beforeEach(() => {
    // jsdom 에는 scrollIntoView 가 없다.
    Element.prototype.scrollIntoView = scrollIntoView;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
    scrollIntoView.mockReset();
});

async function render(props: Partial<Parameters<typeof KanoSatisfactionGraph>[0]> = {}) {
    await act(async () => root.render(createElement(KanoSatisfactionGraph, { analysis, ...props })));
}

it('단독 점은 번호를 원 안 크기로, 겹친 점은 캡슐 안에 한데 그린다', async () => {
    await render();
    const labels = [...container.querySelectorAll('[data-point-label]')].map(el => el.getAttribute('data-point-label'));
    expect(labels).toEqual(['1', '2·3', '4']);

    const single = container.querySelector('[data-point-label="1"]')!;
    expect(single.querySelector('rect')).toBeNull();
    // 원 지름 24 에서 테두리·여백을 뺀 20 안에 들어가는 최대 14.
    expect(single.querySelector('text')!.getAttribute('font-size')).toBe('14');

    const cluster = container.querySelector('[data-point-label="2·3"]')!;
    const badge = cluster.querySelector('rect')!;
    const text = cluster.querySelector('text')!;
    expect(text.getAttribute('font-size')).toBe('12');
    // 캡슐 폭은 지름(24) 이상이고 번호 폭 + 양옆 여백을 담는다: 3 × 12 × 0.62 + 12 = 34.32
    expect(Number(badge.getAttribute('width'))).toBeCloseTo(34.32);
    expect(badge.getAttribute('rx')).toBe('12');
    // 캡슐 중심이 묶음 중심에 놓인다.
    const center = Number(badge.getAttribute('x')) + Number(badge.getAttribute('width')) / 2;
    expect(center).toBeCloseTo(Number(text.getAttribute('x')));
    expect([...cluster.querySelectorAll('[data-point-number]')].map(el => el.textContent)).toEqual(['2', '3']);
});

it('번호를 누르면 해당 표 행으로 스크롤하고 강조하며 부모에게 알린다', async () => {
    const onSelectRequirement = vi.fn();
    await render({ onSelectRequirement });
    const row = (id: string) => container.querySelector(`[data-requirement-row="${id}"]`)!;
    expect(row('r3').getAttribute('data-selected')).toBeNull();

    await act(async () => {
        container.querySelector<SVGTSpanElement>('[data-point-number="3"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSelectRequirement).toHaveBeenCalledWith('r3');
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toBe(row('r3'));
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
    expect(row('r3').getAttribute('data-selected')).toBe('true');
    expect(row('r2').getAttribute('data-selected')).toBeNull();
});

it('점 자체를 눌러도 같은 행으로 간다', async () => {
    await render();
    await act(async () => {
        container.querySelector('[data-requirement-point="r4"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(scrollIntoView.mock.contexts[0]).toBe(container.querySelector('[data-requirement-row="r4"]'));
});

it('부모가 선택을 넘기면 그 값으로 행을 강조한다', async () => {
    await render({ selectedRequirementId: 'r1' });
    expect(container.querySelector('[data-requirement-row="r1"]')!.getAttribute('data-selected')).toBe('true');
});
