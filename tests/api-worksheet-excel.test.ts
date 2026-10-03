// 엑셀 출력 API의 읽기 권한, 양식 선택, 오류 응답과 기존 백업 호환성을 검증한다.
import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { worksheetExcelProject } from './fixtures/worksheet-excel-project';

const findUnique = vi.fn();
const requireProjectAccess = vi.fn();
vi.mock('../lib/prisma', () => ({ prisma: { project: { findUnique } } }));
vi.mock('../lib/authorization', () => ({ requireProjectAccess: (...args: unknown[]) => requireProjectAccess(...args) }));
const { GET } = await import('../app/api/projects/[id]/export/route');
const params = { params: Promise.resolve({ id: 'project-1' }) };
beforeEach(() => {
    vi.clearAllMocks();
    requireProjectAccess.mockResolvedValue({ role: 'VIEWER', user: { userId: 'reader' } });
    findUnique.mockResolvedValue(worksheetExcelProject());
});
const request = (query: string) => new NextRequest(`http://localhost/api/projects/project-1/export${query}`);

it('읽기 전용 사용자도 저장된 개별 양식을 안전한 파일명으로 내려받는다', async () => {
    const response = await GET(request('?format=xlsx&worksheet=spec'), params);
    expect(response.status).toBe(200);
    expect(requireProjectAccess).toHaveBeenCalledWith(expect.anything(), 'project-1', { write: false });
    expect(response.headers.get('Content-Type')).toContain('spreadsheetml.sheet');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(decodeURIComponent(response.headers.get('Content-Disposition')!)).toContain('시험 프로젝트_WS-2 AS-IS 스펙표.xlsx');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(await response.arrayBuffer()) as never);
    expect(workbook.worksheets.map(sheet => sheet.name)).toEqual(['WS-2 AS-IS 스펙표']);
    expect(workbook.worksheets[0].getCell('C7').value).toBe('이송');
});

it('전체 파일과 독립 페이지의 워크시트 별칭도 지원한다', async () => {
    for (const [query, names] of [['?format=xlsx&worksheet=kano%2Fanalysis', ['WS-7 Kano 분석 집계표']], ['?format=xlsx', null]] as const) {
        const response = await GET(request(query), params);
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(Buffer.from(await response.arrayBuffer()) as never);
        if (names) expect(workbook.worksheets.map(sheet => sheet.name)).toEqual(names);
        else expect(workbook.worksheets).toHaveLength(18);
    }
});

it('잘못된 양식, 접근 거부와 없는 프로젝트는 데이터를 출력하지 않는다', async () => {
    expect((await GET(request('?format=xlsx&worksheet=bad'), params)).status).toBe(400);
    expect(findUnique).not.toHaveBeenCalled();
    for (const status of [401, 403]) {
        requireProjectAccess.mockResolvedValueOnce(NextResponse.json({ error: '접근 거부' }, { status }));
        expect((await GET(request('?format=xlsx'), params)).status).toBe(status);
    }
    expect(findUnique).not.toHaveBeenCalled();
    findUnique.mockResolvedValueOnce(null);
    expect((await GET(request('?format=xlsx'), params)).status).toBe(404);
});

it('기존 JSON 백업은 그대로 유지하고 엑셀 생성 오류는 내부 정보 없이 반환한다', async () => {
    const json = await GET(request(''), params);
    const backup = await json.json();
    expect(backup.project.name).toBe('시험 프로젝트');
    expect(backup.customerRequirements).toHaveLength(2);
    expect(json.headers.get('Content-Type')).toContain('application/json');
    const project = worksheetExcelProject();
    project.fitnessMatrix!.marketsJson = 'invalid-private-data';
    findUnique.mockResolvedValueOnce(project);
    const response = await GET(request('?format=xlsx'), params);
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('invalid-private-data');
});
