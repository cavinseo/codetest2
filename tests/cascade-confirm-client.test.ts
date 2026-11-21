// 캐스케이드 확인 409 를 받은 화면이 다시 물을지 판정한다. 같은 건수로 또 막혔는데
// 다시 묻고 보내면 확인을 누를 때마다 같은 요청이 끝없이 돈다.
import { describe, expect, it } from 'vitest';
import { shouldAskCascadeAgain } from '../lib/cascade-confirm-client';

const impact = { kanoResponses: 3, benchmarks: 0, qfdMatrices: 0, attributeFitnesses: 0, techCorrelations: 0, technicalBenchmarks: 0 };

describe('shouldAskCascadeAgain', () => {
    it('처음 막혔을 때(보낸 확인 없음)는 묻는다', () => {
        expect(shouldAskCascadeAgain({ cascadeImpact: impact }, undefined)).toBe(true);
    });

    it('확인한 뒤 건수가 바뀌어 막혔으면 새 건수로 다시 묻는다', () => {
        expect(shouldAskCascadeAgain({ cascadeImpact: { ...impact, kanoResponses: 43 } }, impact)).toBe(true);
    });

    it('확인해 보낸 건수와 같은 건수로 또 막혔으면 묻지 않는다', () => {
        expect(shouldAskCascadeAgain({ cascadeImpact: { ...impact } }, impact)).toBe(false);
    });

    it.each([
        ['응답 없음', null],
        ['건수 없음', {}],
        ['건수가 null', { cascadeImpact: null }],
        ['건수가 객체가 아님', { cascadeImpact: 3 }],
    ])('%s 이면 돌려보낼 건수가 없어 묻지 않는다', (_label, data) => {
        expect(shouldAskCascadeAgain(data as never, undefined)).toBe(false);
    });
});
