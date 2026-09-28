// 상세 제품개요의 글머리 적용과 Enter 자동 이어쓰기를 일반 텍스트로 처리한다.
const bulletPrefix = /^([\t ]*)([•○▪·*\-])(?:[\t ]+|$)/;

export interface OverviewTextEdit {
    value: string;
    selectionStart: number;
    selectionEnd: number;
}

export function applyOverviewBullet(value: string, start: number, end: number, marker: string | null): OverviewTextEdit {
    const lineStart = value.slice(0, start).lastIndexOf('\n') + 1;
    const selectionEnd = end > start && value[end - 1] === '\n' ? end - 1 : end;
    const nextBreak = value.indexOf('\n', selectionEnd);
    const lineEnd = nextBreak === -1 ? value.length : nextBreak;
    const lines = value.slice(lineStart, lineEnd).split('\n');
    let firstPrefixLength = 0;
    let firstPrefixChange = 0;
    const replacement = lines.map((line, index) => {
        const existing = line.match(bulletPrefix);
        const indent = existing?.[1] ?? line.match(/^[\t ]*/)![0];
        const oldPrefix = existing?.[0] ?? indent;
        const newPrefix = indent + (marker ? `${marker} ` : '');
        if (index === 0) {
            firstPrefixLength = newPrefix.length;
            firstPrefixChange = newPrefix.length - oldPrefix.length;
        }
        return newPrefix + line.slice(oldPrefix.length);
    }).join('\n');
    const caret = Math.max(lineStart + firstPrefixLength, start + firstPrefixChange);
    return {
        value: value.slice(0, lineStart) + replacement + value.slice(lineEnd),
        selectionStart: start === end ? caret : lineStart,
        selectionEnd: start === end ? caret : lineStart + replacement.length,
    };
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
