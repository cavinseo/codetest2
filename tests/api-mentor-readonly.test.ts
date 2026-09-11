// 실제 인가 함수로 배정 멘토의 워크시트 편집과 미배정·해제 후 차단을 검증한다.
import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const m = vi.hoisted(() => ({
    auth: vi.fn(), project: vi.fn(), specs: vi.fn(), transaction: vi.fn(),
    deleteSpecs: vi.fn(), createSpec: vi.fn(), importSpecs: vi.fn(),
    deleteSales: vi.fn(), createSales: vi.fn(), sales: vi.fn(),
    updateProject: vi.fn(), createMember: vi.fn(),
}));
vi.mock('../lib/auth', () => ({ requireAuth: m.auth }));
vi.mock('../lib/prisma', () => ({ prisma: {
    project: { findUnique: m.project }, specFunction: { findMany: m.specs },
    projectMember: { create: m.createMember }, $transaction: m.transaction,
} }));
import { GET, POST } from '../app/api/projects/[id]/spec/route';
import { POST as saveSales } from '../app/api/projects/[id]/sales/route';
import { POST as importJson } from '../app/api/projects/[id]/import-json/route';
import { POST as inviteMember } from '../app/api/projects/[id]/members/route';
import { DELETE as deleteProject } from '../app/api/admin/projects/route';
const params = { params: Promise.resolve({ id: 'project' }) };
const specs = [{ name: '조작', level: 'CORE', order: 0 }];
const req = (method: string, body: unknown = { specFunctions: specs }) => new NextRequest('http://localhost/api/projects/project/spec', { method, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) });
beforeEach(() => {
    vi.resetAllMocks();
    m.auth.mockResolvedValue({ userId: 'mentor', role: 'MENTOR' });
    m.project.mockResolvedValue({ ownerId: 'mentee', owner: { mentorAssignment: { mentorId: 'mentor' } }, members: [{ role: 'EDITOR' }] });
    m.specs.mockResolvedValue([{ name: '기존 스펙' }]);
    m.createSpec.mockResolvedValue({ id: 'spec_1' });
    m.sales.mockResolvedValue([{ customer: '고객', amount: 100, order: 0 }]);
    m.transaction.mockImplementation(async callback => callback({
        specFunction: { deleteMany: m.deleteSpecs, create: m.createSpec, createMany: m.importSpecs, findMany: m.specs },
        salesEstimate: { deleteMany: m.deleteSales, createMany: m.createSales, findMany: m.sales },
        project: { update: m.updateProject },
    }));
});
it('배정된 멘토가 기존·신규 프로젝트의 스펙을 읽는다', async () => {
    const response = await GET(req('GET'), params);
    expect(response.status).toBe(200);
    expect((await response.json()).specFunctions).toEqual([{ name: '기존 스펙' }]);
});
it.each(['MENTOR', 'PROGRAM_MANAGER'])('배정된 %s는 스펙을 작성·수정한다', async role => {
    m.auth.mockResolvedValue({ userId: 'mentor', role });
    expect((await POST(req('POST'), params)).status).toBe(200);
    expect(m.deleteSpecs).toHaveBeenCalledWith({ where: { projectId: 'project' } });
    expect(m.createSpec).toHaveBeenCalledWith({ data: { ...specs[0], projectId: 'project', technology: null } });
});
it('배정된 멘토는 공통 워크시트 저장 경로로 매출을 수정한다', async () => {
    expect((await saveSales(req('POST', { rows: [{ customer: '고객', amount: 100, order: 0 }] }), params)).status).toBe(200);
    expect(m.deleteSales).toHaveBeenCalledWith({ where: { projectId: 'project' } });
    expect(m.createSales).toHaveBeenCalledWith({ data: [expect.objectContaining({ projectId: 'project', customer: '고객', amount: 100 })] });
});
it('배정된 멘토는 프로젝트 내용과 스펙을 가져온다', async () => {
    expect((await importJson(req('POST', { specFunctions: specs, project: { description: '멘토가 보완한 설명' } }), params)).status).toBe(200);
    expect(m.importSpecs).toHaveBeenCalledWith({ data: [expect.objectContaining({ projectId: 'project', name: '조작' })] });
    expect(m.updateProject).toHaveBeenCalledWith({ where: { id: 'project' }, data: { description: '멘토가 보완한 설명', detailedDescription: undefined } });
});
it.each(['spec', 'sales', 'import'])('과거 EDITOR라도 다른 멘토에게 배정된 멘티의 %s 저장은 403이고 DB 쓰기는 0회다', async route => {
    m.project.mockResolvedValue({ ownerId: 'other_mentee', owner: { mentorAssignment: { mentorId: 'other_mentor' } }, members: [{ role: 'EDITOR' }] });
    expect((await (route === 'spec' ? POST : route === 'sales' ? saveSales : importJson)(req('POST'), params)).status).toBe(403);
    expect(m.transaction).not.toHaveBeenCalled();
    expect(m.project).toHaveBeenCalledTimes(1);
});
it('배정 해제 후 다음 조회와 저장에서 즉시 접근을 차단한다', async () => {
    m.project.mockResolvedValue({ ownerId: 'mentee', owner: { mentorAssignment: null }, members: [{ role: 'EDITOR' }] });
    expect((await GET(req('GET'), params)).status).toBe(403);
    expect((await POST(req('POST'), params)).status).toBe(403);
    expect(m.specs).not.toHaveBeenCalled();
    expect(m.transaction).not.toHaveBeenCalled();
});
it.each(['MENTOR', 'PROGRAM_MANAGER'])('배정된 %s라도 과거 OWNER 역할로 팀원 초대와 프로젝트 삭제를 할 수 없다', async role => {
    m.auth.mockResolvedValue({ userId: 'mentor', role });
    m.project.mockResolvedValue({ ownerId: 'mentee', owner: { mentorAssignment: { mentorId: 'mentor' } }, members: [{ role: 'OWNER' }] });
    expect((await inviteMember(req('POST', { email: 'member@example.com', role: 'EDITOR' }), params)).status).toBe(403);
    expect((await deleteProject(req('DELETE'))).status).toBe(403);
    expect(m.createMember).not.toHaveBeenCalled();
    expect(m.transaction).not.toHaveBeenCalled();
});
