import { describe, expect, it } from 'vitest';
import { getTopRankedQfdRequirements } from '../lib/tech-tree-qfd';

describe('tech tree QFD ranking source', () => {
    it('returns requirement names in QFD rank order from 1 to 5', () => {
        const result = getTopRankedQfdRequirements([
            { requirementId: 'r6', requirement: 'Rank 6 item', rank: 6, absoluteImportance: 100 },
            { requirementId: 'r2', requirement: 'Rank 2 item', rank: 2, absoluteImportance: 8 },
            { requirementId: 'r1', requirement: 'Rank 1 item', rank: 1, absoluteImportance: 10 },
            { requirementId: 'r4', requirement: 'Rank 4 item', rank: 4, absoluteImportance: 6 },
            { requirementId: 'r5', requirement: 'Rank 5 item', rank: 5, absoluteImportance: 4 },
            { requirementId: 'r3', requirement: 'Rank 3 item', rank: 3, absoluteImportance: 7 },
        ]);

        expect(result.map((item) => item.requirement)).toEqual([
            'Rank 1 item',
            'Rank 2 item',
            'Rank 3 item',
            'Rank 4 item',
            'Rank 5 item',
        ]);
    });

    it('uses absolute importance as a stable tie breaker and skips unranked rows', () => {
        const result = getTopRankedQfdRequirements([
            { requirementId: 'blank', requirement: ' ', rank: 1, absoluteImportance: 99 },
            { requirementId: 'unranked', requirement: 'Unranked', rank: null, absoluteImportance: 99 },
            { requirementId: 'low', requirement: 'Lower tied item', rank: 1, absoluteImportance: 4 },
            { requirementId: 'high', requirement: 'Higher tied item', rank: 1, absoluteImportance: 9 },
        ]);

        expect(result).toEqual([
            { id: 'high', requirement: 'Higher tied item', rank: 1 },
            { id: 'low', requirement: 'Lower tied item', rank: 1 },
        ]);
    });
});
