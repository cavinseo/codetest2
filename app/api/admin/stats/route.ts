import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import { requireAdmin } from '@/lib/authorization';

const log = createLogger('api/admin/stats');

// GET: 관리자 통계
export async function GET(request: NextRequest) {
    const adminResult = await requireAdmin(request);
    if (adminResult instanceof NextResponse) return adminResult;

    try {
        const [userCount, projectCount, responseCount, requirementCount] = await Promise.all([
            prisma.user.count(),
            prisma.project.count(),
            prisma.kanoResponse.count(),
            prisma.customerRequirement.count(),
        ]);

        const kanoDistribution = { M: 0, O: 0, A: 0, I: 0, R: 0, Q: 0 };
        const distribution = await prisma.kanoResponse.groupBy({
            by: ['kanoCategory'],
            _count: {
                kanoCategory: true,
            },
        });

        distribution.forEach((item: any) => {
            const cat = item.kanoCategory as keyof typeof kanoDistribution;
            if (cat in kanoDistribution) {
                kanoDistribution[cat] = item._count.kanoCategory;
            }
        });

        const recentProjects = await prisma.project.findMany({
            take: 5,
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                name: true,
                createdAt: true,
            },
        });

        return NextResponse.json({
            totalProjects: projectCount,
            totalUsers: userCount,
            totalRequirements: requirementCount,
            totalResponses: responseCount,
            recentProjects: recentProjects.map((p: any) => ({
                id: p.id,
                name: p.name,
                createdAt: p.createdAt.toISOString(),
            })),
            kanoDistribution,
        });
    } catch (error: unknown) {
        log.error('관리자 통계 조회 오류', error);
        return NextResponse.json({ error: '통계 조회 실패' }, { status: 500 });
    }
}
