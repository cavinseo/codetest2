// 저장된 워크시트 데이터를 화면 양식과 계산 규칙에 맞춘 엑셀 워크북으로 출력한다.
import ExcelJS from 'exceljs';
import type { Prisma } from '@prisma/client';
import { aggregateKanoResponses, calculateBetterWorse, calculateSatisfactionGraphWeight, getWeightedTimkoCategory, getSatisfactionQuadrant, type KanoAnswer } from './kano-algorithm';
import { calculateQfdWorksheet, relationshipWeight } from './qfd-worksheet';
import { resolveKanoQuestionPair, kanoSurveyAnswerLabels } from './kano-survey-document';
import { buildKanoSurveyIntroduction, kanoSurveyIntroductionSchema } from './kano-survey-introduction';
import { dedupeByAttributeName } from './product-attributes-utils';
import { parseSourceYear } from './funding-ai-agent';
import { getGroupedCellSpans } from './final-report-table-merge';
import { buildFundingPlansWithSales, buildTargetSpecAdditionsFromTechTree } from './worksheet-links';
import { WORKSHEET_EXCEL_SHEETS, type WorksheetExcelId } from './worksheet-excel-sheets';

export type WorksheetExcelProject = Prisma.ProjectGetPayload<{ include: {
    specFunctions: true; productAttributes: true; attributeFitnesses: true; requirements: true;
    technicalCharacteristics: true; qfdMatrices: true; kanoResponses: true; techCorrelations: true;
    benchmarks: true; technicalBenchmarks: true; techTreeEntries: true; improvementItems: true;
    targetSpecs: true; techRoadmaps: true; devPlans: true; salesEstimates: true; assetItems: true;
    fundingPlans: true; fundingSources: true; fitnessMatrix: true;
} }>;

type Value = string | number | Date | null | ExcelJS.CellFormulaValue;
type TableRange = { header: number; start: number; end: number; lastColumn: number };
const NUMBER_FORMAT = '#,##0.00';
const border: Partial<ExcelJS.Borders> = Object.fromEntries(['top', 'left', 'bottom', 'right'].map(edge => [edge, { style: 'thin', color: { argb: 'FFD1D5DB' } }]));
const sorted = <T extends { order: number }>(rows: T[]) => [...rows].sort((a, b) => a.order - b.order);
const formula = (expression: string, result: number | string): ExcelJS.CellFormulaValue => ({ formula: expression, result });

function addTable(sheet: ExcelJS.Worksheet, title: string, headers: string[], rows: Value[][], options: { mergeColumns?: number[]; groupHeaders?: string[] } = {}): TableRange {
    const titleRow = sheet.rowCount + 2;
    const lastColumn = headers.length + 1;
    sheet.mergeCells(titleRow, 2, titleRow, lastColumn);
    const titleCell = sheet.getCell(titleRow, 2);
    titleCell.value = title;
    titleCell.font = { name: '맑은 고딕', size: 12, bold: true, color: { argb: 'FF111827' } };
    sheet.getRow(titleRow).height = 28;
    let header = titleRow + 1;
    if (options.groupHeaders) {
        options.groupHeaders.forEach((name, index) => { sheet.getCell(header, index + 2).value = name; });
        const spans = getGroupedCellSpans(options.groupHeaders.map(name => [name]), [0]);
        spans.forEach((span, index) => { if (span[0] > 1) sheet.mergeCells(header, index + 2, header, index + 1 + span[0]); });
        header++;
    }
    headers.forEach((name, index) => { sheet.getCell(header, index + 2).value = name; });
    for (let row = titleRow + 1; row <= header; row++) {
        sheet.getRow(row).height = Math.max(34, Math.ceil(Math.max(...headers.map(name => name.length)) / 22) * 18 + 12);
        for (let column = 2; column <= lastColumn; column++) {
            sheet.getCell(row, column).style = { font: { name: '맑은 고딕', size: 11, bold: true, color: { argb: 'FF111827' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } }, border, alignment: { vertical: 'middle', horizontal: 'center', wrapText: true } };
        }
    }
    const start = header + 1;
    const values = rows.length ? rows : [headers.map(() => null)];
    values.forEach((values, index) => {
        const row = sheet.getRow(start + index);
        let lines = 1;
        headers.forEach((_, column) => {
            const cell = row.getCell(column + 2);
            cell.value = values[column] === '' ? null : values[column] ?? null;
            cell.style = { font: { name: '맑은 고딕', size: 11, color: { argb: 'FF111827' } }, border, alignment: { vertical: 'top', wrapText: true }, numFmt: typeof cell.value === 'string' ? '@' : Number.isInteger(cell.value) ? '#,##0' : NUMBER_FORMAT };
            if (cell.value instanceof Date) cell.numFmt = 'yyyy-mm-dd hh:mm';
            const text = typeof cell.value === 'string' ? cell.value : '';
            const width = sheet.getColumn(column + 2).width ?? 26;
            lines = Math.max(lines, ...text.split('\n').map(line => Math.ceil([...line].reduce((length, char) => length + (char.charCodeAt(0) > 255 ? 2 : 1), 0) / Math.max(6, width - 2))));
        });
        row.height = Math.max(28, lines * 17 + 10);
    });
    if (options.mergeColumns?.length && rows.length) {
        const spans = getGroupedCellSpans(rows.map(row => row.map(value => String(value ?? ''))), options.mergeColumns);
        spans.forEach((columns, index) => options.mergeColumns!.forEach(column => {
            if (columns[column] > 1) sheet.mergeCells(start + index, column + 2, start + index + columns[column] - 1, column + 2);
        }));
    }
    if (!sheet.views.length) {
        sheet.views = [{ state: 'frozen', ySplit: header, xSplit: 1, showGridLines: false }];
        sheet.pageSetup.printTitlesRow = `${titleRow + 1}:${header}`;
    }
    return { header, start, end: start + values.length - 1, lastColumn };
}

function addTotals(sheet: ExcelJS.Worksheet, table: TableRange, columns: number[]) {
    const row = sheet.getRow(table.end + 1);
    row.getCell(2).value = '합계';
    for (const column of columns) {
        const letter = sheet.getColumn(column).letter;
        let total = 0;
        for (let index = table.start; index <= table.end; index++) total += Number(sheet.getCell(index, column).value) || 0;
        row.getCell(column).value = formula(`SUM(${letter}${table.start}:${letter}${table.end})`, total);
        row.getCell(column).numFmt = Number.isInteger(total) ? '#,##0' : NUMBER_FORMAT;
    }
    row.height = 28;
    for (let column = 2; column <= table.lastColumn; column++) row.getCell(column).style = { ...row.getCell(column).style, font: { name: '맑은 고딕', bold: true, size: 11 }, border, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } } };
}

export async function buildWorksheetExcel(project: WorksheetExcelProject, requested?: WorksheetExcelId): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'KS-QFD';
    workbook.calcProperties.fullCalcOnLoad = true;
    const requirements = sorted(project.requirements);
    const responseGroups = new Map<string, typeof project.kanoResponses>();
    project.kanoResponses.forEach(response => {
        const bucket = responseGroups.get(response.requirementId) ?? [];
        bucket.push(response);
        responseGroups.set(response.requirementId, bucket);
    });
    const analysis = requirements.map(requirement => {
        const responses = responseGroups.get(requirement.id) ?? [];
        const counts = aggregateKanoResponses(responses.map(response => ({ positive: response.positiveAnswer as KanoAnswer, negative: response.negativeAnswer as KanoAnswer })));
        const { better, worse } = calculateBetterWorse(counts);
        const autoWeight = responses.length ? calculateSatisfactionGraphWeight(better, worse) : 0;
        return { requirement, counts, better, worse, autoWeight, timkoWeight: requirement.kanoWeight ?? autoWeight, weight: requirement.kanoWeight != null && requirement.kanoWeight > 0 ? requirement.kanoWeight : autoWeight };
    });
    const technicals = [...project.technicalCharacteristics].filter(row => row.name.trim()).sort((a, b) => a.groupIndex - b.groupIndex || a.columnOrder - b.columnOrder || a.name.localeCompare(b.name));
    const qfd = calculateQfdWorksheet({ requirements: analysis.map(row => ({ ...row.requirement, importance: row.weight })), technicals, relationships: project.qfdMatrices, benchmarks: project.benchmarks });
    for (const definition of WORKSHEET_EXCEL_SHEETS.filter(sheet => !requested || sheet.id === requested)) {
        const sheet = workbook.addWorksheet(definition.name, { pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } } });
        sheet.getColumn(1).width = 3;
        for (let column = 2; column <= 30 + technicals.length; column++) sheet.getColumn(column).width = 26;
        sheet.mergeCells('B2:H2');
        sheet.getCell('B2').value = definition.name;
        sheet.getCell('B2').font = { name: '맑은 고딕', size: 16, bold: true };
        sheet.getRow(2).height = 32;
        sheet.mergeCells('B3:H3');
        sheet.getCell('B3').value = `${project.name} / 저장된 데이터 기준`;
        sheet.getCell('B3').font = { name: '맑은 고딕', size: 11 };
        switch (definition.id) {
            case 'sales': {
                sheet.getColumn(2).width = 9;
                for (const [period, title] of [['Y', '현재(Y) 매출'], ['Y_PLUS_1', '향후 1년 목표 매출']] as const) {
                    const rows = sorted(project.salesEstimates).filter(row => row.period === period);
                    const table = addTable(sheet, `${title} (단위: 원)`, ['번호', '매출처', '매출액', '경쟁사명'], rows.map((row, index) => [index + 1, row.customer, row.amount, row.competitor]));
                    addTotals(sheet, table, [4]);
                }
                break;
            }
            case 'spec': {
                const specs = sorted(project.specFunctions);
                const rows: Value[][] = [];
                for (const core of specs.filter(spec => spec.level === 'CORE')) {
                    const subs = specs.filter(spec => spec.level === 'SUB' && spec.parentId === core.id);
                    if (core.technology || !subs.length) rows.push([core.name, '', '', core.technology]);
                    for (const sub of subs) {
                        const details = specs.filter(spec => spec.level === 'DETAIL' && spec.parentId === sub.id);
                        if (sub.technology || !details.length) rows.push([core.name, sub.name, '', sub.technology]);
                        details.forEach(detail => rows.push([core.name, sub.name, detail.name, detail.technology]));
                    }
                }
                const showDetails = !project.specDetailCollapsed || rows.some(row => row[2]);
                addTable(sheet, '(AS-IS) 스펙표', showDetails ? ['핵심스펙(기능)', '세부스펙(기능)', '세세부기술', '기술적 특성'] : ['핵심스펙(기능)', '세부스펙(기능)', '기술적 특성'], showDetails ? rows : rows.map(row => [row[0], row[1], row[3]]), { mergeColumns: [0, 1] });
                break;
            }
            case 'attributes':
                addTable(sheet, '제품속성서', ['제품명', '고객명', '세분시장', '고객 니즈', '제공혜택', '제품속성', '기술 역량'], sorted(project.productAttributes).map(row => [row.productName, row.customerName, row.marketSegment, row.customerNeed, row.benefit, row.attribute, row.techCapability]));
                break;
            case 'fitness': {
                const saved = project.fitnessMatrix;
                const markets = JSON.parse(saved?.marketsJson || '[]') as Array<{ id: string; name: string; subSegments: Array<{ id: string; name: string }> }>;
                const matrix = JSON.parse(saved?.matrixJson || '{}') as Record<string, Record<string, Record<string, string>>>;
                const columns = markets.flatMap(market => market.subSegments.map(customer => ({ market, customer })));
                const attributes = dedupeByAttributeName(sorted(project.productAttributes));
                const table = addTable(sheet, '제품 속성 적합도', ['속성', ...columns.map(column => column.customer.name)], attributes.map(row => [row.attribute ?? '', ...columns.map(column => matrix[row.id]?.[column.market.id]?.[column.customer.id] ?? '')]), { groupHeaders: ['속성', ...columns.map(column => column.market.name)] });
                for (const priority of ['H', 'M', 'L', 'L*']) {
                    const row = sheet.getRow(sheet.rowCount + 1);
                    row.getCell(2).value = priority;
                    columns.forEach((_, index) => {
                        const letter = sheet.getColumn(index + 3).letter;
                        const count = attributes.filter(attribute => matrix[attribute.id]?.[columns[index].market.id]?.[columns[index].customer.id] === priority).length;
                        const range = `${letter}${table.start}:${letter}${table.end}`;
                        row.getCell(index + 3).value = formula(priority === 'L*' ? `SUMPRODUCT((${range}="L*")*1)` : `COUNTIF(${range},"${priority}")`, count);
                    });
                    row.height = 28;
                }
                addTable(sheet, '적합도 검토 의견', ['사업책임자 의견', '컨설턴트 의견'], [[saved?.managerComment ?? '', saved?.consultantNote ?? '']]);
                if (project.attributeFitnesses.length) addTable(sheet, '속성별 평가', ['제품속성', '중요도', '현재 수준', '목표 수준', '검토 의견'], project.attributeFitnesses.map(row => [project.productAttributes.find(attribute => attribute.id === row.attributeId)?.attribute ?? '', row.importance, row.currentLevel, row.targetLevel, row.note]));
                break;
            }
            case 'requirements':
                sheet.getColumn(2).width = 9;
                addTable(sheet, '고객요구사항 도출표', ['번호', '항목', '1차 그룹', '2차 그룹'], requirements.map((row, index) => [index + 1, row.requirement, row.category, row.subcategory]));
                break;
            case 'kano': {
                const intro = kanoSurveyIntroductionSchema.safeParse(project.kanoSurveyIntroduction);
                const introduction = addTable(sheet, '제품/서비스 소개', ['설문 소개'], [[buildKanoSurveyIntroduction(intro.success ? intro.data : undefined)]]);
                sheet.mergeCells(introduction.header, 2, introduction.header, 10);
                sheet.mergeCells(introduction.start, 2, introduction.start, 10);
                sheet.getColumn(2).width = 9;
                sheet.getColumn(3).width = 30;
                sheet.getColumn(4).width = 10;
                sheet.getColumn(5).width = 60;
                for (let column = 6; column <= 10; column++) sheet.getColumn(column).width = 16;
                const introLength = [...sheet.getCell(introduction.start, 2).text].reduce((length, char) => length + (char.charCodeAt(0) > 255 ? 2 : 1), 0);
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
                break;
            }
            case 'kano-aggregation': {
                const table = addTable(sheet, 'Kano 분석 집계표', ['번호', '설문항목', '매력적(A)', '일원적(O)', '당연적(M)', '역(R)', '무관심(I)', '회의적(Q)', '합계', '만족계수', '불만족계수'], analysis.map((row, index) => [index + 1, row.requirement.requirement, row.counts.A, row.counts.O, row.counts.M, row.counts.R, row.counts.I, row.counts.Q, row.counts.total, row.counts.total ? row.better : null, row.counts.total ? row.worse : null]));
                analysis.forEach((row, index) => {
                    const line = table.start + index;
                    sheet.getCell(line, 10).value = formula(`SUM(D${line}:I${line})`, row.counts.total);
                    sheet.getCell(line, 11).value = formula(`IF(J${line}=0,"",IF(SUM(D${line}:F${line},H${line})=0,0,ROUND((D${line}+E${line})/SUM(D${line}:F${line},H${line}),2)))`, row.counts.total ? row.better : '');
                    sheet.getCell(line, 12).value = formula(`IF(J${line}=0,"",IF(SUM(D${line}:F${line},H${line})=0,0,INT(-(E${line}+F${line})/SUM(D${line}:F${line},H${line})*100+0.5)/100))`, row.counts.total ? row.worse : '');
                    sheet.getCell(line, 11).numFmt = '0.00';
                    sheet.getCell(line, 12).numFmt = '0.00';
                });
                break;
            }
            case 'timko': {
                const quadrantLabels = { ATTRACTIVE: '매력적 품질', ONE_DIMENSIONAL: '일원적 품질', MUST_BE: '당연적 품질', INDIFFERENT: '무관심 품질' };
                const table = addTable(sheet, 'TIMKO / 만족계수', ['번호', '설문항목', '만족계수', '불만족계수', '품질 분류', '자동 가중치', '적용 가중치', '사분면'], analysis.map((row, index) => [index + 1, row.requirement.requirement, row.counts.total ? row.better : null, row.counts.total ? row.worse : null, row.counts.total ? getWeightedTimkoCategory(row.timkoWeight) ?? '' : '', row.autoWeight, row.timkoWeight, row.counts.total ? quadrantLabels[getSatisfactionQuadrant(row.better, row.worse)] : '']));
                analysis.forEach((_, index) => { sheet.getCell(table.start + index, 4).numFmt = '0.00'; sheet.getCell(table.start + index, 5).numFmt = '0.00'; });
                break;
            }
            case 'qfd': {
                for (let column = 5; column < technicals.length + 5; column++) sheet.getColumn(column).width = 18;
                const table = addTable(sheet, 'QFD 관계도 (강 9 / 중 3 / 약 1)', ['2차 그룹', '1차 그룹', '고객요구사항', ...technicals.map(row => row.name), '가중치', '가중치(%)', '자사', '경쟁사', '기획품질', '수준향상율', '절대적 중요성', '요구품질중요성(%)', '순위'], qfd.requirements.map(row => [row.subcategory ?? '', row.category, row.requirement, ...technicals.map(technical => relationshipWeight(project.qfdMatrices.find(relation => relation.requirementId === row.id && relation.technicalCharId === technical.id)?.strength ?? 'NONE') || null), row.weight, row.weightPercent, row.selfScore, row.competitorScore, row.planQuality, row.improvementRate, row.absoluteImportance, row.qualityImportancePercent, row.rank]));
                const weightColumn = technicals.length + 5;
                const letter = (offset: number) => sheet.getColumn(weightColumn + offset).letter;
                qfd.requirements.forEach((row, index) => {
                    const line = table.start + index;
                    sheet.getCell(line, weightColumn + 1).value = formula(`IF(SUM(${letter(0)}$${table.start}:${letter(0)}$${table.end})=0,0,ROUND(${letter(0)}${line}/SUM(${letter(0)}$${table.start}:${letter(0)}$${table.end})*100,2))`, row.weightPercent);
                    sheet.getCell(line, weightColumn + 4).value = formula(`MAX(${letter(2)}${line}:${letter(3)}${line})`, row.planQuality);
                    sheet.getCell(line, weightColumn + 5).value = formula(`IF(${letter(2)}${line}>0,ROUND(${letter(4)}${line}/${letter(2)}${line},2),0)`, row.improvementRate);
                    sheet.getCell(line, weightColumn + 6).value = formula(`ROUND(${letter(0)}${line}*IF(${letter(2)}${line}>0,${letter(4)}${line}/${letter(2)}${line},0),2)`, row.absoluteImportance);
                    sheet.getCell(line, weightColumn + 7).value = formula(`IF(SUM(${letter(6)}$${table.start}:${letter(6)}$${table.end})=0,0,ROUND(${letter(6)}${line}/SUM(${letter(6)}$${table.start}:${letter(6)}$${table.end})*100,2))`, row.qualityImportancePercent);
                    sheet.getCell(line, weightColumn + 8).value = formula(`IF(${letter(6)}${line}>0,RANK(${letter(6)}${line},${letter(6)}$${table.start}:${letter(6)}$${table.end}),"")`, row.rank ?? '');
                });
                const companies = [...new Set(project.technicalBenchmarks.map(row => row.company))];
                const summary = addTable(sheet, '기술특성별 목표 및 중요도', ['기술적 특성', '측정단위', '목표값', ...companies.map(company => company === 'self' ? '자사' : company), '합계 점수', '중요도(%)', '순위'], qfd.technicals.map(row => [row.name, row.unit ?? '', row.targetValue ?? '', ...companies.map(company => project.technicalBenchmarks.find(value => value.technicalCharId === row.id && value.company === company)?.value ?? ''), row.totalScore, row.importancePercent, row.rank]));
                qfd.technicals.forEach((row, index) => {
                    const scoreColumn = companies.length + 5;
                    const technicalLetter = sheet.getColumn(5 + index).letter;
                    sheet.getCell(summary.start + index, scoreColumn).value = formula(`ROUND(SUMPRODUCT(${technicalLetter}${table.start}:${technicalLetter}${table.end},${letter(0)}${table.start}:${letter(0)}${table.end}),2)`, row.totalScore);
                    const scoreLetter = sheet.getColumn(scoreColumn).letter;
                    const line = summary.start + index;
                    sheet.getCell(line, scoreColumn + 1).value = formula(`IF(SUM(${letter(0)}${table.start}:${letter(0)}${table.end})=0,0,ROUND(${scoreLetter}${line}/SUM(${letter(0)}${table.start}:${letter(0)}${table.end})*10,2))`, row.importancePercent);
                    sheet.getCell(line, scoreColumn + 2).value = formula(`IF(${scoreLetter}${line}>0,RANK(${scoreLetter}${line},${scoreLetter}$${summary.start}:${scoreLetter}$${summary.end}),"")`, row.rank ?? '');
                });
                if (project.techCorrelations.length) addTable(sheet, '기술특성 상관관계', ['기술특성 1', '기술특성 2', '상관관계'], project.techCorrelations.map(row => [technicals.find(technical => technical.id === row.techId1)?.name ?? '', technicals.find(technical => technical.id === row.techId2)?.name ?? '', row.correlation]));
                if (project.benchmarks.length) addTable(sheet, '고객요구사항별 경쟁 비교', ['고객요구사항', '회사', '점수'], project.benchmarks.map(row => [requirements.find(requirement => requirement.id === row.requirementId)?.requirement ?? '', row.company === 'self' ? '자사' : row.company, row.score]));
                break;
            }
            case 'tech-tree':
                addTable(sheet, '기능기술체계도', ['고객의 소리', '핵심스펙(기능)', '세부스펙(기능)', '기술적 특성'], sorted(project.techTreeEntries).map(row => [row.customerVoice, row.coreSpec, row.subSpec, row.techCharacteristic]));
                break;
            case 'improvements':
                addTable(sheet, '개선포인트 우선순위', ['순위', '고객니즈', '경쟁사대비 수준향상율', '개발향상비중'], sorted(project.improvementItems).filter(row => row.type === 'need').map((row, index) => [index + 1, row.content, row.improvementRate, row.devProportion]));
                addTable(sheet, '추가 기능 및 성능향상', ['순위', '고객니즈', '추가 기능', '성능향상'], sorted(project.improvementItems).filter(row => row.type === 'feature').map((row, index) => [index + 1, row.content, row.improvementRate, row.devProportion]));
                break;
            case 'target-spec': {
                const targets = sorted(project.targetSpecs);
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
                break;
            }
            case 'tech-roadmap':
                addTable(sheet, '향후목표고객LIST', ['순위', '고객혜택 제공을 위한 제품/서비스개선 방향(차별화)', '개선기능 및 성능향상', '개선을 위한 구현가능성', '목표 고객', 'Q1', 'Q2', 'Q3', 'Q4', '담당자'], sorted(project.techRoadmaps).map((row, index) => [index + 1, row.category, row.techItem, row.currentLevel, row.targetLevel ?? row.owner, row.q1, row.q2, row.q3, row.q4, row.owner]));
                break;
            case 'dev-plan':
                addTable(sheet, '개발계획서', ['단계', '개발 과제', '상세 내용', '시작일', '종료일', '담당자', '진행상태'], sorted(project.devPlans).map(row => [row.phase, row.task, row.description, row.startDate, row.endDate, row.owner, row.status]));
                break;
            case 'assets':
                addTable(sheet, '핵심자산 도출표', ['핵심자산', '필요 항목'], sorted(project.assetItems).filter(row => row.type === 'CORE').map(row => [row.content, row.category]));
                addTable(sheet, '보완자산 도출표', ['필요 항목', '해결방안'], sorted(project.assetItems).filter(row => row.type === 'COMPLEMENTARY').map(row => [row.category, row.content]));
                break;
            case 'funding-plan': {
                const rows = buildFundingPlansWithSales({ plans: sorted(project.fundingPlans), salesEstimates: project.salesEstimates });
                const isTotal = (row: typeof rows[number]) => `${row.category ?? ''}${row.item ?? ''}`.replace(/\s+/g, '').includes('합계');
                const table = addTable(sheet, '자금소요계획표 (단위: 원)', ['구분', '항목', 'Y+1년차', 'Y+2년차', 'Y+3년차'], rows.map(row => [row.category ?? '', row.item ?? '', row.year1 ?? null, row.year2 ?? null, row.year3 ?? null]), { mergeColumns: [0] });
                const costs = rows.filter(row => row.category !== '매출액' && row.item !== '매출액' && !isTotal(row));
                const totalIndexes = rows.flatMap((row, index) => isTotal(row) ? [table.start + index] : []);
                const total = totalIndexes.length ? null : addTable(sheet, '소요자금 합계 (단위: 원)', ['Y+1년차', 'Y+2년차', 'Y+3년차'], [[0, 0, 0]]);
                for (const [index, field] of ['year1', 'year2', 'year3'].entries()) {
                    const letter = sheet.getColumn(index + 4).letter;
                    const references = rows.flatMap((row, rowIndex) => costs.includes(row) ? [`${letter}${table.start + rowIndex}`] : []);
                    const value = formula(references.length ? `SUM(${references.join(',')})` : '0', costs.reduce((sum, row) => sum + Number(row[field as 'year1' | 'year2' | 'year3'] ?? 0), 0));
                    if (total) { sheet.getCell(total.start, index + 2).value = value; sheet.getCell(total.start, index + 2).numFmt = Number.isInteger(value.result) ? '#,##0' : NUMBER_FORMAT; }
                    totalIndexes.forEach(line => { sheet.getCell(line, index + 4).value = value; sheet.getCell(line, index + 4).numFmt = Number.isInteger(value.result) ? '#,##0' : NUMBER_FORMAT; });
                }
                break;
            }
            case 'funding-source': {
                const sources = sorted(project.fundingSources);
                const table = addTable(sheet, '자금조달계획표 (단위: 원)', ['구분', '출처', '금액', '출처', '금액', '출처', '금액'], sources.map(row => [row.category, ...[row.year1, row.year2, row.year3].flatMap(value => { const parsed = parseSourceYear(value); return [parsed.source, parsed.amount === '' ? null : parsed.amountNumber]; })]), { groupHeaders: ['구분', 'Y+1년차', 'Y+1년차', 'Y+2년차', 'Y+2년차', 'Y+3년차', 'Y+3년차'] });
                addTotals(sheet, table, [4, 6, 8]);
                break;
            }
        }
        sheet.pageSetup.printArea = `B2:${sheet.getColumn(Math.max(8, sheet.columnCount)).letter}${sheet.rowCount}`;
    }
    return Buffer.from(await workbook.xlsx.writeBuffer());
}
