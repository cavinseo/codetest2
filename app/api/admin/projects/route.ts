import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import { requireAdmin } from '@/lib/authorization';

const log = createLogger('api/admin/projects');

const PROJECT_CASCADE_COUNT_FIELDS = {
    attributeFitnesses: true,
    benchmarks: true,
    requirements: true,
    kanoResponses: true,
    kanoInvitations: true,
    migrations: true,
    productAttributes: true,
    members: true,
    qfdMatrices: true,
    specFunctions: true,
    techCorrelations: true,
    technicalCharacteristics: true,
    technicalBenchmarks: true,
    techTreeEntries: true,
    improvementItems: true,
    targetSpecs: true,
    techRoadmaps: true,
    devPlans: true,
    salesEstimates: true,
    assetItems: true,
    fundingPlans: true,
    fundingSources: true,
    worksheetComments: true,
} as const;

function countProjectCascadeRecords(counts: Record<string, number>, hasFinalReport: boolean) {
    return Object.values(counts).reduce((total, count) => total + count, hasFinalReport ? 1 : 0);
}

// ─── GET: 모든 프로젝트 목록 (통계 포함) ──────────────────────────────

export async function GET(request: NextRequest) {
    const adminResult = await requireAdmin(request);
    if (adminResult instanceof NextResponse) return adminResult;

    try {
        const [projects, programs] = await Promise.all([prisma.project.findMany({
            include: {
                owner: {
                    select: { email: true, name: true },
                },
                _count: {
                    select: {
                        requirements: true,
                        kanoResponses: true,
                        members: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        }), prisma.program.findMany({
            select: { id: true, name: true, organization: true },
            orderBy: [{ name: 'asc' }, { id: 'asc' }],
        })]);

        const formattedProjects = projects.map((p) => ({
            id: p.id,
            name: p.name,
            description: p.description,
            ownerId: p.ownerId,
            programId: p.programId,
            ownerEmail: p.owner?.email ?? null,
            ownerName: p.owner?.name ?? null,
            createdAt: p.createdAt.toISOString(),
            updatedAt: p.updatedAt.toISOString(),
            reqCount: p._count.requirements,
            responseCount: p._count.kanoResponses,
            memberCount: p._count.members + 1, // +1 for owner
        }));

        return NextResponse.json({ projects: formattedProjects, programs });
    } catch (error: unknown) {
        log.error('프로젝트 목록 조회 실패', error);
        return NextResponse.json({ error: '프로젝트 목록 조회 실패' }, { status: 500 });
    }
}

// ─── DELETE: 프로젝트 삭제 (연관 데이터 cascade) ──────────────────────

export async function DELETE(request: NextRequest) {
    const adminResult = await requireAdmin(request);
    if (adminResult instanceof NextResponse) return adminResult;

    try {
        const body = await request.json();
        const projectId: string | undefined = body?.projectId;
        const confirmCascade = body?.confirmCascade === true;

        if (!projectId) {
            return NextResponse.json({ error: 'projectId가 필요합니다.' }, { status: 400 });
        }

        const target = await prisma.project.findUnique({
            where: { id: projectId },
            select: {
                name: true,
                finalReport: { select: { projectId: true } },
                _count: { select: PROJECT_CASCADE_COUNT_FIELDS },
            },
        });

        if (!target) {
            return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
        }

        const relatedRecords = countProjectCascadeRecords(target._count, Boolean(target.finalReport));
        if (!confirmCascade) {
            return NextResponse.json({
                error: `"${target.name}" 프로젝트와 연결된 데이터 ${relatedRecords}건이 함께 삭제됩니다. 계속하려면 다시 확인하세요.`,
                needsCascadeConfirm: true,
                preview: { relatedRecords },
            }, { status: 409 });
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
