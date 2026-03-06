import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { generateId } from '@/lib/id';
import { requireAuth } from '@/lib/auth';
import { createLogger } from '@/lib/logger';

const log = createLogger('api/projects');

const createProjectSchema = z.object({
    name: z.string().min(1, '프로젝트 이름을 입력하세요'),
    description: z.string().optional(),
    detailedDescription: z.string().optional(),
    businessPlanFile: z.string().optional(),
});

// ─── GET: 프로젝트 목록 조회 ──────────────────────────────────────────
// 로그인한 사용자의 프로젝트만 반환합니다 (소유 + 멤버로 참여한 것 모두).

export async function GET(request: NextRequest) {
    const authResult = requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const { userId } = authResult;

    try {
        const userProjects = await prisma.project.findMany({
            where: {
                OR: [
                    { ownerId: userId },
                    { members: { some: { userId: userId } } },
                ],
            },
            include: {
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
                createdAt: p.createdAt.toISOString(),
                updatedAt: p.updatedAt.toISOString(),
                memberCount: p._count.members + 1, // 소유자 포함
                role: p.ownerId === userId ? 'OWNER' : (p.members[0]?.role ?? 'EDITOR'),
            })),
        });
    } catch (error: unknown) {
        log.error('프로젝트 목록 조회 오류', error);
        return NextResponse.json({ error: '프로젝트 목록 조회 실패' }, { status: 500 });
    }
}

// ─── POST: 새 프로젝트 생성 ───────────────────────────────────────────

export async function POST(request: NextRequest) {
    const authResult = requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const { userId } = authResult;

    try {
        const body = await request.json();
        const { name, description, detailedDescription, businessPlanFile } =
            createProjectSchema.parse(body);

        const newProject = await prisma.project.create({
            data: {
                id: generateId('proj'),
                name,
                description,
                detailedDescription,
                businessPlanFile,
                ownerId: userId,
            },
        });

        log.info('프로젝트 생성', { userId, projectId: newProject.id });

        return NextResponse.json({
            project: {
                id: newProject.id,
                name: newProject.name,
                description: newProject.description,
                createdAt: newProject.createdAt.toISOString(),
                updatedAt: newProject.updatedAt.toISOString(),
                memberCount: 1,
                role: 'OWNER',
            },
        });
    } catch (error: unknown) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
        }
        log.error('프로젝트 생성 오류', error);
        return NextResponse.json({ error: '프로젝트 생성 실패' }, { status: 500 });
    }
}
