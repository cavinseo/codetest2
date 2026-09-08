// 겹치는 점의 번호를 한 라벨로 모으는 규칙을 검증한다.
//
// 지키는 성질은 둘이다. (1) 원이 겹치는 점(중심 거리 < 지름)만 묶이고 닿기만 하는 점은
// 묶이지 않는다 — 임계값이 느슨하면 멀쩡히 보이던 번호까지 합쳐진다. (2) 번호 순서와
// 묶음 중심이 결정적이다 — 차트는 이 결과를 그대로 좌표와 글자로 쓴다.
import { describe, expect, it } from 'vitest';
import { clusterLabel, clusterOverlappingPoints } from '../lib/timko-point-clusters';

const RADIUS = 8;

describe('clusterOverlappingPoints', () => {
    it('겹치지 않는 점은 각자 한 묶음이고 입력 순서와 좌표를 그대로 돌려준다', () => {
        expect(clusterOverlappingPoints([
            { x: 100, y: 100 }, { x: 200, y: 100 }, { x: 100, y: 200 },
        ], RADIUS)).toEqual([
            { members: [0], x: 100, y: 100 },
            { members: [1], x: 200, y: 100 },
            { members: [2], x: 100, y: 200 },
        ]);
    });

    it('좌표가 완전히 같은 점은 한 묶음이 되고 나머지는 단독이다', () => {
        // 사용자 데이터의 4번·7번(같은 만족·불만족 계수)이 이 경우다.
        expect(clusterOverlappingPoints([
            { x: 100, y: 100 }, { x: 150, y: 150 }, { x: 100, y: 100 },
        ], RADIUS)).toEqual([
            { members: [0, 2], x: 100, y: 100 },
            { members: [1], x: 150, y: 150 },
        ]);
    });

    it('중심 거리가 지름과 같으면(닿기만 함) 묶지 않는다', () => {
        expect(clusterOverlappingPoints([{ x: 100, y: 100 }, { x: 116, y: 100 }], RADIUS))
            .toHaveLength(2);
    });

    it('중심 거리가 지름보다 짧으면 가로·세로 어느 방향이든 묶고 중심은 평균이다', () => {
        expect(clusterOverlappingPoints([{ x: 100, y: 100 }, { x: 115, y: 100 }], RADIUS))
            .toEqual([{ members: [0, 1], x: 107.5, y: 100 }]);
        expect(clusterOverlappingPoints([{ x: 100, y: 100 }, { x: 100, y: 115 }], RADIUS))
            .toEqual([{ members: [0, 1], x: 100, y: 107.5 }]);
        // 반지름의 1.5배 거리도 겹침이다 — 임계값이 반지름(지름의 절반)으로 줄면 여기서 갈린다.
        expect(clusterOverlappingPoints([{ x: 100, y: 100 }, { x: 112, y: 100 }], RADIUS))
            .toHaveLength(1);
    });

    it('사슬로 이어진 점은 양 끝이 안 겹쳐도 한 묶음이다', () => {
        expect(clusterOverlappingPoints([
            { x: 100, y: 100 }, { x: 110, y: 100 }, { x: 120, y: 100 },
        ], RADIUS)).toEqual([{ members: [0, 1, 2], x: 110, y: 100 }]);
    });

    it('뒤 점이 먼저 묶여도 구성원은 오름차순, 묶음은 가장 작은 번호 순이다', () => {
        expect(clusterOverlappingPoints([
            { x: 100, y: 100 }, { x: 300, y: 300 }, { x: 300, y: 300 }, { x: 100, y: 100 },
        ], RADIUS)).toEqual([
            { members: [0, 3], x: 100, y: 100 },
            { members: [1, 2], x: 300, y: 300 },
        ]);
    });

    it('점이 없으면 빈 배열이다', () => {
        expect(clusterOverlappingPoints([], RADIUS)).toEqual([]);
    });
});

describe('clusterLabel', () => {
    it('0 기준 인덱스를 1 기준 번호로 바꿔 가운뎃점으로 잇는다', () => {
        expect(clusterLabel([3, 6])).toBe('4·7');
        expect(clusterLabel([10, 14])).toBe('11·15');
        expect(clusterLabel([0])).toBe('1');
    });
});
