import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';
import { createLogger } from '@/lib/logger';
import {
    aggregateKanoResponses,
    calculateBetterWorse,
    type KanoAnswer,
    type KanoCategory,
} from '@/lib/kano-algorithm';
import {
    calculateQfdWorksheet,
    calculateSatisfactionGraphWeight,
} from '@/lib/qfd-worksheet';

const log = createLogger('api/qfd/analysis');



// GET: QFD 醫낇빀 遺꾩꽍 (Kano 媛以묒튂 ?곕룞)
export async function GET(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const params = await props.params;
    const projectId = params.id;
    const accessResult = await requireProjectAccess(request, projectId, { write: request.method !== 'GET' });
    if (accessResult instanceof NextResponse) return accessResult;

    try {
        const [reqs, techs, rels, responses, benchmarks] = await Promise.all([
            prisma.customerRequirement.findMany({ where: { projectId }, orderBy: { order: 'asc' } }),
            prisma.technicalCharacteristic.findMany({ where: { projectId }, orderBy: { name: 'asc' } }),
            prisma.qFDMatrix.findMany({ where: { projectId } }),
            prisma.kanoResponse.findMany({ where: { projectId } }),
            prisma.benchmark.findMany({ where: { projectId } }),
        ]);

        const requirementAnalysis = reqs.map((req: any) => {
            const reqResponses = responses.filter((r: any) => r.requirementId === req.id);
            const responsePairs = reqResponses.map((r: any) => ({
                positive: r.positiveAnswer as KanoAnswer,
                negative: r.negativeAnswer as KanoAnswer,
            }));
            const counts = aggregateKanoResponses(responsePairs);
            const { better, worse } = calculateBetterWorse(counts);
            const kanoCategory = counts.total > 0
                ? counts.dominantCategory
                : (reqResponses[0]?.kanoCategory as KanoCategory | undefined) ?? 'I';
            const importance = calculateSatisfactionGraphWeight(better, worse);

            return {
                id: req.id,
                requirementId: req.id,
                category: req.category,
                subcategory: req.subcategory,
                requirement: req.requirement,
                responseCount: reqResponses.length,
                kanoCategory,
                categories: counts,
                better,
                worse,
                importance,
            };
        });

        const worksheet = calculateQfdWorksheet({
            requirements: requirementAnalysis,
            technicals: techs.map((tech: any) => ({
                id: tech.id,
                name: tech.name,
                unit: tech.unit,
                targetValue: tech.targetValue,
            })),
            relationships: rels.map((rel: any) => ({
                requirementId: rel.requirementId,
                technicalCharId: rel.technicalCharId,
                strength: rel.strength,
            })),
            benchmarks: benchmarks.map((benchmark: any) => ({
                requirementId: benchmark.requirementId,
                company: benchmark.company,
                score: benchmark.score,
            })),
        });

        return NextResponse.json({
            requirements: worksheet.requirements,
            technicals: worksheet.technicals,
            totals: worksheet.totals,
            totalResponses: responses.length,
            totalRequirements: reqs.length,
            totalTechnicals: techs.length,
        });
    } catch (error: unknown) {
        log.error('QFD 遺꾩꽍 ?ㅻ쪟', error);
        return NextResponse.json({ error: 'QFD 遺꾩꽍 ?ㅽ뙣' }, { status: 500 });
    }
}
