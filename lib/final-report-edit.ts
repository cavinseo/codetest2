// 미리보기 화면에서 고친 내용을 문서 모델에 되돌려 넣는다.
//
// 화면이 블록 배열을 직접 주무르면 어느 절이 왜 바뀌었는지 추적할 수 없고, 표의
// 행·열 인덱스를 잘못 짚어도 조용히 다른 칸이 바뀐다. 편집을 한 종류의 값으로
// 표현하고 적용을 이 파일에 모으면 그 실수를 테스트로 막을 수 있다.
//
// 여기서 고친 내용은 문서에만 남고 워크시트 DB 로 돌아가지 않는다. 원본 값이
// 잘못됐다면 해당 워크시트에서 고치는 것이 맞고, 이 화면의 교정은 보고서 한 부를
// 다듬는 용도다.
import type { FinalReportBlock, FinalReportModel } from './final-report-document';

export type BlockEdit =
    | { kind: 'text'; blockIndex: number; text: string }
    | { kind: 'keyValue'; blockIndex: number; row: number; value: string }
    | { kind: 'tableHeader'; blockIndex: number; col: number; value: string }
    | { kind: 'tableCell'; blockIndex: number; row: number; col: number; value: string };

/**
 * 편집 하나를 적용한 새 블록 배열을 돌려준다. 원본은 건드리지 않는다 —
 * 되돌리기와 "몇 군데 고쳤는지"를 위해 원본을 그대로 남겨 둬야 하기 때문이다.
 * 가리키는 자리가 없거나 블록 종류가 맞지 않으면 아무것도 바꾸지 않는다.
 */
export function applyBlockEdit(blocks: FinalReportBlock[], edit: BlockEdit): FinalReportBlock[] {
    const block = blocks[edit.blockIndex];
    if (!block) return blocks;

    const replace = (next: FinalReportBlock) =>
        blocks.map((item, index) => (index === edit.blockIndex ? next : item));

    if (edit.kind === 'text') {
        if (block.kind === 'heading') return replace({ ...block, text: edit.text });
        if (block.kind === 'paragraph') return replace({ ...block, text: edit.text });
        return blocks;
    }
    if (edit.kind === 'keyValue') {
        if (block.kind !== 'keyValueTable' || !block.rows[edit.row]) return blocks;
        return replace({
            ...block,
            rows: block.rows.map((row, index) => (index === edit.row ? { ...row, value: edit.value } : row)),
        });
    }
    if (edit.kind === 'tableHeader') {
        if (block.kind !== 'dataTable' || edit.col >= block.headers.length || edit.col < 0) return blocks;
        return replace({
            ...block,
            headers: block.headers.map((text, index) => (index === edit.col ? edit.value : text)),
        });
    }
    if (block.kind !== 'dataTable') return blocks;
    const row = block.rows[edit.row];
    if (!row || edit.col >= row.length || edit.col < 0) return blocks;
    return replace({
        ...block,
        rows: block.rows.map((cells, index) =>
            index === edit.row ? cells.map((cell, at) => (at === edit.col ? edit.value : cell)) : cells),
    });
}

/** 원본과 견줘 내용이 달라진 블록 수. 화면이 "n곳 교정함"을 보여 주는 데 쓴다. */
export function countEditedBlocks(original: FinalReportBlock[], current: FinalReportBlock[]): number {
    let count = 0;
    for (let index = 0; index < Math.max(original.length, current.length); index += 1) {
        if (JSON.stringify(original[index]) !== JSON.stringify(current[index])) count += 1;
    }
    return count;
}

/** 편집된 블록으로 문서 모델을 다시 만든다. 제목과 파일명은 원본을 유지한다. */
export function withEditedBlocks(model: FinalReportModel, blocks: FinalReportBlock[]): FinalReportModel {
    return { ...model, blocks };
}
