// 원본 QFD 양식의 관계 행렬과 하단 Spec 영역에 저장 데이터와 수식을 배치한다.
import type ExcelJS from 'exceljs';
import type { WorksheetExcelContext } from './worksheet-excel';
import { buildTechnicalGroups } from './qfd-technical-groups';
import { relationshipWeight } from './qfd-worksheet';
import { addTable, cachedFormula, textDisplayWidth } from './worksheet-excel-layout';

type Technical = WorksheetExcelContext['technicalCharacteristics'][number];
const FIRST_ROW = 4;
const BORDER: Partial<ExcelJS.Borders> = Object.fromEntries(['top', 'bottom', 'left', 'right'].map(edge => [edge, { style: 'thin', color: { argb: 'FFD1D5DB' } }]));

function qfdLayout(context: WorksheetExcelContext) {
    const groups = buildTechnicalGroups(context.technicalCharacteristics, context.project.techTreeEntries).map(group => ({
        name: group.coreNames.join(' · ') || `기술특성 그룹 ${group.groupIndex + 1}`,
        columns: [...group.technicals, ...Array<null>(Math.max(0, 3 - group.technicals.length)).fill(null)] as Array<Technical | null>,
    }));
    let count = groups.reduce((sum, group) => sum + group.columns.length, 0);
    while (count < 15) {
        const size = Math.min(3, 15 - count);
        groups.push({ name: '', columns: Array<null>(size).fill(null) });
        count += size;
    }
    const technicals = groups.flatMap(group => group.columns);
    const companies = [...new Set([...context.project.benchmarks, ...context.project.technicalBenchmarks].map(row => row.company).filter(company => company !== 'self'))];
    if (!companies.length) companies.push('competitor');
    const weight = 5 + technicals.length;
    const plan = weight + 3 + companies.length;
    const lastRow = FIRST_ROW + Math.max(28, context.requirements.length) - 1;
    return { groups, technicals, companies, weight, plan, rank: plan + 4, lastRow, totalRow: lastRow + 1, specRow: lastRow + 3, targetRow: lastRow + 5 + companies.length };
}
type QfdLayout = ReturnType<typeof qfdLayout>;
const companyLabel = (company: string) => company === 'competitor' ? '경쟁사C' : company;

function prepareGrid(sheet: ExcelJS.Worksheet, layout: QfdLayout) {
    sheet.pageSetup = { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
        printTitlesRow: '2:3', margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } };
    sheet.views = [{ state: 'frozen', xSplit: 4, ySplit: 3, showGridLines: false }];
    sheet.getColumn(1).width = 4.3984375;
    sheet.getColumn(2).width = 21;
    sheet.getColumn(3).width = 21.59765625;
    sheet.getColumn(4).width = 34.5;
    for (let col = 5; col <= layout.rank; col++) sheet.getColumn(col).width = 9;
    sheet.getColumn(layout.weight + 1).width = 12;
    for (let row = 2; row <= layout.targetRow; row++) {
        sheet.getRow(row).height = row < FIRST_ROW ? 48 : 22;
        for (let col = 2; col <= layout.rank; col++) sheet.getCell(row, col).style = {
            font: { name: '맑은 고딕', size: 10, color: { argb: col === 2 ? 'FF0000FF' : col === 3 ? 'FFFF0000' : 'FF000000' }, bold: row < FIRST_ROW || row > layout.lastRow },
            alignment: { horizontal: col === 4 && row >= FIRST_ROW ? 'left' : 'center', vertical: 'middle', wrapText: true },
            border: BORDER, numFmt: '0.00',
        };
    }
}

function writeHeaders(sheet: ExcelJS.Worksheet, layout: QfdLayout) {
    sheet.mergeCells('B2:D2');
    sheet.getCell('B2').value = '고객요구사항';
    ['2차 그룹(파란색 글씨)', '1차 그룹(빨간색 글씨)', '항목(검정색 글씨)'].forEach((label, index) => { sheet.getCell(3, index + 2).value = label; });
    let column = 5;
    for (const group of layout.groups) {
        if (group.columns.length > 1) sheet.mergeCells(2, column, 2, column + group.columns.length - 1);
        sheet.getCell(2, column).value = group.name || null;
        group.columns.forEach((technical, index) => { sheet.getCell(3, column + index).value = technical?.name ?? null; });
        column += group.columns.length;
    }
    sheet.getCell(2, layout.weight).value = '비교\n대상';
    sheet.getCell(2, layout.weight + 1).value = '중요도';
    sheet.mergeCells(2, layout.weight + 2, 2, layout.plan - 1);
    sheet.getCell(2, layout.weight + 2).value = '경쟁사\n비교';
    ['가중치', '가중치 백분율', '자사', ...layout.companies.map(companyLabel)].forEach((label, index) => { sheet.getCell(3, layout.weight + index).value = label; });
    ['기획품질', '수준향상율', '절대적 중요성', '요구품질중요성(%)', 'RANK'].forEach((label, index) => {
        sheet.mergeCells(2, layout.plan + index, 3, layout.plan + index);
        sheet.getCell(2, layout.plan + index).value = label;
    });
    const lines = Math.max(2, ...layout.technicals.map(technical => Math.ceil(textDisplayWidth(technical?.name ?? '') / 8)), ...layout.companies.map(company => Math.ceil(textDisplayWidth(companyLabel(company)) / 8)));
    sheet.getRow(3).height = Math.max(48, lines * 15 + 8);
    for (const group of layout.groups) {
        sheet.getRow(2).height = Math.max(sheet.getRow(2).height ?? 48, Math.ceil(textDisplayWidth(group.name) / (group.columns.length * 8)) * 15 + 8);
    }
}

function writeRequirementRows(sheet: ExcelJS.Worksheet, layout: QfdLayout, context: WorksheetExcelContext) {
    const letter = (col: number) => sheet.getColumn(col).letter;
    const totalWeight = `${letter(layout.weight)}$${layout.totalRow}`;
    const totalImportance = `${letter(layout.plan + 2)}$${layout.totalRow}`;
    for (let row = FIRST_ROW; row <= layout.lastRow; row++) {
        const requirement = context.qfdAnalysis.requirements[row - FIRST_ROW];
        if (requirement) {
            [requirement.subcategory, requirement.category, requirement.requirement].forEach((value, index) => { sheet.getCell(row, index + 2).value = value ?? null; });
            layout.technicals.forEach((technical, index) => {
                if (technical) sheet.getCell(row, index + 5).value = relationshipWeight(context.project.qfdMatrices.find(value => value.requirementId === requirement.id && value.technicalCharId === technical.id)?.strength ?? 'NONE') || null;
            });
            sheet.getCell(row, layout.weight).value = requirement.weight;
            ['self', ...layout.companies].forEach((company, index) => { sheet.getCell(row, layout.weight + 2 + index).value = context.project.benchmarks.find(value => value.requirementId === requirement.id && value.company === company)?.score ?? null; });
            const lines = [requirement.subcategory ?? '', requirement.category, requirement.requirement].flatMap((value, index) => value.split('\n').map(line => Math.ceil(textDisplayWidth(line) / ((sheet.getColumn(index + 2).width ?? 20) - 2))));
            sheet.getRow(row).height = Math.max(22, Math.max(...lines) * 15 + 8);
        }
        const ref = (col: number) => `${letter(col)}${row}`;
        const formula = (col: number, expression: string, result: number | string) => { sheet.getCell(row, col).value = cachedFormula(`IF($D${row}="","",${expression})`, requirement ? result : ''); };
        formula(layout.weight + 1, `IF(${totalWeight}=0,0,ROUND(${ref(layout.weight)}/${totalWeight}*100,2)/100)`, (requirement?.weightPercent ?? 0) / 100);
        sheet.getCell(row, layout.weight + 1).numFmt = '0.0%';
        formula(layout.plan, `MAX(${ref(layout.weight + 2)}:${ref(layout.plan - 1)})`, requirement?.planQuality ?? 0);
        formula(layout.plan + 1, `IF(${ref(layout.weight + 2)}>0,ROUND(${ref(layout.plan)}/${ref(layout.weight + 2)},2),0)`, requirement?.improvementRate ?? 0);
        formula(layout.plan + 2, `ROUND(${ref(layout.weight)}*IF(${ref(layout.weight + 2)}>0,${ref(layout.plan)}/${ref(layout.weight + 2)},0),2)`, requirement?.absoluteImportance ?? 0);
        formula(layout.plan + 3, `IF(${totalImportance}=0,0,ROUND(${ref(layout.plan + 2)}*100/${totalImportance},2))`, requirement?.qualityImportancePercent ?? 0);
        formula(layout.rank, `IF(${ref(layout.plan + 2)}>0,RANK(${ref(layout.plan + 2)},$${letter(layout.plan + 2)}$${FIRST_ROW}:$${letter(layout.plan + 2)}$${layout.lastRow}),"")`, requirement?.rank ?? '');
        sheet.getCell(row, layout.rank).numFmt = '0';
        for (let col = 5; col < layout.weight; col++) sheet.getCell(row, col).numFmt = '0';
        for (let col = layout.weight + 2; col <= layout.plan; col++) sheet.getCell(row, col).numFmt = '0';
    }
}

function writeTechnicalFooter(sheet: ExcelJS.Worksheet, layout: QfdLayout, context: WorksheetExcelContext) {
    const letter = (col: number) => sheet.getColumn(col).letter;
    sheet.mergeCells(layout.totalRow, 3, layout.totalRow, 4);
    sheet.getCell(layout.totalRow, 3).value = '품질중요도';
    sheet.getCell(layout.totalRow + 1, 4).value = 'RANK';
    const totals = [[layout.weight, context.qfdAnalysis.totals.weight], [layout.weight + 1, context.qfdAnalysis.requirements.reduce((sum, row) => sum + row.weightPercent / 100, 0)], [layout.plan + 2, context.qfdAnalysis.totals.absoluteImportance], [layout.plan + 3, context.qfdAnalysis.requirements.reduce((sum, row) => sum + row.qualityImportancePercent, 0)]];
    totals.forEach(([col, total]) => { sheet.getCell(layout.totalRow, col).value = cachedFormula(`SUM(${letter(col)}${FIRST_ROW}:${letter(col)}${layout.lastRow})`, total); });
    sheet.getCell(layout.totalRow, layout.weight + 1).numFmt = '0.0%';
    sheet.mergeCells(layout.specRow, 3, layout.targetRow - 1, 3);
    sheet.getCell(layout.specRow, 3).value = 'Spec';
    ['측정단위', '자사', ...layout.companies.map(companyLabel)].forEach((label, index) => { sheet.getCell(layout.specRow + index, 4).value = label; });
    sheet.mergeCells(layout.targetRow, 3, layout.targetRow, 4);
    sheet.getCell(layout.targetRow, 3).value = '설계 목표치';
    layout.technicals.forEach((technical, index) => {
        const column = index + 5, col = letter(column), score = context.qfdAnalysis.technicals.find(row => row.id === technical?.id);
        sheet.getCell(layout.totalRow, column).value = cachedFormula(`IF(${col}$3="","",ROUND(SUMPRODUCT(${col}${FIRST_ROW}:${col}${layout.lastRow},$${letter(layout.weight)}$${FIRST_ROW}:$${letter(layout.weight)}$${layout.lastRow}),2))`, technical ? score?.totalScore ?? 0 : '');
        sheet.getCell(layout.totalRow + 1, column).value = cachedFormula(`IF(AND(ISNUMBER(${col}${layout.totalRow}),${col}${layout.totalRow}>0),RANK(${col}${layout.totalRow},$E$${layout.totalRow}:$${letter(layout.weight - 1)}$${layout.totalRow}),"")`, score?.rank ?? '');
        sheet.getCell(layout.totalRow + 1, column).numFmt = '0';
        if (!technical) return;
        sheet.getCell(layout.specRow, column).value = technical.unit;
        ['self', ...layout.companies].forEach((company, index) => { sheet.getCell(layout.specRow + 1 + index, column).value = context.project.technicalBenchmarks.find(value => value.technicalCharId === technical.id && value.company === company)?.value ?? null; });
        sheet.getCell(layout.targetRow, column).value = technical.targetValue;
    });
    for (let row = layout.specRow; row <= layout.targetRow; row++) {
        let lines = 1;
        for (let col = 4; col < layout.weight; col++) lines = Math.max(lines, ...sheet.getCell(row, col).text.split('\n').map(text => Math.ceil(textDisplayWidth(text) / ((sheet.getColumn(col).width ?? 9) - 1))));
        sheet.getRow(row).height = Math.max(22, lines * 15 + 8);
    }
}

export function writeQfdSheet(sheet: ExcelJS.Worksheet, context: WorksheetExcelContext) {
    const layout = qfdLayout(context);
    prepareGrid(sheet, layout);
    writeHeaders(sheet, layout);
    writeRequirementRows(sheet, layout, context);
    writeTechnicalFooter(sheet, layout, context);
    if (context.project.techCorrelations.length) addTable(sheet, '기술특성 상관관계', ['기술특성 1', '기술특성 2', '상관관계'], context.project.techCorrelations.map(row => [context.technicalCharacteristics.find(technical => technical.id === row.techId1)?.name ?? '', context.technicalCharacteristics.find(technical => technical.id === row.techId2)?.name ?? '', row.correlation]));
}
