import { describe, expect, it } from 'vitest';
import {
    groupRequirementsByCategory,
    getRequirementGroupSpans,
    sortRequirementsByWorksheetOrder,
} from '../lib/requirements-table-utils';

describe('요구사항 저장 그룹 순서', () => {
    it('2차 그룹 안에서 1차 그룹을 모으고 첫 등장 순서와 각 그룹의 항목 순서를 보존한다', () => {
        const rows = [
            { id: 'b2-first', category: 'B', subcategory: '2', order: 10 },
            { id: 'a2', category: 'A', subcategory: '2', order: 20 },
            { id: 'b1', category: 'B', subcategory: '1', order: 30 },
            { id: 'b2-last', category: 'B', subcategory: '2', order: 40 },
            { id: 'a1', category: 'A', subcategory: '1', order: 50 },
        ];
        const grouped = groupRequirementsByCategory([...rows].reverse());
        expect(grouped.map(row => row.id)).toEqual(['b2-first', 'b2-last', 'a2', 'b1', 'a1']);
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

describe('요구사항 그룹 셀 병합', () => {
    const rows = [
        { id: 'a1', category: 'A', subcategory: '상위', order: 0 },
        { id: 'a2', category: 'A', subcategory: '상위', order: 1 },
        { id: 'b1', category: 'B', subcategory: '상위', order: 2 },
        { id: 'b2', category: 'B', subcategory: '상위', order: 3 },
        { id: 'a3', category: 'A', subcategory: '다른 상위', order: 4 },
    ];

    it('2차 그룹은 여러 1차 그룹을 포함하고 1차 그룹은 다른 상위 그룹과 합치지 않는다', () => {
        expect(getRequirementGroupSpans(rows, null)).toEqual([
            { primary: 2, secondary: 4 },
            { primary: 0, secondary: 0 },
            { primary: 2, secondary: 0 },
            { primary: 0, secondary: 0 },
            { primary: 1, secondary: 1 },
        ]);
    });

    it('병합 가운데 행을 편집하면 양쪽 그룹 입력칸을 남기고 앞뒤 병합을 나눈다', () => {
        expect(getRequirementGroupSpans(rows, 'a2')).toEqual([
            { primary: 1, secondary: 1 },
            { primary: 1, secondary: 1 },
            { primary: 2, secondary: 2 },
            { primary: 0, secondary: 0 },
            { primary: 1, secondary: 1 },
        ]);
    });

    it('2차 그룹이 비어 있어도 1차 그룹을 묶고 공백과 null을 동일하게 처리한다', () => {
        expect(getRequirementGroupSpans([
            { id: 'one', category: ' A ', subcategory: null, order: 0 },
            { id: 'two', category: 'A', subcategory: ' ', order: 1 },
            { id: 'three', category: 'B', subcategory: undefined, order: 2 },
        ], null)).toEqual([
            { primary: 2, secondary: 3 },
            { primary: 0, secondary: 0 },
            { primary: 1, secondary: 0 },
        ]);
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
});
