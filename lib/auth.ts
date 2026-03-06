import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME } from '@/lib/constants';

/** 세션 쿠키에 저장되는 페이로드 타입. */
export interface SessionUser {
    userId: string;
    email: string;
    name: string;
}

/**
 * 요청에서 세션 사용자를 읽어 반환합니다.
 * 쿠키 미존재 또는 파싱 실패 시 null을 반환합니다.
 *
 * @param request - Next.js 요청 객체
 * @returns 파싱된 세션 사용자 또는 null
 */
export function getSessionUser(request: NextRequest): SessionUser | null {
    const cookieValue = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!cookieValue) return null;

    try {
        const parsed = JSON.parse(cookieValue) as Partial<SessionUser>;
        // 필수 필드 존재 여부 검증 — 손상된 쿠키를 받아들이지 않음
        if (!parsed.userId || !parsed.email || !parsed.name) return null;
        return parsed as SessionUser;
    } catch {
        return null;
    }
}

/**
 * 인증이 필요한 라우트의 세션 사용자를 반환합니다.
 * 세션이 없으면 401 응답을 반환하여 호출 측에서 즉시 return할 수 있도록 합니다.
 *
 * @example
 * const authResult = requireAuth(request);
 * if (authResult instanceof NextResponse) return authResult;
 * const { userId } = authResult;
 *
 * @param request - Next.js 요청 객체
 * @returns SessionUser (인증 성공) 또는 NextResponse 401 (미인증)
 */
export function requireAuth(request: NextRequest): SessionUser | NextResponse {
    const sessionUser = getSessionUser(request);
    if (!sessionUser) {
        return NextResponse.json(
            { error: '로그인이 필요합니다.' },
            { status: 401 }
        );
    }
    return sessionUser;
}
