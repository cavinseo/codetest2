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
