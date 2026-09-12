// 작은 그림의 불필요한 확대와 인쇄 본문 잘림을 막는다.
export const A4_PORTRAIT_BODY = { widthMm: 170, heightMm: 257 };
export const A4_LANDSCAPE_BODY = { widthMm: 257, heightMm: 170 };

/** 값이 하나라도 양수가 아니면 멈춘다 — 이름이 판정이 아니라 단언임을 드러낸다. */
function assertAllPositive(values: number[]): void {
    if (values.some(value => !Number.isFinite(value) || value <= 0)) {
        throw new Error('그림과 본문의 크기는 양수여야 합니다.');
    }
}

export function fitImageToBody(widthPx: number, heightPx: number, body: { widthMm: number; heightMm: number }): { widthMm: number; heightMm: number } {
    assertAllPositive([widthPx, heightPx, body.widthMm, body.heightMm]);
    const widthMm = widthPx * 25.4 / 96;
    const heightMm = heightPx * 25.4 / 96;
    const scale = Math.min(1, body.widthMm / widthMm, body.heightMm / heightMm);
    return { widthMm: widthMm * scale, heightMm: heightMm * scale };
}

export function shouldUseLandscape(widthPx: number, heightPx: number, threshold = 257 / 170): boolean {
    assertAllPositive([widthPx, heightPx, threshold]);
    // 가로 본문보다 더 넓은 종횡비일 때 페이지를 돌려 축소 손실을 줄인다.
    return widthPx / heightPx > threshold;
}
