// 미저장 이탈 경고의 dirty 판정 규칙.
//
// 여기서 틀리면 두 방향으로 나빠진다. 헐거우면 경고가 안 떠 표가 사라지고,
// 빡빡하면 저장이 끝났는데도 경고가 떠 사용자가 그다음부터 경고를 읽지 않는다.
import { describe, expect, it } from 'vitest';
import { isDirty, snapshotOf } from '../lib/unsaved-changes';

const rows = [
    { id: 'a', name: '가', order: 0 },
    { id: 'b', name: '나', order: 1 },
];

describe('isDirty', () => {
    it('저장 시점과 같으면 깨끗하다', () => {
        expect(isDirty(snapshotOf(rows), rows)).toBe(false);
    });

    it('한 셀만 달라도 dirty 다', () => {
        const edited = [{ ...rows[0], name: '다' }, rows[1]];

        expect(isDirty(snapshotOf(rows), edited)).toBe(true);
    });

    it('고쳤다가 되돌리면 다시 깨끗하다', () => {
        // onChange 마다 플래그를 세우는 방식이 놓치는 경우다.
        const snapshot = snapshotOf(rows);
        const edited = [{ ...rows[0], name: '다' }, rows[1]];
        const reverted = [{ ...edited[0], name: '가' }, rows[1]];

        expect(isDirty(snapshot, edited)).toBe(true);
        expect(isDirty(snapshot, reverted)).toBe(false);
    });

    it('행 순서만 바뀌어도 dirty 다', () => {
        expect(isDirty(snapshotOf(rows), [rows[1], rows[0]])).toBe(true);
    });

    it('행이 늘거나 줄어도 dirty 다', () => {
        expect(isDirty(snapshotOf(rows), [...rows, { id: 'c', name: '다', order: 2 }])).toBe(true);
        expect(isDirty(snapshotOf(rows), [rows[0]])).toBe(true);
    });

    it('아직 로드 전(snapshot 이 null)이면 dirty 가 아니다', () => {
        // 로딩 중에 창을 닫는 것까지 막으면 안 된다.
        expect(isDirty(null, rows)).toBe(false);
        expect(isDirty(null, [])).toBe(false);
    });

    it('빈 표끼리는 깨끗하다', () => {
        expect(isDirty(snapshotOf([]), [])).toBe(false);
    });

    it('빈 표에서 행을 추가하면 dirty 다', () => {
        expect(isDirty(snapshotOf([]), [{ id: 'a', name: '', order: 0 }])).toBe(true);
    });
});

describe('snapshotOf', () => {
    it('같은 값이면 같은 문자열이다', () => {
        expect(snapshotOf(rows)).toBe(snapshotOf([...rows]));
    });

    it('표 밖의 입력값도 함께 담을 수 있다', () => {
        // 제품명·기술역량처럼 표 바깥에 있는 입력도 저장 대상이므로 함께 굳힌다.
        const withHeader = { productName: '제품', rows };

        expect(isDirty(snapshotOf(withHeader), { productName: '제품2', rows })).toBe(true);
    });
});
