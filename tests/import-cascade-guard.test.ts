import { describe, expect, it, vi } from 'vitest';
import {
    countCascadeImpact,
    describeCascadeImpact,
    hasCascadeImpact,
    countAttributeCascadeImpact,
    describeAttributeCascadeImpact,
    EMPTY_CASCADE_IMPACT,
    isCascadeImpactConfirmed,
    CascadeImpactChangedError,
    type CascadeImpact,
    type CascadeCounter,
    type AttributeCascadeCounter,
} from '../lib/import-cascade-guard';

function counterWith(counts: { kano: number; benchmark: number; qfd: number }): CascadeCounter {
    return {
        kanoResponse: { count: vi.fn(async () => counts.kano) },
        benchmark: { count: vi.fn(async () => counts.benchmark) },
        qFDMatrix: { count: vi.fn(async () => counts.qfd) },
        attributeFitness: { count: vi.fn(async () => 5) },
        techCorrelation: { count: vi.fn(async () => 7) },
        technicalBenchmark: { count: vi.fn(async () => 11) },
    };
}

describe('countCascadeImpact', () => {
    it('여러 시트를 덮어쓸 때 QFD를 중복 집계하지 않고 연결된 자료를 모두 안내한다', async () => {
        const db = counterWith({ kano: 2, benchmark: 3, qfd: 4 });
        const impact = await countCascadeImpact(db, 'project_1', {
            replacesCustomerRequirements: true, replacesProductAttributes: true, replacesTechnicalCharacteristics: true,
        });
        expect(impact).toEqual({ kanoResponses: 2, benchmarks: 3, qfdMatrices: 4, attributeFitnesses: 5, techCorrelations: 7, technicalBenchmarks: 11 });
        expect(db.qFDMatrix.count).toHaveBeenCalledTimes(1);
        // 건수는 반드시 이 프로젝트로 좁혀 세야 한다. 조건을 빠뜨리면 다른 프로젝트의
        // 응답까지 세어, 확인창 건수와 실제로 지워지는 건수가 어긋난다.
        for (const counter of Object.values(db)) {
            expect(counter.count).toHaveBeenCalledWith({ where: { projectId: 'project_1' } });
        }
        expect(describeCascadeImpact(impact)).toContain('적합도 5건, 기술 상관관계 7건, 기술 벤치마크 11건');
    });

    it('고객요구사항을 덮어쓸 때 함께 지워질 건수를 센다', async () => {
        const db = counterWith({ kano: 42, benchmark: 3, qfd: 17 });

        const impact = await countCascadeImpact(db, 'project_1', { replacesCustomerRequirements: true });

        expect(impact).toEqual({ ...EMPTY_CASCADE_IMPACT, kanoResponses: 42, benchmarks: 3, qfdMatrices: 17 });
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
        expect(hasCascadeImpact({ ...EMPTY_CASCADE_IMPACT, kanoResponses: 1 })).toBe(true);
        expect(hasCascadeImpact({ ...EMPTY_CASCADE_IMPACT, qfdMatrices: 5 })).toBe(true);
    });

    it('전부 0 이면 false', () => {
        expect(hasCascadeImpact(EMPTY_CASCADE_IMPACT)).toBe(false);
    });
});

describe('describeCascadeImpact', () => {
    it('0 인 항목은 문구에서 뺀다', () => {
        const text = describeCascadeImpact({ ...EMPTY_CASCADE_IMPACT, kanoResponses: 12, qfdMatrices: 4 });

        expect(text).toContain('Kano 설문 응답 12건');
        expect(text).toContain('QFD 관계 4건');
        expect(text).not.toContain('벤치마크');
    });

    it('벤치마크 건수도 문구에 담는다', () => {
        // 이 항목만 0 이 아닌 경우가 테스트에 없어, 문구가 아예 실행되지 않았다.
        // 데이터 파괴 직전 사용자에게 보여줄 경고라 문구 자체를 고정해 둔다.
        const text = describeCascadeImpact({ ...EMPTY_CASCADE_IMPACT, benchmarks: 7 });

        expect(text).toContain('벤치마크 7건');
        expect(text).not.toContain('Kano');
        expect(text).not.toContain('QFD');
    });

    it('설문 응답이 복구 불가라는 점을 알린다', () => {
        expect(describeCascadeImpact({ ...EMPTY_CASCADE_IMPACT, kanoResponses: 1 }))
            .toContain('다시 모을 수 없습니다');
    });

    it('설문 응답이 없으면 복구 불가 경고를 붙이지 않는다', () => {
        // 다시 만들 수 있는 자료만 지워질 때 "다시 모을 수 없다"고 겁주지 않는다.
        expect(describeCascadeImpact({ ...EMPTY_CASCADE_IMPACT, benchmarks: 2 }))
            .toBe('데이터를 덮어쓰면 벤치마크 2건이 함께 삭제됩니다.');
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

describe('countCascadeImpact 조회 범위', () => {
    it('모든 건수를 그 프로젝트로 좁혀 센다', async () => {
        // where 가 빠지면 다른 프로젝트의 데이터까지 세어 경고가 과장된다.
        const db = counterWith({ kano: 1, benchmark: 2, qfd: 3 });
        await countCascadeImpact(db, 'project_1', {
            replacesCustomerRequirements: true,
            replacesProductAttributes: true,
            replacesTechnicalCharacteristics: true,
        });

        const expected = { where: { projectId: 'project_1' } };
        expect(db.kanoResponse.count).toHaveBeenCalledWith(expected);
        expect(db.benchmark.count).toHaveBeenCalledWith(expected);
        expect(db.qFDMatrix.count).toHaveBeenCalledWith(expected);
        expect(db.attributeFitness.count).toHaveBeenCalledWith(expected);
        expect(db.techCorrelation.count).toHaveBeenCalledWith(expected);
        expect(db.technicalBenchmark.count).toHaveBeenCalledWith(expected);
    });
});

describe('describeCascadeImpact 복구 불가 안내', () => {
    it('설문 응답이 없으면 복구 불가 문장을 붙이지 않는다', () => {
        // 재수집 경고는 설문 응답이 실제로 지워질 때만 의미가 있다.
        expect(describeCascadeImpact({ ...EMPTY_CASCADE_IMPACT, benchmarks: 7 }))
            .toBe('데이터를 덮어쓰면 벤치마크 7건이 함께 삭제됩니다.');
    });

    it('설문 응답이 있으면 문장 끝에 복구 불가 안내를 붙인다', () => {
        expect(describeCascadeImpact({ ...EMPTY_CASCADE_IMPACT, kanoResponses: 1 }))
            .toBe('데이터를 덮어쓰면 Kano 설문 응답 1건이 함께 삭제됩니다. 설문 응답은 다시 모을 수 없습니다.');
    });
});

// 확인은 화면이 보여 준 건수에 묶여야 한다. 불리언 확인은 확인 뒤 늘어난 건수까지
// 지웠다(감리 B4).
describe('isCascadeImpactConfirmed', () => {
    const impact: CascadeImpact = {
        kanoResponses: 3, benchmarks: 2, qfdMatrices: 5,
        attributeFitnesses: 7, techCorrelations: 11, technicalBenchmarks: 13,
    };

    it('지워질 부수 데이터가 없으면 확인 없이 통과한다', () => {
        expect(isCascadeImpactConfirmed(EMPTY_CASCADE_IMPACT, undefined)).toBe(true);
    });

    it.each([
        ['없음', undefined],
        ['null', null],
        ['예전 불리언 확인', true],
        ['숫자', 3],
        ['문자열', JSON.stringify(impact)],
    ])('지워질 데이터가 있는데 확인이 %s 이면 통과하지 않는다', (_label, confirmed) => {
        expect(isCascadeImpactConfirmed(impact, confirmed)).toBe(false);
    });

    it('모든 건수가 같으면 통과한다', () => {
        expect(isCascadeImpactConfirmed(impact, { ...impact })).toBe(true);
    });

    it('화면이 덧붙인 다른 키는 판정에 영향을 주지 않는다', () => {
        expect(isCascadeImpactConfirmed(impact, { ...impact, note: '확인함' })).toBe(true);
    });

    it.each(Object.keys(impact) as (keyof CascadeImpact)[])('%s 하나만 달라도 통과하지 않는다', (key) => {
        expect(isCascadeImpactConfirmed(impact, { ...impact, [key]: impact[key] + 1 })).toBe(false);
        // "이하"가 아니라 "같음"이다 — 더 적게 확인한 것도, 더 많이 확인한 것도 다시 묻는다.
        expect(isCascadeImpactConfirmed(impact, { ...impact, [key]: impact[key] - 1 })).toBe(false);
    });

    it('건수를 문자열로 보내면 같은 숫자여도 통과하지 않는다', () => {
        expect(isCascadeImpactConfirmed(impact, { ...impact, kanoResponses: '3' })).toBe(false);
    });

    it('한 항목만 있는 영향도 그 항목으로 판정한다', () => {
        const onlyKano = { ...EMPTY_CASCADE_IMPACT, kanoResponses: 4 };
        expect(isCascadeImpactConfirmed(onlyKano, { ...EMPTY_CASCADE_IMPACT, kanoResponses: 4 })).toBe(true);
        expect(isCascadeImpactConfirmed(onlyKano, { ...EMPTY_CASCADE_IMPACT, kanoResponses: 5 })).toBe(false);
    });
});

describe('CascadeImpactChangedError', () => {
    it('새 건수와 그 건수로 만든 경고 문구를 함께 들고 있다', () => {
        const impact = { ...EMPTY_CASCADE_IMPACT, kanoResponses: 43 };
        const error = new CascadeImpactChangedError(impact);

        expect(error).toBeInstanceOf(Error);
        expect(error.impact).toBe(impact);
        expect(error.message).toBe(describeCascadeImpact(impact));
    });
});
