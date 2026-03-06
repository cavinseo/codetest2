import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createLogger } from '@/lib/logger';

const log = createLogger('api/import-json');

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: projectId } = await params;

    try {
        const importData = await request.json();

        if (!importData.version) {
            return NextResponse.json(
                { error: '유효하지 않은 데이터 형식입니다.' },
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

        // 해당 프로젝트의 기존 데이터 삭제 후 새 데이터로 교체 (트랜잭션)
        await prisma.$transaction(async (tx: any) => {
            // 삭제 순서 주의: 외래 키 제약 조건 (onDelete Cascade가 설정되어 있지만 명시적으로 처리하거나 project를 유지하며 하위 데이터만 삭제)
            // 여기서는 project 자체는 유지하고 하위 컬렉션만 교체
            await tx.specFunction.deleteMany({ where: { projectId } });
            await tx.productAttribute.deleteMany({ where: { projectId } });
            await tx.attributeFitness.deleteMany({ where: { projectId } });
            await tx.benchmark.deleteMany({ where: { projectId } });
            await tx.qFDMatrix.deleteMany({ where: { projectId } }); // schema name is QFDMatrix
            await tx.techCorrelation.deleteMany({ where: { projectId } });
            await tx.kanoResponse.deleteMany({ where: { projectId } });
            await tx.technicalCharacteristic.deleteMany({ where: { projectId } });
            await tx.customerRequirement.deleteMany({ where: { projectId } });

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
