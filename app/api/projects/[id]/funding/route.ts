import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { isProjectWriteRole, requireProjectAccess } from '@/lib/authorization';
import { buildFundingPlansWithSales } from '@/lib/worksheet-links';
import { fundingBodySchema } from '@/lib/bulk-save-schemas';

const INITIAL_FUNDING_PLANS = [
    { category: '매출액', item: '매출액', year2: null, year3: null, order: 0 },
    { category: '소요자금', item: '생산비용', order: 1 },
    { category: '소요자금', item: '운영관리비', order: 2 },
    { category: '소요자금', item: '설비투자금', order: 3 },
    { category: '소요자금', item: '연구개발 및 기술이전 등', order: 4 },
    { category: '소요자금', item: '기타 등', order: 5 },
    { category: '소요자금', item: '소요자금 합계', order: 6 },
];

// 처음 여는 화면에는 저장 전에도 입력할 기본행이 필요하다. 조회가 DB를 바꾸지
// 않도록, 저장될 때까지는 화면에서만 쓸 행을 만든다.
function createInitialFundingPlans(projectId: string) {
    return INITIAL_FUNDING_PLANS.map((plan) => ({
        id: `initial-funding-plan-${plan.order}`,
        projectId,
        category: plan.category,
        item: plan.item,
        year1: 0,
        year2: plan.year2 === null ? null : 0,
        year3: plan.year3 === null ? null : 0,
        order: plan.order,
    }));
}

// GET: 자금소요 및 조달 계획
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const { id: projectId } = await props.params;
    const accessResult = await requireProjectAccess(request, projectId, { write: request.method !== 'GET' });
    if (accessResult instanceof NextResponse) return accessResult;
    try {
        let plans = await prisma.fundingPlan.findMany({ where: { projectId }, orderBy: { order: 'asc' } });
        const sources = await prisma.fundingSource.findMany({ where: { projectId }, orderBy: { order: 'asc' } });
        const salesEstimates = await prisma.salesEstimate.findMany({ where: { projectId } });

        // 저장 권한이 있는 사람에게만, 아직 저장되지 않은 기본행을 화면용으로
        // 돌려준다. GET은 어떤 경우에도 DB에 기본행을 쓰지 않는다.
        if (isProjectWriteRole(accessResult.role)) {
            if (plans.length === 0) plans = createInitialFundingPlans(projectId);
        }

        plans = buildFundingPlansWithSales({ plans, salesEstimates }) as typeof plans;

        return NextResponse.json({ plans, sources, canWrite: isProjectWriteRole(accessResult.role) });
    } catch (error) {
        console.error('Funding GET error:', error);
        return NextResponse.json({ error: '자금계획 데이터를 불러오지 못했습니다.' }, { status: 500 });
    }
}

// POST: 자금 계획 일괄 저장
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const { id: projectId } = await props.params;
    const accessResult = await requireProjectAccess(request, projectId, { write: request.method !== 'GET' });
    if (accessResult instanceof NextResponse) return accessResult;
    try {
        const body = fundingBodySchema.parse(await request.json());
        const { plans, sources } = body;

        // 키가 없으면 그 컬렉션은 손대지 않는다. 빈 배열은 의도적 초기화로 본다.
        if (!plans && !sources) {
            return NextResponse.json({ error: '저장할 자금계획 데이터가 없습니다.' }, { status: 400 });
        }

        const [savedPlans, savedSources] = await prisma.$transaction(async (tx) => {
            if (plans) {
                await tx.fundingPlan.deleteMany({ where: { projectId } });
                if (plans.length > 0) {
                    // 예전에는 {...p} 로 클라이언트가 준 임의 필드(id, createdAt 등)가
                    // 그대로 들어갔다. 화이트리스트로 옮겨 담는다.
                    await tx.fundingPlan.createMany({
                        data: plans.map((p) => ({
                            projectId,
                            category: p.category,
                            item: p.item,
                            year1: p.year1,
                            year2: p.year2,
                            year3: p.year3,
                            order: p.order,
                        })),
                    });
                }
            }
            if (sources) {
                await tx.fundingSource.deleteMany({ where: { projectId } });
                if (sources.length > 0) {
                    await tx.fundingSource.createMany({
                        data: sources.map((s) => ({
                            projectId,
                            category: s.category,
                            year1: s.year1,
                            year2: s.year2,
                            year3: s.year3,
                            order: s.order,
                        })),
                    });
                }
            }
            return Promise.all([
                tx.fundingPlan.findMany({ where: { projectId }, orderBy: { order: 'asc' } }),
                tx.fundingSource.findMany({ where: { projectId }, orderBy: { order: 'asc' } }),
            ]);
        });

        return NextResponse.json({ plans: savedPlans, sources: savedSources });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
        }
        console.error('Funding POST error:', error);
        return NextResponse.json({ error: '자금계획 데이터를 저장하지 못했습니다.' }, { status: 500 });
    }
}
