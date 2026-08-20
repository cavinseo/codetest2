import { NextRequest, NextResponse } from 'next/server';
import { prisma } from './prisma';
import { requireAuth, SessionUser } from './auth';

export type ProjectAccessRole = 'OWNER' | 'EDITOR' | 'COACH' | 'ADMIN';

const WRITE_ROLES = new Set<ProjectAccessRole>(['OWNER', 'EDITOR', 'ADMIN']);

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

    const role = project.ownerId === authResult.userId
        ? 'OWNER'
        : (project.members[0]?.role as ProjectAccessRole | undefined);

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
