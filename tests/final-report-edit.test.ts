// 미리보기에서 고친 값이 엉뚱한 칸에 들어가지 않는지 고정한다.
import { describe, expect, it } from 'vitest';
import { applyBlockEdit, countEditedBlocks, withEditedBlocks, type BlockEdit } from '../lib/final-report-edit';
import type { FinalReportBlock, FinalReportModel } from '../lib/final-report-document';

const blocks: FinalReportBlock[] = [
    { kind: 'heading', text: '표지', level: 1 },
    { kind: 'paragraph', text: '본문' },
    { kind: 'keyValueTable', rows: [{ label: '기업명', value: '가' }, { label: '코치명', value: '나' }] },
    { kind: 'dataTable', headers: ['A', 'B'], rows: [['a1', 'b1'], ['a2', 'b2']] },
    { kind: 'image', title: '그림', pngDataUrl: 'data:,', widthMm: 10, heightMm: 10, landscape: false },
];

describe('applyBlockEdit', () => {
    it('제목과 문단의 글을 바꾼다', () => {
        expect(applyBlockEdit(blocks, { kind: 'text', blockIndex: 0, text: '새 제목' })[0])
            .toEqual({ kind: 'heading', text: '새 제목', level: 1 });
        expect(applyBlockEdit(blocks, { kind: 'text', blockIndex: 1, text: '새 본문' })[1])
            .toEqual({ kind: 'paragraph', text: '새 본문' });
    });

    it('원본 배열과 블록을 건드리지 않는다', () => {
        const before = JSON.stringify(blocks);
        const next = applyBlockEdit(blocks, { kind: 'text', blockIndex: 1, text: '바뀜' });
        expect(JSON.stringify(blocks)).toBe(before);
        expect(next).not.toBe(blocks);
        expect(next[0]).toBe(blocks[0]);
    });

    it('키-값 표는 지정한 행의 값만 바꾸고 이름표는 그대로 둔다', () => {
        const next = applyBlockEdit(blocks, { kind: 'keyValue', blockIndex: 2, row: 1, value: '박코치' });
        expect(next[2]).toEqual({ kind: 'keyValueTable', rows: [{ label: '기업명', value: '가' }, { label: '코치명', value: '박코치' }] });
    });

    it('표의 머리글을 바꾼다', () => {
        const next = applyBlockEdit(blocks, { kind: 'tableHeader', blockIndex: 3, col: 1, value: '새B' });
        expect(next[3]).toEqual({ kind: 'dataTable', headers: ['A', '새B'], rows: [['a1', 'b1'], ['a2', 'b2']] });
    });

    it('표의 한 칸만 바꾼다', () => {
        const next = applyBlockEdit(blocks, { kind: 'tableCell', blockIndex: 3, row: 1, col: 0, value: '고침' });
        expect(next[3]).toEqual({ kind: 'dataTable', headers: ['A', 'B'], rows: [['a1', 'b1'], ['고침', 'b2']] });
    });

    const noop: BlockEdit[] = [
        { kind: 'text', blockIndex: 99, text: 'x' },
        { kind: 'text', blockIndex: -1, text: 'x' },
        { kind: 'text', blockIndex: 3, text: 'x' },
        { kind: 'text', blockIndex: 4, text: 'x' },
        { kind: 'keyValue', blockIndex: 1, row: 0, value: 'x' },
        { kind: 'keyValue', blockIndex: 2, row: 9, value: 'x' },
        { kind: 'keyValue', blockIndex: 2, row: -1, value: 'x' },
        { kind: 'tableHeader', blockIndex: 2, col: 0, value: 'x' },
        { kind: 'tableHeader', blockIndex: 3, col: 2, value: 'x' },
        { kind: 'tableHeader', blockIndex: 3, col: -1, value: 'x' },
        { kind: 'tableCell', blockIndex: 0, row: 0, col: 0, value: 'x' },
        { kind: 'tableCell', blockIndex: 3, row: 9, col: 0, value: 'x' },
        { kind: 'tableCell', blockIndex: 3, row: -1, col: 0, value: 'x' },
        { kind: 'tableCell', blockIndex: 3, row: 0, col: 2, value: 'x' },
        { kind: 'tableCell', blockIndex: 3, row: 0, col: -1, value: 'x' },
    ];
    it.each(noop)('없는 자리나 맞지 않는 종류면 그대로 둔다 (%s)', (edit) => {
        expect(applyBlockEdit(blocks, edit)).toBe(blocks);
    });
});

describe('applyBlockEdit 머리글 묶음과 경계', () => {
    const grouped: FinalReportBlock[] = [
        { kind: 'paragraph', text: '본문' },
        { kind: 'dataTable', headers: ['A', 'B', 'C', 'D'], headerGroups: ['1차', '1차', null, '2차'], rows: [['a', 'b', 'c', 'd']] },
    ];

    it('묶음 머리글은 같은 이름이 이어지는 칸까지 한꺼번에 바꾼다', () => {
        const next = applyBlockEdit(grouped, { kind: 'tableGroup', blockIndex: 1, col: 0, value: '첫해' });
        expect((next[1] as Extract<FinalReportBlock, { kind: 'dataTable' }>).headerGroups).toEqual(['첫해', '첫해', null, '2차']);
    });

    it('마지막 칸의 묶음도 표 끝에서 멈춰 바꾼다', () => {
        const next = applyBlockEdit(grouped, { kind: 'tableGroup', blockIndex: 1, col: 3, value: '둘째해' });
        expect((next[1] as Extract<FinalReportBlock, { kind: 'dataTable' }>).headerGroups).toEqual(['1차', '1차', null, '둘째해']);
    });

    const groupNoop: BlockEdit[] = [
        { kind: 'tableGroup', blockIndex: 0, col: 0, value: 'x' },
        { kind: 'tableGroup', blockIndex: 3, col: 0, value: 'x' },
        { kind: 'tableGroup', blockIndex: 1, col: 2, value: 'x' },
        { kind: 'tableGroup', blockIndex: 1, col: 9, value: 'x' },
    ];
    it.each(groupNoop)('묶음이 없거나 빈 칸·없는 칸이면 그대로 둔다 (%s)', (edit) => {
        // blockIndex 3 은 묶음 머리글이 없는 표다.
        const source = edit.blockIndex === 3 ? blocks : grouped;
        expect(applyBlockEdit(source, edit)).toBe(source);
    });

    it('첫 번째 머리글도 바꿀 수 있다', () => {
        // 음수 검사가 0 까지 막으면 첫 열 머리글이 고쳐지지 않는다.
        const next = applyBlockEdit(blocks, { kind: 'tableHeader', blockIndex: 3, col: 0, value: '새A' });
        expect((next[3] as Extract<FinalReportBlock, { kind: 'dataTable' }>).headers).toEqual(['새A', 'B']);
    });
});

describe('countEditedBlocks', () => {
    it('바뀐 블록 수를 센다', () => {
        const once = applyBlockEdit(blocks, { kind: 'text', blockIndex: 1, text: '고침' });
        const twice = applyBlockEdit(once, { kind: 'tableCell', blockIndex: 3, row: 0, col: 0, value: '고침' });
        expect(countEditedBlocks(blocks, blocks)).toBe(0);
        expect(countEditedBlocks(blocks, once)).toBe(1);
        expect(countEditedBlocks(blocks, twice)).toBe(2);
    });

    it('같은 값으로 되돌리면 0 이다', () => {
        const back = applyBlockEdit(applyBlockEdit(blocks, { kind: 'text', blockIndex: 1, text: 'x' }), { kind: 'text', blockIndex: 1, text: '본문' });
        expect(countEditedBlocks(blocks, back)).toBe(0);
    });

    it('길이가 다르면 늘거나 준 만큼 센다', () => {
        expect(countEditedBlocks(blocks, blocks.slice(0, 3))).toBe(2);
        expect(countEditedBlocks(blocks.slice(0, 3), blocks)).toBe(2);
        expect(countEditedBlocks([], [])).toBe(0);
    });
});

describe('withEditedBlocks', () => {
    it('블록만 갈아 끼우고 제목과 파일명은 유지한다', () => {
        const model: FinalReportModel = { title: 'KS-QFD 결과보고서', fileName: '결과보고서_가.docx', blocks };
        const next = withEditedBlocks(model, blocks.slice(0, 1));
        expect(next).toEqual({ title: 'KS-QFD 결과보고서', fileName: '결과보고서_가.docx', blocks: blocks.slice(0, 1) });
        expect(model.blocks).toHaveLength(5);
    });
});
