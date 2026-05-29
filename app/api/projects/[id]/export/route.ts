import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';
import { createLogger } from '@/lib/logger';

const log = createLogger('api/export');

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: projectId } = await params;
    const accessResult = await requireProjectAccess(request, projectId, { write: request.method !== 'GET' });
    if (accessResult instanceof NextResponse) return accessResult;

    try {
        const project = await prisma.project.findUnique({
            where: { id: projectId },
            include: {
                specFunctions: true,
                productAttributes: true,
                attributeFitnesses: true,
                requirements: true,
                technicalCharacteristics: true,
                qfdMatrices: true,
                kanoResponses: true,
                techCorrelations: true,
                benchmarks: true,
            },
        });

        if (!project) {
            return NextResponse.json(
                { error: '프로젝트를 찾을 수 없습니다.' },
                { status: 404 }
            );
        }

        const exportData = {
            project: {
                name: project.name,
                description: project.description,
                detailedDescription: project.detailedDescription,
            },
            specFunctions: project.specFunctions,
            productAttributes: project.productAttributes,
            attributeFitnesses: project.attributeFitnesses,
            customerRequirements: project.requirements,
            technicalCharacteristics: project.technicalCharacteristics,
            qfdRelationships: project.qfdMatrices, // schema use qfdMatrices
            kanoResponses: project.kanoResponses,
            techCorrelations: project.techCorrelations,
            benchmarks: project.benchmarks,
            exportedAt: new Date().toISOString(),
            version: '1.0-prisma',
        };

        return NextResponse.json(exportData);
    } catch (error: unknown) {
        log.error('Export error', error);
        return NextResponse.json(
            { error: '데이터 내보내기에 실패했습니다.' },
            { status: 500 }
        );
    }
}
