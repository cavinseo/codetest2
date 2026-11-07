import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { generateId } from '@/lib/id';
import { requireProjectAccess } from '@/lib/authorization';
import { createLogger } from '@/lib/logger';
import { invalidJsonBodyResponse, readJsonBody } from '@/lib/request-body';
import { canOwnProjectIn } from '@/lib/program';
import { isUserAccessExpired } from '@/lib/invite-access';
import { parseMemberRole } from '@/lib/member-roles';

const log = createLogger('api/members');

const inviteSchema = z.object({
    email: z.string().email('Valid email is required.'),
    // 팀 초대로는 EDITOR(편집자)만 붙인다. 멘토(COACH) 배정은 대상의 시스템 역할을
    // 검사하는 POST /api/projects/[id]/mentors 로만 해야 하므로 여기서 제외한다.
    role: z.enum(['EDITOR'], {
        errorMap: () => ({ message: 'Only EDITOR can be invited.' }),
    }),
});

// 없는 이메일과 초대할 수 없는 계정을 같은 문구로 돌려준다. 다르게 답하면 멘티 누구나 이
// 경로로 임의 이메일의 가입 여부와 이름을 알아낼 수 있다(2026-11-08 코드 리뷰 4번).
const INVITEE_NOT_ELIGIBLE = '같은 프로그램에서 이용 중인 멘티만 팀원으로 초대할 수 있습니다. 이메일을 확인하세요.';

// POST: 팀원 초대

export async function POST(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const { id: projectId } = await props.params;
    const accessResult = await requireProjectAccess(request, projectId, { roles: ['OWNER'] });
    if (accessResult instanceof NextResponse) return accessResult;
    const { userId: requesterId } = accessResult.user;

    try {
        const body = await readJsonBody(request);
        const { email, role } = inviteSchema.parse(body);

        // 프로젝트 존재 여부 및 소유자 정보 확인
        const project = await prisma.project.findUnique({
            where: { id: projectId },
        });

        if (!project) {
            return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
        }

        // 소유자만 팀원을 초대할 수 있습니다.
        if (project.ownerId !== requesterId) {
            return NextResponse.json({ error: '프로젝트 소유자만 팀원을 초대할 수 있습니다.' }, { status: 403 });
        }

        // 초대 대상은 이 프로젝트의 프로그램에서 이용 중인 멘티로 한정한다. 예전에는 아무
        // 가입자나(승인 대기·다른 프로그램·이용 만료 계정까지) 편집자로 붙일 수 있었다.
        // 관리자가 만든 계정은 입력한 대소문자 그대로 저장되므로 대소문자를 무시하고 찾는다.
        const invitedUser = await prisma.user.findFirst({
            where: { email: { equals: email.trim(), mode: 'insensitive' } },
            select: {
                id: true, email: true, name: true, role: true, status: true, isAdmin: true,
                accessExpiresAt: true, programId: true,
                usedInviteCode: {
                    select: {
                        usedAt: true, expiresAt: true, accessExpiresAt: true, accessDurationDays: true, programId: true,
                        program: { select: { endsAt: true } },
                    },
                },
            },
        });
        const invitedRole = invitedUser ? parseMemberRole(invitedUser.role) : null;
        if (!invitedUser || !invitedRole || invitedUser.isAdmin || invitedUser.status !== 'APPROVED'
            || !canOwnProjectIn({ role: invitedRole, programId: invitedUser.programId }, project.programId)
            || isUserAccessExpired(invitedUser)) {
            return NextResponse.json({ error: INVITEE_NOT_ELIGIBLE }, { status: 404 });
        }

        if (invitedUser.id === project.ownerId) {
            return NextResponse.json({ error: '프로젝트 소유자는 초대할 수 없습니다.' }, { status: 400 });
        }

        // 이미 멤버인지 확인
        const existingMember = await prisma.projectMember.findUnique({
            where: {
                projectId_userId: {
                    projectId,
                    userId: invitedUser.id,
                },
            },
        });

        if (existingMember) {
            return NextResponse.json({ error: '이미 프로젝트 멤버입니다.' }, { status: 409 });
        }

        // 멤버 생성
        const newMember = await prisma.projectMember.create({
            data: {
                id: generateId('member'),
                projectId,
                userId: invitedUser.id,
                role,
                invitedBy: requesterId,
                joinedAt: new Date(),
            },
        });

        log.info('팀원 초대 성공', { projectId, invitedUserId: invitedUser.id });

        return NextResponse.json({
            success: true,
            member: {
                id: newMember.id,
                email: invitedUser.email,
                name: invitedUser.name,
                role: newMember.role,
                joinedAt: newMember.joinedAt,
            },
        });
    } catch (error: unknown) {
        const invalidBody = invalidJsonBodyResponse(error);
        if (invalidBody) return invalidBody;
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
        }
        log.error('팀원 초대 오류', error);
        return NextResponse.json({ error: '팀원 초대 중 오류가 발생했습니다.' }, { status: 500 });
    }
}

// GET: 팀원 목록 조회

export async function GET(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const { id: projectId } = await props.params;
    const accessResult = await requireProjectAccess(request, projectId);
    if (accessResult instanceof NextResponse) return accessResult;

    try {
        const project = await prisma.project.findUnique({
            where: { id: projectId },
            include: {
                owner: true,
                members: {
                    include: {
                        user: true,
                    },
                },
            },
        });

        if (!project) {
            return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
        }

        const membersList = [
            {
                id: 'owner',
                userId: project.ownerId,
                email: project.owner.email,
                name: project.owner.name,
                role: 'OWNER',
                joinedAt: project.createdAt,
            },
            ...project.members.map((m: any) => ({
                id: m.id,
                userId: m.userId,
                email: m.user.email,
                name: m.user.name,
                role: m.role,
                joinedAt: m.joinedAt,
            })),
        ];

        return NextResponse.json({ members: membersList });
    } catch (error: unknown) {
        log.error('팀원 목록 조회 오류', error);
        return NextResponse.json({ error: '팀원 목록 조회 실패' }, { status: 500 });
    }
}
