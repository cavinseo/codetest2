// 워크시트가 "저장하지 않은 변경"을 판정하는 규칙. 훅과 분리해 둔 이유는 이 부분만
// 단언할 수 있게 하기 위해서다 — beforeunload 등록은 브라우저 동작이라 테스트로
// 확인할 것이 거의 없지만, 무엇을 dirty 로 볼 것인가는 틀리기 쉽다.
//
// onChange 마다 플래그를 세우는 흔한 방식은 쓰지 않는다. 고쳤다가 되돌린 경우에도
// dirty 로 남아, 실제로는 저장할 것이 없는데 이탈을 막는다. 경고가 한 번 헛돌면
// 사용자는 그다음부터 경고를 읽지 않는다.

/** 저장 시점의 값을 비교 가능한 문자열로 굳힌다. */
export function snapshotOf(value: unknown): string {
    return JSON.stringify(value);
}

/**
 * 저장 이후 값이 달라졌는지 본다.
 *
 * `snapshot` 이 null 이면 아직 최초 로드가 끝나지 않은 상태다. 그때는 비교할
 * 기준이 없으므로 dirty 가 아니다 — 로딩 중에 창을 닫는 것까지 막으면 안 된다.
 */
export function isDirty(snapshot: string | null, value: unknown): boolean {
    if (snapshot === null) return false;
    return snapshotOf(value) !== snapshot;
}

// ── 탭 전환 가로채기용 ─────────────────────────────────────────
//
// 워크시트 사이 이동은 브라우저가 보기에 "페이지를 떠나는 일"이 아니라 한 페이지 안에서
// 화면만 갈아 끼우는 일이라, beforeunload 가 걸리지 않는다. 그래서 탭을 쥐고 있는 쪽이
// "지금 열린 워크시트가 저장 안 된 상태인가"를 알아야 한다.
//
// 열린 워크시트는 보통 하나지만 집합으로 둔다. 워크시트가 자기 상태를 여러 번 보고해도
// 한 번만 세야 하고, 탭을 옮겨 언마운트될 때 반드시 지워져야 하기 때문이다.

/** 워크시트 하나의 dirty 여부를 목록에 반영한다. 같은 키를 여러 번 보고해도 한 번만 센다. */
export function applyDirtyReport(dirtyKeys: Set<string>, key: string, dirty: boolean): void {
    if (dirty) dirtyKeys.add(key);
    else dirtyKeys.delete(key);
}

/** 저장하지 않은 워크시트가 하나라도 있는가. */
export function hasUnsavedWork(dirtyKeys: Set<string>): boolean {
    return dirtyKeys.size > 0;
}

/** 탭을 옮기려 할 때 띄우는 확인 문구. 무엇이 사라지는지 먼저 말한다. */
export const LEAVE_WORKSHEET_CONFIRM =
    '저장하지 않은 변경이 있습니다. 다른 워크시트로 이동하면 사라집니다.\n\n그래도 이동하시겠습니까?';
