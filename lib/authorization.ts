import { NextRequest, NextResponse } from 'next/server';
import { prisma } from './prisma';
import { requireAuth, SessionUser, type AuthenticatedUser } from './auth';
import { canReadAnyProject, canWriteAnyProject, type MemberRole } from './member-roles';

export type ProjectAccessRole = 'OWNER' | 'EDITOR' | 'COACH' | 'ADMIN' | 'VIEWER';

const WRITE_ROLES = new Set<ProjectAccessRole>(['OWNER', 'EDITOR', 'ADMIN']);

/**
 * 이 역할로 프로젝트에 쓸 수 있는가. requireProjectAccess 의 쓰기 판정과 같은
 * 기준을 써야 한다 — GET 라우트가 조회 도중 부수적으로 쓰기를 해야 할 때(예:
 * 자동 채움) 이 판정이 따로 복제되면 VIEWER·COACH 가 읽기만 해도 쓰기가
 * 일어나는 권한 경계 붕괴가 생긴다.
 */
export function isProjectWriteRole(role: ProjectAccessRole): boolean {
    return WRITE_ROLES.has(role);
}

/**
 * 프로젝트에서 유효한 역할을 정한다. requireProjectAccess 와 목록 API 가
 * 같은 답을 내야 하므로 판정을 한 곳에 둔다. 예전에는 두 곳에 복제돼 있어
 * 목록은 VIEWER 라고 하는데 상세는 편집을 허용하는 어긋남이 생겼다.
 *
 * 반환값이 undefined 면 접근 권한이 없다는 뜻이다.
 */
export function resolveProjectRole(params: {
    systemRole: MemberRole;
    isOwner: boolean;
    memberRole: string | null | undefined;
    isAssignedMentor?: boolean;
}): ProjectAccessRole | undefined {
    // 멘토 편집은 현재 소유 멘티의 배정으로만 허용한다. 과거 멤버 역할은 우회로가 아니다.
    if (params.systemRole === 'MENTOR') return params.isAssignedMentor ? 'EDITOR' : undefined;
    if (params.systemRole === 'PROGRAM_MANAGER' && params.isAssignedMentor) return 'EDITOR';
    const explicitRole = params.isOwner
        ? 'OWNER'
        : (params.memberRole as ProjectAccessRole | undefined) ?? undefined;

    if (canWriteAnyProject(params.systemRole)) {
        // 관리자는 전권이되, 이미 쓰기 가능한 명시 역할이 있으면 그대로 둔다.
        // OWNER 전용 게이트에서 관리자 소유자가 막히면 안 된다.
        if (!explicitRole || !WRITE_ROLES.has(explicitRole)) return 'ADMIN';
        return explicitRole;
    }
    if (canReadAnyProject(params.systemRole)) {
        // 실제 멘토로 배정되지 않은 매니저는 전체를 읽되 고치지 못한다.
        // 명시 역할이 없으면 배정되지 않은 프로젝트도 VIEWER 로 읽는다. 팀 초대로
        // EDITOR 행이 생겨도 그 역할로 쓰기가 열리면 안 되므로 VIEWER 로 낮춘다.
        // 단, 승격 전에 직접 만든 프로젝트의 OWNER 는 실제 소유 관계라 유지한다.
        if (!explicitRole || explicitRole === 'EDITOR') return 'VIEWER';
        return explicitRole;
    }
    return explicitRole;
}

export interface ProjectAccess {
    user: AuthenticatedUser;
    role: ProjectAccessRole;
}

function isAdminEmail(email: string): boolean {
    const adminEmails = (process.env.ADMIN_EMAILS || '')
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);

    return adminEmails.includes(email.toLowerCase());
}

/**
 * 관리자 화면에 들어갈 수 있는가. requireAdmin 과 화면이 같은 답을 내야 하므로
 * 판정을 한 곳에 둔다. 예전에는 화면이 isAdmin 과 role 만 보고 판단해,
 * ADMIN_EMAILS 로 들어오는 계정이 링크를 잃었다.
 *
 * 역할이 첫 관문이다. 멘토·멘티·프로그램 매니저는 어떤 경로로도 관리자
 * 모드에 들어올 수 없다 — 아래 세 우회로(isAdmin 플래그, ADMIN_EMAILS,
 * 개발용 플래그)를 전부 이 관문 뒤에 둔 이유다. 예전에는 셋 다 역할을
 * 보지 않아서, 멘티 계정이라도 ADMIN_EMAILS 에 이메일이 있거나
 * ALLOW_DEV_ADMIN 이 켜져 있으면 그대로 통과했다.
 */
export function hasAdminAccess(user: { email: string; isAdmin: boolean; role: MemberRole }): boolean {
    if (user.role !== 'ADMIN') return false;

    // isAdmin 은 requireAuth 가 DB 에서 읽어 온 값이라 플래그 회수가 즉시 반영된다.
    if (user.isAdmin) return true;

    if (isAdminEmail(user.email)) return true;

    // 로컬 개발용 우회: ALLOW_DEV_ADMIN=true 를 명시해야만 활성화 (암묵적 허용 금지)
    if (process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEV_ADMIN === 'true') return true;

    return false;
}

export async function requireAdmin(request: NextRequest): Promise<SessionUser | NextResponse> {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;

    if (hasAdminAccess(authResult)) return authResult;

    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
}

export async function requireProjectAccess(
    request: NextRequest,
    projectId: string,
    options: { write?: boolean; roles?: ProjectAccessRole[] } = {}
): Promise<ProjectAccess | NextResponse> {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;

    const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: {
            ownerId: true,
            owner: { select: { mentorAssignment: { select: { mentorId: true } } } },
            members: {
                where: { userId: authResult.userId },
                select: { role: true },
            },
        },
    });

    if (!project) {
        return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
    }

    // 관리자는 명시 역할과 무관하게 전권이다. "관리자는 이상의 모든 권한을 가진다".
    const role = resolveProjectRole({
        systemRole: authResult.role,
        isOwner: project.ownerId === authResult.userId,
        memberRole: project.members[0]?.role,
        isAssignedMentor: project.owner?.mentorAssignment?.mentorId === authResult.userId,
    });

    if (!role) {
        return NextResponse.json({ error: 'Project access denied.' }, { status: 403 });
    }

    if (options.write && !WRITE_ROLES.has(role)) {
        return NextResponse.json({ error: 'Project write access required.' }, { status: 403 });
    }

    if (options.roles && !options.roles.includes(role)) {
        return NextResponse.json({ error: 'Project role not allowed.' }, { status: 403 });
    }

    return { user: authResult, role };
}
