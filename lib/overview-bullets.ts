// 상세 제품개요에서 Enter를 누를 때 글머리 목록을 이어 쓴다.
const bulletPrefix = /^([\t ]*)([•○▪·*\-])(?:[\t ]+|$)/;

export interface OverviewTextEdit {
    value: string;
    selectionStart: number;
    selectionEnd: number;
}

export function continueOverviewBullet(value: string, start: number, end: number): OverviewTextEdit | null {
    const lineStart = value.slice(0, start).lastIndexOf('\n') + 1;
    const nextBreak = value.indexOf('\n', start);
    const lineEnd = nextBreak === -1 ? value.length : nextBreak;
    const line = value.slice(lineStart, lineEnd);
    const prefix = line.match(bulletPrefix);
    if (!prefix || start < lineStart + prefix[0].length || end > lineEnd) return null;

    if (start === end && !line.slice(prefix[0].length).trim()) {
        return { value: value.slice(0, lineStart) + value.slice(lineEnd), selectionStart: lineStart, selectionEnd: lineStart };
    }
    const insertion = `\n${prefix[1]}${prefix[2]} `;
    const caret = start + insertion.length;
    return { value: value.slice(0, start) + insertion + value.slice(end), selectionStart: caret, selectionEnd: caret };
}
