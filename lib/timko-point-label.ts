// TIMKO 차트 번호를 점의 원(겹친 점은 캡슐) 안에 담기 위한 글자 크기·폭 계산.
//
// 번호가 원 밖으로 넘치면 옆 점의 번호와 섞여 어느 점의 번호인지 읽을 수 없다.
// SVG 는 그리기 전에 글자 폭을 알 수 없으므로, 굵은 숫자 한 글자의 평균 폭을
// 글자 크기의 비율로 잡아 미리 계산한다. 가운뎃점(·)은 숫자보다 좁아 이 값이
// 넉넉한 쪽으로 어긋난다 — 넘치는 것보다 약간 여유가 남는 편이 낫다.
export const LABEL_CHAR_WIDTH_RATIO = 0.62;

/** 글자 크기 fontSize 로 label 을 그렸을 때의 대략적인 폭. */
export function estimateLabelWidth(label: string, fontSize: number): number {
    return label.length * fontSize * LABEL_CHAR_WIDTH_RATIO;
}

/**
 * label 이 innerWidth 안에 들어가는 가장 큰 글자 크기. maxFontSize 보다 키우지 않고,
 * 너무 작아 읽을 수 없게 되지 않도록 minFontSize 아래로는 줄이지 않는다.
 */
export function fitLabelFontSize(label: string, innerWidth: number, maxFontSize: number, minFontSize: number): number {
    const fitted = Math.floor(innerWidth / (label.length * LABEL_CHAR_WIDTH_RATIO));
    return Math.max(minFontSize, Math.min(maxFontSize, fitted));
}
