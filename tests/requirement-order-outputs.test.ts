// 화면 조회와 설문·분석·보고서·엑셀이 같은 고객요구사항 순서를 따르는지 검증한다.
import { expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import JSZip from 'jszip';
import ExcelJS from 'exceljs';
import { worksheetExcelProject } from './fixtures/worksheet-excel-project';
import { buildWorksheetExcel } from '../lib/worksheet-excel';
import { buildWorksheetData } from '../lib/final-report-inputs';
import { buildFinalReportModel } from '../lib/final-report-document';
import { EMPTY_REPORT_FREE_INPUT } from '../lib/final-report-payload';
const state = vi.hoisted(() => ({ requirements: [] as any[], responses: [] as any[] }));
vi.mock('../lib/prisma', () => ({ prisma: {
    customerRequirement: { findMany: async () => state.requirements },
    kanoResponse: { findMany: async () => state.responses },
    project: { findUnique: async () => ({ name: '검증', requirements: state.requirements }) },
    kanoSurveyInvitation: { findUnique: async () => ({ projectId: 'p', expiresAt: new Date('2040-01-01'), respondedAt: null }) },
    technicalCharacteristic: { findMany: async () => [{ id: 't', name: '기술' }] },
    qFDMatrix: { findMany: async () => [{ requirementId: 'b', technicalCharId: 't', strength: 'STRONG' }] },
    benchmark: { findMany: async () => [{ requirementId: 'b', company: 'self', score: 2 }, { requirementId: 'b', company: 'competitor', score: 4 }] },
} }));
vi.mock('../lib/authorization', () => ({ requireProjectAccess: async () => ({ role: 'EDITOR', user: { userId: 'mentor', role: 'MENTOR' } }) }));
import { GET as survey } from '../app/api/survey/[token]/route';
import { GET as paper } from '../app/api/projects/[id]/kano/survey-document/route';
import { GET as offline } from '../app/api/projects/[id]/kano/offline-form/route';
import { GET as script } from '../app/api/projects/[id]/kano/form-script/route';
import { GET as analysis } from '../app/api/projects/[id]/kano/analysis/route';
import { GET as qfd } from '../app/api/projects/[id]/qfd/analysis/route';

function fixture() {
    const project = worksheetExcelProject();
    project.requirements = ['a', 'b', 'c'].map((id, order) => ({ ...project.requirements[0], id, category: id === 'b' ? '다른1차' : '같은1차', subcategory: id === 'b' ? '다른2차' : '같은2차', requirement: `요구${id}`, order, kanoPositiveQ: `긍정${id}`, kanoNegativeQ: `부정${id}`, kanoWeight: order + 1 }));
    project.kanoResponses = [...project.requirements].reverse().map(row => ({ ...project.kanoResponses[0], requirementId: row.id, id: `response-${row.id}` }));
    project.techTreeEntries = project.requirements.map(row => ({ ...project.techTreeEntries[0], id: `tree-${row.id}`, customerVoice: row.requirement, coreSpec: `핵심${row.id}`, subSpec: `세부${row.id}`, techCharacteristic: `기술${row.id}`, order: row.order }));
    project.improvementItems = project.requirements.flatMap(row => ['need', 'feature'].map(type => ({ ...project.improvementItems[0], id: `${type}-${row.id}`, type, content: row.requirement, improvementRate: `작성${row.id}`, order: row.order })));
    project.techRoadmaps = project.requirements.map(row => ({ ...project.techRoadmaps[0], id: `road-${row.id}`, category: row.requirement, q1: `일정${row.id}`, order: row.order }));
    project.targetSpecs = project.techTreeEntries.map(row => ({ ...project.targetSpecs[0], id: `target-${row.id}`, category: row.coreSpec, subCategory: row.subSpec, targetValue: `목표${row.id}`, order: row.order }));
    return project;
}

it('기존 저장 순서가 그룹 순서와 달라도 온라인·Word·HTML·스크립트·집계·QFD가 일치한다', async () => {
    const project = fixture();
    state.requirements = project.requirements;
    state.responses = project.kanoResponses;
    const params = { params: Promise.resolve({ id: 'p' }) };
    const req = () => new NextRequest('http://localhost/api/projects/p/kano');
    const online = await (await survey(req(), { params: Promise.resolve({ token: 'token' }) })).json();
    expect(online.requirements.map((row: any) => row.id)).toEqual(['a', 'c', 'b']);
    const aggregated = await (await analysis(req(), params)).json();
    expect(aggregated.requirements.map((row: any) => [row.requirementId, row.kanoWeight, row.responseCount])).toEqual([['a', 1, 1], ['c', 3, 1], ['b', 2, 1]]);
    const quality = await (await qfd(req(), params)).json();
    expect(quality.requirements.map((row: any) => row.id)).toEqual(['a', 'c', 'b']);
    expect(quality.requirements[2]).toMatchObject({ importance: 2, selfScore: 2, competitorScore: 4, improvementRate: 2, absoluteImportance: 4, rank: 1 });
    expect(quality.technicals[0].totalScore).toBe(18);
    const xml = await (await JSZip.loadAsync(await (await paper(req(), params)).arrayBuffer())).file('word/document.xml')!.async('string');
    const html = await (await offline(req(), params)).text();
    const gs = await (await script(req(), params)).text();
    for (const output of [xml, html, gs]) {
        expect(output.indexOf('긍정a')).toBeLessThan(output.indexOf('긍정c'));
        expect(output.indexOf('긍정c')).toBeLessThan(output.indexOf('긍정b'));
        for (const id of ['a', 'b', 'c']) { expect(output).toContain(`긍정${id}`); expect(output).toContain(`부정${id}`); }
    }
    expect(state.requirements.map(row => row.id)).toEqual(['a', 'b', 'c']);
});

it('보고서와 엑셀의 후속 표가 같은 순서이며 기존 기술·기능·일정·목표값을 보존한다', async () => {
    const project = fixture();
    const before = structuredClone(project);
    const data = buildWorksheetData({ exportData: { customerRequirements: project.requirements }, sales: {}, kanoAnalysis: {}, qfdAnalysis: {}, improvements: { items: project.improvementItems }, techTree: { entries: project.techTreeEntries }, targetSpec: { rows: project.targetSpecs }, techRoadmap: { rows: project.techRoadmaps }, assets: {}, funding: {} });
    const model = buildFinalReportModel({ projectName: '검증', description: null, coachName: null, generatedAt: '2026.10.11' }, data, EMPTY_REPORT_FREE_INPUT, []);
    const tables = model.blocks.filter(block => block.kind === 'dataTable');
    const needs = tables.find(table => table.title === 'WS-11 고객니즈 우선순위')!;
    expect(needs.rows.map(row => [row[1], row[2]])).toEqual([['요구a', '작성a'], ['요구c', '작성c'], ['요구b', '작성b']]);
    expect(tables.find(table => table.title === 'WS-10 기능기술체계도')!.rows.map(row => [row[0], row[3]])).toEqual([['요구a', '기술a'], ['요구c', '기술c'], ['요구b', '기술b']]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await buildWorksheetExcel(project) as never);
    for (const [name, column, prefix] of [['WS-5 고객요구사항도출표', 3, '요구'], ['WS-10 기능기술체계도', 2, '요구'], ['WS-13 향후목표고객LIST', 3, '요구'], ['WS-12 최종목표스펙도출', 2, '핵심']] as const) {
        const sheet = workbook.getWorksheet(name)!;
        expect(sheet, name).toBeDefined();
        const values: string[] = [];
        sheet.eachRow(row => { const value = row.getCell(column).text; if (value.startsWith(prefix) && value.length === prefix.length + 1) values.push(value); });
        expect(values, name).toEqual([`${prefix}a`, `${prefix}c`, `${prefix}b`]);
    }
    expect(project).toEqual(before);
});
