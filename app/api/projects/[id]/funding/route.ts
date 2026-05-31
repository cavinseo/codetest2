import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';
import { buildFundingPlansWithSales } from '@/lib/worksheet-links';

// GET: ?먭툑?뚯슂 諛?議곕떖 怨꾪쉷
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const { id: projectId } = await props.params;
    const accessResult = await requireProjectAccess(request, projectId, { write: request.method !== 'GET' });
    if (accessResult instanceof NextResponse) return accessResult;
    try {
        let plans = await prisma.fundingPlan.findMany({ where: { projectId }, orderBy: { order: 'asc' } });
        let sources = await prisma.fundingSource.findMany({ where: { projectId }, orderBy: { order: 'asc' } });
        const salesEstimates = await prisma.salesEstimate.findMany({ where: { projectId } });

        // 데이터가 없으면 초기 항목 생성
        if (plans.length === 0 && sources.length === 0) {
            const initialPlans = [
                { category: '매출액', item: '매출액', order: 0 },
                { category: '소요자금', item: '생산비용', order: 1 },
                { category: '소요자금', item: '운영관리비', order: 2 },
                { category: '소요자금', item: '설비투자금', order: 3 },
                { category: '소요자금', item: '연구개발 및 기술이전 등', order: 4 },
                { category: '소요자금', item: '기타 등', order: 5 },
                { category: '소요자금', item: '소요자금 합계', order: 6 },
            ];
            const initialSources = [
                { category: '정부자금', order: 0 },
                { category: '엔젤투자금', order: 1 },
                { category: '연구개발 지원금(R&D)', order: 2 },
                { category: '민간투자주도형 기술창업지원(TIPS)', order: 3 },
                { category: '벤처캐피털(VC)', order: 4 },
                { category: '기타', order: 5 },
            ];

            await prisma.$transaction([
                prisma.fundingPlan.createMany({ data: initialPlans.map(p => ({ ...p, projectId })) }),
                prisma.fundingSource.createMany({ data: initialSources.map(s => ({ ...s, projectId })) }),
            ]);

            plans = await prisma.fundingPlan.findMany({ where: { projectId }, orderBy: { order: 'asc' } });
            sources = await prisma.fundingSource.findMany({ where: { projectId }, orderBy: { order: 'asc' } });
        }

        plans = buildFundingPlansWithSales({ plans, salesEstimates }) as typeof plans;

        return NextResponse.json({ plans, sources });
    } catch (error) {
        console.error('Funding GET error:', error);
        return NextResponse.json({ error: 'Failed to load funding data' }, { status: 500 });
    }
}

// POST: 자금 계획 일괄 저장
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const { id: projectId } = await props.params;
    const accessResult = await requireProjectAccess(request, projectId, { write: request.method !== 'GET' });
    if (accessResult instanceof NextResponse) return accessResult;
    try {
        const { plans, sources } = await request.json();
        await prisma.$transaction([
            prisma.fundingPlan.deleteMany({ where: { projectId } }),
            prisma.fundingSource.deleteMany({ where: { projectId } }),
            ...(plans ? [prisma.fundingPlan.createMany({
                data: plans.map((p: any) => ({ ...p, projectId }))
            })] : []),
            ...(sources ? [prisma.fundingSource.createMany({
                data: sources.map((s: any) => ({ ...s, projectId }))
            })] : [])
        ]);

        const [savedPlans, savedSources] = await Promise.all([
            prisma.fundingPlan.findMany({ where: { projectId }, orderBy: { order: 'asc' } }),
            prisma.fundingSource.findMany({ where: { projectId }, orderBy: { order: 'asc' } })
        ]);

        return NextResponse.json({ plans: savedPlans, sources: savedSources });
    } catch (error) {
        console.error('Funding POST error:', error);
        return NextResponse.json({ error: 'Failed to save funding data' }, { status: 500 });
    }
}
