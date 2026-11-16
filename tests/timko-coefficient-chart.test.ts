// Timko 계수 막대의 방향·크기와 응답 상태를 검증하고 기존 만족계수 그래프를 보존한다.
// @vitest-environment jsdom
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import TimkoCoefficientChart from '../components/project/TimkoCoefficientChart';
import KanoSatisfactionGraph from '../components/project/KanoSatisfactionGraph';
import { aggregateKanoResponses, calculateBetterWorse, type KanoAnswer } from '../lib/kano-algorithm';

type Analysis = {
    requirementId: string;
    requirementName?: string;
    better: number;
    worse: number;
    aggregated?: { A: number; O: number; M: number; I: number };
};

function render(analysis: Analysis[]) {
    return new DOMParser().parseFromString(renderToStaticMarkup(createElement(TimkoCoefficientChart, { analysis })), 'text/html');
}

function row(document: Document, requirementId: string) {
    const result = [...document.querySelectorAll('tr[data-requirement-id]')].find(element => element.getAttribute('data-requirement-id') === requirementId);
    expect(result).toBeDefined();
    return result!;
}

function expectBar(element: Element, coefficient: 'better' | 'worse', expected: { x: number; width: number; y: number; fill: string }) {
    const bar = element.querySelector(`rect[data-coefficient="${coefficient}"]`);
    expect(bar).not.toBeNull();
    expect(Number(bar!.getAttribute('x'))).toBeCloseTo(expected.x);
    expect(Number(bar!.getAttribute('width'))).toBeCloseTo(expected.width);
    expect(Number(bar!.getAttribute('y'))).toBe(expected.y);
    expect(bar!.getAttribute('fill')).toBe(expected.fill);
}

describe('Timko 계수의 공통 영점과 막대 방향', () => {
    it.each([
        ['끝값', 1, -1, 60, 240, 240],
        ['영점', 0, 0, 300, 0, 0],
        ['부분값', 0.65, -0.35, 216, 84, 156],
        ['작은 값', 0.01, -0.01, 297.6, 2.4, 2.4],
    ] as const)('%s는 불만족을 왼쪽, 만족을 오른쪽에 같은 척도로 표시한다', (_label, better, worse, worseX, worseWidth, betterWidth) => {
        const rendered = render([{ requirementId: 'requirement', requirementName: '고장 예방', better, worse }]);
        const requirementRow = row(rendered, 'requirement');
        const chart = requirementRow.querySelector('svg[role="img"]');
        expect(chart).not.toBeNull();
        expect(chart!.getAttribute('viewBox')).toBe('0 0 600 56');
        expectBar(requirementRow, 'worse', { x: worseX, width: worseWidth, y: 8, fill: '#facc15' });
        expectBar(requirementRow, 'better', { x: 300, width: betterWidth, y: 30, fill: '#f97316' });
        expect(Number(requirementRow.querySelector('[data-coefficient="worse"]')!.getAttribute('x'))
            + Number(requirementRow.querySelector('[data-coefficient="worse"]')!.getAttribute('width'))).toBeCloseTo(300);
        const ariaLabel = chart!.getAttribute('aria-label');
        expect(ariaLabel).toContain('고장 예방');
        expect(ariaLabel).toContain(String(better));
        expect(ariaLabel).toContain(String(worse));
    });

    it('입력 순서를 유지하고 서로 다른 계수를 요구사항 ID에 연결한다', () => {
        const analysis = [
            { requirementId: 'second', requirementName: '두 번째 요구', better: 0.25, worse: -0.75 },
            { requirementId: 'first', requirementName: '첫 번째 요구', better: 0.8, worse: -0.2 },
            { requirementId: 'third', requirementName: '세 번째 요구', better: 0.5, worse: -0.5 },
        ];
        const before = structuredClone(analysis);
        const rendered = render(analysis);
        expect([...rendered.querySelectorAll('tr[data-requirement-id]')].map(element => element.getAttribute('data-requirement-id'))).toEqual(['second', 'first', 'third']);
        expectBar(row(rendered, 'second'), 'better', { x: 300, width: 60, y: 30, fill: '#f97316' });
        expectBar(row(rendered, 'first'), 'better', { x: 300, width: 192, y: 30, fill: '#f97316' });
        expectBar(row(rendered, 'third'), 'worse', { x: 180, width: 120, y: 8, fill: '#facc15' });
        expect(analysis).toEqual(before);
    });
});

describe('요구사항 이름과 설명', () => {
    it('긴 한글 요구사항을 생략하지 않고 HTML 문법은 실행되지 않는 텍스트로 표시한다', () => {
        const name = '설비의 고장 원인을 단계별로 확인하고 재발 방지 조치와 작업자 안내를 기록한다. '.repeat(8)
            + '<img src="x" onerror="alert(1)"> & <script>alert(2)</script>';
        const requirementRow = row(render([{ requirementId: 'long-name', requirementName: name, better: 0.4, worse: -0.6 }]), 'long-name');
        expect(requirementRow.textContent).toContain(name);
        expect(requirementRow.querySelector('svg')!.getAttribute('aria-label')).toContain(name);
        expect(requirementRow.querySelector('img, script')).toBeNull();
    });

    it('이름이 없거나 빈 문자열이면 화면 순서의 요구사항 번호로 표시한다', () => {
        const rendered = render([
            { requirementId: 'without-name', better: 0.4, worse: -0.6 },
            { requirementId: 'empty-name', requirementName: '', better: 0.3, worse: -0.7 },
        ]);
        expect(row(rendered, 'without-name').textContent).toContain('요구사항 1');
        expect(row(rendered, 'empty-name').textContent).toContain('요구사항 2');
        expect(row(rendered, 'without-name').querySelector('svg')!.getAttribute('aria-label')).toContain('요구사항 1');
        expect(row(rendered, 'empty-name').querySelector('svg')!.getAttribute('aria-label')).toContain('요구사항 2');
    });

    it('설명표에 만족·불만족 공식과 불만족의 음수 부호를 제공한다', () => {
        const rendered = render([{ requirementId: 'one', better: 0.5, worse: -0.5 }]);
        const text = rendered.body.textContent!.replace(/\s+/g, ' ');
        expect(text).toContain('(A + O) / (A + O + M + I)');
        expect(text).toMatch(/[−-]\s*\(O \+ M\) \/ \(A \+ O \+ M \+ I\)/);
        expect(text).toContain('만족');
        expect(text).toContain('불만족');
    });
});

describe('분석 응답의 상태', () => {
    it('빈 분석에는 요구사항 행이나 계수 SVG를 만들지 않는다', () => {
        const rendered = render([]);
        expect(rendered.body.textContent).toContain('분석 결과가 없습니다.');
        expect(rendered.querySelector('tr[data-requirement-id]')).toBeNull();
        expect(rendered.querySelector('svg')).toBeNull();
    });

    it('I 응답만 있으면 계산된 0 계수를 정상적인 두 개 막대로 표시한다', () => {
        const aggregated = aggregateKanoResponses([{ positive: 3, negative: 3 }]);
        const coefficients = calculateBetterWorse(aggregated);
        const requirementRow = row(render([{ requirementId: 'indifferent', ...coefficients, aggregated }]), 'indifferent');
        expect(requirementRow.textContent).not.toContain('계산 대상 응답 없음');
        expect(requirementRow.querySelectorAll('svg')).toHaveLength(1);
        expectBar(requirementRow, 'worse', { x: 300, width: 0, y: 8, fill: '#facc15' });
        expectBar(requirementRow, 'better', { x: 300, width: 0, y: 30, fill: '#f97316' });
    });

    it('R·Q 응답만 있어 분모가 0이면 계산 대상 없음으로 표시하고 SVG를 생략한다', () => {
        const aggregated = aggregateKanoResponses([{ positive: 2, negative: 1 }, { positive: 1, negative: 1 }]);
        const coefficients = calculateBetterWorse(aggregated);
        const requirementRow = row(render([{ requirementId: 'reverse-questionable', ...coefficients, aggregated }]), 'reverse-questionable');
        expect(aggregated).toMatchObject({ R: 1, Q: 1, A: 0, O: 0, M: 0, I: 0 });
        expect(requirementRow.textContent).toContain('계산 대상 응답 없음');
        expect(requirementRow.querySelector('svg')).toBeNull();
    });

    it('집계 분모가 0이면 과거 계수가 남아 있어도 유효한 계산처럼 그리지 않는다', () => {
        const requirementRow = row(render([{ requirementId: 'stale', better: 0.75, worse: -0.5, aggregated: { A: 0, O: 0, M: 0, I: 0 } }]), 'stale');
        expect(requirementRow.textContent).toContain('계산 대상 응답 없음');
        expect(requirementRow.querySelector('svg')).toBeNull();
    });

    it('집계가 생략된 저장본에서는 전달된 계수를 그대로 표시한다', () => {
        const requirementRow = row(render([{ requirementId: 'saved', better: 0.37, worse: -0.82 }]), 'saved');
        expect(requirementRow.textContent).not.toContain('계산 대상 응답 없음');
        expectBar(requirementRow, 'better', { x: 300, width: 88.8, y: 30, fill: '#f97316' });
        expectBar(requirementRow, 'worse', { x: 103.2, width: 196.8, y: 8, fill: '#facc15' });
    });
});

it('기존 Kano 계산의 R·Q 제외와 소수점 반올림을 막대 위치에 연결한다', () => {
    const pairs: Array<{ positive: KanoAnswer; negative: KanoAnswer }> = [
        { positive: 1, negative: 3 }, { positive: 1, negative: 3 },
        { positive: 1, negative: 5 }, { positive: 1, negative: 5 },
        { positive: 2, negative: 5 },
        { positive: 3, negative: 3 }, { positive: 3, negative: 3 }, { positive: 3, negative: 3 },
        { positive: 2, negative: 1 }, { positive: 1, negative: 1 },
    ];
    const aggregated = aggregateKanoResponses(pairs);
    const coefficients = calculateBetterWorse(aggregated);
    expect(aggregated).toMatchObject({ A: 2, O: 2, M: 1, I: 3, R: 1, Q: 1 });
    expect(coefficients).toEqual({ better: 0.5, worse: -0.37 });
    const requirementRow = row(render([{ requirementId: 'calculated', ...coefficients, aggregated }]), 'calculated');
    expectBar(requirementRow, 'better', { x: 300, width: 120, y: 30, fill: '#f97316' });
    expectBar(requirementRow, 'worse', { x: 211.2, width: 88.8, y: 8, fill: '#facc15' });
});

it('만족계수 그래프 부모가 새 막대를 포함해도 기존 Timko 그림은 한 개 유지한다', () => {
    const analysis = [{ requirementId: 'one', requirementName: '고장 예방', better: 0.75, worse: -0.5, quadrant: 'ONE_DIMENSIONAL' }];
    const rendered = new DOMParser().parseFromString(renderToStaticMarkup(createElement(KanoSatisfactionGraph, { analysis })), 'text/html');
    expect(rendered.querySelectorAll('svg.timko-chart')).toHaveLength(1);
    expect(rendered.querySelector('svg.timko-chart')!.parentElement!.querySelector('[data-timko-coefficients]')).toBeNull();
    expect(rendered.querySelectorAll('[data-timko-coefficients]')).toHaveLength(1);
    expect(rendered.querySelectorAll('[data-timko-coefficients] svg[role="img"]')).toHaveLength(1);
    expect(rendered.querySelectorAll('rect[data-coefficient]')).toHaveLength(2);
    expect(rendered.querySelector('svg.timko-chart')!.querySelector('title')!.textContent).toBe('고장 예방');
});
