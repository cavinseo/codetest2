import { createHmac, timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from './prisma';
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from './constants';
import { isAccessExpired, parseMemberRole, type MemberRole } from './member-roles';
import { isProfileCompleteForRole } from './member-profile';

export interface SessionUser {
    userId: string;
    email: string;
    name: string | null;
}

// 서명된 쿠키에 실제로 담기는 값.
// exp 가 없으면 쿠키 문자열이 영구히 유효해지고, ver 가 없으면 발급된 세션을
// 서버에서 되돌릴 방법이 없다. 둘 다 서명 안에 들어가야 위조가 불가능하다.
interface SessionPayload extends SessionUser {
    exp: number; // 만료 시각 (epoch seconds)
    iat: number; // 발급 시각 (epoch seconds)
    ver: number; // 발급 당시 User.sessionVersion
}

export function getSessionSecret(): string {
    const secret = process.env.SESSION_SECRET || process.env.NEXTAUTH_SECRET;
    // 환경과 무관하게 시크릿을 요구한다. 예전에는 개발 환경에서 고정 문자열로
    // 폴백해, 그 값을 아는 사람이 아무 세션이나 위조할 수 있었다.
    if (!secret) {
        throw new Error('SESSION_SECRET (또는 NEXTAUTH_SECRET) 환경변수가 필요합니다.');
    }
    return secret;
}

function signPayload(payload: string): string {
    return createHmac('sha256', getSessionSecret()).update(payload).digest('base64url');
}

function nowInSeconds(): number {
    return Math.floor(Date.now() / 1000);
}

export function encodeSessionCookie(
    sessionUser: SessionUser,
    options: { sessionVersion?: number; maxAgeSeconds?: number } = {}
): string {
    const issuedAt = nowInSeconds();
    const body: SessionPayload = {
        ...sessionUser,
        iat: issuedAt,
        exp: issuedAt + (options.maxAgeSeconds ?? SESSION_MAX_AGE_SECONDS),
        ver: options.sessionVersion ?? 0,
    };
    const payload = Buffer.from(JSON.stringify(body), 'utf8').toString('base64url');
    return `${payload}.${signPayload(payload)}`;
}

/**
 * 서명과 만료만 검증한다. DB 는 보지 않는다.
 * 로그인 여부만 알면 되는 화면(랜딩 페이지 리다이렉트 등)에서 쓴다.
 */
export function verifySessionCookie(cookieValue: string | undefined): SessionPayload | null {
    if (!cookieValue) return null;

    const [payload, signature] = cookieValue.split('.');
    if (!payload || !signature) return null;

    try {
        const expected = signPayload(payload);
        const actualBuffer = Buffer.from(signature, 'base64url');
        const expectedBuffer = Buffer.from(expected, 'base64url');
        if (actualBuffer.length !== expectedBuffer.length) return null;
        if (!timingSafeEqual(actualBuffer, expectedBuffer)) return null;

        const parsed = JSON.parse(
            Buffer.from(payload, 'base64url').toString('utf8')
        ) as Partial<SessionPayload>;

        if (!parsed?.userId || !parsed.email) return null;
        // exp 가 없는 쿠키는 이 필드가 생기기 전에 발급된 것이다. 영구 유효 쿠키를
        // 남겨 두지 않기 위해 거부한다(해당 사용자는 다시 로그인하면 된다).
        if (typeof parsed.exp !== 'number' || parsed.exp <= nowInSeconds()) return null;

        return {
            userId: parsed.userId,
            email: parsed.email,
            name: parsed.name ?? null,
            exp: parsed.exp,
            iat: typeof parsed.iat === 'number' ? parsed.iat : 0,
            ver: typeof parsed.ver === 'number' ? parsed.ver : 0,
        };
    } catch {
        return null;
    }
}

/** 쿠키 값 자체로 세션을 해석한다. 서버 컴포넌트에서 next/headers 의 cookies() 와 함께 쓴다. */
export function getSessionUserFromCookieValue(cookieValue: string | undefined): SessionUser | null {
    const payload = verifySessionCookie(cookieValue);
    if (!payload) return null;
    return { userId: payload.userId, email: payload.email, name: payload.name };
}

export function getSessionUser(request: NextRequest): SessionUser | null {
    return getSessionUserFromCookieValue(request.cookies.get(SESSION_COOKIE_NAME)?.value);
}

export interface AuthenticatedUser extends SessionUser {
    isAdmin: boolean;
    role: MemberRole;
    accessExpiresAt: Date | null;
}

export interface RequireAuthOptions {
    /**
     * 온보딩 미완료 계정도 통과시킨다.
     *
     * 기본값이 "막힘"이라 새로 생기는 라우트는 아무것도 하지 않아도 게이트된다.
     * 이 옵션은 온보딩 자체를 끝내는 경로에만 준다 — 하나 늘릴 때마다 임시
     * 비밀번호로 닿을 수 있는 표면이 그만큼 넓어진다.
     */
    allowIncompleteOnboarding?: boolean;
}

/**
 * 서명·만료를 본 뒤 DB 로 계정 상태까지 확인한다.
 *
 * 쿠키만 믿으면 관리자가 승인을 취소하거나 비밀번호를 바꿔도 이미 발급된 세션이
 * 계속 살아 있다. 승인 게이트가 사후에 아무 소용이 없어지므로, 쓰기 경로가 쓰는
 * 이 함수는 매 요청 DB 를 확인한다(PK 조회 1회).
 */
export async function requireAuth(
    request: NextRequest,
    options: RequireAuthOptions = {}
): Promise<AuthenticatedUser | NextResponse> {
    const payload = verifySessionCookie(request.cookies.get(SESSION_COOKIE_NAME)?.value);
    if (!payload) {
        return NextResponse.json({ error: 'Login required.' }, { status: 401 });
    }

    const dbUser = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: {
            id: true, email: true, name: true, status: true, isAdmin: true,
            sessionVersion: true, role: true, accessExpiresAt: true,
            mustChangePassword: true,
            profile: {
                select: {
                    organization: true, phone: true,
                    expertise: true, careerYears: true,
                    companyName: true, industry: true,
                },
            },
        },
    });

    if (!dbUser) {
        return NextResponse.json({ error: '세션이 만료되었습니다. 다시 로그인하세요.' }, { status: 401 });
    }
    if (dbUser.status !== 'APPROVED') {
        return NextResponse.json(
            { error: '관리자 승인 대기 중인 계정입니다.' },
            { status: 403 }
        );
    }
    if (dbUser.sessionVersion !== payload.ver) {
        return NextResponse.json(
            { error: '세션이 만료되었습니다. 다시 로그인하세요.' },
            { status: 401 }
        );
    }
    // 초대 코드로 들어온 계정은 이용 기간이 정해져 있다.
    if (isAccessExpired(dbUser.accessExpiresAt)) {
        return NextResponse.json(
            { error: '이용 기간이 만료되었습니다. 관리자에게 연장을 요청하세요.' },
            { status: 403 }
        );
    }

    // 저장값이 깨져 있어도 최소 권한으로 떨어뜨린다.
    const role = parseMemberRole(dbUser.role) ?? 'MENTEE';

    // 임시 비밀번호와 미완성 프로필은 온보딩을 마치기 전까지 서비스 전체를 막는다.
    // app/login/page.tsx 의 클라이언트 리디렉트는 주소창으로 우회되므로, 막는 일은
    // 서버가 해야 한다. profile 에 ?? null 을 붙이는 이유는 isProfileCompleteForRole
    // 이 null 만 걸러내기 때문이다 — undefined 가 들어가면 undefined.organization 에서
    // TypeError 로 죽는다.
    if (!options.allowIncompleteOnboarding
        && (dbUser.mustChangePassword
            || !isProfileCompleteForRole(role, dbUser.profile ?? null))) {
        return NextResponse.json(
            { error: '온보딩을 먼저 마쳐야 합니다.', code: 'onboarding_required' },
            { status: 403 }
        );
    }

    return {
        userId: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        isAdmin: dbUser.isAdmin,
        role,
        accessExpiresAt: dbUser.accessExpiresAt,
    };
}
