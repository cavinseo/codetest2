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
    requireProjectAccess.mockResolvedValue({ role: 'VIEWER', user: { userId: 'reader', role: 'MENTEE' } });
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

it('담당 멘토는 전체 파일과 독립 페이지의 워크시트 별칭도 지원한다', async () => {
    requireProjectAccess.mockResolvedValue({ role: 'EDITOR', user: { userId: 'mentor', role: 'MENTOR' } });
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
    expect((await GET(request('?format=xlsx&worksheet=dev-plan'), params)).status).toBe(400);
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
    Object.defineProperty(project, 'salesEstimates', { get() { throw new Error('invalid-private-data'); } });
    findUnique.mockResolvedValueOnce(project);
    const response = await GET(request('?format=xlsx'), params);
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('invalid-private-data');
});

it('WS-4 저장값이 깨져 있어도 그 표만 비우고 엑셀 전체를 만든다', async () => {
    // 깨진 적합도 JSON 하나로 모든 시트의 내보내기가 실패했다(2026-11-08 코드 리뷰 7번).
    const project = worksheetExcelProject();
    project.fitnessMatrix!.marketsJson = '[{"id":"market","name":"제조"}]';
    project.fitnessMatrix!.matrixJson = '{broken';
    findUnique.mockResolvedValueOnce(project);
    const response = await GET(request('?format=xlsx'), params);
    expect(response.status).toBe(200);
});

it.each(['kano-aggregation', 'kano%2Fanalysis', 'timko'])('멘티는 %s 양식을 개별 다운로드할 수 없다', async worksheet => {
    const response = await GET(request(`?format=xlsx&worksheet=${worksheet}`), params);
    expect(response.status).toBe(403);
    expect(findUnique).not.toHaveBeenCalled();
});

it.each([
    { role: 'OWNER', user: { userId: 'mentee', role: 'MENTEE' } },
    { role: 'VIEWER', user: { userId: 'manager', role: 'PROGRAM_MANAGER' } },
])('분석 권한이 없으면 전체 엑셀에서 WS-7과 WS-8만 제외한다 ($user.role)', async access => {
    requireProjectAccess.mockResolvedValue(access);
    const response = await GET(request('?format=xlsx'), params);
    expect(response.status).toBe(200);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(await response.arrayBuffer()) as never);
    const names = workbook.worksheets.map(sheet => sheet.name);
    expect(names).toHaveLength(16);
    expect(names).not.toContain('WS-7 Kano 분석 집계표');
    expect(names).not.toContain('WS-8 TIMKO');
    expect(names).toContain('WS-6 Kano 질문지');
    expect(names).toContain('WS-9 QFD');
});

it.each(['ADMIN', 'PROGRAM_MANAGER'])('%s의 허용된 분석 열람에는 엑셀 다운로드도 포함된다', async role => {
    requireProjectAccess.mockResolvedValue({ role: role === 'ADMIN' ? 'ADMIN' : 'EDITOR', user: { userId: 'reader', role } });
    const response = await GET(request('?format=xlsx&worksheet=timko'), params);
    expect(response.status).toBe(200);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(await response.arrayBuffer()) as never);
    expect(workbook.worksheets.map(sheet => sheet.name)).toEqual(['WS-8 TIMKO']);
});
