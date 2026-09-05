// next/server 의 감리용 스텁. Node 22 의 전역 Request/Response 위에 라우트가 쓰는 표면만 얹는다.
// 라우트는 NextRequest 를 requireProjectAccess 에 넘길 뿐(그것도 스텁이다) 직접 읽지 않고,
// NextResponse 는 생성자·static json·instanceof 판정만 쓴다.
export class NextRequest extends Request {
    get nextUrl() {
        return new URL(this.url);
    }
}

export class NextResponse extends Response {
    static json(body, init = {}) {
        const headers = new Headers(init.headers);
        headers.set('content-type', 'application/json');
        return new NextResponse(JSON.stringify(body), { ...init, headers });
    }
}
