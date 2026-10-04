// 저장된 데이터를 분석하고 워크시트별 엑셀 양식을 하나의 워크북으로 조립한다.
import ExcelJS from 'exceljs';
import type { Prisma } from '@prisma/client';
import { aggregateKanoResponses, calculateBetterWorse, calculateSatisfactionGraphWeight, type KanoAnswer } from './kano-algorithm';
import { calculateQfdWorksheet } from './qfd-worksheet';
import { WORKSHEET_EXCEL_SHEETS, type WorksheetExcelId } from './worksheet-excel-sheets';
import { createWorksheet, sortByOrder } from './worksheet-excel-layout';
import { writeWorksheetContents } from './worksheet-excel-writers';

export type WorksheetExcelProject = Prisma.ProjectGetPayload<{ include: {
    specFunctions: true; productAttributes: true; attributeFitnesses: true; requirements: true;
    technicalCharacteristics: true; qfdMatrices: true; kanoResponses: true; techCorrelations: true;
    benchmarks: true; technicalBenchmarks: true; techTreeEntries: true; improvementItems: true;
    targetSpecs: true; techRoadmaps: true; salesEstimates: true; assetItems: true;
    fundingPlans: true; fundingSources: true; fitnessMatrix: true;
} }>;

function prepareWorksheetData(project: WorksheetExcelProject) {
    const requirements = sortByOrder(project.requirements);
    const responsesByRequirement = new Map<string, typeof project.kanoResponses>();
    project.kanoResponses.forEach(response => {
        const requirementResponses = responsesByRequirement.get(response.requirementId) ?? [];
        requirementResponses.push(response);
        responsesByRequirement.set(response.requirementId, requirementResponses);
    });
    const kanoAnalysis = requirements.map(requirement => {
        const responses = responsesByRequirement.get(requirement.id) ?? [];
        const counts = aggregateKanoResponses(responses.map(response => ({ positive: response.positiveAnswer as KanoAnswer, negative: response.negativeAnswer as KanoAnswer })));
        const { better, worse } = calculateBetterWorse(counts);
        const autoKanoWeight = responses.length ? calculateSatisfactionGraphWeight(better, worse) : 0;
        return {
            requirement, counts, better, worse, autoKanoWeight,
            timkoWeight: requirement.kanoWeight ?? autoKanoWeight,
            qfdWeight: requirement.kanoWeight != null && requirement.kanoWeight > 0 ? requirement.kanoWeight : autoKanoWeight,
        };
    });
    const technicalCharacteristics = [...project.technicalCharacteristics].filter(row => row.name.trim()).sort((a, b) => a.groupIndex - b.groupIndex || a.columnOrder - b.columnOrder || a.name.localeCompare(b.name));
    const qfdAnalysis = calculateQfdWorksheet({ requirements: kanoAnalysis.map(row => ({ ...row.requirement, importance: row.qfdWeight })), technicals: technicalCharacteristics, relationships: project.qfdMatrices, benchmarks: project.benchmarks });
    return { project, requirements, kanoAnalysis, technicalCharacteristics, qfdAnalysis };
}

export type WorksheetExcelContext = ReturnType<typeof prepareWorksheetData>;

export async function buildWorksheetExcel(project: WorksheetExcelProject, requestedWorksheetId?: WorksheetExcelId): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'KS-QFD';
    workbook.calcProperties.fullCalcOnLoad = true;
    const context = prepareWorksheetData(project);
    const selectedSheets = WORKSHEET_EXCEL_SHEETS.filter(sheet => !requestedWorksheetId || sheet.id === requestedWorksheetId);
    for (const definition of selectedSheets) {
        const sheet = definition.id === 'qfd' ? workbook.addWorksheet(definition.name) : createWorksheet(workbook, definition.name, project.name, context.technicalCharacteristics.length);
        writeWorksheetContents(sheet, definition.id, context);
        sheet.pageSetup.printArea = `B2:${sheet.getColumn(Math.max(8, sheet.columnCount)).letter}${sheet.rowCount}`;
    }
    return Buffer.from(await workbook.xlsx.writeBuffer());
}
