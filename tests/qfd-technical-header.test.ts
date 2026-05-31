import { describe, expect, it } from 'vitest';
import {
    chunkTechnicalIndexes,
    findCoreIdForSubName,
    getQfdCoreOptions,
    getQfdSubOptions,
    type QfdSpecFunctionLike,
} from '../lib/qfd-technical-header';

const specs: QfdSpecFunctionLike[] = [
    { id: 'core-b', level: 'CORE', name: '주문 지원', order: 10 },
    { id: 'core-a', level: 'CORE', name: '매칭 지원', order: 1 },
    { id: 'sub-a1', level: 'SUB', parentId: 'core-a', name: '의뢰 등록', order: 2 },
    { id: 'sub-a2', level: 'SUB', parentId: 'core-a', name: '작가 매칭', order: 3 },
    { id: 'sub-b1', level: 'SUB', parentId: 'core-b', name: '결제 처리', order: 11 },
];

describe('qfd technical header helpers', () => {
    it('orders core options like the AS-IS spec table', () => {
        expect(getQfdCoreOptions(specs).map((spec) => spec.name)).toEqual(['매칭 지원', '주문 지원']);
    });

    it('filters sub options by selected core', () => {
        expect(getQfdSubOptions(specs, 'core-a').map((spec) => spec.name)).toEqual(['의뢰 등록', '작가 매칭']);
        expect(getQfdSubOptions(specs, 'core-b').map((spec) => spec.name)).toEqual(['결제 처리']);
    });

    it('finds the parent core for a selected sub function', () => {
        expect(findCoreIdForSubName(specs, '작가 매칭')).toBe('core-a');
        expect(findCoreIdForSubName(specs, '없는 세부기능')).toBe('');
    });

    it('keeps worksheet technical columns grouped by three', () => {
        expect(chunkTechnicalIndexes(15)).toEqual([
            { groupIndex: 0, start: 0, size: 3 },
            { groupIndex: 1, start: 3, size: 3 },
            { groupIndex: 2, start: 6, size: 3 },
            { groupIndex: 3, start: 9, size: 3 },
            { groupIndex: 4, start: 12, size: 3 },
        ]);
    });
});
