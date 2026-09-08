// TIMKO 차트에서 서로 겹치는 점의 번호를 한 라벨로 모으는 규칙.
//
// 좌표가 같은 항목은 나중에 그린 점이 앞 점을 완전히 덮어 번호가 사라진다. 점을 몇 px
// 밀어서 피하는 방법은 쓰지 않는다 — 점이 놓인 칸이 곧 가중치라 위치를 흐트러뜨리면
// 차트에서 가중치를 잘못 읽는다. 대신 원이 겹치는 점끼리 묶어 번호를 '4·7' 처럼 한 줄로
// 그린다. 두 차트(WS-6 Kano2DChart, WS-7 KanoSatisfactionGraph)가 같이 쓴다.

export interface ChartPoint {
    x: number;
    y: number;
}

export interface PointCluster {
    /** 입력 배열의 0 기준 인덱스, 오름차순. 입력 순서가 곧 차트 번호 순서다. */
    members: number[];
    /** 구성원 좌표의 평균 — 라벨을 놓는 자리. */
    x: number;
    y: number;
}

/**
 * 중심 거리가 지름(2·radius)보다 짧은 점끼리 묶는다. 정확히 지름이면 닿기만 하고 번호가
 * 다 보이므로 묶지 않는다. 사슬(A–B, B–C 겹침)은 한 묶음이 된다 — 번호가 전부 라벨에
 * 들어가므로 정보는 잃지 않는다.
 */
export function clusterOverlappingPoints(points: ChartPoint[], radius: number): PointCluster[] {
    // 각 점이 속한 묶음의 대표 인덱스. 처음엔 자기 자신이다(union-find).
    const parent = points.map((_, index) => index);
    const find = (index: number): number => {
        let root = index;
        while (parent[root] !== root) root = parent[root];
        return root;
    };

    const minDistance = radius * 2;
    // 바깥 반복을 for 대신 forEach 로 쓰는 이유: for 의 `a < n` 이 `a <= n` 으로 변이되면
    // 안쪽 반복이 돌지 않아 어떤 테스트로도 못 잡는 등가 뮤턴트가 된다.
    points.forEach((origin, a) => {
        for (let b = a + 1; b < points.length; b += 1) {
            if (Math.hypot(points[b].x - origin.x, points[b].y - origin.y) < minDistance) {
                parent[find(b)] = find(a);
            }
        }
    });

    // 인덱스 오름차순으로 훑으므로 Map 삽입 순서가 곧 "가장 작은 번호 순"이 된다.
    const membersByRoot = new Map<number, number[]>();
    points.forEach((_, index) => {
        const root = find(index);
        const members = membersByRoot.get(root) ?? [];
        members.push(index);
        membersByRoot.set(root, members);
    });

    return [...membersByRoot.values()].map((members) => ({
        members,
        x: members.reduce((sum, index) => sum + points[index].x, 0) / members.length,
        y: members.reduce((sum, index) => sum + points[index].y, 0) / members.length,
    }));
}

/** 0 기준 인덱스를 차트 번호(1 기준)로 바꿔 가운뎃점으로 잇는다. */
export function clusterLabel(members: number[]): string {
    return members.map((index) => index + 1).join('·');
}
