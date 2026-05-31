import { describe, expect, it } from 'vitest';
import {
    shouldShowPrimaryGroup,
    shouldShowSecondaryGroup,
    sortRequirementsByWorksheetOrder,
} from '../lib/requirements-table-utils';

describe('requirements table view helpers', () => {
    it('keeps worksheet order instead of sorting by group names', () => {
        const rows = [
            { requirement: '첫 번째 항목', category: 'B 그룹', subcategory: 'B-2', order: 0 },
            { requirement: '두 번째 항목', category: 'A 그룹', subcategory: 'A-1', order: 1 },
            { requirement: '세 번째 항목', category: 'B 그룹', subcategory: 'B-1', order: 2 },
        ];

        expect(sortRequirementsByWorksheetOrder(rows).map((row) => row.requirement)).toEqual([
            '첫 번째 항목',
            '두 번째 항목',
            '세 번째 항목',
        ]);
    });

    it('shows repeated group labels only once for consecutive duplicate groups', () => {
        const rows = [
            { category: '편의성', subcategory: '주문', order: 0 },
            { category: '편의성', subcategory: '주문', order: 1 },
            { category: '편의성', subcategory: '결제', order: 2 },
            { category: '안전성', subcategory: '결제', order: 3 },
        ];

        expect(rows.map((_, index) => shouldShowPrimaryGroup(rows, index))).toEqual([true, false, false, true]);
        expect(rows.map((_, index) => shouldShowSecondaryGroup(rows, index))).toEqual([true, false, true, true]);
    });
});
