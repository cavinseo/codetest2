import * as XLSX from 'xlsx';

export interface ParsedExcelData {
    fileName: string;
    fileSize: number;
    sheets: ParsedSheet[];
    parseErrors: ParseError[];
}

export interface ParsedSheet {
    name: string;
    rowCount: number;
    colCount: number;
    data: any[][];
    formulas?: { [cell: string]: string };
}

export interface ParseError {
    sheet: string;
    cell?: string;
    message: string;
    severity: 'error' | 'warning';
}

/**
 * 엑셀 파일을 파싱하여 데이터 추출
 */
export async function parseExcelFile(file: File): Promise<ParsedExcelData> {
    const parseErrors: ParseError[] = [];

    try {
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, {
            type: 'array',
            cellFormula: true, // 수식 포함
            cellStyles: true,
        });

        const sheets: ParsedSheet[] = [];

        for (const sheetName of workbook.SheetNames) {
            const worksheet = workbook.Sheets[sheetName];

            // 시트 범위 확인
            const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
            const rowCount = range.e.r + 1;
            const colCount = range.e.c + 1;

            // 데이터 추출 (수식 포함)
            const data: any[][] = XLSX.utils.sheet_to_json(worksheet, {
                header: 1,
                defval: null,
                raw: false,
            });

            // 수식 추출
            const formulas: { [cell: string]: string } = {};
            for (const cellAddress in worksheet) {
                if (cellAddress[0] === '!') continue;
                const cell = worksheet[cellAddress];
                if (cell.f) {
                    formulas[cellAddress] = cell.f;
                }
            }

            sheets.push({
                name: sheetName,
                rowCount,
                colCount,
                data,
                formulas: Object.keys(formulas).length > 0 ? formulas : undefined,
            });
        }

        return {
            fileName: file.name,
            fileSize: file.size,
            sheets,
            parseErrors,
        };
    } catch (error: any) {
        parseErrors.push({
            sheet: 'Global',
            message: `파일 파싱 실패: ${error.message}`,
            severity: 'error',
        });

        return {
            fileName: file.name,
            fileSize: file.size,
            sheets: [],
            parseErrors,
        };
    }
}

/**
 * 특정 시트 이름 찾기 (대소문자 구분 없음)
 */
export function findSheet(parsedData: ParsedExcelData, sheetName: string): ParsedSheet | null {
    return parsedData.sheets.find(
        (sheet) => sheet.name.toLowerCase() === sheetName.toLowerCase()
    ) || null;
}

/**
 * 셀 값 가져오기 (행/열 1-indexed)
 */
export function getCellValue(sheet: ParsedSheet, row: number, col: number): any {
    if (row < 1 || col < 1) return null;
    if (row > sheet.data.length) return null;

    const rowData = sheet.data[row - 1];
    if (!rowData || col > rowData.length) return null;

    return rowData[col - 1];
}

/**
 * 범위 데이터 가져오기 (startRow/startCol 1-indexed)
 */
export function getRangeData(
    sheet: ParsedSheet,
    startRow: number,
    startCol: number,
    endRow: number,
    endCol: number
): any[][] {
    const result: any[][] = [];

    for (let r = startRow; r <= endRow; r++) {
        const row: any[] = [];
        for (let c = startCol; c <= endCol; c++) {
            row.push(getCellValue(sheet, r, c));
        }
        result.push(row);
    }

    return result;
}
