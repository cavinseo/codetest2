import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createLogger } from '@/lib/logger';

const log = createLogger('api/admin/projects');

// ─── GET: 모든 프로젝트 목록 (통계 포함) ──────────────────────────────

export async function GET(_request: NextRequest) {
    try {
        const projects = await prisma.project.findMany({
            include: {
                _count: {
                    select: {
                        requirements: true,
                        kanoResponses: true,
                        members: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        const formattedProjects = projects.map((p: any) => ({
            id: p.id,
            name: p.name,
            description: p.description,
            ownerId: p.ownerId,
            createdAt: p.createdAt.toISOString(),
            updatedAt: p.updatedAt.toISOString(),
            reqCount: p._count.requirements,
            responseCount: p._count.kanoResponses,
            memberCount: p._count.members + 1, // +1 for owner
        }));

        return NextResponse.json({ projects: formattedProjects });
    } catch (error: unknown) {
        log.error('프로젝트 목록 조회 실패', error);
        return NextResponse.json({ error: '프로젝트 목록 조회 실패' }, { status: 500 });
    }
}

// ─── DELETE: 프로젝트 삭제 (연관 데이터 cascade) ──────────────────────

export async function DELETE(request: NextRequest) {
    try {
        const body = await request.json();
        const projectId: string | undefined = body?.projectId;

        if (!projectId) {
            return NextResponse.json({ error: 'projectId가 필요합니다.' }, { status: 400 });
        }

        const target = await prisma.project.findUnique({
            where: { id: projectId },
            select: { name: true },
        });

        if (!target) {
            return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
        }

        // schema.prisma에 onDelete: Cascade가 설정되어 있으므로 project 삭제만으로 관련 데이터 모두 삭제됨
        await prisma.project.delete({
            where: { id: projectId },
        });

        log.info('프로젝트 삭제 완료', { projectName: target.name, projectId });
        return NextResponse.json({ success: true, deletedProject: target.name });
    } catch (error: unknown) {
        log.error('프로젝트 삭제 실패', error);
        return NextResponse.json({ error: '프로젝트 삭제 실패' }, { status: 500 });
    }
}
