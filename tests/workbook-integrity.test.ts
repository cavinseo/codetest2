import { describe, expect, it } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';
import { writeSingleImportTemplateSheetBuffer } from '../lib/import-template-workbook';

const workbookPath = path.join(process.cwd(), 'public', 'asset', '워크시트.xlsx');

// xlsx 0.20 부터 XLSX.readFile 은 set_fs 로 node:fs 를 주입해야 동작한다.
// 앱 코드는 업로드된 버퍼만 다루므로, 테스트도 같은 방식(read + buffer)으로 맞춘다.
function readWorkbook(options: XLSX.ParsingOptions = {}) {
    return XLSX.read(readFileSync(workbookPath), { type: 'buffer', ...options });
}

describe('worksheet workbook integrity', () => {
    it('keeps the bundled workbook available as the upload template', () => {
        const workbookStats = statSync(workbookPath);
        const workbook = readWorkbook();

        expect(workbookStats.size).toBeGreaterThan(0);
        expect(workbook.SheetNames).toContain('AS-IS스펙표');
        expect(workbook.SheetNames).toContain('제품속성표');
        expect(workbook.SheetNames).toContain('고객요구사항도출표');
        expect(workbook.SheetNames).toContain('QFD');
    });

    it('does not contain broken #REF! formulas in the bundled worksheet', () => {
        const workbook = readWorkbook({ cellFormula: true });
        const brokenFormulaCells: Array<{ sheet: string; address: string; formula: string }> = [];

        for (const sheetName of workbook.SheetNames) {
            const worksheet = workbook.Sheets[sheetName];
            for (const address of Object.keys(worksheet)) {
                if (address.startsWith('!')) continue;
                const formula = worksheet[address]?.f;
                if (typeof formula === 'string' && formula.includes('#REF!')) {
                    brokenFormulaCells.push({ sheet: sheetName, address, formula });
                }
            }
        }

        expect(brokenFormulaCells).toEqual([]);
    });

    it.each([
        ['spec', 'AS-IS스펙표'],
        ['attributes', '제품속성표'],
        ['requirements', '고객요구사항도출표'],
    ] as const)('can build a %s only upload template', (sheet, expectedSheetName) => {
        const source = readFileSync(workbookPath);
        const buffer = writeSingleImportTemplateSheetBuffer(source, sheet);
        const workbook = XLSX.read(buffer, { type: 'buffer' });

        expect(workbook.SheetNames).toEqual([expectedSheetName]);
    });
});
