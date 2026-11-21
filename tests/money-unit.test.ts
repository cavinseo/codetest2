// 천원 표시와 기존 저장 단위 사이의 환산에서 실제 금액 보존을 검증한다.
import { expect, it } from 'vitest';
import { formatStoredMoney, fromThousandWon, toThousandWon } from '../lib/money';

it('기존 백만원 금액을 천원으로 표시하고 입력을 저장 단위로 복원한다', () => {
    expect(toThousandWon(100)).toBe(100000);
    expect(fromThousandWon(100000)).toBe(100);
    expect(formatStoredMoney('100')).toBe('100,000');
    expect(formatStoredMoney(null)).toBe('');
    expect(formatStoredMoney('')).toBe('');
    expect(formatStoredMoney(0)).toBe('0');
});

it.each([0, -12.345, 1.001, 0.000123, 300.5, 1e-8, 1e12])('소수·음수·지수값 %s를 환산하고 복원한다', amount => {
    expect(fromThousandWon(toThousandWon(amount))).toBe(amount);
});
