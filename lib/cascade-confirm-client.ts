// 캐스케이드 삭제 확인(409 needsCascadeConfirm)을 받은 화면이 다시 물을지 정한다.
//
// 서버는 확인한 건수와 지금 건수가 다를 때만 다시 409 를 준다(감리 B4). 그러니
// 방금 확인해 보낸 건수와 같은 건수로 또 막혔다면 확인으로는 풀리지 않는 상태다 —
// 그때 다시 묻고 재전송하면 사용자가 "확인"을 누를 때마다 같은 요청이 끝없이 돈다.
// 건수가 없는 응답도 돌려보낼 값이 없어 같은 처지다.

export function shouldAskCascadeAgain(
    data: { cascadeImpact?: unknown } | null | undefined,
    sentImpact: unknown
): boolean {
    if (typeof data?.cascadeImpact !== 'object' || data.cascadeImpact === null) return false;
    return JSON.stringify(data.cascadeImpact) !== JSON.stringify(sentImpact);
}
