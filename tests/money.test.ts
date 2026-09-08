// 금액 표시에서 빈칸과 0, 소수 정밀도 및 구분 쉼표를 검증한다.
import { expect, it } from 'vitest';
import { formatMoney, parseMoney, formatMoneyWithCaret } from '../lib/money';
it('keeps blank, zero and all decimal digits', () => {
    expect(formatMoney(null)).toBe('');
    expect(formatMoney(0)).toBe('0');
    expect(formatMoney(1234.56789)).toBe('1,234.56789');
    expect(formatMoney('1234.')).toBe('1,234.');
    expect(parseMoney('1,234.56789')).toBe(1234.56789);
    expect(parseMoney('')).toBeNull();
    expect(parseMoney('0')).toBe(0);
});

it('keeps the caret after inserted digits when grouping changes', () => {
    expect(formatMoneyWithCaret('4123', 1)).toEqual({ text: '4,123', caret: 1 });
    expect(formatMoneyWithCaret('45,123', 2)).toEqual({ text: '45,123', caret: 2 });
    expect(formatMoneyWithCaret('1,2534', 4)).toEqual({ text: '12,534', caret: 4 });
});
it('preserves decimal editing and deletion caret positions', () => {
    expect(formatMoneyWithCaret('1,234.596', 8)).toEqual({ text: '1,234.596', caret: 8 });
    expect(formatMoneyWithCaret('1,24.56', 3)).toEqual({ text: '124.56', caret: 2 });
    expect(formatMoneyWithCaret('12,34', 5)).toEqual({ text: '1,234', caret: 5 });
    expect(formatMoneyWithCaret('', 0)).toEqual({ text: '', caret: 0 });
});
