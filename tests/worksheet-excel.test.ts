// 엑셀 양식의 전체 데이터, 그룹 병합, 계산값과 인쇄 범위를 검증한다.
import ExcelJS from 'exceljs';
import { expect, it } from 'vitest';
import { buildWorksheetExcel } from '../lib/worksheet-excel';
import { WORKSHEET_EXCEL_SHEETS, resolveWorksheetExcelId } from '../lib/worksheet-excel-sheets';
import { worksheetExcelProject } from './fixtures/worksheet-excel-project';

async function load(id?: typeof WORKSHEET_EXCEL_SHEETS[number]['id'], project = worksheetExcelProject()) {
    const workbook = new ExcelJS.Workbook();
    const buffer = await buildWorksheetExcel(project, id);
    await workbook.xlsx.load(buffer as never);
    return workbook;
}
function rowWith(sheet: ExcelJS.Worksheet, text: string, column = 2): number {
    let found = 0;
    sheet.eachRow(row => { if (row.getCell(column).value === text) found ||= row.number; });
    expect(found, `${sheet.name}: ${text}`).toBeGreaterThan(0);
    return found;
}
function result(cell: ExcelJS.Cell) { return cell.type === ExcelJS.ValueType.Formula ? cell.result : cell.value; }

it('WS-1~16 워크시트 양식을 만들고 저장된 추가 항목과 원본 응답도 보존한다', async () => {
    const project = worksheetExcelProject();
    const before = JSON.stringify(project);
    const workbook = await load(undefined, project);
    expect(workbook.worksheets.map(sheet => sheet.name)).toEqual([...WORKSHEET_EXCEL_SHEETS.slice(0, 6).map(sheet => sheet.name), 'Kano 응답원본', ...WORKSHEET_EXCEL_SHEETS.slice(6).map(sheet => sheet.name)]);
    for (const definition of WORKSHEET_EXCEL_SHEETS) {
        const sheet = workbook.getWorksheet(definition.name)!;
        expect(sheet.pageSetup.printArea).toMatch(new RegExp(`${sheet.rowCount}$`));
        expect(sheet.pageSetup.fitToHeight).toBe(0);
        expect(sheet.views[0].state).toBe('frozen');
    }
    const kano = workbook.getWorksheet('WS-6 Kano 질문지')!;
    expect(kano.getCell(rowWith(kano, '설문 소개') + 1, 2).text).toContain('시험회사');
    rowWith(kano, '가공이 정확하면?', 5);
    rowWith(kano, '가공이 부정확하면?', 5);
    expect(kano.getCell('F11').value).toBeNull();
    expect(workbook.getWorksheet('Kano 응답원본')!.getCell(4, 8).value).toBeInstanceOf(Date);
    expect(workbook.getWorksheet('WS-14 개발계획서')).toBeUndefined();
    rowWith(workbook.getWorksheet('WS-14 핵심자산 및 보완자산')!, '핵심 기술');
    expect(workbook.getWorksheet('WS-15 자금소요계획표')).toBeDefined();
    expect(workbook.getWorksheet('WS-16 자금조달계획표')).toBeDefined();
    expect(workbook.worksheets.some(sheet => sheet.name.startsWith('WS-17'))).toBe(false);
    rowWith(workbook.getWorksheet('WS-13 향후목표고객LIST')!, '설계', 7);
    const literal = workbook.getWorksheet('WS-5 고객요구사항도출표')!.getCell(8, 3);
    expect(literal.type).toBe(ExcelJS.ValueType.String);
    expect(literal.value).toBe('=수식이 아닌 고객 의견');
    expect(JSON.stringify(project)).toBe(before);
});

it('큰 스펙표의 마지막 행까지 출력하고 상위 분류만 병합한다', async () => {
    const project = worksheetExcelProject();
    project.specFunctions = [project.specFunctions[0], ...Array.from({ length: 240 }, (_, index) => ({ ...project.specFunctions[1], id: `sub-${index}`, name: `세부스펙 ${index}`, technology: `기술 ${index}`, order: index + 1 }))];
    const sheet = (await load('spec', project)).worksheets[0];
    expect(sheet.rowCount).toBe(246);
    expect(sheet.getCell('C246').value).toBe('세부스펙 239');
    expect(sheet.getCell('E246').value).toBe('기술 239');
    expect(sheet.getCell('B246').master.address).toBe('B7');
    expect(sheet.pageSetup.printArea).toBe('B2:H246');
    expect(sheet.getCell('E246').alignment.wrapText).toBe(true);
});

it('WS-12의 중복 분류를 통합하고 신규 기술만 색으로 구분하며 스펙값을 보존한다', async () => {
    const sheet = (await load('target-spec')).worksheets[0];
    expect(sheet.getCell('B9').master.address).toBe('B7');
    expect(sheet.getCell('C8').master.address).toBe('C7');
    expect(sheet.getCell('D7').value).toBe('공압 이송');
    expect(sheet.getCell('D8').value).toBe('센서');
    expect(sheet.getCell('D7').fill).not.toHaveProperty('fgColor.argb', 'FFDCFCE7');
    expect(sheet.getCell('D9').fill).toHaveProperty('fgColor.argb', 'FFDCFCE7');
    expect(sheet.getCell('G7').value).toBe('0.1');
    expect(sheet.getCell('I7').value).toBe('0.05');
    expect(sheet.pageSetup.printArea).toBe('B2:I9');
});

it('WS-7에서 응답 없는 항목은 공란이고 불만족계수의 반올림도 화면과 일치한다', async () => {
    const project = worksheetExcelProject();
    project.kanoResponses = Array.from({ length: 10 }, (_, index) => ({ ...project.kanoResponses[0], id: `response-${index}`, positiveAnswer: index < 3 ? 1 : index < 8 ? 2 : 5, negativeAnswer: index < 3 ? 2 : 5 }));
    const sheet = (await load('kano-aggregation', project)).worksheets[0];
    expect(result(sheet.getCell('J7'))).toBe(10);
    expect(result(sheet.getCell('K7'))).toBe(0.38);
    expect(result(sheet.getCell('L7'))).toBe(-0.62);
    expect(sheet.getCell('L7').formula).toContain('INT(');
    expect(sheet.getCell('K8').text).toBe('');
    expect(sheet.getCell('L8').text).toBe('');
    expect(sheet.getCell('J7').formula).toBe('SUM(D7:I7)');
});

it('WS-4의 L*는 와일드카드가 아닌 정확한 우선순위로 집계한다', async () => {
    const sheet = (await load('fitness')).worksheets[0];
    const line = rowWith(sheet, 'L*');
    expect(sheet.getCell(line, 3).formula).toContain('="L*"');
    expect(result(sheet.getCell(line, 3))).toBe(1);
    expect(sheet.getCell('C6').value).toBe('제조업');
    expect(sheet.getCell('C7').value).toBe('가공업체');
});

it('QFD의 적용 가중치와 관계 점수, 경쟁 비교, 중요도, 순위가 계산 규칙과 일치한다', async () => {
    const sheet = (await load('qfd')).worksheets[0];
    expect(sheet.getCell('E7').value).toBe(9);
    expect(sheet.getCell('F7').value).toBe(1.73);
    expect(result(sheet.getCell('J7'))).toBe(5);
    expect(result(sheet.getCell('K7'))).toBe(1.67);
    expect(result(sheet.getCell('L7'))).toBe(2.88);
    expect(result(sheet.getCell('M7'))).toBe(100);
    const summary = rowWith(sheet, '위치 제어');
    expect(result(sheet.getCell(summary, 6))).toBe(15.57);
    expect(result(sheet.getCell(summary, 7))).toBe(90);
    expect(result(sheet.getCell(summary, 8))).toBe(1);
    expect(sheet.getCell(summary, 6).formula).toContain('SUMPRODUCT');
    expect(sheet.getCell(summary, 8).formula).toContain('RANK');
    rowWith(sheet, '경쟁기업', 3);
});

it('TIMKO의 수동 가중치 0도 보존하고 QFD에는 기존 양식의 가중치 규칙을 적용한다', async () => {
    const project = worksheetExcelProject();
    project.requirements[0].kanoWeight = 0;
    const timko = (await load('timko', project)).worksheets[0];
    expect(timko.getCell('H7').value).toBe(0);
    expect(timko.getCell('I7').value).toBe('일원적 품질');
    expect(timko.getCell('D7').numFmt).toBe('0.00');
    const qfd = (await load('qfd', project)).worksheets[0];
    expect(qfd.getCell('F7').value).toBe(3.2);
});

it('매출의 0과 빈칸을 구분하고 자동 연동 매출 및 자금 합계는 이중 합산하지 않는다', async () => {
    const sales = (await load('sales')).worksheets[0];
    expect(sales.getCell('D7').value).toBe(0);
    expect(sales.getCell('D7').type).toBe(ExcelJS.ValueType.Number);
    const funding = (await load('funding-plan')).worksheets[0];
    expect(funding.getCell('D7').value).toBe(1000);
    expect(funding.getCell('E7').value).toBeNull();
    expect(funding.getCell('F7').value).toBe(0);
    const total = rowWith(funding, '소요자금 합계', 3);
    expect(result(funding.getCell(total, 4))).toBe(100);
    expect(result(funding.getCell(total, 5))).toBe(200);
    expect(funding.getCell(total, 4).formula).toBe('SUM(D8)');
    expect(funding.rowCount).toBe(9);
    const sources = (await load('funding-source')).worksheets[0];
    expect(sources.getCell('D8').value).toBe(1200);
    expect(sources.getCell('F8').value).toBe(0);
    expect(sources.getCell('H8').value).toBeNull();
    expect(result(sources.getCell('D9'))).toBe(1200);
});

it('개별 워크시트는 해당 양식만 출력하고 빈 프로젝트도 모든 양식을 만든다', async () => {
    const project = worksheetExcelProject();
    for (const key of Object.keys(project)) if (Array.isArray(project[key as keyof typeof project])) (project as unknown as Record<string, unknown>)[key] = [];
    project.fitnessMatrix = null;
    expect((await load(undefined, project)).worksheets).toHaveLength(16);
    expect((await load('requirements')).worksheets.map(sheet => sheet.name)).toEqual(['WS-5 고객요구사항도출표']);
    expect(resolveWorksheetExcelId('attributes/fitness')).toBe('fitness');
    expect(resolveWorksheetExcelId('kano/analysis')).toBe('kano-aggregation');
    expect(resolveWorksheetExcelId('unknown')).toBeUndefined();
    expect(resolveWorksheetExcelId('dev-plan')).toBeUndefined();
});

it('WS-16 같은 구분의 여러 세부행과 3개년 출처·금액을 모두 출력하고 합산한다', async () => {
    const project = worksheetExcelProject();
    project.fundingSources.push({ ...project.fundingSources[0], id: 'source-2', order: 1, year1: JSON.stringify({ source: '추가 지원사업', amount: '300.5' }), year2: '후속 지원:200', year3: '500' });
    const sheet = (await load('funding-source', project)).worksheets[0];
    expect(sheet.getCell('C9').value).toBe('추가 지원사업');
    expect(sheet.getCell('D9').value).toBe(300.5);
    expect(sheet.getCell('F9').value).toBe(200);
    expect(sheet.getCell('H9').value).toBe(500);
    expect(result(sheet.getCell('D10'))).toBe(1500.5);
    expect(result(sheet.getCell('F10'))).toBe(200);
    expect(result(sheet.getCell('H10'))).toBe(500);
});
