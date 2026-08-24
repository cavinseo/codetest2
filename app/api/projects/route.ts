import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { generateId } from '@/lib/id';
import { requireAuth } from '@/lib/auth';
import { resolveProjectRole } from '@/lib/authorization';
import {
    canCreateProject, canCreateProjectForOthers, canListAllProjects, parseMemberRole,
} from '@/lib/member-roles';
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
    // 멘티가 자기 것을 만들 때는 둘 다 보내지 않는다 — 자신이 속한 프로그램과
    // 자기 자신으로 정해져 있어 고를 여지가 없다. 관리자·매니저가 남을
    // 소유자로 지정해 열 때만 필요하다(아래 POST 참고).
    programId: z.string().min(1, '프로그램을 선택하세요.').optional(),
    ownerMenteeId: z.string().min(1, '소유할 멘티를 선택하세요.').optional(),
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
                programId: true,
                program: { select: { name: true } },
                members: {
                    where: { userId: userId },
                    select: { role: true },
                },
                _count: {
                    // 대시보드 상단 통계가 이 값을 합산해 보여준다. 목록 조회가
                    // 이미 역할별로 범위를 좁히므로(scope), 합계도 자연히 본인
                    // 몫만 잡힌다.
                    select: { members: true, kanoInvitations: true, qfdMatrices: true },
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
                programId: p.programId,
                programName: p.program.name,
                memberCount: p._count.members + 1, // 소유자 포함
                surveyCount: p._count.kanoInvitations,
                qfdMatrixCount: p._count.qfdMatrices,
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

    // 멘티는 자기 것을, 관리자·매니저는 남의 것도 만들 수 있다. 멘토는 못 만든다.
    if (!canCreateProject(authResult.role)) {
        return NextResponse.json(
            { error: '프로젝트를 만들 권한이 없습니다.' },
            { status: 403 }
        );
    }

    try {
        const body = await request.json();
        const { name, description, detailedDescription, businessPlanFile, aiMode, programId, ownerMenteeId } =
            createProjectSchema.parse(body);
        const validatedBusinessPlanFile = validateBusinessPlanFileStorageValue(businessPlanFile);

        // 어느 프로그램에, 누구 것으로 만들지 정한다.
        let targetProgramId: string;
        let ownerId: string;
        let programName: string;

        if (!canCreateProjectForOthers(authResult.role)) {
            // 멘티. 본인이 속한 프로그램에 본인 것으로만 만든다. 본문에 실린
            // programId/ownerMenteeId 는 무시한다 — 그것을 믿으면 남의 프로그램에
            // 남의 이름으로 과제를 열 수 있다.
            const me = await prisma.user.findUnique({
                where: { id: userId },
                select: { programId: true, program: { select: { name: true } } },
            });
            if (!me?.programId || !me.program) {
                return NextResponse.json(
                    { error: '소속된 프로그램이 없어 프로젝트를 만들 수 없습니다. 프로그램 매니저에게 배정을 요청하세요.' },
                    { status: 400 }
                );
            }
            targetProgramId = me.programId;
            ownerId = userId;
            programName = me.program.name;
        } else {
            if (!programId || !ownerMenteeId) {
                return NextResponse.json(
                    { error: '프로그램과 소유할 멘티를 선택하세요.' },
                    { status: 400 }
                );
            }

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

            targetProgramId = program.id;
            ownerId = owner.id;
            programName = program.name;
        }

        const newProject = await prisma.project.create({
            data: {
                id: generateId('proj'),
                name,
                description,
                detailedDescription,
                businessPlanFile: validatedBusinessPlanFile,
                aiMode,
                programId: targetProgramId,
                ownerId,
            },
        });

        log.info('프로젝트 생성', { userId, projectId: newProject.id, programId: targetProgramId, ownerId });

        return NextResponse.json({
            project: {
                id: newProject.id,
                name: newProject.name,
                description: newProject.description,
                detailedDescription: newProject.detailedDescription,
                aiMode: newProject.aiMode,
                createdAt: newProject.createdAt.toISOString(),
                updatedAt: newProject.updatedAt.toISOString(),
                programName,
                memberCount: 1,
                // 갓 만든 프로젝트라 설문도 QFD 도 아직 없다.
                surveyCount: 0,
                qfdMatrixCount: 0,
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
