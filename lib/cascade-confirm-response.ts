// "지우면 연결된 데이터도 함께 사라진다"고 되묻는 409 응답의 모양을 한곳에 둔다.
//
// 요구사항 저장·제품 속성 저장·엑셀 가져오기·JSON 가져오기가 같은 응답 본문을 각자 만들고
// 있었다(2026-10-25 코드 리뷰 D5). 화면(lib/delete-confirmation 등)은 needsCascadeConfirm 과
// cascadeImpact 를 보고 확인창을 띄우므로, 한 곳만 키 이름이 바뀌어도 확인 없이 실패만 보인다.
import { NextResponse } from 'next/server';

export function cascadeConfirmResponse(error: string, cascadeImpact: object) {
    return NextResponse.json({ error, needsCascadeConfirm: true, cascadeImpact }, { status: 409 });
}
