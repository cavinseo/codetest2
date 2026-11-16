import type { ParsedExcelData, ParsedSheet } from './excel-parser';
import { generateId } from './id';
import { fromThousandWon } from './money';

export type WorkbookWritePolicy = 'replace' | 'append';

export interface WorkbookImportOptions {
    sheetNames?: string[];
}

export interface FormulaIssue {
    sheet: string;
    cell: string;
    formula: string;
    message: string;
}

export interface WorkbookImportRecords {
    salesEstimates: Array<{ period?: string; customer?: string | null; amount: number; futureAmount?: number; competitor?: string | null; order: number }>;
    specFunctions: Array<{ id: string; level: 'CORE' | 'SUB' | 'DETAIL'; parentId?: string | null; name: string; technology?: string | null; order: number }>;
    productAttributes: Array<{
        productName?: string | null;
        customerName?: string | null;
        marketSegment?: string | null;
        customerNeed?: string | null;
        benefit?: string | null;
        attribute?: string | null;
        techCapability?: string | null;
        order: number;
    }>;
    customerRequirements: Array<{
        category: string;
        subcategory?: string | null;
        requirement: string;
        kanoPositiveQ?: string | null;
        kanoNegativeQ?: string | null;
        order: number;
    }>;
    technicalCharacteristics: Array<{ name: string; unit?: string | null; targetValue?: string | null }>;
    // 필드 이름은 DB 열 이름이다. 화면이 바뀌면서 열의 쓰임이 달라졌는데 열 이름은 그대로라,
    // 이름과 실제 값이 다르다(2026-10-25 코드 리뷰 N2). 열 이름을 바꾸면 JSON 백업 형식과 모든
    // 화면이 함께 바뀌므로 여기서는 실제 뜻을 적어 둔다.
    //   type 'feature' 행: improvementRate = 추가 기능, devProportion = 성능 향상
    //   type 'need' 행(구 양식): improvementRate = 향상율, devProportion = 비중
    improvementItems: Array<{ type: string; content?: string | null; improvementRate?: string | null; devProportion?: string | null; priority?: string | null; order: number }>;
    targetSpecs: Array<{
        category?: string | null;
        subCategory?: string | null;
        specItem?: string | null;
        unit?: string | null;
        currentValue?: string | null;
        competitorValue?: string | null;
        targetValue?: string | null;
        note?: string | null;
        order: number;
    }>;
    // 향후목표고객(WS-12) 표. 필드 이름은 DB 열 이름이고 실제 값은 다르다(N2):
    //   category = 개선방향(차별화), techItem = 개선기능(성능향상),
    //   currentLevel = 구현가능성, owner = 목표고객(화면은 targetLevel 을 먼저 보고 없으면 owner 를 쓴다)
    techRoadmaps: Array<{
        category?: string | null;
        techItem?: string | null;
        currentLevel?: string | null;
        q1?: string | null;
        q2?: string | null;
        q3?: string | null;
        q4?: string | null;
        targetLevel?: string | null;
        owner?: string | null;
        order: number;
    }>;
    assetItems: Array<{ type: string; category?: string | null; content?: string | null; order: number }>;
    fundingPlans: Array<{ category?: string | null; item?: string | null; year1: number; year2: number | null; year3: number | null; order: number }>;
    fundingSources: Array<{ category?: string | null; year1?: string | null; year2?: string | null; year3?: string | null; order: number }>;
}

export interface ParsedWorkbookImport {
    selectedSheets: string[];
    recognizedSheets: string[];
    unknownSheets: string[];
    records: WorkbookImportRecords;
    counts: Record<keyof WorkbookImportRecords, number>;
    warnings: string[];
    errors: string[];
    formulaIssues: FormulaIssue[];
}

type SheetKey =
    | 'sales'
    | 'spec'
    | 'attributes'
    | 'requirements'
    | 'qfd'
    | 'improvements'
    | 'targetSpec'
    | 'techRoadmap'
    | 'assets'
    | 'fundingPlans'
    | 'fundingSources';

interface SheetDefinition {
    key: SheetKey;
    displayName: string;
    aliases: string[];
}

const SHEET_DEFINITIONS: SheetDefinition[] = [
    { key: 'sales', displayName: '자사매출추정표', aliases: ['자사매출추정표', '매출추정', '매출현황'] },
    { key: 'spec', displayName: 'AS-IS스펙표', aliases: ['AS-IS스펙표', 'AS-IS 스펙표', 'ASIS스펙', '스펙표'] },
    { key: 'attributes', displayName: '제품속성표', aliases: ['제품속성표', '제품속성서'] },
    { key: 'requirements', displayName: '고객요구사항도출표', aliases: ['고객요구사항도출표', '고객요구사항', '요구사항도출'] },
    { key: 'qfd', displayName: 'QFD', aliases: ['QFD'] },
    { key: 'improvements', displayName: '개선포인트도출', aliases: ['개선포인트도출', '개선포인트'] },
    { key: 'targetSpec', displayName: '최종목표스펙도출', aliases: ['최종목표스펙도출', '최종목표스펙', '목표스펙'] },
    { key: 'techRoadmap', displayName: '향후목표고객LIST', aliases: ['향후목표고객LIST', '향후목표고객', '목표고객'] },
    { key: 'assets', displayName: '핵심자산과 보완자산표', aliases: ['핵심자산과 보완자산표', '핵심자산', '보완자산'] },
    { key: 'fundingPlans', displayName: '자금소요계획표', aliases: ['자금소요계획표', '자금소요'] },
    { key: 'fundingSources', displayName: '자금조달계획표', aliases: ['자금조달계획표', '자금조달'] },
];

function emptyRecords(): WorkbookImportRecords {
    return {
        salesEstimates: [],
        specFunctions: [],
        productAttributes: [],
        customerRequirements: [],
        technicalCharacteristics: [],
        improvementItems: [],
        targetSpecs: [],
        techRoadmaps: [],
        assetItems: [],
        fundingPlans: [],
        fundingSources: [],
    };
}

function text(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value).replace(/\s+/g, ' ').trim();
}

function normalize(value: unknown): string {
    return text(value).toLowerCase().replace(/[\s_\-()[\]{}]/g, '');
}

// 엑셀을 서식 그대로(raw: false) 읽으므로 금액·비율 칸은 "₩1,200,000", "12%", "(500)",
// "△500" 같은 표시 문자열로 들어온다. 쉼표만 지우던 때는 이런 값이 전부 0 이 되어 매출·자금
// 표의 금액이 사라졌다. 통화 기호·원·% 는 떼고, 괄호와 △·▲ 는 회계 표기의 음수로 읽는다.
// % 는 화면에 보이는 숫자(12% → 12)를 쓴다 — 앱에서 직접 입력할 때도 12 로 적기 때문이다.
function numberValue(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    let cleaned = text(value).replace(/[,\s₩￦$]|원/g, '');
    let negative = false;
    const parenthesized = /^\((.*)\)$/.exec(cleaned);
    if (parenthesized) {
        negative = true;
        cleaned = parenthesized[1];
    }
    if (/^[△▲]/.test(cleaned)) {
        negative = true;
        cleaned = cleaned.slice(1);
    }
    const parsed = Number(cleaned.replace(/%$/, ''));
    if (!Number.isFinite(parsed)) return 0;
    // "(0)" 이 -0 이 되지 않도록 0 은 그대로 둔다.
    return negative && parsed !== 0 ? -parsed : parsed;
}

function hasText(value: unknown): boolean {
    return text(value).length > 0;
}

function isRowEmpty(row: unknown[] | undefined): boolean {
    return !row || row.every((cell) => !hasText(cell));
}

function cell(row: unknown[] | undefined, col: number): string {
    return text(row?.[col]);
}

function nonZeroCell(row: unknown[] | undefined, col: number): string {
    const value = cell(row, col);
    return value === '0' ? '' : value;
}

/** 양식에 따라 없을 수 있는 열의 값. 열이 없거나 칸이 비면 null 이다. */
function optionalCell(row: unknown[] | undefined, col: number): string | null {
    if (col < 0) return null;
    return cell(row, col) || null;
}

function findHeader(sheet: ParsedSheet, keywords: string[]): { rowIndex: number; columns: number[] } | null {
    const normalizedKeywords = keywords.map(normalize);
    for (let rowIndex = 0; rowIndex < sheet.data.length; rowIndex++) {
        const row = sheet.data[rowIndex] ?? [];
        const normalizedCells = row.map(normalize);
        const columns = normalizedKeywords.map((keyword) => normalizedCells.findIndex((value) => value.includes(keyword)));
        if (columns.every((index) => index >= 0)) {
            return { rowIndex, columns };
        }
    }
    return null;
}

function findColumn(row: unknown[] | undefined, keywords: string[]): number {
    const normalizedKeywords = keywords.map(normalize);
    return (row ?? []).findIndex((value) => {
        const normalizedValue = normalize(value);
        return normalizedKeywords.some((keyword) => normalizedValue.includes(keyword));
    });
}

function matchesDefinition(sheetName: string, definition: SheetDefinition): boolean {
    const normalizedName = normalize(sheetName);
    return definition.aliases.some((alias) => normalizedName.includes(normalize(alias)));
}

function getRequestedSheetAliases(requestedName: string): string[] {
    const normalizedName = normalize(requestedName);
    const matchingDefinition = SHEET_DEFINITIONS.find((definition) =>
        matchesDefinition(requestedName, definition)
    );

    if (matchingDefinition) return [requestedName, matchingDefinition.displayName, ...matchingDefinition.aliases];
    if (normalizedName.includes('제품속성')) return [requestedName, '제품속성표', '제품속성서', '제품속성'];
    if (normalizedName.includes('고객요구사항')) return [requestedName, '고객요구사항도출표', '고객요구사항', '요구사항도출'];
    if (normalizedName.includes('asis') || normalizedName.includes('스펙')) return [requestedName, 'AS-IS스펙표', 'AS-IS 스펙표', 'ASIS스펙', '스펙표'];
    return [requestedName];
}

function matchesRequestedSheet(sheetName: string, requestedName: string): boolean {
    const normalizedSheetName = normalize(sheetName);
    return getRequestedSheetAliases(requestedName).some((alias) => {
        const normalizedAlias = normalize(alias);
        return (
            normalizedSheetName === normalizedAlias ||
            normalizedSheetName.includes(normalizedAlias) ||
            normalizedAlias.includes(normalizedSheetName)
        );
    });
}

function resolveSheetKey(sheetName: string): SheetKey | null {
    return SHEET_DEFINITIONS.find((definition) => matchesDefinition(sheetName, definition))?.key ?? null;
}

function selectSheets(parsedData: ParsedExcelData, options: WorkbookImportOptions) {
    const requested = options.sheetNames?.map(text).filter(Boolean) ?? [];
    if (requested.length === 0) {
        return {
            selected: parsedData.sheets,
            errors: [] as string[],
        };
    }

    const selected: ParsedSheet[] = [];
    const errors: string[] = [];
    for (const requestedName of requested) {
        const byAlias = parsedData.sheets.find((sheet) => matchesRequestedSheet(sheet.name, requestedName));
        if (byAlias) selected.push(byAlias);
        else errors.push(`요청한 워크시트 "${requestedName}"를 찾을 수 없습니다.`);
    }

    return { selected, errors };
}

function sheetMoneyReader(sheet: ParsedSheet): (value: unknown) => number {
    const unit = sheet.data.flat().map(text).join(' ').match(/단위\s*[:：]\s*(천만원|백만원|억원|만원|천원|원)/)?.[1];
    // 단위 없는 기존 양식은 저장값과 같은 백만원으로 읽어 재업로드 금액을 보존한다.
    return value => {
        const amount = numberValue(value);
        if (unit === '천원') return fromThousandWon(amount);
        if (unit === '원') return fromThousandWon(fromThousandWon(amount));
        if (unit === '만원') return fromThousandWon(amount * 10);
        if (unit === '억원') return amount * 100;
        if (unit === '천만원') return amount * 10;
        return amount;
    };
}

function hasLegacyMoneyExportLabel(sheet: ParsedSheet): boolean {
    // 이전 앱 엑셀은 백만원 숫자에 원 표기를 붙여 실제 단위를 확정할 수 없다.
    return sheet.name.startsWith('WS-') && sheet.data.some(row => !hasText(row[0]) && row.some(value =>
        /^(현재\(Y\) 매출|향후 1년 목표 매출|자금소요계획표|자금조달계획표) \(단위: 원\)$/.test(text(value))));
}

function parseSales(sheet: ParsedSheet) {
    const records: WorkbookImportRecords['salesEstimates'] = [];
    const readMoney = sheetMoneyReader(sheet);
    let period = 'Y';
    let columns: { customer: number; amount: number; future: number; competitor: number } | null = null;
    for (const row of sheet.data) {
        const rowText = row.map(text).join(' ');
        if (rowText.includes('단위') && /향후|미래/.test(rowText)) { period = 'Y_PLUS_1'; columns = null; continue; }
        if (rowText.includes('단위') && /현재/.test(rowText)) { period = 'Y'; columns = null; continue; }
        const customerCol = findColumn(row, ['매출처', '고객']);
        const amountCol = findColumn(row, ['매출액', '금액']);
        if (customerCol >= 0 && amountCol >= 0) {
            columns = { customer: customerCol, amount: amountCol, future: findColumn(row, ['미래', 'y+1', '향후']), competitor: findColumn(row, ['경쟁사']) };
            continue;
        }
        if (!columns || isRowEmpty(row) || row.some(value => text(value) === '합계')) continue;
        const customer = cell(row, columns.customer);
        const competitor = cell(row, columns.competitor);
        const amount = readMoney(row[columns.amount]);
        if (customer || amount !== 0 || competitor) records.push({ period, customer: customer || null, amount, competitor: competitor || null, order: records.length });
        if (columns.future >= 0) {
            const futureAmount = readMoney(row[columns.future]);
            if (customer || futureAmount !== 0 || competitor) records.push({ period: 'Y_PLUS_1', customer: customer || null, amount: futureAmount, futureAmount: 0, competitor: competitor || null, order: records.length });
        }
    }
    return records;
}

type SpecLevel = WorkbookImportRecords['specFunctions'][number]['level'];

function specLeafLevel(sub: string, detail: string): SpecLevel {
    if (detail) return 'DETAIL';
    if (sub) return 'SUB';
    return 'CORE';
}

function parseSpec(sheet: ParsedSheet) {
    const records: WorkbookImportRecords['specFunctions'] = [];
    const header = findHeader(sheet, ['핵심', '세부', '기술']);
    if (!header) return records;
    const headerRow = sheet.data[header.rowIndex];
    const coreCol = findColumn(headerRow, ['핵심']);
    const subCol = findColumn(headerRow, ['세부']);
    const detailCol = findColumn(headerRow, ['세세부', '상세']);
    const techCol = findColumn(headerRow, ['기술']);

    // 핵심·세부 기능 칸은 보통 여러 행에 걸쳐 병합돼 있고, 병합 셀은 첫 행에만 값이 있다.
    // 빈 칸을 "상위 없음"으로 읽으면 둘째 행부터의 하위 기능이 고아가 되어 속성 선택·
    // 목표스펙 화면에서 사라졌다. 빈 상위 칸은 위에서 이어진 병합으로 보고 직전 상위에 잇는다.
    let currentCoreId: string | null = null;
    let currentSubId: string | null = null;
    for (let rowIndex = header.rowIndex + 1; rowIndex < sheet.data.length; rowIndex++) {
        const row = sheet.data[rowIndex];
        const core = cell(row, coreCol);
        const sub = cell(row, subCol);
        const detail = detailCol >= 0 && detailCol !== subCol ? cell(row, detailCol) : '';
        const technology = cell(row, techCol);
        if (!core && !sub && !detail && !technology) continue;

        // 한 행의 기술 칸은 그 행에서 가장 아래 단계(세세부 > 세부 > 핵심)의 기능에 붙는다.
        const leafLevel = specLeafLevel(sub, detail);
        const technologyFor = (level: SpecLevel) => (level === leafLevel ? technology || null : null);
        const coreId = generateId('spec');
        const subId = generateId('spec');
        if (core) {
            records.push({ id: coreId, level: 'CORE', name: core, technology: technologyFor('CORE'), order: records.length });
            currentCoreId = coreId;
            currentSubId = null;
        }
        if (sub) {
            records.push({ id: subId, level: 'SUB', parentId: currentCoreId, name: sub, technology: technologyFor('SUB'), order: records.length });
            currentSubId = subId;
        }
        if (detail) records.push({ id: generateId('spec'), level: 'DETAIL', parentId: currentSubId ?? currentCoreId, name: detail, technology: technologyFor('DETAIL'), order: records.length });
        if (!core && !sub && !detail && technology) records.push({ id: generateId('spec'), level: 'CORE', name: technology, technology, order: records.length });
    }
    return records;
}

function parseAttributes(sheet: ParsedSheet) {
    const records: WorkbookImportRecords['productAttributes'] = [];
    const header = findHeader(sheet, ['제품명', '고객명', '세분시장', '제품속성']);
    if (!header) return records;
    const headerRow = sheet.data[header.rowIndex];
    const productCol = findColumn(headerRow, ['제품명']);
    const customerCol = findColumn(headerRow, ['고객명']);
    const segmentCol = findColumn(headerRow, ['세분시장']);
    const needCol = findColumn(headerRow, ['고객니즈', '니즈']);
    const benefitCol = findColumn(headerRow, ['제공혜택', '혜택']);
    const attrCol = findColumn(headerRow, ['제품속성', '속성']);
    const techCol = findColumn(headerRow, ['기술역량', '기술']);

    for (let rowIndex = header.rowIndex + 1; rowIndex < sheet.data.length; rowIndex++) {
        const row = sheet.data[rowIndex];
        const item = {
            productName: cell(row, productCol) || null,
            customerName: cell(row, customerCol) || null,
            marketSegment: cell(row, segmentCol) || null,
            customerNeed: cell(row, needCol) || null,
            benefit: cell(row, benefitCol) || null,
            attribute: cell(row, attrCol) || null,
            techCapability: cell(row, techCol) || null,
            order: records.length,
        };
        if (Object.entries(item).some(([key, value]) => key !== 'order' && hasText(value))) records.push(item);
    }
    return records;
}

function parseRequirements(sheet: ParsedSheet) {
    const records: WorkbookImportRecords['customerRequirements'] = [];
    const header = findHeader(sheet, ['항목', '1차', '2차']);
    if (!header) return records;
    const headerRow = sheet.data[header.rowIndex];
    const requirementCol = findColumn(headerRow, ['항목', '요구']);
    const categoryCol = findColumn(headerRow, ['1차', '대분류']);
    const subcategoryCol = findColumn(headerRow, ['2차', '중분류']);

    for (let rowIndex = header.rowIndex + 1; rowIndex < sheet.data.length; rowIndex++) {
        const row = sheet.data[rowIndex];
        const requirement = cell(row, requirementCol);
        if (!requirement) continue;
        records.push({
            category: cell(row, categoryCol) || '미분류',
            subcategory: cell(row, subcategoryCol) || null,
            requirement,
            order: records.length,
        });
    }
    return records;
}

function parseQfdTechnicals(sheet: ParsedSheet) {
    const records: WorkbookImportRecords['technicalCharacteristics'] = [];
    const specRowIndex = sheet.data.findIndex((row) => (row ?? []).some((value) => normalize(value) === 'spec'));
    if (specRowIndex < 0) return records;
    const specRow = sheet.data[specRowIndex] ?? [];
    const unitRow = sheet.data[specRowIndex + 1] ?? [];
    const targetRow = sheet.data[specRowIndex + 3] ?? [];
    for (let col = 0; col < specRow.length; col++) {
        const name = cell(specRow, col);
        if (!name || normalize(name) === 'spec' || normalize(name).includes('측정단위')) continue;
        records.push({
            name,
            unit: cell(unitRow, col) || null,
            targetValue: cell(targetRow, col) || null,
        });
    }
    return records;
}

// 개선포인트 시트에는 표가 둘 있다. 예전 양식의 "고객니즈 순위" 표와, 지금 양식의
// "개선포인트 · 추가 기능 · 성능 향상" 표다. 한 함수에 두 파서가 겹쳐 있어 나눴다
// (2026-10-25 코드 리뷰 L7).
function parseImprovementNeeds(sheet: ParsedSheet): WorkbookImportRecords['improvementItems'] {
    const records: WorkbookImportRecords['improvementItems'] = [];
    const header = findHeader(sheet, ['순위', '고객니즈']);
    if (!header) return records;
    const headerRow = sheet.data[header.rowIndex];
    // 지금 양식의 표 머리에도 '순위'·'고객니즈'가 함께 있을 수 있다. 그건 아래 표의 몫이다.
    const isFeatureListHeader = findColumn(headerRow, ['추가 기능', '추가기능']) >= 0
        || findColumn(headerRow, ['성능향상', '성능 향상']) >= 0;
    if (isFeatureListHeader) return records;
    const priorityCol = findColumn(headerRow, ['순위']);
    const contentCol = findColumn(headerRow, ['고객니즈']);
    const rateCol = findColumn(headerRow, ['향상율', '개선율']);
    const proportionCol = findColumn(headerRow, ['비중']);
    // 아래에 지금 양식의 기능 표가 이어 붙어 있으면 그 머리 행에서 멈춘다. 예전에는 시트 끝까지
    // 읽어, 기능 표의 머리와 행까지 고객니즈로 들어왔다.
    const featureHeader = findHeader(sheet, ['개선포인트', '추가 기능', '성능향상']);
    const end = featureHeader && featureHeader.rowIndex > header.rowIndex ? featureHeader.rowIndex : sheet.data.length;
    for (let rowIndex = header.rowIndex + 1; rowIndex < end; rowIndex++) {
        const row = sheet.data[rowIndex];
        const content = cell(row, contentCol);
        if (!content) continue;
        records.push({
            type: 'need',
            content,
            improvementRate: optionalCell(row, rateCol),
            devProportion: optionalCell(row, proportionCol),
            priority: optionalCell(row, priorityCol),
            order: records.length,
        });
    }
    return records;
}

function parseImprovementFeatures(sheet: ParsedSheet): WorkbookImportRecords['improvementItems'] {
    const records: WorkbookImportRecords['improvementItems'] = [];
    const header = findHeader(sheet, ['개선포인트', '추가 기능', '성능향상']);
    if (!header) return records;
    const headerRow = sheet.data[header.rowIndex];
    const needCol = findColumn(headerRow, ['개선포인트']);
    const addedFeatureCol = findColumn(headerRow, ['추가 기능', '추가기능']);
    const performanceCol = findColumn(headerRow, ['성능향상', '성능 향상']);
    for (let rowIndex = header.rowIndex + 1; rowIndex < sheet.data.length; rowIndex++) {
        const row = sheet.data[rowIndex];
        const customerNeed = nonZeroCell(row, needCol);
        const addedFeature = nonZeroCell(row, addedFeatureCol);
        const performanceImprovement = nonZeroCell(row, performanceCol);
        if (!customerNeed && !addedFeature && !performanceImprovement) continue;
        records.push({
            type: 'feature',
            content: customerNeed || null,
            // DB 열 이름이 다를 뿐, 추가 기능·성능 향상을 담는다(위 타입 주석 참고).
            improvementRate: addedFeature || null,
            devProportion: performanceImprovement || null,
            priority: null,
            order: records.length,
        });
    }
    return records;
}

function parseImprovements(sheet: ParsedSheet) {
    return [...parseImprovementNeeds(sheet), ...parseImprovementFeatures(sheet)];
}

function parseTargetSpecs(sheet: ParsedSheet) {
    const records: WorkbookImportRecords['targetSpecs'] = [];
    const header = findHeader(sheet, ['스펙분류', '세부항목', '기술']);
    if (!header) return records;
    const headerRow = sheet.data[header.rowIndex];
    const categoryCol = findColumn(headerRow, ['스펙분류', '분류']);
    const subCol = findColumn(headerRow, ['세부항목']);
    const specCol = findColumn(headerRow, ['기술적특성', '기술']);
    const noteCol = findColumn(headerRow, ['개선여부', '비고']);

    for (let rowIndex = header.rowIndex + 1; rowIndex < sheet.data.length; rowIndex++) {
        const row = sheet.data[rowIndex];
        const specItem = cell(row, specCol);
        const category = cell(row, categoryCol);
        const subCategory = cell(row, subCol);
        if (!specItem && !category && !subCategory) continue;
        records.push({ category: category || null, subCategory: subCategory || null, specItem: specItem || null, note: optionalCell(row, noteCol), order: records.length });
    }
    return records;
}

function parseTechRoadmap(sheet: ParsedSheet) {
    const records: WorkbookImportRecords['techRoadmaps'] = [];
    const header = findHeader(sheet, ['순위', '개선', '목표고객']);
    if (!header) return records;
    const headerRow = sheet.data[header.rowIndex];
    const directionCol = findColumn(headerRow, ['개선방향', '차별화']);
    const techCol = findColumn(headerRow, ['개선기능', '성능향상']);
    const feasibilityCol = findColumn(headerRow, ['구현가능성']);
    const targetCol = findColumn(headerRow, ['목표고객']);

    for (let rowIndex = header.rowIndex + 1; rowIndex < sheet.data.length; rowIndex++) {
        const row = sheet.data[rowIndex];
        const techItem = cell(row, techCol);
        const category = cell(row, directionCol);
        const targetCustomer = cell(row, targetCol);
        if (!techItem && !category && !targetCustomer) continue;
        const feasibility = optionalCell(row, feasibilityCol);
        records.push({ category: category || null, techItem: techItem || null, currentLevel: feasibility, owner: targetCustomer || null, order: records.length });
    }
    return records;
}

function parseAssets(sheet: ParsedSheet) {
    const records: WorkbookImportRecords['assetItems'] = [];
    let currentType: 'CORE' | 'COMPLEMENTARY' = 'CORE';
    for (const row of sheet.data) {
        const joined = row.map(text).join(' ');
        if (joined.includes('보완자산')) currentType = 'COMPLEMENTARY';
        if (joined.includes('핵심자산')) currentType = 'CORE';
        if (joined.includes('필요 항목') || joined.includes('해결방안') || joined.includes('도출표')) continue;
        const values = row.map(text).filter(Boolean);
        if (values.length === 0) continue;
        records.push({ type: currentType, category: values[0] ?? null, content: values.slice(1).join(' / ') || null, order: records.length });
    }
    return records;
}

function parseFundingPlans(sheet: ParsedSheet) {
    const records: WorkbookImportRecords['fundingPlans'] = [];
    const header = findHeader(sheet, ['구분', '항목']);
    if (!header) return records;
    const readMoney = sheetMoneyReader(sheet);
    const [categoryCol, itemCol] = header.columns;
    let previousCategory = '';
    for (let rowIndex = header.rowIndex + 1; rowIndex < sheet.data.length; rowIndex++) {
        const row = sheet.data[rowIndex];
        if (row?.some(value => /합계.*단위/.test(text(value)))) break;
        const item = cell(row, itemCol);
        const category = cell(row, categoryCol) || (item ? previousCategory : '');
        if (!category && !item) continue;
        if (/합계|단위/.test(category + item)) continue;
        previousCategory = category;
        // 매출액 행의 2·3차년도는 비워 둘 수 있다(아직 모름). 0 으로 읽으면 "매출 0원"이 되므로
        // 빈 칸은 null 로 남긴다. 다른 행은 빈 칸도 0 이다. 금액은 시트의 단위 표기대로 환산하고,
        // 구분 열 위치가 양식마다 달라 항목 열 바로 뒤를 1차년도로 본다.
        const isRevenueRow = category === '매출액' || item === '매출액';
        const yearAmount = (col: number) => (isRevenueRow && !cell(row, col) ? null : readMoney(row?.[col]));
        records.push({
            category: category || null,
            item: item || null,
            year1: readMoney(row?.[itemCol + 1]),
            year2: yearAmount(itemCol + 2),
            year3: yearAmount(itemCol + 3),
            order: records.length,
        });
    }
    return records;
}

function parseFundingSources(sheet: ParsedSheet) {
    const records: WorkbookImportRecords['fundingSources'] = [];
    const header = findHeader(sheet, ['구분']);
    const start = header ? header.rowIndex + 2 : 0;
    const categoryCol = header?.columns[0] ?? 0;
    const readMoney = sheetMoneyReader(sheet);
    const hasDeclaredUnit = sheet.data.flat().some(value => /단위\s*[:：]/.test(text(value)));
    let previousCategory = '';
    for (let rowIndex = start; rowIndex < sheet.data.length; rowIndex++) {
        const row = sheet.data[rowIndex];
        if (isRowEmpty(row)) continue;
        const category = cell(row, categoryCol) || previousCategory;
        if (!category || category.includes('합계')) continue;
        previousCategory = category;
        const years = [1, 3, 5].map(offset => {
            const source = cell(row, categoryCol + offset);
            const amount = cell(row, categoryCol + offset + 1);
            if (!hasDeclaredUnit) return [source, amount].filter(Boolean).join(':') || null;
            return source || amount !== '' ? JSON.stringify({ source, amount: amount === '' ? '' : String(readMoney(amount)) }) : null;
        });
        records.push({ category, year1: years[0], year2: years[1], year3: years[2], order: records.length });
    }
    return records;
}

function appendRecords(records: WorkbookImportRecords, key: SheetKey, sheet: ParsedSheet) {
    switch (key) {
        case 'sales':
            records.salesEstimates.push(...parseSales(sheet));
            break;
        case 'spec':
            records.specFunctions.push(...parseSpec(sheet));
            break;
        case 'attributes':
            records.productAttributes.push(...parseAttributes(sheet));
            break;
        case 'requirements':
            records.customerRequirements.push(...parseRequirements(sheet));
            break;
        case 'qfd':
            records.technicalCharacteristics.push(...parseQfdTechnicals(sheet));
            break;
        case 'improvements':
            records.improvementItems.push(...parseImprovements(sheet));
            break;
        case 'targetSpec':
            records.targetSpecs.push(...parseTargetSpecs(sheet));
            break;
        case 'techRoadmap':
            records.techRoadmaps.push(...parseTechRoadmap(sheet));
            break;
        case 'assets':
            records.assetItems.push(...parseAssets(sheet));
            break;
        case 'fundingPlans':
            records.fundingPlans.push(...parseFundingPlans(sheet));
            break;
        case 'fundingSources':
            records.fundingSources.push(...parseFundingSources(sheet));
            break;
    }
}

export function getImportableSheetKeys() {
    return SHEET_DEFINITIONS.map((definition) => definition.displayName);
}

export function validateWorkbookFormulas(parsedData: ParsedExcelData): FormulaIssue[] {
    const issues: FormulaIssue[] = [];
    for (const sheet of parsedData.sheets) {
        for (const [cellAddress, formula] of Object.entries(sheet.formulas ?? {})) {
            if (formula.includes('#REF!')) {
                issues.push({
                    sheet: sheet.name,
                    cell: cellAddress,
                    formula,
                    message: '깨진 #REF! 수식이 있습니다.',
                });
            }
        }
    }
    return issues;
}

export function parseWorkbookImport(parsedData: ParsedExcelData, options: WorkbookImportOptions = {}): ParsedWorkbookImport {
    const records = emptyRecords();
    const warnings: string[] = [];
    const selection = selectSheets(parsedData, options);
    const recognizedSheets: string[] = [];
    const unknownSheets: string[] = [];

    for (const selectedSheet of selection.selected) {
        const key = resolveSheetKey(selectedSheet.name);
        if (!key) {
            unknownSheets.push(selectedSheet.name);
            warnings.push(`지원하지 않는 워크시트 "${selectedSheet.name}"는 건너뜁니다.`);
            continue;
        }
        if (['sales', 'fundingPlans', 'fundingSources'].includes(key) && hasLegacyMoneyExportLabel(selectedSheet)) {
            selection.errors.push(`워크시트 "${selectedSheet.name}"는 이전 앱의 금액 단위 표기가 일치하지 않는 양식입니다. 원래 백만원 금액이면 단위 표기를 백만원으로 수정하거나 새 천원 양식을 이용해 주세요.`);
            continue;
        }
        const before = Object.values(records).reduce((sum, rows) => sum + rows.length, 0);
        appendRecords(records, key, selectedSheet);
        const after = Object.values(records).reduce((sum, rows) => sum + rows.length, 0);
        recognizedSheets.push(selectedSheet.name);
        if (after === before) {
            warnings.push(`워크시트 "${selectedSheet.name}"에서 반영할 값을 찾지 못했습니다.`);
        }
    }

    const counts = Object.fromEntries(
        Object.entries(records).map(([key, value]) => [key, value.length])
    ) as Record<keyof WorkbookImportRecords, number>;

    return {
        selectedSheets: selection.selected.map((sheet) => sheet.name),
        recognizedSheets,
        unknownSheets,
        records,
        counts,
        warnings,
        errors: selection.errors,
        formulaIssues: validateWorkbookFormulas(parsedData),
    };
}
