// 미저장 이탈 경고의 dirty 판정 규칙.
//
// 여기서 틀리면 두 방향으로 나빠진다. 헐거우면 경고가 안 떠 표가 사라지고,
// 빡빡하면 저장이 끝났는데도 경고가 떠 사용자가 그다음부터 경고를 읽지 않는다.
import { describe, expect, it } from 'vitest';
import {
    applyDirtyReport,
    hasUnsavedWork,
    isDirty,
    LEAVE_WORKSHEET_CONFIRM,
    snapshotOf,
} from '../lib/unsaved-changes';

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

describe('탭 전환 가로채기 — dirty 목록', () => {
    it('저장 안 된 워크시트가 없으면 이동을 막지 않는다', () => {
        expect(hasUnsavedWork(new Set())).toBe(false);
    });

    it('워크시트가 dirty 를 보고하면 이동을 막는다', () => {
        const keys = new Set<string>();

        applyDirtyReport(keys, 'ws-3', true);

        expect(hasUnsavedWork(keys)).toBe(true);
    });

    it('같은 워크시트가 여러 번 보고해도 한 번만 센다', () => {
        // 타이핑마다 이펙트가 도므로 같은 키가 계속 들어온다.
        const keys = new Set<string>();

        applyDirtyReport(keys, 'ws-3', true);
        applyDirtyReport(keys, 'ws-3', true);
        applyDirtyReport(keys, 'ws-3', true);

        expect(keys.size).toBe(1);
    });

    it('저장하거나 언마운트되면 목록에서 빠지고 이동이 풀린다', () => {
        // 훅의 정리 함수가 하는 일이다. 탭을 옮기면 워크시트는 언마운트되는데, 그때
        // dirty 로 남겨 두면 경고가 다음 이동까지 따라다녀 저장했는데도 되묻게 된다.
        const keys = new Set<string>();
        applyDirtyReport(keys, 'ws-3', true);

        applyDirtyReport(keys, 'ws-3', false);

        expect(hasUnsavedWork(keys)).toBe(false);
    });

    it('없는 키를 지워도 문제없다', () => {
        const keys = new Set<string>();

        applyDirtyReport(keys, 'ws-3', false);

        expect(hasUnsavedWork(keys)).toBe(false);
    });

    it('워크시트가 둘 이상 dirty 면 하나만 저장해도 여전히 막는다', () => {
        const keys = new Set<string>();
        applyDirtyReport(keys, 'ws-3', true);
        applyDirtyReport(keys, 'ws-5', true);

        applyDirtyReport(keys, 'ws-3', false);

        expect(hasUnsavedWork(keys)).toBe(true);
    });

    it('확인 문구는 무엇이 사라지는지 먼저 말한다', () => {
        expect(LEAVE_WORKSHEET_CONFIRM).toContain('사라집니다');
        expect(LEAVE_WORKSHEET_CONFIRM).toContain('이동');
    });
});
