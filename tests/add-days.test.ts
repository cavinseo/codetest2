// 만료일 계산을 한곳에 모은 addDays(2026-10-25 코드 리뷰 D8).
import { expect, it } from 'vitest';
import { addDays } from '../lib/add-days';

it('달력 날짜로 일수를 더하고 시각은 그대로 둔다', () => {
    const issued = new Date(2026, 0, 30, 15, 45, 10, 123);

    const result = addDays(issued, 3);

    expect([result.getFullYear(), result.getMonth(), result.getDate()]).toEqual([2026, 1, 2]);
    expect([result.getHours(), result.getMinutes(), result.getSeconds(), result.getMilliseconds()]).toEqual([15, 45, 10, 123]);
});

it('원래 날짜는 바꾸지 않는다', () => {
    const issued = new Date(2026, 0, 1);

    addDays(issued, 14);

    expect(issued.getDate()).toBe(1);
});

it('음수와 0 도 그대로 계산한다', () => {
    expect(addDays(new Date(2026, 2, 1), -1).getDate()).toBe(28);
    expect(addDays(new Date(2026, 2, 1), 0).getTime()).toBe(new Date(2026, 2, 1).getTime());
});
