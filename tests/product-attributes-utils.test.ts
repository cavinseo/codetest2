import { describe, expect, it } from 'vitest';
import {
    buildCustomerNamesByMarketSegment,
    buildSpecPickerRows,
    dedupeByAttributeName,
    getBenefitSpan,
    getCustomerNameSpan,
    getCustomerNeedSpan,
    getMarketSegmentSpan,
    getSpecPickerSpan,
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

describe('getSpecPickerSpan', () => {
    it('core 가 다르면 sub 이름이 같아도 두 행 모두 칸을 그린다', () => {
        // 회귀 본체. 예전에는 아래 행이 0 을 받아 숨겨졌는데 위 행의 rowSpan 은
        // core 경계에서 멈춘 1 이라, 그 칸을 아무도 그리지 않고 열이 밀렸다.
        const rows = [
            { core: 'A', sub: '설치' },
            { core: 'B', sub: '설치' },
        ];

        expect(getSpecPickerSpan(rows, 'sub', 0)).toBe(1);
        expect(getSpecPickerSpan(rows, 'sub', 1)).toBe(1);
    });

    it('세부기능이 없어 sub 가 빈 문자열인 인접 행도 마찬가지다', () => {
        // buildSpecPickerRows 는 하위가 없는 core 에 sub: '' 를 넣는다.
        // 가장 흔하게 밟히는 경로였다.
        const rows = [
            { core: 'A', sub: '' },
            { core: 'B', sub: '' },
        ];

        expect(getSpecPickerSpan(rows, 'sub', 0)).toBe(1);
        expect(getSpecPickerSpan(rows, 'sub', 1)).toBe(1);
    });

    it('같은 core 안에서 연속된 같은 sub 는 첫 행이 개수를 갖고 나머지는 숨는다', () => {
        const rows = [
            { core: 'A', sub: '설치' },
            { core: 'A', sub: '설치' },
            { core: 'A', sub: '관리' },
        ];

        expect(getSpecPickerSpan(rows, 'sub', 0)).toBe(2);
        expect(getSpecPickerSpan(rows, 'sub', 1)).toBe(0);
        expect(getSpecPickerSpan(rows, 'sub', 2)).toBe(1);
    });

    it("key 가 'core' 면 core 만 본다", () => {
        const rows = [
            { core: 'A', sub: '설치' },
            { core: 'A', sub: '관리' },
            { core: 'B', sub: '설치' },
        ];

        expect(getSpecPickerSpan(rows, 'core', 0)).toBe(2);
        expect(getSpecPickerSpan(rows, 'core', 1)).toBe(0);
        expect(getSpecPickerSpan(rows, 'core', 2)).toBe(1);
    });

    it('떨어져 있는 같은 값은 병합하지 않는다', () => {
        const rows = [
            { core: 'A', sub: '설치' },
            { core: 'A', sub: '관리' },
            { core: 'A', sub: '설치' },
        ];

        expect(getSpecPickerSpan(rows, 'sub', 0)).toBe(1);
        expect(getSpecPickerSpan(rows, 'sub', 2)).toBe(1);
    });

    it('빈 배열과 범위 밖 index 는 1 이다', () => {
        expect(getSpecPickerSpan([], 'sub', 0)).toBe(1);
        expect(getSpecPickerSpan([{ core: 'A', sub: 'x' }], 'sub', 5)).toBe(1);
    });

    it('단일 행은 1 이다', () => {
        expect(getSpecPickerSpan([{ core: 'A', sub: 'x' }], 'sub', 0)).toBe(1);
        expect(getSpecPickerSpan([{ core: 'A', sub: 'x' }], 'core', 0)).toBe(1);
    });
});
