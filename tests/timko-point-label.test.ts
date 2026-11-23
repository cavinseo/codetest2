// 차트 번호가 원(또는 캡슐) 안에 들어가도록 글자 크기·폭을 계산하는 규칙을 검증한다.
//
// 지키는 성질은 둘이다. (1) 자릿수가 늘면 글자를 줄여 정해진 폭 안에 넣되, 최대·최소
// 크기를 벗어나지 않는다. (2) 폭 추정은 글자 수와 글자 크기에 비례한다 — 캡슐 폭이
// 이 값으로 정해지므로 어긋나면 번호가 캡슐 밖으로 넘친다.
import { describe, expect, it } from 'vitest';
import { estimateLabelWidth, fitLabelFontSize, LABEL_CHAR_WIDTH_RATIO } from '../lib/timko-point-label';

describe('estimateLabelWidth', () => {
    it('글자 수 × 글자 크기 × 평균 폭 비율이다', () => {
        expect(LABEL_CHAR_WIDTH_RATIO).toBe(0.62);
        expect(estimateLabelWidth('16', 10)).toBeCloseTo(12.4);
        expect(estimateLabelWidth('2·9·16', 12)).toBeCloseTo(44.64);
    });
});

describe('fitLabelFontSize', () => {
    const INNER = 20;

    it('한 자리 번호는 최대 크기로 그린다', () => {
        expect(fitLabelFontSize('7', INNER, 14, 8)).toBe(14);
    });

    it('폭에 딱 맞는 크기는 그대로 쓴다', () => {
        // 20 / (2 × 0.62) = 16.1… → 16 이므로 최대 16 이면 16 이 들어간다.
        expect(fitLabelFontSize('16', INNER, 16, 8)).toBe(16);
        expect(fitLabelFontSize('16', INNER, 17, 8)).toBe(16);
    });

    it('세 자리 번호는 폭에 맞춰 줄인다', () => {
        // 20 / (3 × 0.62) = 10.75… → 10
        expect(fitLabelFontSize('100', INNER, 14, 8)).toBe(10);
        expect(estimateLabelWidth('100', 10)).toBeLessThanOrEqual(INNER);
    });

    it('아무리 길어도 최소 크기 아래로는 줄이지 않는다', () => {
        // 20 / (5 × 0.62) = 6.45… → 6 이지만 최소 8 을 지킨다.
        expect(fitLabelFontSize('12345', INNER, 14, 8)).toBe(8);
        expect(fitLabelFontSize('12345', INNER, 14, 6)).toBe(6);
    });
});
