import { describe, expect, it } from 'vitest';
import { buildQfdSpecFooterRows } from '../lib/qfd-footer-rows';

describe('qfd footer rows', () => {
    const label = (company: string) => company === 'competitor' ? '경쟁사' : company;

    it('matches worksheet spec footer order with one competitor', () => {
        expect(buildQfdSpecFooterRows(['competitor'], label).map((row) => row.rowLabel ?? row.specLabel)).toEqual([
            '측정단위',
            '자사',
            '경쟁사',
            '설계 목표치',
        ]);
    });

    it('adds every competitor to the worksheet spec footer area', () => {
        expect(buildQfdSpecFooterRows(['competitor', '경쟁사 2', '알파'], label).map((row) => row.rowLabel ?? row.specLabel)).toEqual([
            '측정단위',
            '자사',
            '경쟁사',
            '경쟁사 2',
            '알파',
            '설계 목표치',
        ]);
    });
});
