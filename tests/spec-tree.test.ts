// AS-IS 스펙 순회를 한곳에 모은 buildSpecTree 와, 그것을 쓰는 화면들이 핵심 바로 아래 붙은
// 세세부를 더는 빠뜨리지 않는지 확인한다(2026-10-25 코드 리뷰 D7).
import { describe, expect, it } from 'vitest';
import { buildSpecTree } from '../lib/spec-tree';
import { buildFlatSpecRowsFromFunctions } from '../lib/spec-table-utils';
import { buildTechTreeSpecOptions } from '../lib/tech-tree-utils';
import { buildSpecPickerRows, type AttributeSpecFunctionLike } from '../lib/product-attributes-utils';
import { buildTargetSpecsFromAsIs } from '../lib/worksheet-links';

type Spec = AttributeSpecFunctionLike;
const spec = (id: string, level: Spec['level'], parentId: string | null, order: number | null, technology: string | null = null): Spec =>
    ({ id, level, parentId, name: id, order, technology });

const ids = (tree: ReturnType<typeof buildSpecTree<Spec>>) =>
    tree.map(({ core, subs }) => [core.id, subs.map(({ sub, details }) => [sub.id, details.map((detail) => detail.id)])]);

describe('buildSpecTree', () => {
    it('order 순으로 핵심 → 세부 → 세세부를 묶는다', () => {
        const tree = buildSpecTree([
            spec('d2', 'DETAIL', 's1', 6),
            spec('c2', 'CORE', null, 2),
            spec('s1', 'SUB', 'c1', 3),
            spec('c1', 'CORE', null, 1),
            spec('d1', 'DETAIL', 's1', 5),
            spec('s2', 'SUB', 'c2', 4),
        ]);

        expect(ids(tree)).toEqual([
            ['c1', [['s1', ['d1', 'd2']]]],
            ['c2', [['s2', []]]],
        ]);
    });

    it('order 가 없으면 0 으로 보고, 같은 order 는 들어온 순서를 지킨다', () => {
        const tree = buildSpecTree([
            spec('c2', 'CORE', null, 1),
            spec('c0', 'CORE', null, null),
            spec('c1', 'CORE', null, 0),
        ]);

        expect(tree.map(({ core }) => core.id)).toEqual(['c0', 'c1', 'c2']);
    });

    it('입력 배열을 정렬로 바꾸지 않는다', () => {
        const specs = [spec('c2', 'CORE', null, 2), spec('c1', 'CORE', null, 1)];

        buildSpecTree(specs);

        expect(specs.map((item) => item.id)).toEqual(['c2', 'c1']);
    });

    it('핵심 바로 아래 붙은 세세부는 세부 자리에 오고, 그 아래는 펼치지 않는다', () => {
        // 엑셀 가져오기는 세부 칸이 빈 행의 세세부를 핵심 아래에 붙인다(lib/workbook-importer).
        const tree = buildSpecTree([
            spec('c1', 'CORE', null, 1),
            spec('s1', 'SUB', 'c1', 2),
            spec('d-core', 'DETAIL', 'c1', 3),
            spec('d-deep', 'DETAIL', 'd-core', 4),
        ]);

        expect(ids(tree)).toEqual([['c1', [['s1', []], ['d-core', []]]]]);
    });

    it('상위가 없거나 없는 상위를 가리키는 세부·세세부, 핵심 아래의 핵심은 빠진다', () => {
        const tree = buildSpecTree([
            spec('c1', 'CORE', null, 1),
            spec('lost-sub', 'SUB', null, 2),
            spec('ghost-sub', 'SUB', 'missing', 3),
            spec('ghost-detail', 'DETAIL', 'missing', 4),
            spec('nested-core', 'CORE', 'c1', 5),
            spec('sub-under-sub', 'SUB', 'lost-sub', 6),
        ]);

        expect(ids(tree)).toEqual([['c1', []], ['nested-core', []]]);
    });

    it('세부는 자기 부모의 것만 받는다', () => {
        const tree = buildSpecTree([
            spec('c1', 'CORE', null, 1),
            spec('c2', 'CORE', null, 2),
            spec('s1', 'SUB', 'c1', 3),
            spec('s2', 'SUB', 'c2', 4),
            spec('d1', 'DETAIL', 's1', 5),
            spec('d2', 'DETAIL', 's2', 6),
        ]);

        expect(ids(tree)).toEqual([
            ['c1', [['s1', ['d1']]]],
            ['c2', [['s2', ['d2']]]],
        ]);
    });
});

describe('핵심 바로 아래 세세부가 화면에서 사라지지 않는다 (D7)', () => {
    const specs = [
        spec('core', 'CORE', null, 1),
        spec('sub', 'SUB', 'core', 2, '세부 기술'),
        spec('detail', 'DETAIL', 'sub', 3, '세세부 기술'),
        spec('direct', 'DETAIL', 'core', 4, '직속 기술'),
    ];

    it('스펙표 행', () => {
        expect(buildFlatSpecRowsFromFunctions(specs).map((row) => [row.core, row.sub, row.detail, row.technology])).toEqual([
            ['core', 'sub', 'detail', '세세부 기술'],
            ['core', 'direct', '', '직속 기술'],
        ]);
    });

    it('기능기술체계도 후보', () => {
        expect(buildTechTreeSpecOptions(specs).map((option) => [option.id, option.depth, option.parentId])).toEqual([
            ['sub', 0, 'core'],
            ['detail', 1, 'sub'],
            ['direct', 0, 'core'],
        ]);
    });

    it('제품속성 선택표', () => {
        expect(buildSpecPickerRows(specs, 'attribute').map((row) => row.pickValue)).toEqual(['detail', 'direct']);
    });

    it('목표스펙 제안', () => {
        expect(buildTargetSpecsFromAsIs(specs).map((row) => [row.category, row.subCategory, row.specItem])).toEqual([
            ['core', 'sub', '세부 기술'],
            ['core', 'sub > detail', '세세부 기술'],
            ['core', 'direct', '직속 기술'],
        ]);
    });
});
