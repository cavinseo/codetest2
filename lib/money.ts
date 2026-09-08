// 금액의 소수 자릿수를 보존하며 세 자리 구분 표시와 숫자 변환을 제공한다.
export function formatMoney(value: number | string | null | undefined): string {
    if (value == null || value === '') return '';
    const raw = String(value).replace(/,/g, '');
    const text = /e/i.test(raw) && Number.isFinite(Number(raw))
        ? Number(raw).toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 20 })
        : raw;
    const [integer, decimal] = text.split('.');
    return integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (decimal === undefined ? '' : '.' + decimal);
}

export function parseMoney(value: string): number | null {
    const text = value.replace(/,/g, '').trim();
    if (!text) return null;
    const number = Number(text);
    return Number.isFinite(number) ? number : null;
}

export function formatMoneyWithCaret(value: string, position: number): { text: string; caret: number } {
    const text = formatMoney(value);
    const characterCount = value.slice(0, position).replace(/,/g, '').length;
    let caret = 0;
    let seen = 0;
    while (caret < text.length && seen < characterCount) {
        if (text[caret] !== ',') seen += 1;
        caret += 1;
    }
    return { text, caret };
}
