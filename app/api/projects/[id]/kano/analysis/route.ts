import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';
import { createLogger } from '@/lib/logger';
import { KANO_ANSWER_SCORE } from '@/lib/constants';
import {
    aggregateKanoResponses,
    calculateBetterWorse,
    getTimkoCategory,
    getSatisfactionQuadrant,
} from '@/lib/kano-algorithm';

const log = createLogger('api/kano/analysis');

// GET: Kano 遺꾩꽍 寃곌낵 議고쉶
export async function GET(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const params = await props.params;
    try {
        const projectId = params.id;
        const accessResult = await requireProjectAccess(request, projectId, { write: request.method !== 'GET' });
        if (accessResult instanceof NextResponse) return accessResult;

        const projectResponses = await prisma.kanoResponse.findMany({
            where: { projectId },
        });

        if (projectResponses.length === 0) {
            return NextResponse.json({
                totalResponses: 0,
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
            const timkoCategory = getTimkoCategory(better);
            const quadrant = getSatisfactionQuadrant(better, worse);

            return {
                requirementId: reqId,
                responseCount: responses.length,
                aggregated,
                better: Math.round(better * 100) / 100,
                worse: Math.round(worse * 100) / 100,
                timkoCategory,
                quadrant,
            };
        });

        results.sort((a, b) => b.better - a.better);

        return NextResponse.json({
            totalResponses: projectResponses.length,
            uniqueRespondents: new Set(projectResponses.map((r: any) => r.invitationId)).size,
            requirements: results,
        });
    } catch (error: unknown) {
        log.error('Kano 遺꾩꽍 ?ㅻ쪟', error);
        return NextResponse.json({ error: 'Kano 遺꾩꽍 ?ㅽ뙣' }, { status: 500 });
    }
}
