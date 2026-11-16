// 재정렬할 때 기존 연결과 작성 내용이 같은 항목에 남는지 검증한다.
import { describe, expect, it } from 'vitest';
import { orderByRequirementIds, orderByRequirementText, orderImprovementItems, orderTargetSpecs } from '../lib/requirement-order';

const requirements = [{ id: 'a', requirement: 'A' }, { id: 'c', requirement: 'C' }, { id: 'b', requirement: 'B' }];
describe('고객요구사항 연결 순서', () => {
    it('ID별 값은 유지하며 표시 순서만 바꾸고 미연결 행은 뒤에 보존한다', () => {
        const rows = [{ requirementId: 'b', value: 20 }, { requirementId: 'unknown', value: 99 }, { requirementId: 'a', value: 10 }];
        expect(orderByRequirementIds(rows, requirements, row => row.requirementId)).toEqual([rows[2], rows[0], rows[1]]);
        expect(rows.map(row => row.value)).toEqual([20, 99, 10]);
    });
    it('유일한 문구만 연결하고 중복·미연결 내용은 삭제하지 않는다', () => {
        const source = [{ text: 'B', order: 0, note: 'B기술' }, { text: ' X ', order: 1, note: '유지' }, { text: 'A', order: 2, note: 'A기술' }];
        const result = orderByRequirementText(source, [...requirements, { requirement: 'X' }, { requirement: 'X' }], row => row.text);
        expect(result).toEqual([{ ...source[2], order: 0 }, { ...source[0], order: 1 }, { ...source[1], order: 2 }]);
        expect(source[2].order).toBe(2);
    });
    it('개선니즈와 기능은 자기 문구 및 작성값을 함께 이동한다', () => {
        const rows = [{ id: 'nb', type: 'need', content: 'B', order: 0, value: '20%' }, { id: 'na', type: 'need', content: 'A', order: 1, value: '10%' }, { id: 'fa', type: 'feature', content: 'A', order: 0, value: 'A기능' }, { id: 'fb', type: 'feature', content: 'B', order: 1, value: 'B기능' }];
        expect(orderImprovementItems(rows, requirements).map(row => [row.id, row.value, row.order])).toEqual([['na', '10%', 0], ['nb', '20%', 1], ['fa', 'A기능', 0], ['fb', 'B기능', 1]]);
    });
    it('목표스펙은 스펙쌍 단위로 이동하고 입력한 목표값은 유지한다', () => {
        const rows = [{ category: 'B', subCategory: 'sub', order: 0, targetValue: '20' }, { category: 'A', subCategory: 'sub', order: 1, targetValue: '10' }, { category: 'B', subCategory: 'sub', order: 2, targetValue: '30' }, { category: 'manual', subCategory: '', order: 3, targetValue: '40' }];
        expect(orderTargetSpecs(rows, [{ coreSpec: 'A', subSpec: 'sub' }, { coreSpec: 'B', subSpec: 'sub' }]).map(row => [row.category, row.targetValue])).toEqual([['A', '10'], ['B', '20'], ['B', '30'], ['manual', '40']]);
    });
    it('WS-12는 일부 세부스펙만 연결되어도 핵심스펙 묶음을 분리하지 않는다', () => {
        const rows = [{ category: 'A', subCategory: 'a1', order: 0 }, { category: 'A', subCategory: 'a2', order: 1 }, { category: 'B', subCategory: 'b1', order: 2 }, { category: null, subCategory: '', order: 3 }];
        const result = orderTargetSpecs(rows, [{ coreSpec: '', subSpec: '' }, { coreSpec: 'B', subSpec: 'b1' }, { coreSpec: 'A', subSpec: 'a1' }]);
        expect(result.map(row => [row.category, row.subCategory])).toEqual([['B', 'b1'], ['A', 'a1'], ['A', 'a2'], [null, '']]);
    });

});
