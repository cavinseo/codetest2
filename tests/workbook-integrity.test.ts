import { describe, expect, it } from 'vitest';
import { statSync } from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';

describe('worksheet workbook integrity', () => {
    it('keeps the bundled workbook available as the upload template', () => {
        const workbookPath = path.join(process.cwd(), 'public', 'asset', '워크시트.xlsx');
        const workbookStats = statSync(workbookPath);
        const workbook = XLSX.readFile(workbookPath);

        expect(workbookStats.size).toBeGreaterThan(0);
        expect(workbook.SheetNames).toContain('AS-IS스펙표');
        expect(workbook.SheetNames).toContain('제품속성표');
        expect(workbook.SheetNames).toContain('고객요구사항도출표');
        expect(workbook.SheetNames).toContain('QFD');
    });

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
