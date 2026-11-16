// 천원 엑셀의 재업로드에서 매출·자금·소수·빈칸의 실제 금액 보존을 검증한다.
import * as XLSX from 'xlsx';
import { expect, it } from 'vitest';
import { buildWorksheetExcel } from '../lib/worksheet-excel';
import { parseWorkbookImport } from '../lib/workbook-importer';
import { parseSourceYear } from '../lib/funding-ai-agent';
import { worksheetExcelProject } from './fixtures/worksheet-excel-project';

it.each([true, false])('다운로드한 천원 양식을 다시 읽어도 저장 금액과 독립 매출 기간을 보존한다 (저장 합계행 %s)', async hasTotal => {
    const project = worksheetExcelProject();
    if (!hasTotal) project.fundingPlans = project.fundingPlans.filter(row => !row.item?.includes('합계'));
    project.salesEstimates[0].amount = 0.12345;
    project.fundingSources.push({ ...project.fundingSources[0], id: 'second', order: 1,
        year1: JSON.stringify({ source: '후속:지원', amount: '0.10025' }), year2: JSON.stringify({ source: '예정', amount: '' }), year3: '12.345' });
    const workbook = XLSX.read(await buildWorksheetExcel(project), { type: 'buffer' });
    const sheets = workbook.SheetNames.filter(name => /매출|자금/.test(name)).map(name => {
        const data = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1, defval: null, raw: true });
        return { name, data, rowCount: data.length, colCount: Math.max(...data.map(row => row.length)) };
    });
    const { records } = parseWorkbookImport({ fileName: '천원.xlsx', fileSize: 1, parseErrors: [], sheets });
    expect(records.salesEstimates.map(row => [row.period, row.customer, row.amount])).toEqual([
        ['Y', '고객', 0.12345], ['Y_PLUS_1', '미래고객', 1000],
    ]);
    expect(records.fundingPlans).toMatchObject([
        { category: '매출액', year1: 1000, year2: null, year3: 0 },
        { category: '소요자금', year1: 100, year2: 200, year3: 0 },
    ]);
    expect(records.fundingPlans).toHaveLength(2);
    expect(records.fundingSources).toHaveLength(2);
    for (const [index, source] of project.fundingSources.entries()) {
        expect(records.fundingSources[index].category).toBe(source.category);
        for (const year of ['year1', 'year2', 'year3'] as const) {
            expect(parseSourceYear(records.fundingSources[index][year])).toEqual(parseSourceYear(source[year]));
        }
    }
});

it.each([['천원', 100000], ['백만원', 100], ['원', 100000000], ['만원', 10000], ['억원', 1]])('명시된 %s 단위 금액을 저장 단위로 환산한다', (unit, amount) => {
    const data = [[`단위: ${unit}`], ['구분', '항목', '1년차', '2년차', '3년차'], ['소요자금', '개발비', amount, 0, 0]];
    const result = parseWorkbookImport({ fileName: '시험.xlsx', fileSize: 1, parseErrors: [], sheets: [{ name: '자금소요계획표', data, rowCount: 3, colCount: 5 }] });
    expect(result.records.fundingPlans[0].year1).toBe(100);
});

it('이전 앱의 잘못된 원 표기 엑셀은 금액을 추측해 저장하지 않는다', () => {
    const data = [[null, '현재(Y) 매출 (단위: 원)'], [null, '번호', '매출처', '매출액', '경쟁사명'], [null, 1, '고객', 100, '']];
    const result = parseWorkbookImport({ fileName: '구양식.xlsx', fileSize: 1, parseErrors: [], sheets: [{ name: 'WS-1 자사매출추정표', data, rowCount: 3, colCount: 5 }] });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('금액 단위 표기가 일치하지 않는');
    expect(result.records.salesEstimates).toEqual([]);
});
