import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';
import { createLogger } from '@/lib/logger';
import { calculateWorksheetCompleteness } from '@/lib/worksheet-completeness';
import {
    BusinessPlanFileValidationError,
    validateBusinessPlanFileStorageValue,
} from '@/lib/business-plan-file';

const log = createLogger('api/project/overview');

const updateOverviewSchema = z.object({
    name: z.string().min(1, '프로젝트명을 입력하세요.'),
    description: z.string().optional(),
    detailedDescription: z.string().optional(),
    businessPlanFile: z.string().nullable().optional(),
});

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: projectId } = await params;
        const accessResult = await requireProjectAccess(request, projectId, { write: false });
        if (accessResult instanceof NextResponse) return accessResult;

        const [
            project,
            salesEstimates,
            specFunctions,
            productAttributes,
            attributeFitnesses,
            requirements,
            kanoResponses,
            technicalCharacteristics,
            qfdRelationships,
            techTreeEntries,
            improvementItems,
            targetSpecs,
            techRoadmaps,
            devPlans,
            assetItems,
            fundingPlans,
            fundingSources,
            fitnessMatrix,
        ] = await Promise.all([
            prisma.project.findUnique({
                where: { id: projectId },
                select: {
                    id: true,
                    name: true,
                    description: true,
                    detailedDescription: true,
                    businessPlanFile: true,
                    createdAt: true,
                    updatedAt: true,
                },
            }),
            prisma.salesEstimate.count({ where: { projectId } }),
            prisma.specFunction.count({ where: { projectId } }),
            prisma.productAttribute.count({ where: { projectId } }),
            prisma.attributeFitness.count({ where: { projectId } }),
            prisma.customerRequirement.count({ where: { projectId } }),
            prisma.kanoResponse.count({ where: { projectId } }),
            prisma.technicalCharacteristic.count({ where: { projectId } }),
            prisma.qFDMatrix.count({ where: { projectId, NOT: { strength: 'NONE' } } }),
            prisma.techTreeEntry.count({ where: { projectId } }),
            prisma.improvementItem.count({ where: { projectId } }),
            prisma.targetSpec.count({ where: { projectId } }),
            prisma.techRoadmap.count({ where: { projectId } }),
            prisma.devPlan.count({ where: { projectId } }),
            prisma.assetItem.count({ where: { projectId } }),
            prisma.fundingPlan.count({ where: { projectId } }),
            prisma.fundingSource.count({ where: { projectId } }),
            prisma.fitnessMatrix.findUnique({
                where: { projectId },
                select: { id: true },
            }),
        ]);

        if (!project) {
            return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
        }

        const counts = {
            salesEstimates,
            specFunctions,
            productAttributes,
            attributeFitnesses,
            requirements,
            kanoResponses,
            technicalCharacteristics,
            qfdRelationships,
            techTreeEntries,
            improvementItems,
            targetSpecs,
            techRoadmaps,
            devPlans,
            assetItems,
            fundingPlans,
            fundingSources,
        };

        const worksheetCompleteness = calculateWorksheetCompleteness({
            project,
            counts,
            hasFitnessMatrix: Boolean(fitnessMatrix),
        });

        return NextResponse.json({
            project: {
                ...project,
                role: accessResult.role,
                createdAt: project.createdAt.toISOString(),
                updatedAt: project.updatedAt.toISOString(),
            },
            counts,
            worksheetCompleteness,
        });
    } catch (error: unknown) {
        log.error('Project overview fetch failed', error);
        return NextResponse.json({ error: 'Project overview fetch failed.' }, { status: 500 });
    }
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: projectId } = await params;
        const accessResult = await requireProjectAccess(request, projectId, { write: true });
        if (accessResult instanceof NextResponse) return accessResult;

        const body = await request.json();
        const data = updateOverviewSchema.parse(body);
        const businessPlanFile = data.businessPlanFile === undefined
            ? undefined
            : validateBusinessPlanFileStorageValue(data.businessPlanFile);

        const project = await prisma.project.update({
            where: { id: projectId },
            data: {
                name: data.name.trim(),
                description: data.description?.trim() || null,
                detailedDescription: data.detailedDescription?.trim() || null,
                ...(businessPlanFile !== undefined ? { businessPlanFile } : {}),
            },
        });

        return NextResponse.json({
            project: {
                id: project.id,
                name: project.name,
                description: project.description,
                detailedDescription: project.detailedDescription,
                createdAt: project.createdAt.toISOString(),
                updatedAt: project.updatedAt.toISOString(),
            },
        });
    } catch (error: unknown) {
        if (error instanceof z.ZodError || error instanceof BusinessPlanFileValidationError) {
            const message = error instanceof z.ZodError ? error.errors[0].message : error.message;
            return NextResponse.json({ error: message }, { status: 400 });
        }
        log.error('Project overview update failed', error);
        return NextResponse.json({ error: 'Project overview update failed.' }, { status: 500 });
    }
}
