import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { generateId } from '@/lib/id';
import { requireAuth } from '@/lib/auth';
import { createLogger } from '@/lib/logger';

const log = createLogger('api/members');

const inviteSchema = z.object({
    email: z.string().email('유효한 이메일을 입력하세요'),
    role: z.enum(['EDITOR', 'COACH'], {
        errorMap: () => ({ message: 'EDITOR 또는 COACH 역할만 초대할 수 있습니다.' }),
    }),
});

// ─── POST: 팀원 초대 ──────────────────────────────────────────────────

export async function POST(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    // 세션 인증: 로그인한 사용자만 팀원을 초대할 수 있습니다.
    const authResult = requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const { userId: requesterId } = authResult;

    const { id: projectId } = await props.params;

    try {
        const body = await request.json();
        const { email, role } = inviteSchema.parse(body);

        // 프로젝트 존재 확인 및 소유자 정보 가져오기
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

// ─── GET: 팀원 목록 조회 ──────────────────────────────────────────────

export async function GET(
    _request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const { id: projectId } = await props.params;

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
