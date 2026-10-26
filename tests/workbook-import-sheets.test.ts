// 엑셀 가져오기 라우트에서 떼어 낸 시트 고르기·미리보기 요약(2026-10-25 코드 리뷰 L9).
import { describe, expect, it } from 'vitest';
import type { ParsedExcelData, ParsedSheet } from '../lib/excel-parser';
import { normalizeSheetName, selectedSheetsInclude, selectSheets, toSheetPreview } from '../lib/workbook-import-sheets';

const sheet = (name: string, data: unknown[][] = [], formulas?: Record<string, string>): ParsedSheet =>
    ({ name, rowCount: data.length, colCount: data[0]?.length ?? 0, data, formulas });
const workbook = (...sheets: ParsedSheet[]): ParsedExcelData => ({ fileName: 'a.xlsx', fileSize: 1, sheets, parseErrors: [] });

describe('normalizeSheetName', () => {
    it('대소문자·공백·구분 기호를 무시한다', () => {
        expect(normalizeSheetName('AS-IS 스펙표 (WS_2)')).toBe('asis스펙표ws2');
        expect(normalizeSheetName('[제품]{속성}')).toBe('제품속성');
    });
});

describe('selectSheets', () => {
    const book = workbook(sheet('AS-IS 스펙표'), sheet('제품속성서'), sheet('고객요구사항 도출표'), sheet('메모'));

    it('요청한 시트가 없으면 워크북 전체를 고른다', () => {
        expect(selectSheets(book, [])).toEqual(book.sheets);
    });

    it('요청 이름을 별칭으로 맞춰 고르고, 못 찾은 이름은 따로 돌려준다', () => {
        const result = selectSheets(book, ['스펙', '제품속성표', '고객요구사항', '판매계획']);

        expect(Array.isArray(result)).toBe(false);
        if (Array.isArray(result)) return;
        expect(result.selectedSheets.map((item) => item.name)).toEqual(['AS-IS 스펙표', '제품속성서', '고객요구사항 도출표']);
        expect(result.missingSheets).toEqual(['판매계획']);
    });

    it('별칭이 없는 이름은 그 이름을 서로 포함하는지로 맞춘다', () => {
        const result = selectSheets(book, ['메모장']);

        if (Array.isArray(result)) throw new Error('선택 결과여야 한다');
        expect(result.selectedSheets.map((item) => item.name)).toEqual(['메모']);
    });
});

describe('toSheetPreview', () => {
    it('앞 8행·8열만 미리 보이고, 빈 칸을 뺀 칸 수와 수식 수를 센다', () => {
        const rows = Array.from({ length: 10 }, (_, rowIndex) => Array.from({ length: 10 }, (_, colIndex) => (colIndex === 0 ? ' ' : `${rowIndex}-${colIndex}`)));
        rows[0][1] = null as unknown as string;

        const preview = toSheetPreview(sheet('판매', rows, { A1: '=SUM(B1:B2)', B2: '=1+1' }));

        expect(preview.previewRows).toHaveLength(8);
        expect(preview.previewRows[0]).toHaveLength(8);
        expect(preview.nonEmptyCellCount).toBe(10 * 9 - 1);
        expect(preview.formulaCount).toBe(2);
        expect(preview).toMatchObject({ name: '판매', rowCount: 10, colCount: 10 });
    });

    it('수식이 없으면 0 이다', () => {
        expect(toSheetPreview(sheet('빈 시트')).formulaCount).toBe(0);
    });
});

describe('selectedSheetsInclude', () => {
    it('고른 시트 이름에 키워드가 들어 있는지 표기 차이를 무시하고 본다', () => {
        expect(selectedSheetsInclude(['WS-8 개선 포인트 도출'], ['개선포인트도출'])).toBe(true);
        expect(selectedSheetsInclude(['판매계획'], ['개선포인트'])).toBe(false);
    });
});
