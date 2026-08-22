import { NextRequest, NextResponse } from 'next/server';
import { prisma } from './prisma';
import { requireAuth, SessionUser } from './auth';
import { canReadAnyProject, canWriteAnyProject, type MemberRole } from './member-roles';

export type ProjectAccessRole = 'OWNER' | 'EDITOR' | 'COACH' | 'ADMIN' | 'VIEWER';

const WRITE_ROLES = new Set<ProjectAccessRole>(['OWNER', 'EDITOR', 'ADMIN']);

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
}): ProjectAccessRole | undefined {
    const explicitRole = params.isOwner
        ? 'OWNER'
        : (params.memberRole as ProjectAccessRole | undefined) ?? undefined;

    if (canWriteAnyProject(params.systemRole)) {
        // 관리자는 전권이되, 이미 쓰기 가능한 명시 역할이 있으면 그대로 둔다.
        // OWNER 전용 게이트에서 관리자 소유자가 막히면 안 된다.
        if (!explicitRole || !WRITE_ROLES.has(explicitRole)) return 'ADMIN';
        return explicitRole;
    }
    if (!explicitRole && canReadAnyProject(params.systemRole)) {
        // 매니저는 배정되지 않은 프로젝트도 읽는다. VIEWER 는 WRITE_ROLES 에
        // 없으므로 쓰기와 roles 검사에서 자동으로 걸러진다.
        return 'VIEWER';
    }
    return explicitRole;
}

export interface ProjectAccess {
    user: SessionUser;
    role: ProjectAccessRole;
}

function isAdminEmail(email: string): boolean {
    const adminEmails = (process.env.ADMIN_EMAILS || '')
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);

    return adminEmails.includes(email.toLowerCase());
}

export async function requireAdmin(request: NextRequest): Promise<SessionUser | NextResponse> {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;

    // isAdmin 은 requireAuth 가 DB 에서 읽어 온 값이라 플래그 회수가 즉시 반영된다.
    if (authResult.isAdmin) return authResult;

    if (isAdminEmail(authResult.email)) return authResult;

    // 로컬 개발용 우회: ALLOW_DEV_ADMIN=true 를 명시해야만 활성화 (암묵적 허용 금지)
    if (process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEV_ADMIN === 'true') return authResult;

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
