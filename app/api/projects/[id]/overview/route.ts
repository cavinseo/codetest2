import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';
import { createLogger } from '@/lib/logger';
import { assertWorksheetRevision, worksheetRevision, WorksheetRevisionConflict, WorksheetRevisionMissing } from '@/lib/worksheet-revision';
import { calculateWorksheetCompleteness } from '@/lib/worksheet-completeness';
import { getProductOverviewImages, validateProductOverview } from '@/lib/product-overview';
import {
    BusinessPlanFileValidationError,
    validateBusinessPlanFileStorageValue,
} from '@/lib/business-plan-file';
import { invalidJsonBodyResponse, readJsonBody } from '@/lib/request-body';

const log = createLogger('api/project/overview');

const overviewSelect = {
    id: true,
    name: true,
    companyName: true,
    // 화면 상단에 누구의 프로젝트인지 보이려고 소유 멘티의 이름만 가져온다(이메일은 내보내지 않는다).
    // 프로젝트에 기업명이 없으면 멘티 프로필의 기업명을 기본값으로 쓰려고 함께 읽는다.
    // 개정값은 overviewRevisionRows 가 편집 대상만 골라 계산하므로 owner 는 비교에 섞이지 않는다.
    owner: { select: { name: true, profile: { select: { companyName: true } } } },
    description: true,
    detailedDescription: true,
    productName: true,
    relatedImages: true,
    productImageDataUrl: true,
    productImageWidthPx: true,
    productImageHeightPx: true,
    marketDefinition: true,
    targetCustomer: true,
    additionalMarketData: true,
    includeAdditionalMarketDataInReport: true,
    businessPlanFile: true,
    createdAt: true,
    updatedAt: true,
} as const;

// 소유자 정보에서 만든 표시값 대신 실제 저장된 편집 대상만 고정 순서로 비교한다.
function overviewRevisionRows(project: object) {
    const values = project as Record<string, unknown>;
    return [Object.fromEntries([
        'name', 'companyName', 'description', 'detailedDescription', 'businessPlanFile',
        'productName', 'relatedImages', 'productImageDataUrl', 'productImageWidthPx', 'productImageHeightPx',
        'marketDefinition', 'targetCustomer', 'additionalMarketData', 'includeAdditionalMarketDataInReport',
    ].map(key => [key, values[key]]))];
}

const updateOverviewSchema = z.object({
    name: z.string().min(1, '프로젝트명을 입력하세요.'),
    companyName: z.string().trim().max(300).optional(),
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
            assetItems,
            fundingPlans,
            fundingSources,
            fitnessMatrix,
        ] = await Promise.all([
            prisma.project.findUnique({
                where: { id: projectId },
                select: overviewSelect,
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
            assetItems,
            fundingPlans,
            fundingSources,
        };

        const worksheetCompleteness = calculateWorksheetCompleteness({
            project,
            counts,
            hasFitnessMatrix: Boolean(fitnessMatrix),
        });

        const { owner, ...projectFields } = project;
        return NextResponse.json({
            revision: worksheetRevision(overviewRevisionRows(project)),
            project: {
                ...projectFields,
                ownerName: owner?.name?.trim() || null,
                companyName: project.companyName ?? owner?.profile?.companyName ?? '',
                relatedImages: getProductOverviewImages(project),
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

        const body = await readJsonBody(request);
        const data = updateOverviewSchema.parse(body);
        let productDetails;
        try { productDetails = validateProductOverview(body); }
        catch { return NextResponse.json({ error: '제품 정보나 이미지를 확인하세요. 관련이미지는 최대 3개, 각각 PNG/JPEG, 최적화 후 1MB 이하만 저장할 수 있습니다.' }, { status: 400 }); }
        const businessPlanFile = data.businessPlanFile === undefined
            ? undefined
            : validateBusinessPlanFileStorageValue(data.businessPlanFile);

        const project = await prisma.$transaction(async tx => {
            const current = await tx.project.findUnique({ where: { id: projectId }, select: overviewSelect });
            if (!current) return null;
            assertWorksheetRevision(request, overviewRevisionRows(current));
            return tx.project.update({
                where: { id: projectId },
                include: { owner: { select: { profile: { select: { companyName: true } } } } },
                data: {
                    ...productDetails,
                    name: data.name.trim(),
                    ...(data.companyName !== undefined ? { companyName: data.companyName } : {}),
                    description: data.description?.trim() || null,
                    detailedDescription: data.detailedDescription?.trim() ? data.detailedDescription : null,
                    ...(businessPlanFile !== undefined ? { businessPlanFile } : {}),
                },
            });
        }, { isolationLevel: 'Serializable' });
        if (!project) return NextResponse.json({ error: 'Project not found.' }, { status: 404 });

        return NextResponse.json({
            revision: worksheetRevision(overviewRevisionRows(project)),
            project: {
                id: project.id,
                name: project.name,
                companyName: project.companyName ?? project.owner.profile?.companyName ?? '',
                description: project.description,
                detailedDescription: project.detailedDescription,
                productName: project.productName,
                relatedImages: getProductOverviewImages(project),
                productImageDataUrl: project.productImageDataUrl,
                productImageWidthPx: project.productImageWidthPx,
                productImageHeightPx: project.productImageHeightPx,
                marketDefinition: project.marketDefinition,
                targetCustomer: project.targetCustomer,
                additionalMarketData: project.additionalMarketData,
                includeAdditionalMarketDataInReport: project.includeAdditionalMarketDataInReport,
                createdAt: project.createdAt.toISOString(),
                updatedAt: project.updatedAt.toISOString(),
            },
        });
    } catch (error: unknown) {
        const invalidBody = invalidJsonBodyResponse(error);
        if (invalidBody) return invalidBody;
        if (error instanceof WorksheetRevisionMissing) return NextResponse.json({ error: '개요 개정값이 없습니다. 새로고침 후 다시 저장하세요.' }, { status: 428 });
        if (error instanceof WorksheetRevisionConflict || (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2034')) {
            return NextResponse.json({ error: '다른 화면에서 개요가 변경되었습니다. 현재 입력은 유지됩니다. 필요한 입력을 복사한 뒤 새로고침하여 최신 내용과 비교하세요.' }, { status: 409 });
        }
        if (error instanceof z.ZodError || error instanceof BusinessPlanFileValidationError) {
            const message = error instanceof z.ZodError ? error.errors[0].message : error.message;
            return NextResponse.json({ error: message }, { status: 400 });
        }
        log.error('Project overview update failed', error);
        return NextResponse.json({ error: 'Project overview update failed.' }, { status: 500 });
    }
}
