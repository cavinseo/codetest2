// 워크시트 엑셀의 데이터·수식·서식·병합·인쇄 설정이 그대로 유지되는지 검증한다.
import { createHash } from 'node:crypto';
import ExcelJS from 'exceljs';
import { expect, it } from 'vitest';
import { buildWorksheetExcel } from '../lib/worksheet-excel';
import { worksheetExcelProject } from './fixtures/worksheet-excel-project';

// 천원 환산·요구사항 연동 순서·번호 머리글·문항 연결 시트를 반영한 기준으로 전체 수식과 서식을 고정한다.
// 그 기준에 main 의 WS-2 세세부 열 이름 변경('세세부기술'→'세세부기능')을 합친 값이다. 열 이름을 되돌리면
// 다섯 시나리오가 모두 천원 기준 해시와 같아지는 것을 확인했고, 그 열이 숨는 collapsed 만 그대로다.
const baselineHashes = {
    complete: '4506206eccc9ad3039f66611a86d60aed2f1bd70319deb2ae14ad62b8890407d',
    empty: 'fe9db6148533fa2a50ea2eedf37e1ea85e6352cb8eb5cd1f5a57aaad28ba4c7a',
    collapsed: '5fb80bb9e3ab4578e33da2eb213760a624d7c7304b8000b03d7331dd6e4c5121',
    expanded: '266368cb9dd7670b95d0941ed01c201ac09c99dc925b662012c0940f04c4bbe1',
    long: '22fbd985d6f0f166ac6fc86e7004e1cb39196ebf8d43030078549e46616a09be',
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

it.each(Object.keys(baselineHashes) as Array<keyof typeof baselineHashes>)('%s 프로젝트의 요구사항 연동 출력 기준과 나머지 수식·양식을 유지한다', async scenario => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await buildWorksheetExcel(projectForScenario(scenario)) as never);
    const output = canonicalize(workbook.worksheets.filter(sheet => sheet.name !== 'WS-9 QFD').map(sheet => sheet.model));
    const hash = createHash('sha256').update(JSON.stringify(output)).digest('hex');
    expect(hash).toBe(baselineHashes[scenario]);
});
