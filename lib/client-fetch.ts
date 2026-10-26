// 화면에서 API 응답을 다루는 공용 함수.
//
// "본문을 읽고, 실패면 서버 문구(없으면 기본 문구)로 던진다"와 "401 이면 로그인으로, 403 이면
// 거부 화면"이 화면마다 복사돼 있었다(2026-10-25 코드 리뷰 D3). 문구 규칙이 화면마다 조금씩
// 어긋나지 않도록 한곳에 둔다.

/**
 * 응답 본문(JSON)을 돌려준다. 실패 응답이면 서버가 준 error 문구로, 없으면 fallbackMessage 로
 * 던진다. 본문이 JSON 이 아니어도 해석 오류 대신 같은 규칙의 문구로 던진다.
 */
export async function readJsonOrThrow<T = any>(response: Response, fallbackMessage: string): Promise<T> {
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error || fallbackMessage);
    return data;
}

/** 401 이면 로그인 화면으로 보내고 true 를 돌려준다. 호출한 쪽은 true 면 그대로 멈추면 된다. */
export function redirectToLoginOn401(response: Pick<Response, 'status'>): boolean {
    if (response.status !== 401) return false;
    window.location.replace('/login');
    return true;
}

/**
 * 로그인·권한이 필요한 화면의 첫 조회 결과를 판정한다. 401 은 로그인으로 보내고 'redirected',
 * 403 은 'denied'(호출한 쪽이 거부 안내를 띄운다), 그 밖은 'allowed'.
 */
export function checkPageAccess(response: Pick<Response, 'status'>): 'redirected' | 'denied' | 'allowed' {
    if (redirectToLoginOn401(response)) return 'redirected';
    return response.status === 403 ? 'denied' : 'allowed';
}
