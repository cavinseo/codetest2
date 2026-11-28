import { orderRequirementLinkedWorksheets } from '@/lib/requirement-order';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';
import { getKanoAnalysisAccess, isKanoAnalysisWorksheet } from '@/lib/kano-analysis-access';
import { createLogger } from '@/lib/logger';
import { getProductOverviewImages } from '@/lib/product-overview';
import { resolveWorksheetExcelId, WORKSHEET_EXCEL_SHEETS } from '@/lib/worksheet-excel-sheets';
import { kanoSurveyFileNameStem } from '@/lib/kano-survey-document';
import { finalReportSourceRevision, REPORT_SOURCE_INCLUDE } from '@/lib/final-report-source-revision';

const log = createLogger('api/export');

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: projectId } = await params;
    const accessResult = await requireProjectAccess(request, projectId, { write: false });
    if (accessResult instanceof NextResponse) return accessResult;

    const isExcel = request.nextUrl.searchParams.get('format') === 'xlsx';
    const requestedWorksheet = request.nextUrl.searchParams.get('worksheet');
    const worksheetId = requestedWorksheet ? resolveWorksheetExcelId(requestedWorksheet) : undefined;
    if (isExcel && requestedWorksheet && !worksheetId) {
        return NextResponse.json({ error: '지원하지 않는 워크시트입니다.' }, { status: 400 });
    }

    const { canRead: canReadKanoAnalysis } = getKanoAnalysisAccess(accessResult);
    if (isExcel && worksheetId && isKanoAnalysisWorksheet(worksheetId) && !canReadKanoAnalysis) {
        return NextResponse.json({ error: 'Kano 분석은 담당 멘토와 관리자만 열람할 수 있습니다.' }, { status: 403 });
    }

    try {
        const storedProject = await prisma.project.findUnique({
            where: { id: projectId },
            // 보고서 소스 리비전과 같은 컬렉션 목록을 쓴다. 이 목록에 devPlans 가 들어 있어야 한다 —
            // WS-14 화면은 없앴지만 행은 DB 에 남아 있고, JSON 복원이 이 컬렉션을 지운 뒤 다시
            // 채우므로 백업에서 빼면 복원 한 번에 사라진다.
            include: REPORT_SOURCE_INCLUDE,
        });

        if (!storedProject) {
            return NextResponse.json(
                { error: '프로젝트를 찾을 수 없습니다.' },
                { status: 404 }
            );
        }

        const sourceRevision = finalReportSourceRevision(storedProject);
        if (request.nextUrl.searchParams.get('revisionOnly') === '1') {
            return NextResponse.json({ sourceRevision }, { headers: { 'Cache-Control': 'no-store' } });
        }

        const project = orderRequirementLinkedWorksheets(storedProject);
        if (isExcel) {
            const { buildWorksheetExcel } = await import('@/lib/worksheet-excel');
            const buffer = await buildWorksheetExcel(project, worksheetId, { includeKanoAnalysis: canReadKanoAnalysis });
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
                companyName: project.companyName,
                productName: project.productName,
                relatedImages: getProductOverviewImages(project),
                productImageDataUrl: project.productImageDataUrl,
                productImageWidthPx: project.productImageWidthPx,
                productImageHeightPx: project.productImageHeightPx,
                marketDefinition: project.marketDefinition,
                targetCustomer: project.targetCustomer,
                businessPlanFile: project.businessPlanFile,
                description: project.description,
                detailedDescription: project.detailedDescription,
                additionalMarketData: project.additionalMarketData,
                // 보고서 반영 여부도 백업에 담아야 복원 뒤 결과보고서 내용이 달라지지 않는다.
                includeAdditionalMarketDataInReport: project.includeAdditionalMarketDataInReport,
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
            techTreeEntries: project.techTreeEntries,
            improvementItems: project.improvementItems,
            targetSpecs: project.targetSpecs,
            techRoadmaps: project.techRoadmaps,
            devPlans: project.devPlans,
            salesEstimates: project.salesEstimates,
            assetItems: project.assetItems,
            fundingPlans: project.fundingPlans,
            fundingSources: project.fundingSources,
            exportedAt: new Date().toISOString(),
            version: '1.1-prisma',
            sourceRevision,
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
