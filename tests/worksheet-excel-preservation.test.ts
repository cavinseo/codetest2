// 워크시트 엑셀의 데이터·수식·서식·병합·인쇄 설정이 그대로 유지되는지 검증한다.
import { createHash } from 'node:crypto';
import ExcelJS from 'exceljs';
import { expect, it } from 'vitest';
import { buildWorksheetExcel } from '../lib/worksheet-excel';
import { worksheetExcelProject } from './fixtures/worksheet-excel-project';

// cc16ede 출력의 자산·자금 시트 이름과 B2 제목 번호만 WS-14~16으로 바꾸고 다른 내용과 서식은 동일함을 비교 검증했다.
const baselineHashes = {
    complete: '24bc31070b7206625eac65d4747317ad8ffd153d7a613364c24fbcc71c4d00b9',
    empty: '83f394d77486f08a094d361f28a6ee73bfd90786b9083d70a6395e8e86226f66',
    collapsed: '10661f27392736012c25e689315a3c632b7776f047a1557c275dfe20078ebd45',
    expanded: '61158db210822046d14b97783dea36397bc6da541a4a21936adf8486989885b9',
    long: 'e221ffe41c363438a43f1cf65ea3310dd8a00c734473fb55a6197d5ae73bd75c',
};

function projectForScenario(scenario: keyof typeof baselineHashes) {
    const project = worksheetExcelProject();
    if (scenario === 'empty') {
        for (const key of Object.keys(project)) if (Array.isArray(project[key as keyof typeof project])) (project as unknown as Record<string, unknown>)[key] = [];
        project.fitnessMatrix = null;
    } else if (scenario === 'collapsed') {
        project.specFunctions = project.specFunctions.filter(row => row.level !== 'DETAIL');
        project.specDetailCollapsed = true;
        project.kanoResponses = [];
    } else if (scenario === 'expanded') {
        project.technicalCharacteristics.push({ ...project.technicalCharacteristics[0], id: 'technical-2', name: '검사', columnOrder: 1 });
        project.techCorrelations.push({ id: 'correlation', projectId: project.id, techId1: 'technical', techId2: 'technical-2', correlation: 'STRONG_POSITIVE' });
        project.technicalBenchmarks.push({ ...project.technicalBenchmarks[0], id: 'second-company', company: '경쟁기업', value: '0.02' });
        project.attributeFitnesses.push({ id: 'attribute-fitness', projectId: project.id, attributeId: 'attribute', importance: 5, currentLevel: 2, targetLevel: 4, note: '비교 의견' });
        project.fundingPlans = project.fundingPlans.filter(row => !row.item?.includes('합계'));
        project.fundingPlans[1].year1 = 100.5;
        project.fitnessMatrix!.marketsJson = JSON.stringify([{ id: 'market', name: '제조업', subSegments: [{ id: 'customer', name: '가공업체' }, { id: 'customer-2', name: '검사업체' }] }]);
    } else if (scenario === 'long') {
        project.specFunctions = [project.specFunctions[0], ...Array.from({ length: 240 }, (_, index) => ({ ...project.specFunctions[1], id: `sub-${index}`, name: `세부스펙 ${index}`, technology: `기술 ${index}`, order: index + 1 }))];
    }
    return project;
}

function canonicalize(value: unknown): unknown {
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map(canonicalize);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([first], [second]) => first.localeCompare(second)).map(([key, item]) => [key, canonicalize(item)]));
    return value;
}

it.each(Object.keys(baselineHashes) as Array<keyof typeof baselineHashes>)('%s 프로젝트의 엑셀 내용과 양식을 변경하지 않는다', async scenario => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await buildWorksheetExcel(projectForScenario(scenario)) as never);
    const output = canonicalize(workbook.worksheets.map(sheet => sheet.model));
    const hash = createHash('sha256').update(JSON.stringify(output)).digest('hex');
    expect(hash).toBe(baselineHashes[scenario]);
});
