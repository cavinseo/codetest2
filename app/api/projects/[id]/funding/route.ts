import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { isProjectWriteRole, requireProjectAccess } from '@/lib/authorization';
import { buildFundingPlansWithSales } from '@/lib/worksheet-links';
import { fundingBodySchema } from '@/lib/bulk-save-schemas';
import { invalidJsonBodyResponse, readJsonBody } from '@/lib/request-body';
import { createLogger } from '@/lib/logger';
import { assertWorksheetRevision, worksheetRevision, worksheetRevisionErrorResponse } from '@/lib/worksheet-revision';

const log = createLogger('api/funding');

const FUNDING_ORDER = [{ order: 'asc' as const }, { id: 'asc' as const }];

// 소요계획과 조달계획은 화면이 따로 저장한다. 한쪽 저장이 다른 쪽 화면을 충돌로
// 막지 않도록 개정값도 컬렉션별로 둔다. 두 컬렉션을 한 번에 보낼 때는 둘을 묶은 값을 쓴다.
// 개정값은 화면용 기본행·매출 연동 전에 DB 에서 읽은 행으로 만든다.
function fundingRevisions(plans: unknown[], sources: unknown[]) {
    return {
        plans: worksheetRevision(plans),
        sources: worksheetRevision(sources),
        all: worksheetRevision([plans, sources]),
    };
}

function writtenCollectionRows(
    written: { plans: boolean; sources: boolean },
    current: { plans: unknown[]; sources: unknown[] }
): unknown[] {
    if (written.plans && written.sources) return [current.plans, current.sources];
    return written.plans ? current.plans : current.sources;
}

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
    const accessResult = await requireProjectAccess(request, projectId, { write: false });
    if (accessResult instanceof NextResponse) return accessResult;
    try {
        let plans = await prisma.fundingPlan.findMany({ where: { projectId }, orderBy: FUNDING_ORDER });
        const sources = await prisma.fundingSource.findMany({ where: { projectId }, orderBy: FUNDING_ORDER });
        const salesEstimates = await prisma.salesEstimate.findMany({ where: { projectId } });
        const revisions = fundingRevisions(plans, sources);

        // 저장 권한이 있는 사람에게만, 아직 저장되지 않은 기본행을 화면용으로
        // 돌려준다. GET은 어떤 경우에도 DB에 기본행을 쓰지 않는다.
        if (isProjectWriteRole(accessResult.role)) {
            if (plans.length === 0) plans = createInitialFundingPlans(projectId);
        }

        plans = buildFundingPlansWithSales({ plans, salesEstimates }) as typeof plans;

        return NextResponse.json({ plans, sources, revisions, canWrite: isProjectWriteRole(accessResult.role) });
    } catch (error) {
        log.error('Funding GET error', error);
        return NextResponse.json({ error: '자금계획 데이터를 불러오지 못했습니다.' }, { status: 500 });
    }
}

// POST: 자금 계획 일괄 저장
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const { id: projectId } = await props.params;
    const accessResult = await requireProjectAccess(request, projectId, { write: true });
    if (accessResult instanceof NextResponse) return accessResult;
    try {
        const body = fundingBodySchema.parse(await readJsonBody(request));
        const { plans, sources } = body;

        // 키가 없으면 그 컬렉션은 손대지 않는다. 빈 배열은 의도적 초기화로 본다.
        if (!plans && !sources) {
            return NextResponse.json({ error: '저장할 자금계획 데이터가 없습니다.' }, { status: 400 });
        }

        // 화면이 읽은 뒤 다른 사람이 저장했으면 전체 교체가 그 입력을 지우므로 409 로 막는다(감리 B3).
        const [savedPlans, savedSources] = await prisma.$transaction(async (tx) => {
            const [currentPlans, currentSources] = await Promise.all([
                tx.fundingPlan.findMany({ where: { projectId }, orderBy: FUNDING_ORDER }),
                tx.fundingSource.findMany({ where: { projectId }, orderBy: FUNDING_ORDER }),
            ]);
            assertWorksheetRevision(request, writtenCollectionRows(
                { plans: Boolean(plans), sources: Boolean(sources) },
                { plans: currentPlans, sources: currentSources }
            ));
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
                tx.fundingPlan.findMany({ where: { projectId }, orderBy: FUNDING_ORDER }),
                tx.fundingSource.findMany({ where: { projectId }, orderBy: FUNDING_ORDER }),
            ]);
        }, { isolationLevel: 'Serializable' });

        return NextResponse.json({
            plans: savedPlans,
            sources: savedSources,
            revisions: fundingRevisions(savedPlans, savedSources),
        });
    } catch (error) {
        const invalidBody = invalidJsonBodyResponse(error);
        if (invalidBody) return invalidBody;
        const revisionResponse = worksheetRevisionErrorResponse(error);
        if (revisionResponse) return revisionResponse;
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
        }
        log.error('Funding POST error', error);
        return NextResponse.json({ error: '자금계획 데이터를 저장하지 못했습니다.' }, { status: 500 });
    }
}
