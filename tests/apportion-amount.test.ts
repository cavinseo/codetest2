// 금액을 가중치대로 나눈 몫의 합이 원래 금액과 정확히 같은지 본다(감리 B17).
// 예전에는 앞 몫을 각각 반올림해 필요액 2 를 4칸에 나누면 1·1·1·0 으로 3 이 됐다.
import { describe, expect, it } from 'vitest';
import { apportionAmount } from '../lib/apportion-amount';

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

describe('apportionAmount', () => {
    it('반올림이 쌓여도 합이 필요액을 넘지 않는다', () => {
        expect(apportionAmount(2, [1, 1, 1, 1])).toEqual([1, 1, 0, 0]);
    });

    it('나누어떨어지면 비율 그대로 나눈다', () => {
        expect(apportionAmount(100, [3, 1])).toEqual([75, 25]);
    });

    it('남은 1 단위는 소수부가 큰 항목에 먼저 준다', () => {
        // 몫 1.2 · 2.6 · 3.2 → 내림 1·2·3, 남은 1 은 소수부 0.6 인 둘째에.
        expect(apportionAmount(7, [1.2, 2.6, 3.2])).toEqual([1, 3, 3]);
    });

    it('소수부가 같으면 앞 항목부터 준다', () => {
        expect(apportionAmount(1, [1, 1])).toEqual([1, 0]);
        expect(apportionAmount(5, [1, 1])).toEqual([3, 2]);
        expect(apportionAmount(2, [1, 1, 1])).toEqual([1, 1, 0]);
        expect(apportionAmount(3, [1, 1, 1, 1, 1])).toEqual([1, 1, 1, 0, 0]);
    });

    it('정수가 아닌 금액은 1 보다 작은 끝수를 마지막 항목에 둔다', () => {
        const amounts = apportionAmount(2.5, [1, 1]);
        expect(amounts).toEqual([1, 1.5]);
    });

    it('항목이 하나면 전부 준다', () => {
        expect(apportionAmount(9, [0.3])).toEqual([9]);
    });

    it.each([
        [50, [0.4, 0.3, 0.05]],
        [70, [0.4, 0.3, 0.05]],
        [1, [0.05, 0.05, 0.05]],
        [123457, [0.4, 0.35, 0.2, 0.05]],
    ])('%d 를 %j 로 나눈 합은 원래 금액이다', (total, weights) => {
        const amounts = apportionAmount(total, weights);
        expect(sum(amounts)).toBe(total);
        expect(amounts.every((amount) => Number.isInteger(amount) && amount >= 0)).toBe(true);
    });
});
