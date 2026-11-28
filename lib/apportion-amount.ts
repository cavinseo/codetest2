// 금액을 가중치대로 나누되, 나눈 몫의 합이 정확히 원래 금액이 되게 한다.
//
// 자금조달 자동 배분은 앞 항목들을 각각 반올림하고 마지막 항목에 나머지를 주되 0 에서
// 잘랐다. 반올림이 올라간 만큼은 회수할 곳이 없어, 필요액 2 를 빈 항목 4개에 나누면
// 1·1·1·0 으로 합계 3 이 됐다(감리 B17). 몫을 내림한 뒤 남은 1 단위를 소수부가 큰
// 항목부터 하나씩 주는 최대 잔여 방식으로 합을 맞춘다.

/** total 을 weights 비율로 나눈다. 정수 금액은 정수로 나누고, 합은 total 과 같다. */
export function apportionAmount(total: number, weights: number[]): number[] {
    const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
    const shares = weights.map((weight) => total * (weight / weightTotal));
    const amounts = shares.map((share) => Math.floor(share));
    let leftover = total - amounts.reduce((sum, amount) => sum + amount, 0);

    // 소수부가 큰 순서로 남은 1 단위를 하나씩 준다. sort 는 안정 정렬(ES2019)이라 소수부가
    // 같으면 원래 순서, 곧 앞 항목이 먼저다.
    const order = shares
        .map((share, index) => ({ index, fraction: share - amounts[index] }))
        .sort((a, b) => b.fraction - a.fraction);
    for (const { index } of order) {
        if (leftover < 1) break;
        amounts[index] += 1;
        leftover -= 1;
    }
    // total 이 정수가 아니면 1 보다 작은 끝수가 남는다. 버리지 않고 마지막 항목에 둔다.
    amounts[amounts.length - 1] += leftover;
    return amounts;
}
