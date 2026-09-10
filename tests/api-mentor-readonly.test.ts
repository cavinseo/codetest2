// 실제 인가 함수를 거쳐 멘토의 조회는 허용하고 워크시트 저장은 차단하는지 검증한다.
import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const m = vi.hoisted(() => ({ auth: vi.fn(), project: vi.fn(), specs: vi.fn(), transaction: vi.fn() }));
vi.mock('../lib/auth', () => ({ requireAuth: m.auth }));
vi.mock('../lib/prisma', () => ({ prisma: { project: { findUnique: m.project }, specFunction: { findMany: m.specs }, $transaction: m.transaction } }));
import { GET, POST } from '../app/api/projects/[id]/spec/route';
import { POST as saveSales } from '../app/api/projects/[id]/sales/route';
const params = { params: Promise.resolve({ id: 'project' }) };
const req = (method: string) => new NextRequest('http://localhost/api/projects/project/spec', { method, ...(method === 'POST' ? { body: JSON.stringify({ specFunctions: [{ name: '조작', level: 'CORE', order: 0 }] }) } : {}) });
beforeEach(() => {
    vi.resetAllMocks();
    m.auth.mockResolvedValue({ userId: 'mentor', role: 'MENTOR' });
    m.project.mockResolvedValue({ ownerId: 'mentee', owner: { mentorAssignment: { mentorId: 'mentor' } }, members: [{ role: 'EDITOR' }] });
    m.specs.mockResolvedValue([{ name: '기존 스펙' }]);
});
it('배정된 멘토가 기존·신규 프로젝트의 스펙을 읽는다', async () => {
    const response = await GET(req('GET'), params);
    expect(response.status).toBe(200);
    expect((await response.json()).specFunctions).toEqual([{ name: '기존 스펙' }]);
});
it.each(['spec', 'sales'])('과거 EDITOR인 멘토도 %s 저장 시 403이고 DB 쓰기는 0회다', async route => {
    expect((await (route === 'spec' ? POST : saveSales)(req('POST'), params)).status).toBe(403);
    expect(m.transaction).not.toHaveBeenCalled();
    expect(m.project).toHaveBeenCalledTimes(1);
});
it('배정 해제 후 다음 조회에서 즉시 접근을 차단한다', async () => {
    m.project.mockResolvedValue({ ownerId: 'mentee', owner: { mentorAssignment: null }, members: [{ role: 'EDITOR' }] });
    expect((await GET(req('GET'), params)).status).toBe(403);
    expect(m.specs).not.toHaveBeenCalled();
});
