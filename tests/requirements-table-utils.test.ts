import { describe, expect, it } from 'vitest';
import {
    groupRequirementsByCategory,
    shouldShowPrimaryGroup,
    shouldShowSecondaryGroup,
    sortRequirementsByWorksheetOrder,
} from '../lib/requirements-table-utils';

describe('요구사항 저장 그룹 순서', () => {
    it('1차 그룹 안에서 2차 그룹을 모으고 첫 등장 순서와 각 그룹의 항목 순서를 보존한다', () => {
        const rows = [
            { id: 'b2-first', category: 'B', subcategory: '2', order: 10 },
            { id: 'a2', category: 'A', subcategory: '2', order: 20 },
            { id: 'b1', category: 'B', subcategory: '1', order: 30 },
            { id: 'b2-last', category: 'B', subcategory: '2', order: 40 },
            { id: 'a1', category: 'A', subcategory: '1', order: 50 },
        ];
        const grouped = groupRequirementsByCategory([...rows].reverse());
        expect(grouped.map(row => row.id)).toEqual(['b2-first', 'b2-last', 'b1', 'a2', 'a1']);
        expect(grouped.map(row => row.order)).toEqual([0, 1, 2, 3, 4]);
        expect(rows.map(row => row.order)).toEqual([10, 20, 30, 40, 50]);
        expect(groupRequirementsByCategory(grouped)).toEqual(grouped);
    });

    it('빈 2차 그룹과 앞뒤 공백은 같은 그룹으로 처리하고 입력 내용과 ID는 보존한다', () => {
        const rows = [
            { id: 'one', category: ' 품질 ', subcategory: null, order: 0 },
            { id: 'two', category: '품질', subcategory: '속도', order: 1 },
            { id: 'three', category: '품질', subcategory: undefined, order: 2 },
            { id: 'four', category: '품질', subcategory: ' ', order: 3 },
        ];
        expect(groupRequirementsByCategory(rows)).toEqual([
            rows[0], { ...rows[2], order: 1 }, { ...rows[3], order: 2 }, { ...rows[1], order: 3 },
        ]);
    });

    it('순서 값이 같은 행의 상대 순서를 지키고 빈 목록을 허용한다', () => {
        const rows = [
            { id: 'first', category: 'B', subcategory: '같은 그룹', order: 0 },
            { id: 'second', category: 'A', subcategory: '같은 그룹', order: 0 },
            { id: 'third', category: 'B', subcategory: '같은 그룹', order: 0 },
        ];
        expect(groupRequirementsByCategory(rows).map(row => row.id)).toEqual(['first', 'third', 'second']);
        expect(groupRequirementsByCategory([])).toEqual([]);
    });
});

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

    it('shows the secondary group again when the primary group changes', () => {
        const rows = [
            { category: 'primary one', subcategory: 'focus work', order: 0 },
            { category: 'primary two', subcategory: 'focus work', order: 1 },
            { category: 'primary two', subcategory: 'different work', order: 2 },
        ];

        expect(rows.map((_, index) => shouldShowSecondaryGroup(rows, index))).toEqual([true, true, true]);
    });

    // 엑셀 업로드 시 2차 분류 칸이 비면 importer 가 subcategory 를 null 로 저장한다.
    it('handles null and undefined group values coming from an excel import', () => {
        const rows = [
            { category: '미분류', subcategory: null, order: 0 },
            { category: '미분류', subcategory: null, order: 1 },
            { category: '미분류', subcategory: '2차 그룹', order: 2 },
            { category: '미분류', subcategory: undefined, order: 3 },
        ];

        expect(rows.map((_, index) => shouldShowPrimaryGroup(rows, index))).toEqual([true, false, false, false]);
        expect(rows.map((_, index) => shouldShowSecondaryGroup(rows, index))).toEqual([true, false, true, true]);
    });

    it('treats consecutive secondary groups with surrounding spaces as the same label', () => {
        const rows = [
            { category: '1차 그룹', subcategory: '2차 그룹', order: 0 },
            { category: '1차 그룹 ', subcategory: ' 2차 그룹 ', order: 1 },
            { category: '1차 그룹', subcategory: '다른 2차 그룹', order: 2 },
        ];

        expect(rows.map((_, index) => shouldShowPrimaryGroup(rows, index))).toEqual([true, false, false]);
        expect(rows.map((_, index) => shouldShowSecondaryGroup(rows, index))).toEqual([true, false, true]);
    });
});
