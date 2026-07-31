import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';
import { createLogger } from '@/lib/logger';
import { importDeletionPlan, importHasAnyData } from '@/lib/import-json-plan';

const log = createLogger('api/import-json');

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: projectId } = await params;
    const accessResult = await requireProjectAccess(request, projectId, { write: request.method !== 'GET' });
    if (accessResult instanceof NextResponse) return accessResult;

    try {
        const importData = await request.json();

        if (!importData.version) {
            return NextResponse.json(
                { error: '유효하지 않은 데이터 형식입니다.' },
                { status: 400 }
            );
        }

        // 최소 하나의 데이터 배열이 있어야 import 허용 (빈 payload로 전체 삭제 방지)
        if (!importHasAnyData(importData)) {
            return NextResponse.json(
                { error: '가져올 데이터가 없습니다.' },
                { status: 400 }
            );
        }

        const project = await prisma.project.findUnique({
            where: { id: projectId },
        });

        if (!project) {
            return NextResponse.json(
                { error: '프로젝트를 찾을 수 없습니다.' },
                { status: 404 }
            );
        }

        // 해당 프로젝트의 기존 데이터를 삭제하고 새 데이터로 교체(트랜잭션)
        // 중요: payload에 실제로 포함된 컬렉션만 삭제합니다. 부분 payload가
        // 무관한 컬렉션(고객요구/설문응답/벤치마크 등)을 전부 지우던 문제를 방지.
        await prisma.$transaction(async (tx: any) => {
            for (const model of importDeletionPlan(importData)) {
                await tx[model].deleteMany({ where: { projectId } });
            }

            // 새 데이터 삽입
            if (importData.customerRequirements?.length > 0) {
                await tx.customerRequirement.createMany({
                    data: importData.customerRequirements.map((r: any) => ({ ...r, projectId })),
                });
            }
            if (importData.technicalCharacteristics?.length > 0) {
                await tx.technicalCharacteristic.createMany({
                    data: importData.technicalCharacteristics.map((t: any) => ({ ...t, projectId })),
                });
            }
            if (importData.specFunctions?.length > 0) {
                await tx.specFunction.createMany({
                    data: importData.specFunctions.map((s: any) => ({ ...s, projectId })),
                });
            }
            if (importData.productAttributes?.length > 0) {
                await tx.productAttribute.createMany({
                    data: importData.productAttributes.map((a: any) => ({ ...a, projectId })),
                });
            }
            if (importData.attributeFitnesses?.length > 0) {
                await tx.attributeFitness.createMany({
                    data: importData.attributeFitnesses.map((f: any) => ({ ...f, projectId })),
                });
            }
            if (importData.qfdRelationships?.length > 0) {
                // schema use qfdMatrices, fields might differ, check naming
                await tx.qFDMatrix.createMany({
                    data: importData.qfdRelationships.map((q: any) => ({
                        id: q.id,
                        projectId,
                        requirementId: q.requirementId,
                        technicalCharId: q.technicalCharId,
                        relationship: q.strength || q.relationship,
                    })),
                });
            }
            if (importData.kanoResponses?.length > 0) {
                await tx.kanoResponse.createMany({
                    data: importData.kanoResponses.map((k: any) => ({
                        ...k,
                        projectId,
                        positiveAnswer: k.positiveAnswer ?? (k.functionalAnswer === 'LIKE' ? 1 : 3), // handle legacy
                        negativeAnswer: k.negativeAnswer ?? (k.dysfunctionalAnswer === 'DISLIKE' ? 5 : 3),
                        kanoCategory: k.kanoCategory ?? k.category,
                    })),
                });
            }

            // 프로젝트 기본 정보 업데이트
            if (importData.project) {
                await tx.project.update({
                    where: { id: projectId },
                    data: {
                        description: importData.project.description,
                        detailedDescription: importData.project.detailedDescription,
                    },
                });
            }
        });

        log.info('Data imported successfully', { projectId });

        return NextResponse.json({
            success: true,
            message: '데이터를 성공적으로 가져왔습니다.',
            imported: {
                specFunctions: importData.specFunctions?.length || 0,
                productAttributes: importData.productAttributes?.length || 0,
                attributeFitnesses: importData.attributeFitnesses?.length || 0,
                customerRequirements: importData.customerRequirements?.length || 0,
                technicalCharacteristics: importData.technicalCharacteristics?.length || 0,
                qfdRelationships: importData.qfdRelationships?.length || 0,
                kanoResponses: importData.kanoResponses?.length || 0,
            },
        });
    } catch (error: unknown) {
        log.error('Import error', error);
        return NextResponse.json(
            { error: '데이터 가져오기에 실패했습니다.' },
            { status: 500 }
        );
    }
}
