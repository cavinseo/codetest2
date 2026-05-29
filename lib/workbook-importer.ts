import type { ParsedExcelData, ParsedSheet } from './excel-parser';
import { generateId } from './id';

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
    fundingPlans: Array<{ category?: string | null; item?: string | null; year1: number; year2: number; year3: number; order: number }>;
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

function numberValue(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const cleaned = text(value).replace(/,/g, '');
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
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
        const exact = parsedData.sheets.find((sheet) => normalize(sheet.name) === normalize(requestedName));
        const byAlias = exact ?? parsedData.sheets.find((sheet) => normalize(sheet.name).includes(normalize(requestedName)) || normalize(requestedName).includes(normalize(sheet.name)));
        if (byAlias) selected.push(byAlias);
        else errors.push(`요청한 워크시트 "${requestedName}"를 찾을 수 없습니다.`);
    }

    return { selected, errors };
}

function parseSales(sheet: ParsedSheet) {
    const records: WorkbookImportRecords['salesEstimates'] = [];
    const header = findHeader(sheet, ['매출처', '매출액']);
    if (!header) return records;
    const headerRow = sheet.data[header.rowIndex];
    const customerCol = findColumn(headerRow, ['매출처', '고객']);
    const amountCol = findColumn(headerRow, ['매출액', '금액']);
    const futureAmountCol = findColumn(headerRow, ['미래', 'y+1', '향후']);
    const competitorCol = findColumn(headerRow, ['경쟁사']);

    for (let rowIndex = header.rowIndex + 1; rowIndex < sheet.data.length; rowIndex++) {
        const row = sheet.data[rowIndex];
        if (isRowEmpty(row)) continue;
        const customer = cell(row, customerCol);
        const amount = numberValue(row?.[amountCol]);
        const futureAmount = futureAmountCol >= 0 ? numberValue(row?.[futureAmountCol]) : 0;
        const competitor = competitorCol >= 0 ? cell(row, competitorCol) : '';
        if (customer || amount !== 0 || competitor) {
            records.push({ period: 'Y', customer: customer || null, amount, competitor: competitor || null, order: records.length });
        }
        if (customer || futureAmount !== 0 || competitor) {
            records.push({ period: 'Y_PLUS_1', customer: customer || null, amount: futureAmount, futureAmount: 0, competitor: competitor || null, order: records.length });
        }
    }
    return records;
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

    for (let rowIndex = header.rowIndex + 1; rowIndex < sheet.data.length; rowIndex++) {
        const row = sheet.data[rowIndex];
        const core = cell(row, coreCol);
        const sub = cell(row, subCol);
        const detail = detailCol >= 0 && detailCol !== subCol ? cell(row, detailCol) : '';
        const technology = cell(row, techCol);
        if (!core && !sub && !detail && !technology) continue;

        const coreId = generateId('spec');
        const subId = generateId('spec');
        if (core) records.push({ id: coreId, level: 'CORE', name: core, technology: !sub && !detail ? technology || null : null, order: records.length });
        if (sub) records.push({ id: subId, level: 'SUB', parentId: core ? coreId : null, name: sub, technology: detail ? null : technology || null, order: records.length });
        if (detail) records.push({ id: generateId('spec'), level: 'DETAIL', parentId: sub ? subId : core ? coreId : null, name: detail, technology: technology || null, order: records.length });
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

function parseImprovements(sheet: ParsedSheet) {
    const records: WorkbookImportRecords['improvementItems'] = [];
    const firstHeader = findHeader(sheet, ['순위', '고객니즈']);
    if (firstHeader) {
        const headerRow = sheet.data[firstHeader.rowIndex];
        const priorityCol = findColumn(headerRow, ['순위']);
        const contentCol = findColumn(headerRow, ['고객니즈']);
        const rateCol = findColumn(headerRow, ['향상율', '개선율']);
        const proportionCol = findColumn(headerRow, ['비중']);
        for (let rowIndex = firstHeader.rowIndex + 1; rowIndex < sheet.data.length; rowIndex++) {
            const row = sheet.data[rowIndex];
            const content = cell(row, contentCol);
            if (!content) continue;
            records.push({
                type: 'need',
                content,
                improvementRate: rateCol >= 0 ? cell(row, rateCol) || null : null,
                devProportion: proportionCol >= 0 ? cell(row, proportionCol) || null : null,
                priority: priorityCol >= 0 ? cell(row, priorityCol) || null : null,
                order: records.length,
            });
        }
    }
    return records;
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
        records.push({ category: category || null, subCategory: subCategory || null, specItem: specItem || null, note: noteCol >= 0 ? cell(row, noteCol) || null : null, order: records.length });
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
        const owner = cell(row, targetCol);
        if (!techItem && !category && !owner) continue;
        records.push({ category: category || null, techItem: techItem || null, currentLevel: feasibilityCol >= 0 ? cell(row, feasibilityCol) || null : null, owner: owner || null, order: records.length });
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
    for (let rowIndex = header.rowIndex + 1; rowIndex < sheet.data.length; rowIndex++) {
        const row = sheet.data[rowIndex];
        const category = cell(row, 0);
        const item = cell(row, 1);
        if (!category && !item) continue;
        records.push({
            category: category || null,
            item: item || null,
            year1: numberValue(row?.[2]),
            year2: numberValue(row?.[3]),
            year3: numberValue(row?.[4]),
            order: records.length,
        });
    }
    return records;
}

function parseFundingSources(sheet: ParsedSheet) {
    const records: WorkbookImportRecords['fundingSources'] = [];
    const header = findHeader(sheet, ['구분']);
    const start = header ? header.rowIndex + 2 : 0;
    for (let rowIndex = start; rowIndex < sheet.data.length; rowIndex++) {
        const row = sheet.data[rowIndex];
        const category = cell(row, 0);
        if (!category || category === '합계') continue;
        records.push({
            category,
            year1: [cell(row, 1), cell(row, 2)].filter(Boolean).join(':') || null,
            year2: [cell(row, 3), cell(row, 4)].filter(Boolean).join(':') || null,
            year3: [cell(row, 5), cell(row, 6)].filter(Boolean).join(':') || null,
            order: records.length,
        });
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
