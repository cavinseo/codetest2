// "지우면 연결된 데이터도 함께 사라진다"고 되묻는 409 응답의 모양을 한곳에 둔다.
//
// 요구사항 저장·제품 속성 저장·엑셀 가져오기·JSON 가져오기가 같은 응답 본문을 각자 만들고
// 있었다(2026-10-25 코드 리뷰 D5). 화면(lib/delete-confirmation 등)은 needsCascadeConfirm 과
// cascadeImpact 를 보고 확인창을 띄우므로, 한 곳만 키 이름이 바뀌어도 확인 없이 실패만 보인다.
//
// 화면은 받은 cascadeImpact 를 그대로 confirmedCascadeImpact 로 돌려보내 확인한다. 서버는
// 그 건수가 지금 지워질 건수와 정확히 같을 때만 진행하므로, 확인이 보여 준 건수에 묶인다(감리 B4).
// 제품 속성은 건수 모양이 달라({ fitnesses }) 문구와 건수를 호출부가 함께 넘긴다.
import { NextResponse } from 'next/server';

export function cascadeConfirmResponse(error: string, cascadeImpact: object) {
    return NextResponse.json({ error, needsCascadeConfirm: true, cascadeImpact }, { status: 409 });
}
