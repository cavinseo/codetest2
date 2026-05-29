import { describe, expect, it } from 'vitest';
import {
    buildSpecPickerRows,
    getCustomerNameSpan,
    getMarketSegmentSpan,
    resolveRelatedTechnology,
} from '../lib/product-attributes-utils';

describe('product attribute technology linking', () => {
    const legacySpecs = [
        { id: 'core-1', level: 'CORE' as const, name: '커미션 거래 중계', order: 0 },
        { id: 'sub-1', level: 'SUB' as const, parentId: 'core-1', name: '안전 결제 처리', order: 1 },
        {
            id: 'detail-1',
            level: 'DETAIL' as const,
            parentId: 'sub-1',
            name: '에스크로 결제로 의뢰인 대금 보호',
            technology: null,
            order: 2,
        },
    ];

    it('uses the clicked AS-IS row technology when a product attribute is picked', () => {
        expect(resolveRelatedTechnology(legacySpecs, '에스크로 결제로 의뢰인 대금 보호', '에스크로 결제')).toBe('에스크로 결제');
    });

    it('falls back to the detail text for legacy AS-IS rows whose technology is null', () => {
        expect(resolveRelatedTechnology(legacySpecs, '에스크로 결제로 의뢰인 대금 보호')).toBe('에스크로 결제로 의뢰인 대금 보호');
    });

    it('passes non-empty technology from picker rows even when the DB technology field is null', () => {
        const rows = buildSpecPickerRows(legacySpecs, 'attribute');

        expect(rows[0]).toMatchObject({
            pickValue: '에스크로 결제로 의뢰인 대금 보호',
            technology: '에스크로 결제로 의뢰인 대금 보호',
            pickTech: '에스크로 결제로 의뢰인 대금 보호',
        });
    });

    it('aggregates child technologies when a sub function is selected', () => {
        const specs = [
            { id: 'core-1', level: 'CORE' as const, name: '커미션 거래 중계', order: 0 },
            { id: 'sub-1', level: 'SUB' as const, parentId: 'core-1', name: '안전 결제 처리', order: 1 },
            {
                id: 'detail-1',
                level: 'DETAIL' as const,
                parentId: 'sub-1',
                name: '에스크로 결제',
                technology: 'PG/에스크로',
                order: 2,
            },
            {
                id: 'detail-2',
                level: 'DETAIL' as const,
                parentId: 'sub-1',
                name: '분할 지급 자동화',
                technology: null,
                order: 3,
            },
        ];

        expect(resolveRelatedTechnology(specs, '안전 결제 처리')).toBe('PG/에스크로, 분할 지급 자동화');
    });

    it('groups a customer across multiple needs within the same market segment', () => {
        const rows = [
            { marketSegment: '구매자시장', customerName: '1020 팬덤 소비자' },
            { marketSegment: '구매자시장', customerName: '1020 팬덤 소비자' },
            { marketSegment: '구매자시장', customerName: '창작 의뢰자' },
            { marketSegment: '작가시장', customerName: '창작 의뢰자' },
        ];

        expect(getMarketSegmentSpan(rows, 0)).toBe(3);
        expect(getMarketSegmentSpan(rows, 1)).toBe(0);
        expect(getCustomerNameSpan(rows, 0)).toBe(2);
        expect(getCustomerNameSpan(rows, 1)).toBe(0);
        expect(getCustomerNameSpan(rows, 2)).toBe(1);
        expect(getCustomerNameSpan(rows, 3)).toBe(1);
    });
});
