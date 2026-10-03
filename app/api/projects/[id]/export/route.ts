import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';
import { createLogger } from '@/lib/logger';
import { resolveWorksheetExcelId, WORKSHEET_EXCEL_SHEETS } from '@/lib/worksheet-excel-sheets';
import { kanoSurveyFileNameStem } from '@/lib/kano-survey-document';

const log = createLogger('api/export');

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: projectId } = await params;
    const accessResult = await requireProjectAccess(request, projectId, { write: request.method !== 'GET' });
    if (accessResult instanceof NextResponse) return accessResult;

    const isExcel = request.nextUrl.searchParams.get('format') === 'xlsx';
    const requestedWorksheet = request.nextUrl.searchParams.get('worksheet');
    const worksheetId = requestedWorksheet ? resolveWorksheetExcelId(requestedWorksheet) : undefined;
    if (isExcel && requestedWorksheet && !worksheetId) {
        return NextResponse.json({ error: '지원하지 않는 워크시트입니다.' }, { status: 400 });
    }

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
                technicalBenchmarks: true,
                techTreeEntries: true,
                improvementItems: true,
                targetSpecs: true,
                techRoadmaps: true,
                salesEstimates: true,
                assetItems: true,
                fundingPlans: true,
                fundingSources: true,
                fitnessMatrix: true,
            },
        });

        if (!project) {
            return NextResponse.json(
                { error: '프로젝트를 찾을 수 없습니다.' },
                { status: 404 }
            );
        }

        if (isExcel) {
            const { buildWorksheetExcel } = await import('@/lib/worksheet-excel');
            const buffer = await buildWorksheetExcel(project, worksheetId);
            const output = new ArrayBuffer(buffer.byteLength);
            new Uint8Array(output).set(buffer);
            const sheetName = WORKSHEET_EXCEL_SHEETS.find(sheet => sheet.id === worksheetId)?.name ?? '전체_워크시트';
            const fileName = encodeURIComponent(`${kanoSurveyFileNameStem(project.name)}_${sheetName}.xlsx`);
            return new NextResponse(output, { headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename*=UTF-8''${fileName}`,
                'Cache-Control': 'no-store',
            } });
        }

        const exportData = {
            project: {
                name: project.name,
                description: project.description,
                detailedDescription: project.detailedDescription,
                additionalMarketData: project.additionalMarketData,
            },
            specFunctions: project.specFunctions,
            specDetailCollapsed: project.specDetailCollapsed,
            productAttributes: project.productAttributes,
            attributeFitnesses: project.attributeFitnesses,
            fitnessMatrix: project.fitnessMatrix,
            customerRequirements: project.requirements,
            technicalCharacteristics: project.technicalCharacteristics,
            qfdRelationships: project.qfdMatrices, // schema use qfdMatrices
            kanoResponses: project.kanoResponses,
            techCorrelations: project.techCorrelations,
            benchmarks: project.benchmarks,
            technicalBenchmarks: project.technicalBenchmarks,
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
