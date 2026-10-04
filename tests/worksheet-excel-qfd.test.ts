// WS-9 다운로드의 원본 양식 구조와 확장된 데이터·계산 수식을 검증한다.
import ExcelJS from 'exceljs';
import { expect, it } from 'vitest';
import { buildWorksheetExcel } from '../lib/worksheet-excel';
import { worksheetExcelProject } from './fixtures/worksheet-excel-project';

async function load(project = worksheetExcelProject()) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await buildWorksheetExcel(project, 'qfd') as never);
    return workbook.worksheets[0];
}

it('원본 QFD의 두 줄 머리글과 관계도 아래의 중요도·순위·Spec·설계목표를 같은 위치에 출력한다', async () => {
    const project = worksheetExcelProject(), before = JSON.stringify(project);
    project.techTreeEntries[0].subSpec = '위치 제어';
    const sheet = await load(project);
    expect(sheet.getCell('B2').value).toBe('고객요구사항');
    expect(sheet.getCell('D2').master.address).toBe('B2');
    expect(sheet.getCell('E2').value).toBe('가공');
    expect(sheet.getCell('G2').master.address).toBe('E2');
    expect(sheet.getCell('S2').master.address).toBe('Q2');
    expect(sheet.getCell('T3').value).toBe('가중치');
    expect(sheet.getCell('W3').value).toBe('경쟁기업');
    expect(sheet.getCell('AB3').master.address).toBe('AB2');
    expect(sheet.getCell('B4').font.color?.argb).toBe('FF0000FF');
    expect(sheet.getCell('C4').font.color?.argb).toBe('FFFF0000');
    expect(sheet.getCell('C32').value).toBe('품질중요도');
    expect(sheet.getCell('D32').master.address).toBe('C32');
    expect(sheet.getCell('D33').value).toBe('RANK');
    expect(sheet.getCell('C36').master.address).toBe('C34');
    expect(sheet.getCell('D34').value).toBe('측정단위');
    expect(sheet.getCell('E34').value).toBe('mm');
    expect(sheet.getCell('E35').value).toBe('0.1');
    expect(sheet.getCell('C37').value).toBe('설계 목표치');
    expect(sheet.getCell('E37').value).toBe('0.05');
    expect(sheet.getCell('E4').value).toBe(9);
    expect(sheet.getCell('U4').result).toBe(1);
    expect(sheet.getCell('U4').numFmt).toBe('0.0%');
    expect(sheet.getCell('Z4').result).toBe(2.88);
    expect(sheet.getCell('E32').result).toBe(15.57);
    expect(sheet.getCell('E32').formula).toContain('SUMPRODUCT(E4:E31,$T$4:$T$31)');
    expect(sheet.getCell('E33').result).toBe(1);
    expect(sheet.getCell('F33').text).toBe('');
    expect(sheet.getCell('D5').type).toBe(ExcelJS.ValueType.String);
    expect(sheet.pageSetup.printArea).toBe('B2:AB37');
    expect(sheet.pageSetup.printTitlesRow).toBe('2:3');
    expect(sheet.views[0]).toMatchObject({ xSplit: 4, ySplit: 3 });
    project.techTreeEntries[0].subSpec = '자동 검사';
    expect(JSON.stringify(project)).toBe(before);
});

it('원본 칸 수를 초과한 요구사항·그룹·경쟁사도 누락 없이 늘리고 상관관계를 보존한다', async () => {
    const project = worksheetExcelProject();
    project.requirements = Array.from({ length: 40 }, (_, i) => ({ ...project.requirements[0], id: `req-${i}`, order: i, requirement: `고객 요구사항 ${i}`, kanoWeight: 1 }));
    project.technicalCharacteristics = Array.from({ length: 18 }, (_, i) => ({ ...project.technicalCharacteristics[0], id: `tech-${i}`, name: `기술 ${i}`, groupIndex: Math.floor(i / 3), columnOrder: i }));
    project.benchmarks = [{ ...project.benchmarks[0], requirementId: 'req-39', score: 2 }, { ...project.benchmarks[1], requirementId: 'req-39', company: '경쟁사 A', score: 4 }];
    project.technicalBenchmarks = [{ ...project.technicalBenchmarks[0], technicalCharId: 'tech-17', company: '경쟁사 B', value: '0.02' }];
    project.qfdMatrices = [{ ...project.qfdMatrices[0], requirementId: 'req-39', technicalCharId: 'tech-17', strength: 'STRONG' }];
    project.techCorrelations = [{ id: 'correlation', projectId: project.id, techId1: 'tech-0', techId2: 'tech-17', correlation: 'STRONG_POSITIVE' }];
    const sheet = await load(project);
    expect(sheet.getCell('D43').value).toBe('고객 요구사항 39');
    expect(sheet.getCell('V43').value).toBe(9);
    expect(sheet.getCell('AA3').value).toBe('경쟁사 B');
    expect(sheet.getCell('AB43').result).toBe(4);
    expect(sheet.getCell('AB43').formula).toBe('IF($D43="","",MAX(Y43:AA43))');
    expect(sheet.getCell('V44').result).toBe(9);
    expect(sheet.getCell('V49').value).toBe('0.02');
    expect(sheet.getCell('V50').value).toBe('0.05');
    expect(sheet.pageSetup.printArea).toBe(`B2:AF${sheet.rowCount}`);
    expect(sheet.getCell('B54').value).toBe('기술 0');
    expect(sheet.getCell('C54').value).toBe('기술 17');
});

it('비어 있는 프로젝트도 원본 입력 칸과 안전한 계산식을 유지한다', async () => {
    const project = worksheetExcelProject();
    project.requirements = []; project.technicalCharacteristics = []; project.qfdMatrices = []; project.benchmarks = []; project.technicalBenchmarks = []; project.techTreeEntries = [];
    const sheet = await load(project);
    expect(sheet.getCell('W3').value).toBe('경쟁사C');
    expect(sheet.getCell('D4').value).toBeNull();
    expect(sheet.getCell('U4').text).toBe('');
    expect(sheet.getCell('Y4').formula).toContain('V4>0');
    expect(sheet.getCell('E32').text).toBe('');
    expect(sheet.getCell('AB31').formula).toContain('$Z$4:$Z$31');
    expect(sheet.pageSetup.printArea).toBe('B2:AB37');
});
