import { describe, expect, it } from 'vitest';
import {
    buildCustomerNamesByMarketSegment,
    buildSpecPickerRows,
    dedupeByAttributeName,
    getBenefitSpan,
    getCustomerNameSpan,
    getCustomerNeedSpan,
    getMarketSegmentSpan,
    getAppliedTechnologiesForAttributes,
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

    it('선택된 제품속성에 연결된 실제 적용기술만 중복 없이 모은다', () => {
        const specs = [
            { id: 'core', level: 'CORE' as const, name: '관리', order: 0 },
            { id: 'sub', level: 'SUB' as const, parentId: 'core', name: '진단', order: 1 },
            { id: 'detail-1', level: 'DETAIL' as const, parentId: 'sub', name: '원인 분석', technology: 'AI 분석', order: 2 },
            { id: 'detail-2', level: 'DETAIL' as const, parentId: 'sub', name: '원격 진단', technology: '통신 기술', order: 3 },
            { id: 'detail-3', level: 'DETAIL' as const, parentId: 'sub', name: '이력 조회', technology: 'AI 분석', order: 4 },
            { id: 'detail-4', level: 'DETAIL' as const, parentId: 'sub', name: '기술 미입력', technology: null, order: 5 },
        ];

        expect(getAppliedTechnologiesForAttributes(specs, ['진단', '원인 분석', '기술 미입력']))
            .toEqual(['AI 분석', '통신 기술']);
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

    it('merges identical customer needs and benefits inside one market segment', () => {
        const rows = [
            { marketSegment: '소규모 동호회', customerNeed: '명단 통합', benefit: '운영 시간 절감' },
            { marketSegment: '소규모 동호회', customerNeed: '명단 통합', benefit: '운영 시간 절감' },
            { marketSegment: '소규모 동호회', customerNeed: '명단 통합', benefit: '운영 시간 절감' },
        ];

        expect(getCustomerNeedSpan(rows, 0)).toBe(3);
        expect(getCustomerNeedSpan(rows, 1)).toBe(0);
        expect(getCustomerNeedSpan(rows, 2)).toBe(0);
        expect(getBenefitSpan(rows, 0)).toBe(3);
        expect(getBenefitSpan(rows, 1)).toBe(0);
    });

    it('keeps identical benefits separate when adjacent customer needs differ', () => {
        const rows = [
            { marketSegment: 'PLC SI 시장', customerNeed: '외부 인력 도착 전 복구', benefit: '원격 해결률 향상' },
            { marketSegment: 'PLC SI 시장', customerNeed: '전문인력 없이 고장 진단', benefit: '원격 해결률 향상' },
            { marketSegment: 'PLC SI 시장', customerNeed: ' 전문인력 없이 고장 진단 ', benefit: ' 원격 해결률 향상 ' },
            { marketSegment: 'PLC SI 시장', customerNeed: '외부 인력 도착 전 복구', benefit: '원격 해결률 향상' },
        ];

        expect(rows.map((_, index) => getBenefitSpan(rows, index))).toEqual([1, 2, 0, 1]);
    });

    it('keeps benefit inputs independent until their customer needs are entered', () => {
        const rows = [
            { marketSegment: 'PLC SI 시장', customerNeed: '', benefit: '원격 해결률 향상' },
            { marketSegment: 'PLC SI 시장', customerNeed: ' ', benefit: '원격 해결률 향상' },
            { marketSegment: 'PLC SI 시장', customerNeed: '고장 진단', benefit: '원격 해결률 향상' },
        ];

        expect(rows.map((_, index) => getBenefitSpan(rows, index))).toEqual([1, 1, 1]);
    });

    it('does not merge the same value across different market segments', () => {
        const rows = [
            { marketSegment: '소규모 동호회', customerNeed: '명단 통합', benefit: '운영 시간 절감' },
            { marketSegment: '중대형 동호회', customerNeed: '명단 통합', benefit: '운영 시간 절감' },
        ];

        expect(getCustomerNeedSpan(rows, 0)).toBe(1);
        expect(getCustomerNeedSpan(rows, 1)).toBe(1);
        expect(getBenefitSpan(rows, 0)).toBe(1);
        expect(getBenefitSpan(rows, 1)).toBe(1);
    });

    it('keeps empty and non-adjacent values as their own cells', () => {
        const rows = [
            { marketSegment: '소규모 동호회', customerNeed: '', benefit: '' },
            { marketSegment: '소규모 동호회', customerNeed: '', benefit: '' },
            { marketSegment: '소규모 동호회', customerNeed: '회비 관리', benefit: '번아웃 완화' },
            { marketSegment: '소규모 동호회', customerNeed: '명단 통합', benefit: '운영 시간 절감' },
            { marketSegment: '소규모 동호회', customerNeed: '회비 관리', benefit: '번아웃 완화' },
        ];

        expect(getCustomerNeedSpan(rows, 0)).toBe(1);
        expect(getCustomerNeedSpan(rows, 1)).toBe(1);
        expect(getCustomerNeedSpan(rows, 2)).toBe(1);
        expect(getCustomerNeedSpan(rows, 3)).toBe(1);
        expect(getCustomerNeedSpan(rows, 4)).toBe(1);
        expect(getBenefitSpan(rows, 2)).toBe(1);
        expect(getBenefitSpan(rows, 4)).toBe(1);
    });

    it('builds customer names by market segment for WS-4 sub segments', () => {
        const rows = [
            { marketSegment: '구매자시장', customerName: '1020 팬덤 소비자' },
            { marketSegment: '구매자시장', customerName: '1020 팬덤 소비자' },
            { marketSegment: '구매자시장', customerName: '창작 의뢰자' },
            { marketSegment: '작가시장', customerName: '프리랜서 작가' },
            { marketSegment: '작가시장', customerName: '' },
            { marketSegment: '', customerName: '미분류 고객' },
        ];

        expect(buildCustomerNamesByMarketSegment(rows)).toEqual({
            구매자시장: ['1020 팬덤 소비자', '창작 의뢰자'],
            작가시장: ['프리랜서 작가'],
        });
    });

    it('keeps only the first row for duplicate product attributes', () => {
        const rows = [
            { id: 'a1', attribute: 'Fast setup', order: 0 },
            { id: 'a2', attribute: ' fast   setup ', order: 1 },
            { id: 'a3', attribute: 'Secure login', order: 2 },
            { id: 'a4', attribute: '', order: 3 },
        ];

        expect(dedupeByAttributeName(rows).map((row) => row.id)).toEqual(['a1', 'a3']);
    });
});
