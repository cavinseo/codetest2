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
    | { kind: 'tableGroup'; blockIndex: number; col: number; value: string }
    | { kind: 'tableCell'; blockIndex: number; row: number; col: number; value: string };

/**
 * 편집 하나를 적용한 새 블록 배열을 돌려준다. 원본은 건드리지 않는다 —
 * 되돌리기와 "몇 군데 고쳤는지"를 위해 원본을 그대로 남겨 둬야 하기 때문이다.
 * 가리키는 자리가 없거나 블록 종류가 맞지 않으면 아무것도 바꾸지 않는다.
 */
export function applyBlockEdit(blocks: FinalReportBlock[], edit: BlockEdit): FinalReportBlock[] {
    const block = blocks[edit.blockIndex];
    if (!block) return blocks;

    const replaceEditedBlock = (next: FinalReportBlock) =>
        blocks.map((item, index) => (index === edit.blockIndex ? next : item));

    if (edit.kind === 'text') {
        if (block.kind === 'heading') return replaceEditedBlock({ ...block, text: edit.text });
        if (block.kind === 'paragraph') return replaceEditedBlock({ ...block, text: edit.text });
        return blocks;
    }
    if (edit.kind === 'keyValue') {
        if (block.kind !== 'keyValueTable' || !block.rows[edit.row]) return blocks;
        return replaceEditedBlock({
            ...block,
            rows: block.rows.map((row, index) => (index === edit.row ? { ...row, value: edit.value } : row)),
        });
    }
    // 남은 세 종류는 모두 표를 고친다. 표 종류 검사를 한곳에 모으는 이유: 묶음 머리글
    // 편집 안에서만 검사하면 headerGroups 가 표에만 있어 검사를 빼도 결과가 같아지고,
    // 그 회귀를 어떤 테스트로도 잡을 수 없다. 여기 두면 머리글·칸 편집이 검사를 지킨다.
    if (block.kind !== 'dataTable') return blocks;
    if (edit.kind === 'tableGroup') {
        const groups = block.headerGroups;
        if (!groups || groups[edit.col] == null) return blocks;
        const previous = groups[edit.col];
        // previous 가 null 이 아니므로 표 끝을 지나 읽은 undefined 에서 반복이 멈춘다.
        let end = edit.col + 1;
        while (groups[end] === previous) end++;
        return replaceEditedBlock({ ...block, headerGroups: groups.map((text, column) => column >= edit.col && column < end ? edit.value : text) });
    }
    if (edit.kind === 'tableHeader') {
        if (edit.col >= block.headers.length || edit.col < 0) return blocks;
        return replaceEditedBlock({
            ...block,
            headers: block.headers.map((text, index) => (index === edit.col ? edit.value : text)),
        });
    }
    // 남은 종류는 tableCell 하나다 — 표의 한 칸을 바꾼다.
    const row = block.rows[edit.row];
    if (!row || edit.col >= row.length || edit.col < 0) return blocks;
    return replaceEditedBlock({
        ...block,
        rows: block.rows.map((cells, index) =>
            index === edit.row ? cells.map((cell, cellIndex) => (cellIndex === edit.col ? edit.value : cell)) : cells),
    });
}

/** 원본과 견줘 내용이 달라진 블록 수. 화면이 "n곳 교정함"을 보여 주는 데 쓴다. */
export function countEditedBlocks(original: FinalReportBlock[], current: FinalReportBlock[]): number {
    // 짧은 쪽의 빈 자리는 undefined 끼리 비교돼 같다고 나오므로, 긴 쪽 길이만큼 견준다.
    return Array.from({ length: Math.max(original.length, current.length) }, (_, index) => index)
        .filter(index => JSON.stringify(original[index]) !== JSON.stringify(current[index]))
        .length;
}

/** 편집된 블록으로 문서 모델을 다시 만든다. 제목과 파일명은 원본을 유지한다. */
export function withEditedBlocks(model: FinalReportModel, blocks: FinalReportBlock[]): FinalReportModel {
    return { ...model, blocks };
}
