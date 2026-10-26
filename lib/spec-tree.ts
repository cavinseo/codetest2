// AS-IS 스펙(핵심 → 세부 → 세세부)을 순서대로 펼치는 순회를 한곳에 둔다.
//
// 스펙표 행·기능기술체계도 후보·제품속성 선택표·목표스펙 제안·결과보고서·엑셀 내보내기가 같은
// 순회를 각자 들고 있었고, 모두 "세부 아래의 세세부"만 찾았다(2026-10-25 코드 리뷰 D7). 엑셀
// 가져오기는 세부 칸이 빈 행의 세세부를 핵심 바로 아래에 붙이므로(lib/workbook-importer), 그런
// 세세부가 여섯 화면 모두에서 조용히 사라졌다. 핵심 바로 아래의 세세부는 세부 자리에 보여 준다.

export interface SpecTreeItemLike {
    id: string;
    level: string;
    parentId?: string | null;
    order?: number | null;
}

export interface SpecTreeBranch<T> {
    /** 세부 자리의 항목. 보통 SUB 이고, 핵심 바로 아래 붙은 DETAIL 이면 그 DETAIL 이다. */
    sub: T;
    /** sub 아래의 세세부(DETAIL). sub 가 DETAIL 이면 비어 있다. */
    details: T[];
}

export interface SpecTreeNode<T> {
    core: T;
    subs: SpecTreeBranch<T>[];
}

/**
 * order 순으로 정렬해 핵심마다 세부·세세부를 묶는다. 같은 order 는 들어온 순서를 지킨다.
 * 상위가 없거나 상위를 찾을 수 없는 세부·세세부는 어느 계통에도 넣을 수 없어 빠진다.
 */
export function buildSpecTree<T extends SpecTreeItemLike>(specs: readonly T[]): SpecTreeNode<T>[] {
    const sorted = [...specs].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const childrenOf = (parent: T, levels: readonly string[]) =>
        sorted.filter((spec) => spec.parentId === parent.id && levels.includes(spec.level));

    return sorted
        .filter((spec) => spec.level === 'CORE')
        .map((core) => ({
            core,
            subs: childrenOf(core, ['SUB', 'DETAIL'])
                .map((sub) => ({ sub, details: sub.level === 'SUB' ? childrenOf(sub, ['DETAIL']) : [] })),
        }));
}
