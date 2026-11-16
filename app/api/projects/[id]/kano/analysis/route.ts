import { groupRequirementsByCategory } from '@/lib/requirements-table-utils';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';
import { getKanoAnalysisAccess } from '@/lib/kano-analysis-access';
import { createLogger } from '@/lib/logger';
import { countProjectResponses, countUniqueProjectRespondents } from '@/lib/kano-analysis-stats';
import {
    aggregateKanoResponses,
    calculateBetterWorse,
    calculateSatisfactionGraphWeight,
    getWeightedTimkoCategory,
    getSatisfactionQuadrant,
} from '@/lib/kano-algorithm';
import { invalidJsonBodyResponse, readJsonBody } from '@/lib/request-body';
import { resolveKanoWeight } from '@/lib/kano-weight';

const log = createLogger('api/kano/analysis');

// GET: Kano 분석 결과 조회
export async function GET(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const params = await props.params;
    try {
        const projectId = params.id;
        const accessResult = await requireProjectAccess(request, projectId, { write: false });
        if (accessResult instanceof NextResponse) return accessResult;

        const permissions = getKanoAnalysisAccess(accessResult);
        if (request.nextUrl.searchParams.get('view') === 'summary') {
            const responses = await prisma.kanoResponse.findMany({
                where: { projectId, project: { id: projectId }, requirement: { projectId }, invitation: { projectId } },
                select: { invitationId: true, respondentEmail: true },
            });
            return NextResponse.json({
                ...permissions,
                totalResponses: countProjectResponses(responses),
                uniqueRespondents: countUniqueProjectRespondents(responses),
            });
        }
        if (!permissions.canRead) {
            return NextResponse.json({ error: 'Kano 분석은 담당 멘토와 관리자만 열람할 수 있습니다.' }, { status: 403 });
        }

        const projectResponses = await prisma.kanoResponse.findMany({
            where: {
                projectId,
                project: { id: projectId },
                requirement: { projectId },
                invitation: { projectId },
            },
        });
        const requirements = groupRequirementsByCategory(await prisma.customerRequirement.findMany({
            where: { projectId },
            select: { id: true, kanoWeight: true, order: true, category: true, subcategory: true },
            orderBy: { order: 'asc' },
        }));
        const requirementWeights = new Map(requirements.map((req: any) => [req.id, req.kanoWeight]));
        const requirementOrder = new Map(requirements.map((req: any, index: number) => [req.id, req.order ?? index]));

        if (projectResponses.length === 0) {
            return NextResponse.json({
                totalResponses: 0,
                uniqueRespondents: 0,
                requirements: [],
            });
        }

        const requirementMap = new Map<string, any[]>();
        projectResponses.forEach((response: any) => {
            const existing = requirementMap.get(response.requirementId) || [];
            requirementMap.set(response.requirementId, [...existing, response]);
        });

        const results = Array.from(requirementMap.entries()).map(([reqId, responses]) => {
            const mappedResponses = responses.map((r: any) => ({
                positive: (r.positiveAnswer || 3) as 1 | 2 | 3 | 4 | 5,
                negative: (r.negativeAnswer || 3) as 1 | 2 | 3 | 4 | 5,
            }));

            const aggregated = aggregateKanoResponses(mappedResponses);
            const { better, worse } = calculateBetterWorse(aggregated);
            const autoKanoWeight = calculateSatisfactionGraphWeight(better, worse);
            const savedKanoWeight = requirementWeights.get(reqId);
            const quadrant = getSatisfactionQuadrant(better, worse);
            const kanoWeight = resolveKanoWeight(savedKanoWeight, autoKanoWeight);
            const timkoCategory = getWeightedTimkoCategory(kanoWeight);

            return {
                requirementId: reqId,
                responseCount: responses.length,
                aggregated,
                better: Math.round(better * 100) / 100,
                worse: Math.round(worse * 100) / 100,
                kanoWeight,
                autoKanoWeight,
                timkoCategory,
                quadrant,
            };
        });

        results.sort((a, b) => {
            const aOrder = requirementOrder.get(a.requirementId) ?? Number.MAX_SAFE_INTEGER;
            const bOrder = requirementOrder.get(b.requirementId) ?? Number.MAX_SAFE_INTEGER;
            return aOrder - bOrder;
        });

        return NextResponse.json({
            totalResponses: countProjectResponses(projectResponses),
            uniqueRespondents: countUniqueProjectRespondents(projectResponses),
            requirements: results,
        });
    } catch (error: unknown) {
        log.error('Kano 분석 오류', error);
        return NextResponse.json({ error: 'Kano 분석 실패' }, { status: 500 });
    }
}

export async function PATCH(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const params = await props.params;
    try {
        const projectId = params.id;
        const accessResult = await requireProjectAccess(request, projectId, { write: true });
        if (accessResult instanceof NextResponse) return accessResult;

        if (!getKanoAnalysisAccess(accessResult).canEdit) {
            return NextResponse.json({ error: 'Kano 분석은 담당 멘토만 수정할 수 있습니다.' }, { status: 403 });
        }

        const body = await readJsonBody(request);
        const updates = Array.isArray(body.weights) ? body.weights : [];

        await prisma.$transaction(
            updates.map((item: any) => {
                const weight = item.kanoWeight === null || item.kanoWeight === ''
                    ? null
                    : Number(item.kanoWeight);
                return prisma.customerRequirement.updateMany({
                    where: { id: String(item.requirementId), projectId },
                    data: { kanoWeight: Number.isFinite(weight) ? weight : null },
                });
            })
        );

        return NextResponse.json({ success: true, count: updates.length });
    } catch (error: unknown) {
        const invalidBody = invalidJsonBodyResponse(error);
        if (invalidBody) return invalidBody;
        log.error('Kano 가중치 저장 오류', error);
        return NextResponse.json({ error: 'Kano 가중치 저장 실패' }, { status: 500 });
    }
}
