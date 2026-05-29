import { describe, expect, it } from 'vitest';
import path from 'node:path';
import XLSX from 'xlsx';

describe('worksheet workbook integrity', () => {
    it('does not contain broken #REF! formulas in the bundled worksheet', () => {
        const workbookPath = path.join(process.cwd(), 'public', 'asset', '워크시트.xlsx');
        const workbook = XLSX.readFile(workbookPath, { cellFormula: true });
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
});
