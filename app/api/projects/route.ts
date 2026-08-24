import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { generateId } from '@/lib/id';
import { requireAuth } from '@/lib/auth';
import { resolveProjectRole } from '@/lib/authorization';
import { canCreateProject, canListAllProjects, parseMemberRole } from '@/lib/member-roles';
import { canManageThisProgram, canOwnProjectIn } from '@/lib/program';
import { createLogger } from '@/lib/logger';
import {
    BusinessPlanFileValidationError,
    validateBusinessPlanFileStorageValue,
} from '@/lib/business-plan-file';
import { DEFAULT_PROJECT_AI_MODE, projectAiModeSchema } from '@/lib/ai/project-ai-mode';

const log = createLogger('api/projects');

const createProjectSchema = z.object({
    name: z.string().min(1, '프로젝트 이름을 입력하세요'),
    description: z.string().optional(),
    detailedDescription: z.string().optional(),
    businessPlanFile: z.string().nullable().optional(),
    aiMode: projectAiModeSchema.optional().default(DEFAULT_PROJECT_AI_MODE),
    // 프로그램은 매니저·관리자가 열고, 그 안의 프로젝트는 참여 멘티가 소유한다.
    // "누가 만드는가"(canCreateProject)와 "누가 갖는가"는 다른 질문이다.
    programId: z.string().min(1, '프로그램을 선택하세요.'),
    ownerMenteeId: z.string().min(1, '소유할 멘티를 선택하세요.'),
});

// ─── GET: 프로젝트 목록 조회 ──────────────────────────────────────────
// 로그인한 사용자의 프로젝트만 반환합니다 (소유 + 멤버로 참여한 것 모두).

export async function GET(request: NextRequest) {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const { userId } = authResult;

    try {
        // 관리자와 매니저는 배정 대상을 고르기 위해 전체 목록을 본다.
        const scope = canListAllProjects(authResult.role)
            ? {}
            : { OR: [{ ownerId: userId }, { members: { some: { userId } } }] };

        const userProjects = await prisma.project.findMany({
            where: scope,
            select: {
                id: true,
                name: true,
                description: true,
                detailedDescription: true,
                ownerId: true,
                createdAt: true,
                updatedAt: true,
                program: { select: { name: true } },
                members: {
                    where: { userId: userId },
                    select: { role: true },
                },
                _count: {
                    select: { members: true },
                },
            },
            orderBy: { updatedAt: 'desc' },
        });
        return NextResponse.json({
            projects: userProjects.map((p: any) => ({
                id: p.id,
                name: p.name,
                description: p.description,
                detailedDescription: p.detailedDescription,
                createdAt: p.createdAt.toISOString(),
                updatedAt: p.updatedAt.toISOString(),
                programName: p.program.name,
                memberCount: p._count.members + 1, // 소유자 포함
                role: resolveProjectRole({
                    systemRole: authResult.role,
                    isOwner: p.ownerId === userId,
                    memberRole: p.members[0]?.role,
                }) ?? 'EDITOR',
            })),
        });
    } catch (error: unknown) {
        log.error('프로젝트 목록 조회 오류', error);
        return NextResponse.json({ error: '프로젝트 목록 조회 실패' }, { status: 500 });
    }
}

// ─── POST: 새 프로젝트 생성 ───────────────────────────────────────────

export async function POST(request: NextRequest) {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const { userId } = authResult;

    // 관리자·매니저가 과제를 열고 멘토·멘티는 나중에 참가자로 붙는 구조다.
    if (!canCreateProject(authResult.role)) {
        return NextResponse.json(
            { error: '프로젝트를 만들 권한이 없습니다. 관리자 또는 프로그램 매니저 계정으로 생성할 수 있습니다.' },
            { status: 403 }
        );
    }

    try {
        const body = await request.json();
        const { name, description, detailedDescription, businessPlanFile, aiMode, programId, ownerMenteeId } =
            createProjectSchema.parse(body);
        const validatedBusinessPlanFile = validateBusinessPlanFileStorageValue(businessPlanFile);

        const program = await prisma.program.findUnique({
            where: { id: programId },
            select: { id: true, name: true, managerId: true },
        });
        if (!program) {
            return NextResponse.json({ error: '프로그램을 찾을 수 없습니다.' }, { status: 404 });
        }
        if (!canManageThisProgram({ role: authResult.role, userId }, program)) {
            return NextResponse.json(
                { error: '이 프로그램에 프로젝트를 만들 권한이 없습니다.' },
                { status: 403 }
            );
        }

        const owner = await prisma.user.findUnique({
            where: { id: ownerMenteeId },
            select: { id: true, role: true, programId: true },
        });
        const ownerRole = owner ? parseMemberRole(owner.role) : null;
        if (!owner || !ownerRole || !canOwnProjectIn({ role: ownerRole, programId: owner.programId }, programId)) {
            return NextResponse.json(
                { error: '이 프로그램에 속한 멘티만 프로젝트 소유자로 지정할 수 있습니다.' },
                { status: 400 }
            );
        }

        const newProject = await prisma.project.create({
            data: {
                id: generateId('proj'),
                name,
                description,
                detailedDescription,
                businessPlanFile: validatedBusinessPlanFile,
                aiMode,
                programId,
                ownerId: owner.id,
            },
        });

        log.info('프로젝트 생성', { userId, projectId: newProject.id, programId, ownerId: owner.id });

        return NextResponse.json({
            project: {
                id: newProject.id,
                name: newProject.name,
                description: newProject.description,
                detailedDescription: newProject.detailedDescription,
                aiMode: newProject.aiMode,
                createdAt: newProject.createdAt.toISOString(),
                updatedAt: newProject.updatedAt.toISOString(),
                programName: program.name,
                memberCount: 1,
                role: 'OWNER',
            },
        });
    } catch (error: unknown) {
        if (error instanceof z.ZodError || error instanceof BusinessPlanFileValidationError) {
            const message = error instanceof z.ZodError ? error.errors[0].message : error.message;
            return NextResponse.json({ error: message }, { status: 400 });
        }
        log.error('프로젝트 생성 오류', error);
        return NextResponse.json({ error: '프로젝트 생성 실패' }, { status: 500 });
    }
}
