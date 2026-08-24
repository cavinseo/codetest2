// 한 프로그램에 속한 멘티 목록. 새 프로젝트를 개설할 때 소유자 후보로 쓴다.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { createLogger } from '@/lib/logger';
import { toErrorResponse } from '@/lib/api-error';
import { canManagePrograms } from '@/lib/member-roles';
import { canManageThisProgram } from '@/lib/program';

const log = createLogger('api/programs/mentees');

export async function GET(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const { id: programId } = await props.params;
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    if (!canManagePrograms(authResult.role)) {
        return NextResponse.json({ error: '멘티 목록을 볼 권한이 없습니다.' }, { status: 403 });
    }

    try {
        const program = await prisma.program.findUnique({
            where: { id: programId },
            select: { managerId: true },
        });
        if (!program) {
            return NextResponse.json({ error: '프로그램을 찾을 수 없습니다.' }, { status: 404 });
        }
        if (!canManageThisProgram({ role: authResult.role, userId: authResult.userId }, program)) {
            return NextResponse.json({ error: '이 프로그램의 멘티 목록을 볼 권한이 없습니다.' }, { status: 403 });
        }

        const mentees = await prisma.user.findMany({
            where: { programId, role: 'MENTEE', status: 'APPROVED' },
            select: { id: true, name: true, email: true },
            orderBy: { name: 'asc' },
        });

        return NextResponse.json({ mentees });
    } catch (error: unknown) {
        return toErrorResponse(error, { log, message: '멘티 목록을 불러오지 못했습니다.', context: { programId } });
    }
}
