// 날짜에 일수를 더한다. 접근 기간 만료일(member-roles)과 초대 코드 사용 기한(invite-code)이
// 같은 계산을 각자 들고 있었다(2026-10-25 코드 리뷰 D8).
//
// setDate 를 쓰는 이유: 밀리초에 하루씩 더하면 서머타임이 있는 시간대에서 시각이 한 시간
// 밀린다. 달력 날짜로 더해야 "발급 시각과 같은 시각의 N일 뒤"가 된다.
export function addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}
