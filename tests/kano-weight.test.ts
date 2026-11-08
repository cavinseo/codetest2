// 직접 넣은 Kano 가중치(0 포함)와 자동 가중치 중 무엇을 쓸지 정하는 규칙을 검증한다.
import { expect, it } from 'vitest';
import { resolveKanoWeight } from '../lib/kano-weight';

it('직접 넣은 가중치는 0 이어도 그대로 쓴다', () => {
    expect(resolveKanoWeight(2.5, 4)).toBe(2.5);
    expect(resolveKanoWeight(0, 4)).toBe(0);
});

it('빈칸이거나 숫자가 아니면 자동 가중치를 쓴다', () => {
    expect(resolveKanoWeight(null, 4)).toBe(4);
    expect(resolveKanoWeight(undefined, 4)).toBe(4);
    expect(resolveKanoWeight(Number.NaN, 4)).toBe(4);
    expect(resolveKanoWeight(Number.POSITIVE_INFINITY, 4)).toBe(4);
    // 타입 밖의 값(문자열로 저장된 값)은 숫자로 바꾸지 않는다. Number('') 가 0 이 되어 빈칸을 0 으로 읽는다.
    expect(resolveKanoWeight('' as unknown as number, 4)).toBe(4);
});
