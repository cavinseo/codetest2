// 저장된 데이터를 워크시트별 엑셀 양식과 계산 수식으로 작성한다.
import type ExcelJS from 'exceljs';
import type { WorksheetExcelContext } from './worksheet-excel';
import type { WorksheetExcelId } from './worksheet-excel-sheets';
import { getWeightedTimkoCategory, getSatisfactionQuadrant } from './kano-algorithm';
import { relationshipWeight } from './qfd-worksheet';
import { resolveKanoQuestionPair, kanoSurveyAnswerLabels } from './kano-survey-document';
import { buildKanoSurveyIntroduction, kanoSurveyIntroductionSchema } from './kano-survey-introduction';
import { dedupeByAttributeName } from './product-attributes-utils';
import { parseSourceYear } from './funding-ai-agent';
import { buildFundingPlansWithSales, buildTargetSpecAdditionsFromTechTree } from './worksheet-links';
import { addTable, addTotals, sortByOrder, cachedFormula, textDisplayWidth, writeNumericFormula, type ExcelCellValue, type ExcelTableRange } from './worksheet-excel-layout';

function writeSalesSheet(sheet: ExcelJS.Worksheet, context: WorksheetExcelContext) {
    const { project } = context;
    sheet.getColumn(2).width = 9;
    for (const [period, title] of [['Y', '현재(Y) 매출'], ['Y_PLUS_1', '향후 1년 목표 매출']] as const) {
        const rows = sortByOrder(project.salesEstimates).filter(row => row.period === period);
        const table = addTable(sheet, `${title} (단위: 원)`, ['번호', '매출처', '매출액', '경쟁사명'], rows.map((row, index) => [index + 1, row.customer, row.amount, row.competitor]));
        addTotals(sheet, table, [4]);
    }
}

function writeSpecSheet(sheet: ExcelJS.Worksheet, context: WorksheetExcelContext) {
    const { project } = context;
    const specFunctions = sortByOrder(project.specFunctions);
    const specRows: ExcelCellValue[][] = [];
    for (const coreSpec of specFunctions.filter(spec => spec.level === 'CORE')) {
        const subSpecs = specFunctions.filter(spec => spec.level === 'SUB' && spec.parentId === coreSpec.id);
        if (coreSpec.technology || !subSpecs.length) specRows.push([coreSpec.name, '', '', coreSpec.technology]);
        for (const subSpec of subSpecs) {
            const detailSpecs = specFunctions.filter(spec => spec.level === 'DETAIL' && spec.parentId === subSpec.id);
            if (subSpec.technology || !detailSpecs.length) specRows.push([coreSpec.name, subSpec.name, '', subSpec.technology]);
            detailSpecs.forEach(detail => specRows.push([coreSpec.name, subSpec.name, detail.name, detail.technology]));
        }
    }
    const includeDetailColumn = !project.specDetailCollapsed || specRows.some(row => row[2]);
    addTable(sheet, '(AS-IS) 스펙표', includeDetailColumn ? ['핵심스펙(기능)', '세부스펙(기능)', '세세부기술', '기술적 특성'] : ['핵심스펙(기능)', '세부스펙(기능)', '기술적 특성'], includeDetailColumn ? specRows : specRows.map(row => [row[0], row[1], row[3]]), { mergeColumns: [0, 1] });
}

function writeAttributesSheet(sheet: ExcelJS.Worksheet, context: WorksheetExcelContext) {
    const { project } = context;
    addTable(sheet, '제품속성서', ['제품명', '고객명', '세분시장', '고객 니즈', '제공혜택', '제품속성', '기술 역량'], sortByOrder(project.productAttributes).map(row => [row.productName, row.customerName, row.marketSegment, row.customerNeed, row.benefit, row.attribute, row.techCapability]));
}

function writeFitnessSheet(sheet: ExcelJS.Worksheet, context: WorksheetExcelContext) {
    const { project } = context;
    const savedFitness = project.fitnessMatrix;
    const markets = JSON.parse(savedFitness?.marketsJson || '[]') as Array<{ id: string; name: string; subSegments: Array<{ id: string; name: string }> }>;
    const matrix = JSON.parse(savedFitness?.matrixJson || '{}') as Record<string, Record<string, Record<string, string>>>;
    const columns = markets.flatMap(market => market.subSegments.map(customer => ({ market, customer })));
    const attributes = dedupeByAttributeName(sortByOrder(project.productAttributes));
    const table = addTable(sheet, '제품 속성 적합도', ['속성', ...columns.map(column => column.customer.name)], attributes.map(row => [row.attribute ?? '', ...columns.map(column => matrix[row.id]?.[column.market.id]?.[column.customer.id] ?? '')]), { groupHeaders: ['속성', ...columns.map(column => column.market.name)] });
    for (const priority of ['H', 'M', 'L', 'L*']) {
        const row = sheet.getRow(sheet.rowCount + 1);
        row.getCell(2).value = priority;
        columns.forEach((_, index) => {
            const columnLetter = sheet.getColumn(index + 3).letter;
            const count = attributes.filter(attribute => matrix[attribute.id]?.[columns[index].market.id]?.[columns[index].customer.id] === priority).length;
            const range = `${columnLetter}${table.start}:${columnLetter}${table.end}`;
            row.getCell(index + 3).value = cachedFormula(priority === 'L*' ? `SUMPRODUCT((${range}="L*")*1)` : `COUNTIF(${range},"${priority}")`, count);
        });
        row.height = 28;
    }
    addTable(sheet, '적합도 검토 의견', ['사업책임자 의견', '컨설턴트 의견'], [[savedFitness?.managerComment ?? '', savedFitness?.consultantNote ?? '']]);
    if (project.attributeFitnesses.length) addTable(sheet, '속성별 평가', ['제품속성', '중요도', '현재 수준', '목표 수준', '검토 의견'], project.attributeFitnesses.map(row => [project.productAttributes.find(attribute => attribute.id === row.attributeId)?.attribute ?? '', row.importance, row.currentLevel, row.targetLevel, row.note]));
}

function writeRequirementsSheet(sheet: ExcelJS.Worksheet, context: WorksheetExcelContext) {
    const { requirements } = context;
    sheet.getColumn(2).width = 9;
    addTable(sheet, '고객요구사항 도출표', ['번호', '항목', '1차 그룹', '2차 그룹'], requirements.map((row, index) => [index + 1, row.requirement, row.category, row.subcategory]));
}

function writeKanoSurveySheet(sheet: ExcelJS.Worksheet, context: WorksheetExcelContext) {
    const { project, requirements } = context;
    const workbook = sheet.workbook;
    const parsedIntroduction = kanoSurveyIntroductionSchema.safeParse(project.kanoSurveyIntroduction);
    const introduction = addTable(sheet, '제품/서비스 소개', ['설문 소개'], [[buildKanoSurveyIntroduction(parsedIntroduction.success ? parsedIntroduction.data : undefined)]]);
    sheet.mergeCells(introduction.header, 2, introduction.header, 10);
    sheet.mergeCells(introduction.start, 2, introduction.start, 10);
    sheet.getColumn(2).width = 9;
    sheet.getColumn(3).width = 30;
    sheet.getColumn(4).width = 10;
    sheet.getColumn(5).width = 60;
    for (let column = 6; column <= 10; column++) sheet.getColumn(column).width = 16;
    const introLength = textDisplayWidth(sheet.getCell(introduction.start, 2).text);
    sheet.getRow(introduction.start).height = Math.max(64, Math.ceil(introLength / 187) * 17 + 10);
    addTable(sheet, 'Kano 질문지', ['번호', '설문항목', '긍정/부정', '질문', ...kanoSurveyAnswerLabels()], requirements.flatMap((row, index) => {
        const pair = resolveKanoQuestionPair(row);
        return [[index + 1, row.requirement, '긍정', pair.positive, '', '', '', '', ''], [index + 1, row.requirement, '부정', pair.negative, '', '', '', '', '']];
    }), { mergeColumns: [0, 1] });
    if (project.kanoResponses.length) {
        const responses = workbook.addWorksheet('Kano 응답원본');
        responses.getColumn(1).width = 3;
        for (let column = 2; column <= 9; column++) responses.getColumn(column).width = 26;
        addTable(responses, 'Kano 수집 응답', ['번호', '응답자', '설문항목', '긍정 응답', '부정 응답', 'Kano 분류', '응답일'], [...project.kanoResponses].sort((a, b) => a.respondedAt.getTime() - b.respondedAt.getTime()).map((row, index) => [index + 1, row.respondentEmail, requirements.find(requirement => requirement.id === row.requirementId)?.requirement ?? '', row.positiveAnswer, row.negativeAnswer, row.kanoCategory, row.respondedAt]));
    }
}

function writeKanoAggregationSheet(sheet: ExcelJS.Worksheet, context: WorksheetExcelContext) {
    const { kanoAnalysis } = context;
    const table = addTable(sheet, 'Kano 분석 집계표', ['번호', '설문항목', '매력적(A)', '일원적(O)', '당연적(M)', '역(R)', '무관심(I)', '회의적(Q)', '합계', '만족계수', '불만족계수'], kanoAnalysis.map((row, index) => [index + 1, row.requirement.requirement, row.counts.A, row.counts.O, row.counts.M, row.counts.R, row.counts.I, row.counts.Q, row.counts.total, row.counts.total ? row.better : null, row.counts.total ? row.worse : null]));
    kanoAnalysis.forEach((row, index) => {
        const rowNumber = table.start + index;
        sheet.getCell(rowNumber, 10).value = cachedFormula(`SUM(D${rowNumber}:I${rowNumber})`, row.counts.total);
        sheet.getCell(rowNumber, 11).value = cachedFormula(`IF(J${rowNumber}=0,"",IF(SUM(D${rowNumber}:F${rowNumber},H${rowNumber})=0,0,ROUND((D${rowNumber}+E${rowNumber})/SUM(D${rowNumber}:F${rowNumber},H${rowNumber}),2)))`, row.counts.total ? row.better : '');
        sheet.getCell(rowNumber, 12).value = cachedFormula(`IF(J${rowNumber}=0,"",IF(SUM(D${rowNumber}:F${rowNumber},H${rowNumber})=0,0,INT(-(E${rowNumber}+F${rowNumber})/SUM(D${rowNumber}:F${rowNumber},H${rowNumber})*100+0.5)/100))`, row.counts.total ? row.worse : '');
        sheet.getCell(rowNumber, 11).numFmt = '0.00';
        sheet.getCell(rowNumber, 12).numFmt = '0.00';
    });
}

function writeTimkoSheet(sheet: ExcelJS.Worksheet, context: WorksheetExcelContext) {
    const { kanoAnalysis } = context;
    const quadrantLabels = { ATTRACTIVE: '매력적 품질', ONE_DIMENSIONAL: '일원적 품질', MUST_BE: '당연적 품질', INDIFFERENT: '무관심 품질' };
    const table = addTable(sheet, 'TIMKO / 만족계수', ['번호', '설문항목', '만족계수', '불만족계수', '품질 분류', '자동 가중치', '적용 가중치', '사분면'], kanoAnalysis.map((row, index) => [index + 1, row.requirement.requirement, row.counts.total ? row.better : null, row.counts.total ? row.worse : null, row.counts.total ? getWeightedTimkoCategory(row.timkoWeight) ?? '' : '', row.autoKanoWeight, row.timkoWeight, row.counts.total ? quadrantLabels[getSatisfactionQuadrant(row.better, row.worse)] : '']));
    kanoAnalysis.forEach((_, index) => { sheet.getCell(table.start + index, 4).numFmt = '0.00'; sheet.getCell(table.start + index, 5).numFmt = '0.00'; });
}

function writeQfdSheet(sheet: ExcelJS.Worksheet, context: WorksheetExcelContext) {
    const { project, technicalCharacteristics, qfdAnalysis } = context;
    for (let column = 5; column < technicalCharacteristics.length + 5; column++) sheet.getColumn(column).width = 18;
    const table = addTable(sheet, 'QFD 관계도 (강 9 / 중 3 / 약 1)', ['2차 그룹', '1차 그룹', '고객요구사항', ...technicalCharacteristics.map(row => row.name), '가중치', '가중치(%)', '자사', '경쟁사', '기획품질', '수준향상율', '절대적 중요성', '요구품질중요성(%)', '순위'], qfdAnalysis.requirements.map(row => [row.subcategory ?? '', row.category, row.requirement, ...technicalCharacteristics.map(technical => relationshipWeight(project.qfdMatrices.find(relation => relation.requirementId === row.id && relation.technicalCharId === technical.id)?.strength ?? 'NONE') || null), row.weight, row.weightPercent, row.selfScore, row.competitorScore, row.planQuality, row.improvementRate, row.absoluteImportance, row.qualityImportancePercent, row.rank]));
    writeQfdRequirementFormulas(sheet, table, context);
    writeQfdTechnicalSummary(sheet, table, context);
    writeQfdComparisons(sheet, context);
}

function writeQfdRequirementFormulas(sheet: ExcelJS.Worksheet, table: ExcelTableRange, context: WorksheetExcelContext) {
    const { technicalCharacteristics, qfdAnalysis } = context;
    const weightColumn = technicalCharacteristics.length + 5;
    const columnLetter = (offset: number) => sheet.getColumn(weightColumn + offset).letter;
    qfdAnalysis.requirements.forEach((row, index) => {
        const rowNumber = table.start + index;
        sheet.getCell(rowNumber, weightColumn + 1).value = cachedFormula(`IF(SUM(${columnLetter(0)}$${table.start}:${columnLetter(0)}$${table.end})=0,0,ROUND(${columnLetter(0)}${rowNumber}/SUM(${columnLetter(0)}$${table.start}:${columnLetter(0)}$${table.end})*100,2))`, row.weightPercent);
        sheet.getCell(rowNumber, weightColumn + 4).value = cachedFormula(`MAX(${columnLetter(2)}${rowNumber}:${columnLetter(3)}${rowNumber})`, row.planQuality);
        sheet.getCell(rowNumber, weightColumn + 5).value = cachedFormula(`IF(${columnLetter(2)}${rowNumber}>0,ROUND(${columnLetter(4)}${rowNumber}/${columnLetter(2)}${rowNumber},2),0)`, row.improvementRate);
        sheet.getCell(rowNumber, weightColumn + 6).value = cachedFormula(`ROUND(${columnLetter(0)}${rowNumber}*IF(${columnLetter(2)}${rowNumber}>0,${columnLetter(4)}${rowNumber}/${columnLetter(2)}${rowNumber},0),2)`, row.absoluteImportance);
        sheet.getCell(rowNumber, weightColumn + 7).value = cachedFormula(`IF(SUM(${columnLetter(6)}$${table.start}:${columnLetter(6)}$${table.end})=0,0,ROUND(${columnLetter(6)}${rowNumber}/SUM(${columnLetter(6)}$${table.start}:${columnLetter(6)}$${table.end})*100,2))`, row.qualityImportancePercent);
        sheet.getCell(rowNumber, weightColumn + 8).value = cachedFormula(`IF(${columnLetter(6)}${rowNumber}>0,RANK(${columnLetter(6)}${rowNumber},${columnLetter(6)}$${table.start}:${columnLetter(6)}$${table.end}),"")`, row.rank ?? '');
    });
}

function writeQfdTechnicalSummary(sheet: ExcelJS.Worksheet, table: ExcelTableRange, context: WorksheetExcelContext) {
    const { project, technicalCharacteristics, qfdAnalysis } = context;
    const weightColumnLetter = sheet.getColumn(technicalCharacteristics.length + 5).letter;
    const companies = [...new Set(project.technicalBenchmarks.map(row => row.company))];
    const summary = addTable(sheet, '기술특성별 목표 및 중요도', ['기술적 특성', '측정단위', '목표값', ...companies.map(company => company === 'self' ? '자사' : company), '합계 점수', '중요도(%)', '순위'], qfdAnalysis.technicals.map(row => [row.name, row.unit ?? '', row.targetValue ?? '', ...companies.map(company => project.technicalBenchmarks.find(value => value.technicalCharId === row.id && value.company === company)?.value ?? ''), row.totalScore, row.importancePercent, row.rank]));
    qfdAnalysis.technicals.forEach((row, index) => {
        const scoreColumn = companies.length + 5;
        const technicalLetter = sheet.getColumn(5 + index).letter;
        sheet.getCell(summary.start + index, scoreColumn).value = cachedFormula(`ROUND(SUMPRODUCT(${technicalLetter}${table.start}:${technicalLetter}${table.end},${weightColumnLetter}${table.start}:${weightColumnLetter}${table.end}),2)`, row.totalScore);
        const scoreLetter = sheet.getColumn(scoreColumn).letter;
        const rowNumber = summary.start + index;
        sheet.getCell(rowNumber, scoreColumn + 1).value = cachedFormula(`IF(SUM(${weightColumnLetter}${table.start}:${weightColumnLetter}${table.end})=0,0,ROUND(${scoreLetter}${rowNumber}/SUM(${weightColumnLetter}${table.start}:${weightColumnLetter}${table.end})*10,2))`, row.importancePercent);
        sheet.getCell(rowNumber, scoreColumn + 2).value = cachedFormula(`IF(${scoreLetter}${rowNumber}>0,RANK(${scoreLetter}${rowNumber},${scoreLetter}$${summary.start}:${scoreLetter}$${summary.end}),"")`, row.rank ?? '');
    });
}

function writeQfdComparisons(sheet: ExcelJS.Worksheet, context: WorksheetExcelContext) {
    const { project, requirements, technicalCharacteristics } = context;
    if (project.techCorrelations.length) addTable(sheet, '기술특성 상관관계', ['기술특성 1', '기술특성 2', '상관관계'], project.techCorrelations.map(row => [technicalCharacteristics.find(technical => technical.id === row.techId1)?.name ?? '', technicalCharacteristics.find(technical => technical.id === row.techId2)?.name ?? '', row.correlation]));
    if (project.benchmarks.length) addTable(sheet, '고객요구사항별 경쟁 비교', ['고객요구사항', '회사', '점수'], project.benchmarks.map(row => [requirements.find(requirement => requirement.id === row.requirementId)?.requirement ?? '', row.company === 'self' ? '자사' : row.company, row.score]));
}

function writeTechTreeSheet(sheet: ExcelJS.Worksheet, context: WorksheetExcelContext) {
    const { project } = context;
    addTable(sheet, '기능기술체계도', ['고객의 소리', '핵심스펙(기능)', '세부스펙(기능)', '기술적 특성'], sortByOrder(project.techTreeEntries).map(row => [row.customerVoice, row.coreSpec, row.subSpec, row.techCharacteristic]));
}

function writeImprovementsSheet(sheet: ExcelJS.Worksheet, context: WorksheetExcelContext) {
    const { project } = context;
    addTable(sheet, '개선포인트 우선순위', ['순위', '고객니즈', '경쟁사대비 수준향상율', '개발향상비중'], sortByOrder(project.improvementItems).filter(row => row.type === 'need').map((row, index) => [index + 1, row.content, row.improvementRate, row.devProportion]));
    addTable(sheet, '추가 기능 및 성능향상', ['순위', '고객니즈', '추가 기능', '성능향상'], sortByOrder(project.improvementItems).filter(row => row.type === 'feature').map((row, index) => [index + 1, row.content, row.improvementRate, row.devProportion]));
}

function writeTargetSpecSheet(sheet: ExcelJS.Worksheet, context: WorksheetExcelContext) {
    const { project } = context;
    const targets = sortByOrder(project.targetSpecs);
    const table = addTable(sheet, '최종목표스펙도출', ['스펙분류', '세부항목', '기술적 특성', '개선여부', '단위', '현재값', '경쟁사값', '목표값'], targets.map(row => [row.category, row.subCategory, row.specItem, row.note, row.unit, row.currentValue, row.competitorValue, row.targetValue]), { mergeColumns: [0, 1] });
    const newSpecs = buildTargetSpecAdditionsFromTechTree(project.techTreeEntries, project.specFunctions, []).filter(row => row.note === '신규');
    targets.forEach((row, index) => {
        if (row.note?.trim() === '신규' || newSpecs.some(spec => spec.category === row.category?.trim() && spec.subCategory === row.subCategory?.trim())) {
            for (let column = 2; column <= table.lastColumn; column++) {
                const cell = sheet.getCell(table.start + index, column);
                if (!cell.isMerged) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
            }
        }
    });
}

function writeTechRoadmapSheet(sheet: ExcelJS.Worksheet, context: WorksheetExcelContext) {
    const { project } = context;
    addTable(sheet, '향후목표고객LIST', ['순위', '고객혜택 제공을 위한 제품/서비스개선 방향(차별화)', '개선기능 및 성능향상', '개선을 위한 구현가능성', '목표 고객', 'Q1', 'Q2', 'Q3', 'Q4', '담당자'], sortByOrder(project.techRoadmaps).map((row, index) => [index + 1, row.category, row.techItem, row.currentLevel, row.targetLevel ?? row.owner, row.q1, row.q2, row.q3, row.q4, row.owner]));
}

function writeAssetsSheet(sheet: ExcelJS.Worksheet, context: WorksheetExcelContext) {
    const { project } = context;
    addTable(sheet, '핵심자산 도출표', ['핵심자산', '필요 항목'], sortByOrder(project.assetItems).filter(row => row.type === 'CORE').map(row => [row.content, row.category]));
    addTable(sheet, '보완자산 도출표', ['필요 항목', '해결방안'], sortByOrder(project.assetItems).filter(row => row.type === 'COMPLEMENTARY').map(row => [row.category, row.content]));
}

function writeFundingPlanSheet(sheet: ExcelJS.Worksheet, context: WorksheetExcelContext) {
    const { project } = context;
    const rows = buildFundingPlansWithSales({ plans: sortByOrder(project.fundingPlans), salesEstimates: project.salesEstimates });
    const isTotal = (row: typeof rows[number]) => `${row.category ?? ''}${row.item ?? ''}`.replace(/\s+/g, '').includes('합계');
    const table = addTable(sheet, '자금소요계획표 (단위: 원)', ['구분', '항목', 'Y+1년차', 'Y+2년차', 'Y+3년차'], rows.map(row => [row.category ?? '', row.item ?? '', row.year1 ?? null, row.year2 ?? null, row.year3 ?? null]), { mergeColumns: [0] });
    const costs = rows.filter(row => row.category !== '매출액' && row.item !== '매출액' && !isTotal(row));
    const totalIndexes = rows.flatMap((row, index) => isTotal(row) ? [table.start + index] : []);
    const total = totalIndexes.length ? null : addTable(sheet, '소요자금 합계 (단위: 원)', ['Y+1년차', 'Y+2년차', 'Y+3년차'], [[0, 0, 0]]);
    for (const [index, field] of ['year1', 'year2', 'year3'].entries()) {
        const columnLetter = sheet.getColumn(index + 4).letter;
        const references = rows.flatMap((row, rowIndex) => costs.includes(row) ? [`${columnLetter}${table.start + rowIndex}`] : []);
        const value = cachedFormula(references.length ? `SUM(${references.join(',')})` : '0', costs.reduce((sum, row) => sum + Number(row[field as 'year1' | 'year2' | 'year3'] ?? 0), 0));
        if (total) writeNumericFormula(sheet.getCell(total.start, index + 2), value);
        totalIndexes.forEach(rowNumber => writeNumericFormula(sheet.getCell(rowNumber, index + 4), value));
    }
}

function writeFundingSourceSheet(sheet: ExcelJS.Worksheet, context: WorksheetExcelContext) {
    const { project } = context;
    const sources = sortByOrder(project.fundingSources);
    const table = addTable(sheet, '자금조달계획표 (단위: 원)', ['구분', '출처', '금액', '출처', '금액', '출처', '금액'], sources.map(row => [row.category, ...[row.year1, row.year2, row.year3].flatMap(value => { const parsed = parseSourceYear(value); return [parsed.source, parsed.amount === '' ? null : parsed.amountNumber]; })]), { groupHeaders: ['구분', 'Y+1년차', 'Y+1년차', 'Y+2년차', 'Y+2년차', 'Y+3년차', 'Y+3년차'] });
    addTotals(sheet, table, [4, 6, 8]);
}

export function writeWorksheetContents(sheet: ExcelJS.Worksheet, worksheetId: WorksheetExcelId, context: WorksheetExcelContext) {
    switch (worksheetId) {
        case 'sales': return writeSalesSheet(sheet, context);
        case 'spec': return writeSpecSheet(sheet, context);
        case 'attributes': return writeAttributesSheet(sheet, context);
        case 'fitness': return writeFitnessSheet(sheet, context);
        case 'requirements': return writeRequirementsSheet(sheet, context);
        case 'kano': return writeKanoSurveySheet(sheet, context);
        case 'kano-aggregation': return writeKanoAggregationSheet(sheet, context);
        case 'timko': return writeTimkoSheet(sheet, context);
        case 'qfd': return writeQfdSheet(sheet, context);
        case 'tech-tree': return writeTechTreeSheet(sheet, context);
        case 'improvements': return writeImprovementsSheet(sheet, context);
        case 'target-spec': return writeTargetSpecSheet(sheet, context);
        case 'tech-roadmap': return writeTechRoadmapSheet(sheet, context);
        case 'assets': return writeAssetsSheet(sheet, context);
        case 'funding-plan': return writeFundingPlanSheet(sheet, context);
        case 'funding-source': return writeFundingSourceSheet(sheet, context);
    }
}
