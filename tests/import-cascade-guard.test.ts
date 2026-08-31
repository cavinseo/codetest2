import { describe, expect, it, vi } from 'vitest';
import {
    countCascadeImpact,
    describeCascadeImpact,
    hasCascadeImpact,
    countAttributeCascadeImpact,
    describeAttributeCascadeImpact,
    EMPTY_CASCADE_IMPACT,
    type CascadeCounter,
    type AttributeCascadeCounter,
} from '../lib/import-cascade-guard';

function counterWith(counts: { kano: number; benchmark: number; qfd: number }): CascadeCounter {
    return {
        kanoResponse: { count: vi.fn(async () => counts.kano) },
        benchmark: { count: vi.fn(async () => counts.benchmark) },
        qFDMatrix: { count: vi.fn(async () => counts.qfd) },
    };
}

describe('countCascadeImpact', () => {
    it('고객요구사항을 덮어쓸 때 함께 지워질 건수를 센다', async () => {
        const db = counterWith({ kano: 42, benchmark: 3, qfd: 17 });

        const impact = await countCascadeImpact(db, 'project_1', { replacesCustomerRequirements: true });

        expect(impact).toEqual({ kanoResponses: 42, benchmarks: 3, qfdMatrices: 17 });
        expect(db.kanoResponse.count).toHaveBeenCalledWith({ where: { projectId: 'project_1' } });
    });

    it('고객요구사항을 건드리지 않으면 세지 않는다', async () => {
        const db = counterWith({ kano: 42, benchmark: 3, qfd: 17 });

        const impact = await countCascadeImpact(db, 'project_1', { replacesCustomerRequirements: false });

        expect(impact).toEqual(EMPTY_CASCADE_IMPACT);
        expect(db.kanoResponse.count).not.toHaveBeenCalled();
    });
});

describe('hasCascadeImpact', () => {
    it('하나라도 0 이 아니면 true', () => {
        expect(hasCascadeImpact({ kanoResponses: 1, benchmarks: 0, qfdMatrices: 0 })).toBe(true);
        expect(hasCascadeImpact({ kanoResponses: 0, benchmarks: 0, qfdMatrices: 5 })).toBe(true);
        // 벤치마크만 있는 프로젝트가 "삭제될 데이터 없음"으로 판정되면 확인 절차 없이
        // 덮어써진다. 세 항을 각각 단독으로 확인해야 이 분기가 지켜진다.
        expect(hasCascadeImpact({ kanoResponses: 0, benchmarks: 3, qfdMatrices: 0 })).toBe(true);
    });

    it('전부 0 이면 false', () => {
        expect(hasCascadeImpact(EMPTY_CASCADE_IMPACT)).toBe(false);
    });
});

describe('describeCascadeImpact', () => {
    it('0 인 항목은 문구에서 뺀다', () => {
        const text = describeCascadeImpact({ kanoResponses: 12, benchmarks: 0, qfdMatrices: 4 });

        expect(text).toContain('Kano 설문 응답 12건');
        expect(text).toContain('QFD 관계 4건');
        expect(text).not.toContain('벤치마크');
    });

    it('벤치마크 건수도 문구에 담는다', () => {
        // 이 항목만 0 이 아닌 경우가 테스트에 없어, 문구가 아예 실행되지 않았다.
        // 데이터 파괴 직전 사용자에게 보여줄 경고라 문구 자체를 고정해 둔다.
        const text = describeCascadeImpact({ kanoResponses: 0, benchmarks: 7, qfdMatrices: 0 });

        expect(text).toContain('벤치마크 7건');
        expect(text).not.toContain('Kano');
        expect(text).not.toContain('QFD');
    });

    it('설문 응답이 복구 불가라는 점을 알린다', () => {
        expect(describeCascadeImpact({ kanoResponses: 1, benchmarks: 0, qfdMatrices: 0 }))
            .toContain('다시 모을 수 없습니다');
    });

    it('영향이 없으면 빈 문자열', () => {
        expect(describeCascadeImpact(EMPTY_CASCADE_IMPACT)).toBe('');
    });
});

describe('countAttributeCascadeImpact', () => {
    function attrCounterWith(fitnesses: number): AttributeCascadeCounter {
        return { attributeFitness: { count: vi.fn(async () => fitnesses) } };
    }

    it('속성을 지울 때 함께 사라질 적합도 건수를 센다', async () => {
        const db = attrCounterWith(9);

        const impact = await countAttributeCascadeImpact(db, 'project_1');

        expect(impact).toEqual({ fitnesses: 9 });
        expect(db.attributeFitness.count).toHaveBeenCalledWith({ where: { projectId: 'project_1' } });
    });

    it('적합도가 없으면 0 을 돌려준다', async () => {
        const db = attrCounterWith(0);

        expect(await countAttributeCascadeImpact(db, 'project_1')).toEqual({ fitnesses: 0 });
    });
});

describe('describeAttributeCascadeImpact', () => {
    it('적합도 건수를 문구에 담는다', () => {
        const text = describeAttributeCascadeImpact({ fitnesses: 4 });

        expect(text).toContain('적합도 4건');
        expect(text).toContain('함께 삭제');
    });

    it('적합도가 0 이면 빈 문자열', () => {
        expect(describeAttributeCascadeImpact({ fitnesses: 0 })).toBe('');
    });
});
