// 데이터 이관 모델 순서 정의가 FK 의존 관계와 일치하는지 검증하는 테스트입니다.
import { describe, expect, it } from 'vitest';
import {
    MIGRATION_MODEL_ORDER,
    MODEL_DEPENDENCIES,
    chunk,
} from '../scripts/db-migration-models.mjs';

describe('MIGRATION_MODEL_ORDER', () => {
    it('이관 대상 24개 모델을 중복 없이 담는다', () => {
        expect(MIGRATION_MODEL_ORDER).toHaveLength(24);
        expect(new Set(MIGRATION_MODEL_ORDER).size).toBe(24);
    });

    it('폐기 대상인 analyticsInsight 를 포함하지 않는다', () => {
        expect(MIGRATION_MODEL_ORDER).not.toContain('analyticsInsight');
    });

    it('모든 모델의 FK 부모가 자기보다 먼저 등장한다', () => {
        const seen = new Set<string>();

        for (const model of MIGRATION_MODEL_ORDER) {
            for (const parent of MODEL_DEPENDENCIES[model] ?? []) {
                expect(
                    seen.has(parent),
                    `${model} 이 아직 삽입되지 않은 ${parent} 를 참조합니다`
                ).toBe(true);
            }
            seen.add(model);
        }
    });

    it('의존 관계 표의 키와 값이 모두 이관 목록 안에 있다', () => {
        const known = new Set(MIGRATION_MODEL_ORDER);

        for (const [model, parents] of Object.entries(MODEL_DEPENDENCIES)) {
            expect(known.has(model), `${model} 이 이관 목록에 없습니다`).toBe(true);
            for (const parent of parents as string[]) {
                expect(known.has(parent), `${parent} 가 이관 목록에 없습니다`).toBe(true);
            }
        }
    });
});

describe('chunk', () => {
    it('지정한 크기로 배열을 나눈다', () => {
        expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    });

    it('빈 배열은 빈 결과를 낸다', () => {
        expect(chunk([], 10)).toEqual([]);
    });

    it('크기보다 짧은 배열은 한 덩어리로 둔다', () => {
        expect(chunk([1, 2], 10)).toEqual([[1, 2]]);
    });
});
