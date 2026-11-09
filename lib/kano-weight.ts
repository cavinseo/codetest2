// Kano 가중치를 정한다. 사용자가 집계표에 직접 넣은 값이 있으면 그것을, 없으면 응답으로 계산한 자동값을 쓴다.
//
// TIMKO 는 직접 넣은 0 을 그대로 쓰는데 QFD 화면과 엑셀 QFD 시트는 0 을 "입력 없음"으로 보고
// 자동값을 써서, 같은 요구사항이 TIMKO 에서는 0, QFD 에서는 자동값으로 달리 보였다(2026-11-08 코드
// 리뷰 11번). 사용자가 0 을 넣는 것은 그 요구사항을 중요도에서 빼겠다는 뜻이므로 세 곳 모두 이
// 규칙 하나로 정한다. 빈칸은 DB 에 null 로 저장된다.

/** 직접 입력한 가중치(0 포함)가 있으면 그 값, 없거나 숫자가 아니면 자동값 */
export function resolveKanoWeight(saved: number | null | undefined, autoWeight: number): number {
    // Number.isFinite 는 전역 isFinite 와 달리 값을 숫자로 바꾸지 않아 null·'' 을 0 으로 읽지 않는다.
    return Number.isFinite(saved) ? saved as number : autoWeight;
}
