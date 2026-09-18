import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { generateId } from '@/lib/id';
import { requireProjectAccess } from '@/lib/authorization';
import { createLogger } from '@/lib/logger';

const log = createLogger('api/members');

const inviteSchema = z.object({
    email: z.string().email('Valid email is required.'),
    // 팀 초대로는 EDITOR(편집자)만 붙인다. 멘토(COACH) 배정은 대상의 시스템 역할을
    // 검사하는 POST /api/projects/[id]/mentors 로만 해야 하므로 여기서 제외한다.
    role: z.enum(['EDITOR'], {
        errorMap: () => ({ message: 'Only EDITOR can be invited.' }),
    }),
});

// 대상을 ProjectMember.id 가 아니라 userId 로 받는다. 목록 조회(GET)가 소유자를
// id 'owner' 인 가짜 행으로 끼워 넣어 행 id 는 키로 쓰기에 불안정하고, 스키마의
// @@unique([projectId, userId]) 가 userId 를 이 관계의 자연 키로 만든다.
const removeSchema = z.object({
    userId: z.string().min(1, '제외할 팀원을 선택하세요.'),
});

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
        const body = await request.json();
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

        // 초대 대상 사용자 확인
        const invitedUser = await prisma.user.findUnique({
            where: { email },
        });

        if (!invitedUser) {
            return NextResponse.json(
                { error: '해당 이메일의 사용자를 찾을 수 없습니다. 먼저 회원가입이 필요합니다.' },
                { status: 404 }
            );
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

// DELETE: 팀원 제외
//
// 초대(POST)만 있고 회수가 없으면 잘못 초대한 편집자의 쓰기 권한을 거둘 방법이
// 계정 삭제나 프로젝트 삭제뿐이 된다. 초대와 같은 권한으로 회수도 할 수 있게 한다.
// 접근 권한은 요청마다 resolveProjectRole 이 계산하므로 제외는 즉시 반영된다.

export async function DELETE(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const { id: projectId } = await props.params;
    const accessResult = await requireProjectAccess(request, projectId, { roles: ['OWNER'] });
    if (accessResult instanceof NextResponse) return accessResult;
    const { userId: requesterId } = accessResult.user;

    try {
        const { userId } = removeSchema.parse(await request.json());

        // roles: ['OWNER'] 를 통과했으므로 요청자가 곧 소유자다. 소유자는 멤버 행이
        // 아니라 프로젝트 자체에 붙으므로 제외 대상이 아니며, 허용하면 소유자가 자기
        // 프로젝트에서 스스로 잠기는 길이 열린다.
        if (userId === requesterId) {
            return NextResponse.json({ error: '프로젝트 소유자는 제외할 수 없습니다.' }, { status: 400 });
        }

        // 같은 버튼을 두 번 눌러도 안전하도록 조건부 삭제로 처리하고 건수로 판정한다.
        const removed = await prisma.projectMember.deleteMany({ where: { projectId, userId } });

        if (removed.count === 0) {
            return NextResponse.json({ error: '이 프로젝트의 팀원이 아닙니다.' }, { status: 404 });
        }

        // 이메일은 남기지 않는다(lib/logger.ts 규칙).
        log.info('팀원 제외', { projectId, removedUserId: userId });

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
        }
        log.error('팀원 제외 오류', error);
        return NextResponse.json({ error: '팀원 제외 중 오류가 발생했습니다.' }, { status: 500 });
    }
}
