// 업로드용 워크북 템플릿에서 단일 시트 파일을 생성하는 유틸리티
import * as XLSX from 'xlsx';

export type ImportTemplateSheet = 'spec' | 'attributes' | 'requirements';

const SHEET_MATCHERS: Record<ImportTemplateSheet, (sheetName: string) => boolean> = {
    spec: (sheetName) => {
        const normalized = normalizeSheetName(sheetName);
        return (
            normalized.includes('asis') &&
            (normalized.includes('spec') || normalized.includes('스펙'))
        );
    },
    attributes: (sheetName) => normalizeSheetName(sheetName).includes('제품속성표'),
    requirements: (sheetName) => normalizeSheetName(sheetName).includes('고객요구사항도출표'),
};

export const IMPORT_TEMPLATE_FILE_NAMES: Record<ImportTemplateSheet, string> = {
    spec: 'AS-IS_스펙표_업로드_양식.xlsx',
    attributes: '제품속성표_업로드_양식.xlsx',
    requirements: '고객요구사항도출표_업로드_양식.xlsx',
};

function normalizeSheetName(name: string) {
    return name.toLowerCase().replace(/[\s_\-()[\]{}]/g, '');
}

export function parseImportTemplateSheet(value: string | null): ImportTemplateSheet | null {
    if (value === 'spec' || value === 'attributes' || value === 'requirements') return value;
    return null;
}

export function findImportTemplateSheetName(sheetNames: string[], sheet: ImportTemplateSheet) {
    return sheetNames.find(SHEET_MATCHERS[sheet]) ?? null;
}

export function writeSingleImportTemplateSheetBuffer(
    workbookBuffer: Buffer,
    sheet: ImportTemplateSheet
): Buffer {
    const sourceWorkbook = XLSX.read(workbookBuffer, {
        type: 'buffer',
        cellFormula: true,
        cellStyles: true,
    });
    const sheetName = findImportTemplateSheetName(sourceWorkbook.SheetNames, sheet);

    if (!sheetName) {
        throw new Error(`Import template sheet not found: ${sheet}`);
    }

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sourceWorkbook.Sheets[sheetName], sheetName);

    return XLSX.write(workbook, {
        type: 'buffer',
        bookType: 'xlsx',
    });
}
