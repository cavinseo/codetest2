// 인쇄 본문을 넘거나 작은 그림이 확대되는 회귀를 막는다.
import { describe, expect, it } from 'vitest';
import { A4_LANDSCAPE_BODY, A4_PORTRAIT_BODY, fitImageToBody, shouldUseLandscape } from '../lib/report-image-fit';

describe('report image fitting', () => {
    it('uses A4 body areas with 20mm margins', () => {
        expect(A4_PORTRAIT_BODY).toEqual({ widthMm: 170, heightMm: 257 });
        expect(A4_LANDSCAPE_BODY).toEqual({ widthMm: 257, heightMm: 170 });
    });
    it.each([
        [960, 96, 170, 17],
        [96, 1920, 12.85, 257],
        [1920, 1920, 170, 170],
        [960, 3840, 64.25, 257],
        [96, 192, 25.4, 50.8],
    ])('fits %s by %s pixels without stretching', (w, h, widthMm, heightMm) => {
        const result = fitImageToBody(w, h, A4_PORTRAIT_BODY);
        expect(result.widthMm).toBeCloseTo(widthMm, 10);
        expect(result.heightMm).toBeCloseTo(heightMm, 10);
    });
    it('honors the supplied body dimensions', () => {
        expect(fitImageToBody(960, 480, { widthMm: 80, heightMm: 30 })).toEqual({ widthMm: 60, heightMm: 30 });
    });
    it.each([0, -1, NaN, Infinity, -Infinity])('rejects invalid extent %s', value => {
        expect(() => fitImageToBody(value, 96, A4_PORTRAIT_BODY)).toThrow('그림과 본문의 크기는 양수여야 합니다.');
        expect(() => fitImageToBody(96, value, A4_PORTRAIT_BODY)).toThrow('그림과 본문의 크기는 양수여야 합니다.');
        expect(() => fitImageToBody(96, 96, { widthMm: value, heightMm: 170 })).toThrow('그림과 본문의 크기는 양수여야 합니다.');
        expect(() => fitImageToBody(96, 96, { widthMm: 170, heightMm: value })).toThrow('그림과 본문의 크기는 양수여야 합니다.');
        expect(() => shouldUseLandscape(value, 96)).toThrow('그림과 본문의 크기는 양수여야 합니다.');
        expect(() => shouldUseLandscape(96, value)).toThrow('그림과 본문의 크기는 양수여야 합니다.');
        expect(() => shouldUseLandscape(96, 96, value)).toThrow('그림과 본문의 크기는 양수여야 합니다.');
    });
    it('uses a strict aspect-ratio threshold and permits an override', () => {
        expect(shouldUseLandscape(100, 200)).toBe(false);
        expect(shouldUseLandscape(257, 170)).toBe(false);
        expect(shouldUseLandscape(258, 170)).toBe(true);
        expect(shouldUseLandscape(150, 100, 1.4)).toBe(true);
        expect(shouldUseLandscape(150, 100, 2)).toBe(false);
        expect(shouldUseLandscape(150, 100, 1.5)).toBe(false);
    });
});
