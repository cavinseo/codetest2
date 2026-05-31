import { describe, expect, it } from 'vitest';
import { getKanoAnswerLabel, getKanoCategoryLabel } from '../lib/kano-response-display';

describe('Kano response display helpers', () => {
    it('shows the configured Kano answer labels', () => {
        expect([1, 2, 3, 4, 5].map(getKanoAnswerLabel)).toEqual([
            '마음에 든다',
            '당연하다',
            '아무런느낌이 없다',
            '하는수 없다',
            '마음에 안든다',
        ]);
    });

    it('shows compact Kano category labels', () => {
        expect(getKanoCategoryLabel('A')).toBe('매력(A)');
        expect(getKanoCategoryLabel('M')).toBe('당연(M)');
        expect(getKanoCategoryLabel('Q')).toBe('의심(Q)');
    });
});
