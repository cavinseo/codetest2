import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import { classifyKano } from '@/lib/kano';

const log = createLogger('api/qfd/analysis');



// GET: QFD 종합 분석 (Kano 가중치 연동)
export async function GET(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const params = await props.params;
    const projectId = params.id;

    try {
        const [reqs, techs, rels, responses] = await Promise.all([
            prisma.customerRequirement.findMany({ where: { projectId } }),
            prisma.technicalCharacteristic.findMany({ where: { projectId } }),
            prisma.qFDMatrix.findMany({ where: { projectId } }),
            prisma.kanoResponse.findMany({ where: { projectId } }),
        ]);

        const requirementAnalysis = reqs.map((req: any) => {
            const reqResponses = responses.filter((r: any) => r.requirementId === req.id);
            const categories = { M: 0, O: 0, A: 0, I: 0, R: 0, Q: 0 };
            reqResponses.forEach((r: any) => {
                const functional = r.functionalAnswer as string;
                const dysfunctional = r.dysfunctionalAnswer as string;
                const cat = classifyKano(functional, dysfunctional) as keyof typeof categories;
                if (categories[cat] !== undefined) categories[cat]++;
            });

            const total = reqResponses.length || 1;
            const better = (categories.A + categories.O) / total;
            const worse = -1 * (categories.O + categories.M) / total;
            const kanoCategory = Object.entries(categories).sort((a, b) => b[1] - a[1])[0][0];

            const categoryWeights: Record<string, number> = {
                M: 4, O: 5, A: 3, I: 1, R: 0, Q: 0,
            };
            const importance = reqResponses.length > 0
                ? Math.round((categoryWeights[kanoCategory] + Math.abs(worse) * 3) * 10) / 10
                : 3;

            return {
                requirementId: req.id,
                category: req.category,
                requirement: req.requirement,
                responseCount: reqResponses.length,
                kanoCategory,
                categories,
                better: Math.round(better * 100) / 100,
                worse: Math.round(worse * 100) / 100,
                importance: Math.min(importance, 10),
            };
        });

        const strengthScore: Record<string, number> = { STRONG: 9, MEDIUM: 3, WEAK: 1, NONE: 0 };

        const technicalAnalysis = techs.map((tech: any) => {
            let totalScore = 0;
            reqs.forEach((req: any) => {
                const rel = rels.find((r: any) => r.requirementId === req.id && r.technicalCharId === tech.id);
                const strength = rel ? rel.strength : 'NONE';
                const relScore = strengthScore[strength] || 0;
                const reqAnalysis = requirementAnalysis.find((a: any) => a.requirementId === req.id);
                const importance = reqAnalysis?.importance || 3;
                totalScore += relScore * importance;
            });

            return {
                technicalCharId: tech.id,
                name: tech.name,
                unit: tech.unit,
                targetValue: tech.targetValue,
                totalScore: Math.round(totalScore * 10) / 10,
                rank: 0,
            };
        });

        const sorted = [...technicalAnalysis].sort((a: any, b: any) => b.totalScore - a.totalScore);
        technicalAnalysis.forEach((t: any) => {
            t.rank = sorted.findIndex((s: any) => s.technicalCharId === t.technicalCharId) + 1;
        });

        return NextResponse.json({
            requirements: requirementAnalysis,
            technicals: technicalAnalysis,
            totalResponses: responses.length,
            totalRequirements: reqs.length,
            totalTechnicals: techs.length,
        });
    } catch (error: unknown) {
        log.error('QFD 분석 오류', error);
        return NextResponse.json({ error: 'QFD 분석 실패' }, { status: 500 });
    }
}
