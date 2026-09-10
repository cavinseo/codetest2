// 멘티별 단일 배정과 담당 매니저 범위를 API 진입점에서 검증한다.
import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
const mocks = vi.hoisted(() => ({
    auth: vi.fn(), user: vi.fn(), users: vi.fn(), project: vi.fn(),
    assignment: vi.fn(), upsert: vi.fn(), remove: vi.fn(),
}));
vi.mock('../lib/auth', () => ({ requireAuth: mocks.auth }));
vi.mock('../lib/prisma', () => ({ prisma: {
    user: { findUnique: mocks.user, findMany: mocks.users },
    project: { findUnique: mocks.project },
    mentorAssignment: { findUnique: mocks.assignment, upsert: mocks.upsert, deleteMany: mocks.remove },
} }));
import { GET, POST, DELETE } from '../app/api/projects/[id]/mentors/route';
import { POST as assignMentee } from '../app/api/mentees/[id]/mentor/route';
const params = { params: Promise.resolve({ id: 'p1' }) };
const request = (method = 'POST', userId = 'mentor') => new NextRequest('http://localhost/api/projects/p1/mentors', {
    method, ...(method === 'GET' ? {} : { body: JSON.stringify({ userId }) }),
});
beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({ userId: 'manager', role: 'PROGRAM_MANAGER' });
    mocks.project.mockResolvedValue({ ownerId: 'mentee' });
    mocks.user.mockImplementation(async ({ where }) => where.id === 'mentee'
        ? { id: 'mentee', role: 'MENTEE', program: { managerId: 'manager' } }
        : { id: where.id, role: 'MENTOR', status: 'APPROVED', accessExpiresAt: null });
    mocks.users.mockResolvedValue([]);
    mocks.assignment.mockResolvedValue(null);
});
it.each(['ADMIN', 'PROGRAM_MANAGER'])('%s는 멘티에게 단일 멘토를 배정한다', async role => {
    mocks.auth.mockResolvedValue({ userId: 'manager', role });
    expect((await POST(request(), params)).status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith({
        where: { menteeId: 'mentee' }, create: { menteeId: 'mentee', mentorId: 'mentor' },
        update: { mentorId: 'mentor', assignedAt: expect.any(Date) },
    });
});
it.each(['MENTOR', 'MENTEE'])('%s는 배정·해제·목록을 사용할 수 없다', async role => {
    mocks.auth.mockResolvedValue({ userId: 'manager', role });
    for (const [handler, method] of [[POST, 'POST'], [DELETE, 'DELETE'], [GET, 'GET']] as const) {
        expect((await handler(request(method), params)).status).toBe(403);
    }
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
});
it.each(['POST', 'DELETE', 'GET'])('다른 매니저의 %s 요청을 차단한다', async method => {
    mocks.auth.mockResolvedValue({ userId: 'other', role: 'PROGRAM_MANAGER' });
    expect((await GET(request(method), params)).status).toBe(403);
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
});
it('프로젝트가 없어도 멘티에게 배정한다', async () => {
    expect((await assignMentee(request(), { params: Promise.resolve({ id: 'mentee' }) })).status).toBe(200);
    expect(mocks.project).not.toHaveBeenCalled();
});
it('배정 교체는 같은 멘티 키를 갱신한다', async () => {
    await POST(request('POST', 'replacement'), params);
    expect(mocks.upsert.mock.calls[0][0].update.mentorId).toBe('replacement');
});
it('삭제는 요청한 멘티와 현재 멘토 조합으로 한정한다', async () => {
    expect((await DELETE(request('DELETE'), params)).status).toBe(200);
    expect(mocks.remove).toHaveBeenCalledWith({ where: { menteeId: 'mentee', mentorId: 'mentor' } });
});
it.each(['MENTEE', 'ADMIN'])('%s는 멘토로 지정할 수 없다', async role => {
    mocks.user.mockResolvedValueOnce({ id: 'mentee', role: 'MENTEE', program: { managerId: 'manager' } })
        .mockResolvedValueOnce({ id: 'target', role, status: 'APPROVED' });
    expect((await POST(request(), params)).status).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
});
it.each([
    { role: 'MENTOR', status: 'PENDING' },
    { role: 'MENTOR', status: 'APPROVED', accessExpiresAt: new Date('2000-01-01') },
    null,
])('미승인·만료·없는 멘토를 차단한다', async target => {
    mocks.user.mockResolvedValueOnce({ id: 'mentee', role: 'MENTEE', program: { managerId: 'manager' } }).mockResolvedValueOnce(target);
    expect((await POST(request(), params)).status).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
});
it('프로그램 매니저를 멘토로 지정할 수 있다', async () => {
    mocks.user.mockResolvedValueOnce({ id: 'mentee', role: 'MENTEE', program: { managerId: 'manager' } })
        .mockResolvedValueOnce({ id: 'mentor', role: 'PROGRAM_MANAGER', status: 'APPROVED' });
    expect((await POST(request(), params)).status).toBe(200);
});
it('해당 멘티의 배정 한 건만 조회한다', async () => {
    mocks.assignment.mockResolvedValue({ mentorId: 'mentor', mentor: { name: '멘토', role: 'MENTOR' } });
    const response = await GET(request('GET'), params);
    expect((await response.json()).mentors).toEqual([{ id: 'mentee', userId: 'mentor', user: { name: '멘토', role: 'MENTOR' } }]);
    expect(mocks.assignment.mock.calls[0][0].where).toEqual({ menteeId: 'mentee' });
});
it('후보는 승인된 멘토·매니저로 제한하고 만료자는 제외한다', async () => {
    mocks.users.mockResolvedValue([{ id: 'ok', accessExpiresAt: null }, { id: 'expired', accessExpiresAt: new Date('2000-01-01') }]);
    const response = await GET(new NextRequest('http://localhost/api/projects/p1/mentors?candidates=1'), params);
    expect((await response.json()).candidates).toEqual([{ id: 'ok' }]);
    expect(mocks.users.mock.calls[0][0].where).toEqual({ role: { in: ['MENTOR', 'PROGRAM_MANAGER'] }, status: 'APPROVED' });
});
it('없는 프로젝트는 404로 처리한다', async () => {
    mocks.project.mockResolvedValue(null);
    expect((await POST(request(), params)).status).toBe(404);
});
it('빈 대상은 400으로 처리한다', async () => {
    expect((await POST(request('POST', ''), params)).status).toBe(400);
});
it('인증 실패를 그대로 반환한다', async () => {
    mocks.auth.mockResolvedValue(NextResponse.json({}, { status: 401 }));
    expect((await POST(request(), params)).status).toBe(401);
});
