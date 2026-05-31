import { describe, expect, it } from 'vitest';
import { resolveBenchmarkDeleteScope } from '../lib/qfd-benchmark-guards';

describe('qfd benchmark delete guards', () => {
    it('keeps full reset only for requests without company parameter', () => {
        expect(resolveBenchmarkDeleteScope(new URLSearchParams())).toEqual({
            mode: 'all',
            company: null,
        });
    });

    it('rejects blank company parameter instead of treating it as a full reset', () => {
        expect(resolveBenchmarkDeleteScope(new URLSearchParams('company=   '))).toEqual({
            mode: 'invalid',
            company: null,
            error: '삭제할 경쟁사명이 필요합니다.',
        });
    });

    it('rejects self company deletion', () => {
        expect(resolveBenchmarkDeleteScope(new URLSearchParams('company=self'))).toEqual({
            mode: 'invalid',
            company: null,
            error: '자사 열은 삭제할 수 없습니다.',
        });
    });

    it('returns a trimmed competitor deletion scope', () => {
        expect(resolveBenchmarkDeleteScope(new URLSearchParams('company=%20경쟁사%202%20'))).toEqual({
            mode: 'company',
            company: '경쟁사 2',
        });
    });
});
