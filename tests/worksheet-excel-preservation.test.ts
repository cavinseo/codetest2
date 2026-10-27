// 워크시트 엑셀의 데이터·수식·서식·병합·인쇄 설정이 그대로 유지되는지 검증한다.
import { createHash } from 'node:crypto';
import ExcelJS from 'exceljs';
import { expect, it } from 'vitest';
import { buildWorksheetExcel } from '../lib/worksheet-excel';
import { worksheetExcelProject } from './fixtures/worksheet-excel-project';

// c52f6a5 출력에서 이번 수정 대상인 WS-9를 제외한 모든 시트의 내용과 서식을 비교한다.
// WS-2 세세부 열 이름을 '세세부기술'에서 '세세부기능'으로 바꾼 뒤 그 열이 보이는 네 시나리오의 값을 갱신했다.
const baselineHashes = {
    complete: 'a334f1606ac2bae1280e23e9f31ab991e53632774b7cf623f765d357f0260040',
    empty: '4473b33a07627d03a54abe4ae92ac222261a95064650f1c5d3ed222fa2298c42',
    collapsed: '4b561c1c961052665524d3e7a395c6fa3f868cb92418c5685fbe636501b7356a',
    expanded: 'a298b254ba78249c82e96cd3d297e8018ca5cba84e8f184055d5b6196b1cf89c',
    long: '2ac95cdf68be64aed679e71a11f49b025558b0ec0c2a1d9b9d625e1c18b1955b',
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

it.each(Object.keys(baselineHashes) as Array<keyof typeof baselineHashes>)('%s 프로젝트의 WS-9 이외 내용과 양식을 변경하지 않는다', async scenario => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await buildWorksheetExcel(projectForScenario(scenario)) as never);
    const output = canonicalize(workbook.worksheets.filter(sheet => sheet.name !== 'WS-9 QFD').map(sheet => sheet.model));
    const hash = createHash('sha256').update(JSON.stringify(output)).digest('hex');
    expect(hash).toBe(baselineHashes[scenario]);
});
