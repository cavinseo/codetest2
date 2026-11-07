// 워크시트 엑셀의 데이터·수식·서식·병합·인쇄 설정이 그대로 유지되는지 검증한다.
import { createHash } from 'node:crypto';
import ExcelJS from 'exceljs';
import { expect, it } from 'vitest';
import { buildWorksheetExcel } from '../lib/worksheet-excel';
import { worksheetExcelProject } from './fixtures/worksheet-excel-project';

// c52f6a5 출력에서 이번 수정 대상인 WS-9를 제외한 모든 시트의 내용과 서식을 비교한다.
// WS-2 세세부 열 이름을 '세세부기술'에서 '세세부기능'으로 바꾼 뒤 그 열이 보이는 네 시나리오의 값을 갱신했다.
// 2026-11-08 매출·자금 시트의 금액 단위 표기를 '원'에서 '백만원'으로 고친 뒤 다섯 시나리오의 값을 갱신했다.
const baselineHashes = {
    complete: 'df00a3b4719d6039a39552be60ea0decc4dbf37acb5390f18ce53c39ad9044a6',
    empty: 'ad981baf111f774a1a60cc1b4c312fe15d2beaf065c7540bc7f4614b84f3b49a',
    collapsed: 'ca6b15a2e9a9800591323fa9e43292611d28f21206c9c643d17abe1b5ef31877',
    expanded: '4f23e4f7c2016684947c28bfd747de3be333c47793f9ab211d664c4a8546ec7d',
    long: 'd6c4391b08bca9b39d616772f39baf58947dbc029b652e204df088aa08b9ce39',
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
