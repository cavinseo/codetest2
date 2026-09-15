// 프로그램(기관 단위로 개설하는 주제별 단위)의 개설·목록 API.
//
// 매니저도 쓰므로 requireAdmin 이 아니라 시스템 역할 게이트를 쓴다.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { generateId } from '@/lib/id';
import { createLogger } from '@/lib/logger';
import { toErrorResponse } from '@/lib/api-error';
import { canManagePrograms, canCreateProgram } from '@/lib/member-roles';
import { isValidProgramPeriod } from '@/lib/program';

const log = createLogger('api/programs');

const createProgramSchema = z.object({
    name: z.string().min(1, '프로그램명을 입력하세요.'),
    organization: z.string().min(1, '주관기관명을 입력하세요.'),
    startsAt: z.coerce.date({ errorMap: () => ({ message: '시작일을 입력하세요.' }) }),
    endsAt: z.coerce.date({ errorMap: () => ({ message: '종료일을 입력하세요.' }) }),
    managerId: z.string().min(1).optional(),
});

export async function GET(request: NextRequest) {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    if (!canManagePrograms(authResult.role)) {
        return NextResponse.json({ error: '프로그램을 볼 권한이 없습니다.' }, { status: 403 });
    }

    try {
        if (request.nextUrl.searchParams.get('managers') === '1') {
            if (!canCreateProgram(authResult.role)) return NextResponse.json({ error: '담당자 선택은 관리자만 가능합니다.' }, { status: 403 });
            const managers = await prisma.user.findMany({
                where: { role: 'PROGRAM_MANAGER', status: 'APPROVED', OR: [{ accessExpiresAt: null }, { accessExpiresAt: { gt: new Date() } }] },
                select: { id: true, name: true }, orderBy: { name: 'asc' },
            });
            return NextResponse.json({ managers });
        }
        // 매니저는 자신이 담당하는 프로그램만 본다. 관리자는 전체를 본다.
        const scope = authResult.role === 'ADMIN' ? {} : { managerId: authResult.userId };

        const programs = await prisma.program.findMany({
            where: scope,
            select: {
                id: true, name: true, organization: true, startsAt: true, endsAt: true,
                managerId: true, createdAt: true,
                manager: { select: { name: true, email: true } },
                _count: { select: { projects: true, mentees: true } },
            },
            orderBy: { createdAt: 'desc' },
        });

        return NextResponse.json({
            programs: programs.map((p) => ({
                id: p.id,
                name: p.name,
                organization: p.organization,
                startsAt: p.startsAt.toISOString(),
                endsAt: p.endsAt.toISOString(),
                managerId: p.managerId,
                managerName: p.manager.name,
                managerEmail: p.manager.email,
                createdAt: p.createdAt.toISOString(),
                projectCount: p._count.projects,
                menteeCount: p._count.mentees,
            })),
        });
    } catch (error: unknown) {
        return toErrorResponse(error, { log, message: '프로그램 목록을 불러오지 못했습니다.' });
    }
}

export async function POST(request: NextRequest) {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    if (!canCreateProgram(authResult.role)) {
        return NextResponse.json({ error: '프로그램을 개설할 권한이 없습니다.' }, { status: 403 });
    }

    try {
        const parsed = createProgramSchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
        }
        const { name, organization, startsAt, endsAt, managerId } = parsed.data;

        if (!isValidProgramPeriod(startsAt, endsAt)) {
            return NextResponse.json({ error: '종료일은 시작일보다 뒤여야 합니다.' }, { status: 400 });
        }

        if (managerId) {
            const manager = await prisma.user.findUnique({ where: { id: managerId }, select: { role: true, status: true, accessExpiresAt: true } });
            if (!manager || manager.role !== 'PROGRAM_MANAGER' || manager.status !== 'APPROVED' || (manager.accessExpiresAt && manager.accessExpiresAt <= new Date())) {
                return NextResponse.json({ error: '이용 가능한 프로그램 매니저를 선택하세요.' }, { status: 400 });
            }
        }
        // 별도 담당자를 고르지 않으면 개설한 관리자가 직접 운영한다.
        const program = await prisma.program.create({
            data: {
                id: generateId('prog'),
                name,
                organization,
                startsAt,
                endsAt,
                managerId: managerId ?? authResult.userId,
            },
        });

        log.info('프로그램 개설', { programId: program.id, managerId: program.managerId });

        return NextResponse.json({
            program: {
                id: program.id,
                name: program.name,
                organization: program.organization,
                startsAt: program.startsAt.toISOString(),
                endsAt: program.endsAt.toISOString(),
                managerId: program.managerId,
                projectCount: 0,
                menteeCount: 0,
            },
        });
    } catch (error: unknown) {
        return toErrorResponse(error, { log, message: '프로그램 개설에 실패했습니다.' });
    }
}
