// 엑셀 워크시트의 표 서식, 그룹 병합과 합계 수식을 공통으로 적용한다.
import type ExcelJS from 'exceljs';
import { getGroupedCellSpans } from './final-report-table-merge';

export type ExcelCellValue = string | number | Date | null | ExcelJS.CellFormulaValue;
export type ExcelTableRange = { header: number; start: number; end: number; lastColumn: number };
type TableOptions = { mergeColumns?: number[]; groupHeaders?: string[] };
const CELL_BORDER: Partial<ExcelJS.Borders> = Object.fromEntries(['top', 'left', 'bottom', 'right'].map(edge => [edge, { style: 'thin', color: { argb: 'FFD1D5DB' } }]));
const DECIMAL_FORMAT = '#,##0.00';

export const sortByOrder = <T extends { order: number }>(rows: T[]) => [...rows].sort((first, second) => first.order - second.order);
export const cachedFormula = (expression: string, result: number | string): ExcelJS.CellFormulaValue => ({ formula: expression, result });
export const numericFormat = (value: unknown) => Number.isInteger(value) ? '#,##0' : DECIMAL_FORMAT;
export const textDisplayWidth = (text: string) => [...text].reduce((width, character) => width + (character.charCodeAt(0) > 255 ? 2 : 1), 0);

export function createWorksheet(workbook: ExcelJS.Workbook, name: string, projectName: string, technicalCount: number) {
    const sheet = workbook.addWorksheet(name, { pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } } });
    sheet.getColumn(1).width = 3;
    for (let column = 2; column <= 30 + technicalCount; column++) sheet.getColumn(column).width = 26;
    sheet.mergeCells('B2:H2');
    sheet.getCell('B2').value = name;
    sheet.getCell('B2').font = { name: '맑은 고딕', size: 16, bold: true };
    sheet.getRow(2).height = 32;
    sheet.mergeCells('B3:H3');
    sheet.getCell('B3').value = `${projectName} / 저장된 데이터 기준`;
    sheet.getCell('B3').font = { name: '맑은 고딕', size: 11 };
    return sheet;
}

function writeTableHeading(sheet: ExcelJS.Worksheet, title: string, titleRow: number, lastColumn: number) {
    sheet.mergeCells(titleRow, 2, titleRow, lastColumn);
    const cell = sheet.getCell(titleRow, 2);
    cell.value = title;
    cell.font = { name: '맑은 고딕', size: 12, bold: true, color: { argb: 'FF111827' } };
    sheet.getRow(titleRow).height = 28;
}

function writeTableHeaders(sheet: ExcelJS.Worksheet, titleRow: number, headers: string[], groupHeaders?: string[]) {
    let headerRow = titleRow + 1;
    if (groupHeaders) {
        groupHeaders.forEach((name, index) => { sheet.getCell(headerRow, index + 2).value = name; });
        const groupSpans = getGroupedCellSpans(groupHeaders.map(name => [name]), [0]);
        groupSpans.forEach((span, index) => { if (span[0] > 1) sheet.mergeCells(headerRow, index + 2, headerRow, index + 1 + span[0]); });
        headerRow++;
    }
    headers.forEach((name, index) => { sheet.getCell(headerRow, index + 2).value = name; });
    for (let rowNumber = titleRow + 1; rowNumber <= headerRow; rowNumber++) {
        sheet.getRow(rowNumber).height = Math.max(34, Math.ceil(Math.max(...headers.map(name => name.length)) / 22) * 18 + 12);
        for (let column = 2; column <= headers.length + 1; column++) {
            sheet.getCell(rowNumber, column).style = { font: { name: '맑은 고딕', size: 11, bold: true, color: { argb: 'FF111827' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } }, border: CELL_BORDER, alignment: { vertical: 'middle', horizontal: 'center', wrapText: true } };
        }
    }
    return headerRow;
}

function writeTableRow(sheet: ExcelJS.Worksheet, rowNumber: number, columnCount: number, values: ExcelCellValue[]) {
    const row = sheet.getRow(rowNumber);
    let wrappedLines = 1;
    for (let index = 0; index < columnCount; index++) {
        const cell = row.getCell(index + 2);
        cell.value = values[index] === '' ? null : values[index] ?? null;
        cell.style = { font: { name: '맑은 고딕', size: 11, color: { argb: 'FF111827' } }, border: CELL_BORDER, alignment: { vertical: 'top', wrapText: true }, numFmt: typeof cell.value === 'string' ? '@' : numericFormat(cell.value) };
        if (cell.value instanceof Date) cell.numFmt = 'yyyy-mm-dd hh:mm';
        const text = typeof cell.value === 'string' ? cell.value : '';
        const columnWidth = sheet.getColumn(index + 2).width ?? 26;
        wrappedLines = Math.max(wrappedLines, ...text.split('\n').map(line => Math.ceil(textDisplayWidth(line) / Math.max(6, columnWidth - 2))));
    }
    row.height = Math.max(28, wrappedLines * 17 + 10);
}

function mergeTableGroups(sheet: ExcelJS.Worksheet, firstRow: number, rows: ExcelCellValue[][], mergeColumns: number[]) {
    const rowSpans = getGroupedCellSpans(rows.map(row => row.map(value => String(value ?? ''))), mergeColumns);
    rowSpans.forEach((spans, index) => mergeColumns.forEach(column => {
        if (spans[column] > 1) sheet.mergeCells(firstRow + index, column + 2, firstRow + index + spans[column] - 1, column + 2);
    }));
}

export function addTable(sheet: ExcelJS.Worksheet, title: string, headers: string[], rows: ExcelCellValue[][], options: TableOptions = {}): ExcelTableRange {
    const titleRow = sheet.rowCount + 2;
    const lastColumn = headers.length + 1;
    writeTableHeading(sheet, title, titleRow, lastColumn);
    const headerRow = writeTableHeaders(sheet, titleRow, headers, options.groupHeaders);
    const firstRow = headerRow + 1;
    const populatedRows = rows.length ? rows : [headers.map(() => null)];
    populatedRows.forEach((values, index) => writeTableRow(sheet, firstRow + index, headers.length, values));
    if (options.mergeColumns?.length && rows.length) mergeTableGroups(sheet, firstRow, rows, options.mergeColumns);
    if (!sheet.views.length) {
        sheet.views = [{ state: 'frozen', ySplit: headerRow, xSplit: 1, showGridLines: false }];
        sheet.pageSetup.printTitlesRow = `${titleRow + 1}:${headerRow}`;
    }
    return { header: headerRow, start: firstRow, end: firstRow + populatedRows.length - 1, lastColumn };
}

export function writeNumericFormula(cell: ExcelJS.Cell, value: ExcelJS.CellFormulaValue) {
    cell.value = value;
    cell.numFmt = numericFormat(value.result);
}

export function addTotals(sheet: ExcelJS.Worksheet, table: ExcelTableRange, columns: number[]) {
    const totalRow = sheet.getRow(table.end + 1);
    totalRow.getCell(2).value = '합계';
    for (const column of columns) {
        const columnLetter = sheet.getColumn(column).letter;
        let total = 0;
        for (let rowNumber = table.start; rowNumber <= table.end; rowNumber++) total += Number(sheet.getCell(rowNumber, column).value) || 0;
        writeNumericFormula(totalRow.getCell(column), cachedFormula(`SUM(${columnLetter}${table.start}:${columnLetter}${table.end})`, total));
    }
    totalRow.height = 28;
    for (let column = 2; column <= table.lastColumn; column++) totalRow.getCell(column).style = { ...totalRow.getCell(column).style, font: { name: '맑은 고딕', bold: true, size: 11 }, border: CELL_BORDER, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } } };
}
