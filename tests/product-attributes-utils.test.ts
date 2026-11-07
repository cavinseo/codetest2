import { describe, expect, it } from 'vitest';
import {
    buildCustomerNamesByMarketSegment,
    joinCustomerNames,
    mergeSegmentCustomerNames,
    collapseCustomerRowsToSegments,
    splitCustomerNames,
    buildSpecPickerRows,
    dedupeByAttributeName,
    getBenefitSpan,
    getCustomerNeedSpan,
    getMarketSegmentSpan,
    getAppliedTechnologiesForAttributes,
    resolveRelatedTechnology,
    type AttributeSpecFunctionLike,
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

    it('groups rows of the same market segment regardless of customer name', () => {
        const rows = [
            { marketSegment: '구매자시장', customerName: '1020 팬덤 소비자' },
            { marketSegment: '구매자시장', customerName: '1020 팬덤 소비자' },
            { marketSegment: '구매자시장', customerName: '창작 의뢰자' },
            { marketSegment: '작가시장', customerName: '창작 의뢰자' },
        ];

        expect(getMarketSegmentSpan(rows, 0)).toBe(3);
        expect(getMarketSegmentSpan(rows, 1)).toBe(0);
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

    it('splits comma-joined customer names into WS-4 sub segments', () => {
        expect(buildCustomerNamesByMarketSegment([
            { marketSegment: '시장', customerName: 'A, B' },
            { marketSegment: '시장', customerName: 'B，C\nD' },
        ])).toEqual({ 시장: ['A', 'B', 'C', 'D'] });
    });

    it('joins customer names without blanks or duplicates', () => {
        expect(splitCustomerNames(' A , ,B,A ')).toEqual(['A', 'B']);
        expect(splitCustomerNames(null)).toEqual([]);
        expect(joinCustomerNames(['A', ' ', 'B, C', 'A', null])).toBe('A, B, C');
    });

    it('앞뒤가 모두 숫자인 쉼표는 나누지 않아 저장값이 원문과 같다', () => {
        expect(splitCustomerNames('12,000명 고객사')).toEqual(['12,000명 고객사']);
        expect(joinCustomerNames(['12,000명 고객사'])).toBe('12,000명 고객사');
        expect(splitCustomerNames('1,234,567명 고객사')).toEqual(['1,234,567명 고객사']);
        // 전각 쉼표도 같은 규칙을 따른다.
        expect(splitCustomerNames('12，000명 고객사')).toEqual(['12，000명 고객사']);
        expect(splitCustomerNames('갑，을')).toEqual(['갑', '을']);
        expect(splitCustomerNames('12,000명 고객사, 을')).toEqual(['12,000명 고객사', '을']);
    });

    it('한쪽이라도 숫자가 아닌 쉼표는 지금처럼 구분자다', () => {
        expect(splitCustomerNames('Acme, Inc.')).toEqual(['Acme', 'Inc.']);
        expect(splitCustomerNames('12, 000명')).toEqual(['12', '000명']);
        expect(splitCustomerNames('갑,1공장')).toEqual(['갑', '1공장']);
        expect(splitCustomerNames('1공장,2공장')).toEqual(['1공장', '2공장']);
        expect(splitCustomerNames('1,,2')).toEqual(['1', '2']);
        expect(splitCustomerNames('갑\n을\r\n병')).toEqual(['갑', '을', '병']);
    });

    it('숫자 쉼표 고객명은 세분시장 병합과 행 정리에서도 한 고객이다', () => {
        const rows = [
            { marketSegment: '제조', customerName: '12,000명 고객사', customerNeed: 'n', benefit: 'b', attribute: 'a' },
            { marketSegment: '제조', customerName: '을', customerNeed: 'n', benefit: 'b', attribute: 'a' },
        ];
        expect(buildCustomerNamesByMarketSegment(rows)).toEqual({ 제조: ['12,000명 고객사', '을'] });
        expect(collapseCustomerRowsToSegments(rows).map(row => row.customerName)).toEqual(['12,000명 고객사, 을']);
    });

    it('shares customer names across all rows of a segment, including non-adjacent ones', () => {
        const merged = mergeSegmentCustomerNames([
            { id: '1', marketSegment: 'X', customerName: 'A' },
            { id: '2', marketSegment: 'Y', customerName: 'C' },
            { id: '3', marketSegment: ' X ', customerName: 'B' },
            { id: '4', marketSegment: '', customerName: '미분류, 고객' },
            { id: '5', marketSegment: null, customerName: null },
        ]);
        expect(merged.map(row => row.customerName)).toEqual(['A, B', 'C', 'A, B', '미분류, 고객', '']);
        expect(merged.map(row => row.id)).toEqual(['1', '2', '3', '4', '5']);
    });

    it('keeps every different need when merging customers of a segment', () => {
        const rows = [
            { id: '1', marketSegment: 'X', customerName: 'A', customerNeed: '니즈1', benefit: '혜택1', attribute: '속성1' },
            { id: '2', marketSegment: 'X', customerName: 'B', customerNeed: '니즈2', benefit: '혜택2', attribute: '속성2' },
        ];
        expect(collapseCustomerRowsToSegments(rows)).toEqual([
            { ...rows[0], customerName: 'A, B' },
            { ...rows[1], customerName: 'A, B' },
        ]);
    });

    it('drops only rows that become identical, keeping the first id for WS-4 references', () => {
        const row = { marketSegment: 'X', customerNeed: '니즈', benefit: '혜택', attribute: '속성' };
        const normalized = collapseCustomerRowsToSegments([
            { ...row, id: 'first', customerName: 'A' },
            { ...row, id: 'other-attribute', customerName: 'A', attribute: '다른 속성' },
            { ...row, id: 'duplicate', customerName: 'B' },
            { id: 'blank-1', marketSegment: '', customerName: '', customerNeed: '', benefit: '', attribute: '' },
            { id: 'blank-2', marketSegment: '', customerName: '', customerNeed: '', benefit: '', attribute: '' },
        ]);
        expect(normalized.map(item => item.id)).toEqual(['first', 'other-attribute', 'blank-1', 'blank-2']);
        expect(normalized[0].customerName).toBe('A, B');
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

// 2026-10-25 코드 리뷰 B27: 자기 자신이나 서로를 부모로 가리키는 스펙에서 무한 반복에 빠졌다.
describe('순환하는 스펙 부모 (B27)', () => {
    it('자기 자신을 부모로 가리키는 스펙이 있어도 끝나고 나머지 기술을 모은다', () => {
        const specs: AttributeSpecFunctionLike[] = [
            { id: 'core', name: '진단', level: 'CORE', parentId: null, technology: '', order: 0 },
            { id: 'sub', name: '원인 분석', level: 'SUB', parentId: 'core', technology: '로그 분석', order: 1 },
            { id: 'self', name: '고장 난 행', level: 'SUB', parentId: 'self', technology: '엉뚱한 기술', order: 2 },
        ];

        expect(getAppliedTechnologiesForAttributes(specs, ['진단'])).toEqual(['로그 분석']);
    });

    it('서로를 부모로 가리키는 두 스펙이 있어도 끝난다', () => {
        const specs: AttributeSpecFunctionLike[] = [
            { id: 'core', name: '진단', level: 'CORE', parentId: null, technology: '', order: 0 },
            { id: 'a', name: '가', level: 'SUB', parentId: 'b', technology: '가 기술', order: 1 },
            { id: 'b', name: '나', level: 'SUB', parentId: 'a', technology: '나 기술', order: 2 },
            { id: 'child', name: '자식', level: 'DETAIL', parentId: 'core', technology: '자식 기술', order: 3 },
        ];

        expect(getAppliedTechnologiesForAttributes(specs, ['진단'])).toEqual(['자식 기술']);
    });

    it('순환 고리 안의 스펙을 고르면 고리 안의 기술만 모은다', () => {
        const specs: AttributeSpecFunctionLike[] = [
            { id: 'a', name: '가', level: 'SUB', parentId: 'b', technology: '', order: 0 },
            { id: 'b', name: '나', level: 'SUB', parentId: 'a', technology: '나 기술', order: 1 },
        ];

        expect(getAppliedTechnologiesForAttributes(specs, ['가'])).toEqual(['나 기술']);
    });
});
