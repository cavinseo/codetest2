// 사용자 정보 화면이 쓰는 "내 소속" 조회.
//
// 경로에 userId 를 받지 않는다. 세션의 userId 만 쓰므로 남의 소속을 들여다볼
// 수 없다(app/api/me/profile 과 같은 원칙).
//
// 역할마다 답이 다르다:
//   MENTEE           내가 속한 프로그램 + 내 프로젝트를 맡은 담당 멘토
//   MENTOR           내가 배정된 프로젝트를 프로그램별로 묶은 것
//   PROGRAM_MANAGER  내가 개설한 프로그램과 그 안의 프로젝트
//   ADMIN            해당 없음(어느 프로그램에도 소속되지 않는 독립 역할)
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { createLogger } from '@/lib/logger';
import { toErrorResponse } from '@/lib/api-error';
import { collectMentors, groupProjectsByProgram, type ProgramRef } from '@/lib/affiliation';

const log = createLogger('api/me/affiliation');

const PROGRAM_FIELDS = {
    id: true, name: true, organization: true, startsAt: true, endsAt: true,
} as const;

function toProgramRef(p: {
    id: string; name: string; organization: string; startsAt: Date; endsAt: Date;
}): ProgramRef {
    return {
        id: p.id,
        name: p.name,
        organization: p.organization,
        startsAt: p.startsAt.toISOString(),
        endsAt: p.endsAt.toISOString(),
    };
}

export async function GET(request: NextRequest) {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const { userId, role } = authResult;

    try {
        if (role === 'MENTEE') {
            const [me, owned] = await Promise.all([
                prisma.user.findUnique({
                    where: { id: userId },
                    select: { program: { select: PROGRAM_FIELDS } },
                }),
                // 담당 멘토는 내 프로젝트에 COACH 로 배정된 사람이다. 멘토 배정이
                // ProjectMember.role='COACH' 로 기록되므로 거기서 거슬러 올라간다.
                prisma.project.findMany({
                    where: { ownerId: userId },
                    select: {
                        name: true,
                        members: {
                            where: { role: 'COACH' },
                            select: { user: { select: { id: true, name: true, email: true } } },
                        },
                    },
                    orderBy: { updatedAt: 'desc' },
                }),
            ]);

            return NextResponse.json({
                role,
                program: me?.program ? toProgramRef(me.program) : null,
                mentors: collectMentors(owned),
                programs: [],
            });
        }

        if (role === 'MENTOR') {
            const memberships = await prisma.projectMember.findMany({
                where: { userId, role: 'COACH' },
                select: {
                    project: {
                        select: { id: true, name: true, program: { select: PROGRAM_FIELDS } },
                    },
                },
                orderBy: { joinedAt: 'desc' },
            });

            return NextResponse.json({
                role,
                program: null,
                mentors: [],
                programs: groupProjectsByProgram(
                    memberships.map(({ project }) => ({
                        project: { id: project.id, name: project.name, program: toProgramRef(project.program) },
                    }))
                ),
            });
        }

        if (role === 'PROGRAM_MANAGER') {
            const programs = await prisma.program.findMany({
                where: { managerId: userId },
                select: {
                    ...PROGRAM_FIELDS,
                    projects: {
                        select: { id: true, name: true, owner: { select: { name: true } } },
                        orderBy: { updatedAt: 'desc' },
                    },
                },
                orderBy: { createdAt: 'desc' },
            });

            return NextResponse.json({
                role,
                program: null,
                mentors: [],
                programs: programs.map((p) => ({
                    ...toProgramRef(p),
                    projects: p.projects.map((proj) => ({
                        id: proj.id, name: proj.name, ownerName: proj.owner?.name ?? null,
                    })),
                })),
            });
        }

        // 관리자는 프로그램에 소속되지 않는다. 빈 값을 주고 화면이 이 절을 감춘다.
        return NextResponse.json({ role, program: null, mentors: [], programs: [] });
    } catch (error: unknown) {
        return toErrorResponse(error, { log, message: '소속 정보를 불러오지 못했습니다.' });
    }
}
