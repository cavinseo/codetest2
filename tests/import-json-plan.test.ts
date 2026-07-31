import { describe, expect, it } from 'vitest';
import { importDeletionPlan, importHasAnyData } from '../lib/import-json-plan';

describe('import-json 삭제 계획 — 부분 payload 데이터 손실 방지', () => {
    it('payload에 포함된 컬렉션만 삭제 대상으로 반환한다', () => {
        // 스펙만 담아 보내면 스펙만 교체 대상 (기존엔 9개 컬렉션을 모두 삭제했음)
        const plan = importDeletionPlan({ version: 1, specFunctions: [{ name: 'A' }] });
        expect(plan).toEqual(['specFunction']);
    });

    it('무관한 컬렉션(고객요구/설문응답 등)은 건드리지 않는다', () => {
        const plan = importDeletionPlan({ specFunctions: [] });
        expect(plan).not.toContain('customerRequirement');
        expect(plan).not.toContain('kanoResponse');
        expect(plan).not.toContain('benchmark');
    });

    it('키가 존재하면 빈 배열이어도 해당 컬렉션은 교체(삭제) 대상이다', () => {
        const plan = importDeletionPlan({ specFunctions: [], customerRequirements: [] });
        expect(plan).toContain('specFunction');
        expect(plan).toContain('customerRequirement');
    });

    it('여러 컬렉션은 FK-safe 순서대로 반환한다', () => {
        const plan = importDeletionPlan({
            customerRequirements: [],
            technicalCharacteristics: [],
            productAttributes: [],
            attributeFitnesses: [],
        });
        expect(plan).toEqual([
            'customerRequirement',
            'technicalCharacteristic',
            'productAttribute',
            'attributeFitness',
        ]);
    });

    it('배열이 아닌 값은 삭제 계획에서 제외한다', () => {
        const plan = importDeletionPlan({ specFunctions: 'nope', customerRequirements: null });
        expect(plan).toEqual([]);
    });

    it('importHasAnyData: 최소 하나의 non-empty 배열이 있어야 true', () => {
        expect(importHasAnyData({ version: 1 })).toBe(false);
        expect(importHasAnyData({ specFunctions: [] })).toBe(false);
        expect(importHasAnyData({ specFunctions: [{ name: 'A' }] })).toBe(true);
    });
});
