// 요청 본문 JSON 읽기.
//
// request.json() 은 본문이 깨진 JSON 이면 SyntaxError 를 던지는데, 라우트의 catch 가 이를
// 서버 오류로 보고 500 을 돌려줬다. 고칠 쪽은 서버가 아니라 요청이므로 400 이 맞고, 500 으로
// 답하면 서버 장애처럼 로그·알림을 오염시킨다(2026-10-25 코드 리뷰 B25). 본문 해석 실패를
// 전용 오류로 구분해 catch 에서 400 으로 바꾼다.
import { NextResponse } from 'next/server';

export class InvalidJsonBodyError extends Error {
    constructor() {
        super('요청 본문이 올바른 JSON 형식이 아닙니다.');
        this.name = 'InvalidJsonBodyError';
    }
}

/** request.json() 과 같지만(반환 형식도 같다), 깨진 본문은 InvalidJsonBodyError 로 던진다. */
export async function readJsonBody(request: Request): Promise<any> {
    try {
        return await request.json();
    } catch {
        throw new InvalidJsonBodyError();
    }
}

/** catch 에서 먼저 불러, 본문 해석 실패면 400 응답을, 아니면 null 을 돌려준다. */
export function invalidJsonBodyResponse(error: unknown): NextResponse | null {
    return error instanceof InvalidJsonBodyError
        ? NextResponse.json({ error: error.message }, { status: 400 })
        : null;
}
