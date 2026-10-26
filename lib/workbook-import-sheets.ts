// 엑셀 가져오기에서 어떤 시트를 읽을지 고르고, 미리보기용 요약을 만든다.
//
// 가져오기 라우트(app/api/projects/[id]/import)의 POST 와 반영 트랜잭션이 한 파일에 약 270줄로
// 엉켜 있어 나눴다(2026-10-25 코드 리뷰 L9). 이 파일은 DB 를 모르는 순수 함수만 둔다.
import type { ParsedExcelData, ParsedSheet } from './excel-parser';

const PREVIEW_ROW_LIMIT = 8;
const PREVIEW_COL_LIMIT = 8;

export function normalizeSheetName(name: string) {
    return name.toLowerCase().replace(/[\s_\-()[\]{}]/g, '');
}

function getRequestedSheetAliases(requestedName: string) {
    const normalized = normalizeSheetName(requestedName);
    if (normalized.includes('제품속성')) return ['제품속성표', '제품속성서', '제품속성'];
    if (normalized.includes('고객요구사항')) return ['고객요구사항도출표', '고객요구사항', '요구사항도출'];
    if (normalized.includes('asis') || normalized.includes('as-is') || normalized.includes('스펙')) return ['AS-IS스펙표', 'AS-IS 스펙표', 'ASIS스펙', '스펙표'];
    return [requestedName];
}

function matchesRequestedSheetName(sheetName: string, requestedName: string) {
    const normalizedSheetName = normalizeSheetName(sheetName);
    return getRequestedSheetAliases(requestedName).some((alias) => {
        const normalizedAlias = normalizeSheetName(alias);
        return (
            normalizedSheetName === normalizedAlias ||
            normalizedSheetName.includes(normalizedAlias) ||
            normalizedAlias.includes(normalizedSheetName)
        );
    });
}

function countNonEmptyCells(sheet: ParsedSheet) {
    return sheet.data.reduce((total, row) => {
        return total + row.filter((value) => value !== null && value !== undefined && `${value}`.trim() !== '').length;
    }, 0);
}

export function toSheetPreview(sheet: ParsedSheet) {
    return {
        name: sheet.name,
        rowCount: sheet.rowCount,
        colCount: sheet.colCount,
        nonEmptyCellCount: countNonEmptyCells(sheet),
        formulaCount: sheet.formulas ? Object.keys(sheet.formulas).length : 0,
        previewRows: sheet.data
            .slice(0, PREVIEW_ROW_LIMIT)
            .map((row) => row.slice(0, PREVIEW_COL_LIMIT)),
    };
}

export function selectSheets(parsedData: ParsedExcelData, requestedSheetNames: string[]) {
    if (requestedSheetNames.length === 0) {
        return parsedData.sheets;
    }

    const missingSheets: string[] = [];
    const selectedSheets = requestedSheetNames
        .map((requestedName) => {
            const sheet = parsedData.sheets.find(
                (item) => matchesRequestedSheetName(item.name, requestedName)
            );
            if (!sheet) missingSheets.push(requestedName);
            return sheet;
        })
        .filter((sheet): sheet is ParsedSheet => Boolean(sheet));

    return { selectedSheets, missingSheets };
}

export function selectedSheetsInclude(selectedSheets: string[], keywords: string[]) {
    return selectedSheets.some((sheetName) => {
        const normalizedSheetName = normalizeSheetName(sheetName);
        return keywords.some((keyword) => normalizedSheetName.includes(normalizeSheetName(keyword)));
    });
}
