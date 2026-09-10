// 코멘트의 워크시트 범위와 작성자 권한이 본문 쓰기 권한과 분리되는지 검증한다.
import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
const m = vi.hoisted(() => ({ access: vi.fn(), project: vi.fn(), list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() }));
vi.mock('../lib/authorization', () => ({ requireProjectAccess: m.access }));
vi.mock('../lib/prisma', () => ({ prisma: { project: { findUnique: m.project }, worksheetComment: { findMany: m.list, create: m.create, updateMany: m.update, deleteMany: m.remove } } }));
import { GET, POST, PATCH, DELETE } from '../app/api/projects/[id]/comments/route';
const params = { params: Promise.resolve({ id: 'project' }) };
const req = (method: string, body?: unknown, worksheetId = 'spec') => new NextRequest(`http://localhost/api/projects/project/comments?worksheetId=${worksheetId}`, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
beforeEach(() => {
    vi.resetAllMocks();
    m.access.mockResolvedValue({ user: { userId: 'mentor', role: 'MENTOR' }, role: 'COACH' });
    m.project.mockResolvedValue({ owner: { mentorAssignment: { mentorId: 'mentor' } } });
    m.list.mockResolvedValue([]);
    m.create.mockResolvedValue({ id: 'comment' });
    m.update.mockResolvedValue({ count: 1 });
    m.remove.mockResolvedValue({ count: 1 });
});
it('코멘트 조회는 해당 프로젝트와 워크시트로 한정한다', async () => {
    const res = await GET(req('GET'), params);
    expect(await res.json()).toEqual({ comments: [], canComment: true, userId: 'mentor' });
    expect(m.list.mock.calls[0][0].where).toEqual({ projectId: 'project', worksheetId: 'spec' });
    expect(m.access).toHaveBeenCalledWith(expect.any(NextRequest), 'project');
});
it('배정된 멘토는 다른 작성자 ID를 보내도 본인 명의로만 작성한다', async () => {
    expect((await POST(req('POST', { content: ' 의견 ', authorId: 'other', worksheetId: 'qfd' }), params)).status).toBe(201);
    expect(m.create.mock.calls[0][0].data).toEqual({ projectId: 'project', worksheetId: 'spec', authorId: 'mentor', content: '의견' });
});
it.each(['PATCH', 'DELETE'])('%s는 해당 워크시트의 자기 코멘트로만 범위를 제한한다', async method => {
    const handler = method === 'PATCH' ? PATCH : DELETE;
    expect((await handler(req(method, { id: 'comment', content: '수정' }), params)).status).toBe(200);
    expect((method === 'PATCH' ? m.update : m.remove).mock.calls[0][0].where).toEqual({ projectId: 'project', worksheetId: 'spec', id: 'comment', authorId: 'mentor' });
});
it.each(['PATCH', 'DELETE'])('타 작성자 또는 다른 워크시트의 코멘트 %s는 거절한다', async method => {
    m.update.mockResolvedValue({ count: 0 }); m.remove.mockResolvedValue({ count: 0 });
    expect((await (method === 'PATCH' ? PATCH : DELETE)(req(method, { id: 'other', content: '수정' }), params)).status).toBe(403);
});
it('멘티는 코멘트를 읽을 수 있지만 작성할 수 없다', async () => {
    m.access.mockResolvedValue({ user: { userId: 'mentee', role: 'MENTEE' }, role: 'OWNER' });
    expect((await (await GET(req('GET'), params)).json()).canComment).toBe(false);
    expect((await POST(req('POST', { content: '의견' }), params)).status).toBe(403);
    expect(m.create).not.toHaveBeenCalled();
});
it('미배정 매니저는 프로젝트를 읽어도 코멘트를 작성할 수 없다', async () => {
    m.access.mockResolvedValue({ user: { userId: 'manager', role: 'PROGRAM_MANAGER' }, role: 'VIEWER' });
    expect((await POST(req('POST', { content: '의견' }), params)).status).toBe(403);
});
it('배정 해제되어 접근이 거절되면 코멘트를 조회하거나 저장하지 않는다', async () => {
    m.access.mockResolvedValue(NextResponse.json({ error: 'denied' }, { status: 403 }));
    expect((await GET(req('GET'), params)).status).toBe(403);
    expect((await POST(req('POST', { content: '의견' }), params)).status).toBe(403);
    expect(m.project).not.toHaveBeenCalled(); expect(m.create).not.toHaveBeenCalled();
});
it.each(['', 'import', 'unknown'])('워크시트 ID %s는 거절한다', async worksheetId => {
    expect((await POST(req('POST', { content: '의견' }, worksheetId), params)).status).toBe(400);
    expect(m.create).not.toHaveBeenCalled();
});
it.each(['', '   ', 'x'.repeat(5001)])('잘못된 길이의 코멘트는 저장하지 않는다', async content => {
    expect((await POST(req('POST', { content }), params)).status).toBe(400);
    expect(m.create).not.toHaveBeenCalled();
});
it('관리자는 배정 없이 코멘트를 작성한다', async () => {
    m.access.mockResolvedValue({ user: { userId: 'admin', role: 'ADMIN' }, role: 'ADMIN' });
    expect((await POST(req('POST', { content: '의견' }), params)).status).toBe(201);
});
