import { describe, expect, it } from 'vitest';
import {
    targetSpecBodySchema,
    salesBodySchema,
    techRoadmapBodySchema,
    devPlanBodySchema,
    techTreeBodySchema,
    attributesBodySchema,
    fitnessBodySchema,
} from '../lib/bulk-save-schemas';

describe('bulk-save schemas — 데이터 손실 방지 가드', () => {
    it('필드가 누락되면 거부한다 (실수로 인한 전체 삭제 방지)', () => {
        // 빈 body / 잘못된 키 → 검증 실패 (기존엔 `body.attributes || []` 로 조용히 전체 삭제됐음)
        expect(targetSpecBodySchema.safeParse({}).success).toBe(false);
        expect(salesBodySchema.safeParse({}).success).toBe(false);
        expect(attributesBodySchema.safeParse({}).success).toBe(false);
        expect(fitnessBodySchema.safeParse({}).success).toBe(false);
        expect(techTreeBodySchema.safeParse({}).success).toBe(false);
    });

    it('컬렉션 필드가 배열이 아니면 거부한다', () => {
        expect(targetSpecBodySchema.safeParse({ rows: 'oops' }).success).toBe(false);
        expect(attributesBodySchema.safeParse({ attributes: null }).success).toBe(false);
        expect(techTreeBodySchema.safeParse({ entries: {} }).success).toBe(false);
    });

    it('명시적 빈 배열은 허용한다 (의도적 초기화 기능 보존)', () => {
        // SalesTable.handleReset 등은 { rows: [] } 를 일부러 전송한다.
        expect(targetSpecBodySchema.safeParse({ rows: [] }).success).toBe(true);
        expect(salesBodySchema.safeParse({ rows: [] }).success).toBe(true);
        expect(techRoadmapBodySchema.safeParse({ rows: [] }).success).toBe(true);
        expect(devPlanBodySchema.safeParse({ rows: [] }).success).toBe(true);
        expect(techTreeBodySchema.safeParse({ entries: [] }).success).toBe(true);
        expect(attributesBodySchema.safeParse({ attributes: [] }).success).toBe(true);
        expect(fitnessBodySchema.safeParse({ fitnesses: [] }).success).toBe(true);
    });

    it('알 수 없는 필드를 제거한다 (mass-assignment 차단)', () => {
        const parsed = targetSpecBodySchema.parse({
            rows: [{ specItem: 'A', order: 0, projectId: 'evil', id: 'injected', extra: 1 }],
        });
        const row = parsed.rows[0] as Record<string, unknown>;
        expect(row.projectId).toBeUndefined();
        expect(row.id).toBeUndefined();
        expect(row.extra).toBeUndefined();
        expect(row.specItem).toBe('A');
    });

    it('제품 속성 id 는 보존한다 (적합도가 attributeId 로 참조하므로)', () => {
        const parsed = attributesBodySchema.parse({
            attributes: [{ id: 'attr-1', productName: 'P', order: 0, projectId: 'evil' }],
        });
        const row = parsed.attributes[0] as Record<string, unknown>;
        expect(row.id).toBe('attr-1');
        expect(row.projectId).toBeUndefined();
    });

    it('숫자 필드를 강제 변환한다 (문자열 order 허용)', () => {
        const parsed = targetSpecBodySchema.parse({ rows: [{ specItem: 'A', order: '3' }] });
        expect(parsed.rows[0].order).toBe(3);
    });

    it('order 가 비숫자면 거부한다', () => {
        expect(targetSpecBodySchema.safeParse({ rows: [{ specItem: 'A', order: 'abc' }] }).success).toBe(false);
    });

    it('적합도는 attributeId 가 필수다', () => {
        expect(fitnessBodySchema.safeParse({ fitnesses: [{ importance: 1 }] }).success).toBe(false);
        expect(fitnessBodySchema.safeParse({ fitnesses: [{ attributeId: 'a1' }] }).success).toBe(true);
    });
});
