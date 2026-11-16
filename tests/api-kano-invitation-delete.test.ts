// 실제 프로젝트 권한과 모의 DB로 미응답 초대의 개별 삭제 및 접수 응답 보호를 검증한다.
import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const m = vi.hoisted(() => ({ auth: vi.fn(), project: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), deleteMany: vi.fn(), responseDelete: vi.fn(), invitationUpdate: vi.fn() }));
vi.mock('../lib/auth', () => ({ requireAuth: m.auth }));
vi.mock('../lib/prisma', () => ({ prisma: {
    project: { findUnique: m.project },
    kanoSurveyInvitation: { findMany: m.findMany, findFirst: m.findFirst, deleteMany: m.deleteMany, updateMany: m.invitationUpdate },
    kanoResponse: { deleteMany: m.responseDelete },
} }));
vi.mock('../lib/logger', () => ({ createLogger: () => ({ error: vi.fn() }) }));
const route = await import('../app/api/projects/[id]/kano/invitations/route');
const params = { params: Promise.resolve({ id: 'project_a' }) };
const pending = { id: 'inv_pending', projectId: 'project_a', email: 'pending@example.test', token: 'private-token', expiresAt: new Date('2027-01-01'), respondedAt: null, _count: { responses: 0 } };
const completed = { ...pending, id: 'inv_completed', respondedAt: new Date('2026-10-01'), _count: { responses: 0 } };
const imported = { ...pending, id: 'inv_imported', _count: { responses: 2 } };
let invitations: typeof pending[];
function request(body: unknown = { invitationId: pending.id }) {
    return new NextRequest('https://app.example.test/api/projects/project_a/kano/invitations', { method: 'DELETE', body: JSON.stringify(body) });
}
function authAs(role: string, userId: string) {
    m.auth.mockResolvedValue({ userId, email: 'actor@example.test', role, isAdmin: role === 'ADMIN', name: null });
}
function noRelatedWrite() {
    expect(m.responseDelete).not.toHaveBeenCalled();
    expect(m.invitationUpdate).not.toHaveBeenCalled();
}
beforeEach(() => {
    vi.resetAllMocks();
    authAs('MENTEE', 'owner');
    m.project.mockResolvedValue({ ownerId: 'owner', owner: { mentorAssignment: { mentorId: 'mentor' } }, members: [] });
    invitations = [structuredClone(pending), { ...pending, id: 'inv_other' }, { ...pending, id: 'inv_b', projectId: 'project_b' }];
    m.findMany.mockResolvedValue([pending, completed, imported]);
    m.findFirst.mockImplementation(async ({ where }) => invitations.find(inv => inv.id === where.id && inv.projectId === where.projectId) ?? null);
    m.deleteMany.mockImplementation(async ({ where }) => {
        const before = invitations.length;
        invitations = invitations.filter(inv => !(inv.id === where.id && inv.projectId === where.projectId && inv.respondedAt === where.respondedAt && inv._count.responses === 0));
        return { count: before - invitations.length };
    });
});

it.each([['소유 멘티', 'MENTEE', 'owner'], ['배정 멘토', 'MENTOR', 'mentor'], ['관리자', 'ADMIN', 'admin']])('%s는 현재 프로젝트의 미응답 초대 한 건만 삭제한다', async (_label, role, userId) => {
    authAs(role, userId);
    expect((await route.DELETE(request(), params)).status).toBe(200);
    expect(invitations.map(inv => inv.id)).toEqual(['inv_other', 'inv_b']);
    expect(m.findFirst).toHaveBeenCalledExactlyOnceWith({ where: { id: pending.id, projectId: 'project_a' }, select: { id: true, respondedAt: true, _count: { select: { responses: true } } } });
    expect(m.deleteMany).toHaveBeenCalledExactlyOnceWith({ where: { id: pending.id, projectId: 'project_a', respondedAt: null, responses: { none: {} } } });
    noRelatedWrite();
});

it.each([['MENTEE', 'viewer', 'VIEWER'], ['MENTEE', 'coach', 'COACH'], ['MENTOR', 'unassigned', 'EDITOR'], ['PROGRAM_MANAGER', 'manager', 'EDITOR']])('%s/%s의 쓰기 권한이 없으면 대상 조회 전에 거절한다', async (role, userId, memberRole) => {
    authAs(role, userId);
    m.project.mockResolvedValue({ ownerId: 'owner', owner: { mentorAssignment: { mentorId: 'mentor' } }, members: [{ role: memberRole }] });
    expect((await route.DELETE(request(), params)).status).toBe(403);
    expect(m.findFirst).not.toHaveBeenCalled();
    expect(m.deleteMany).not.toHaveBeenCalled();
    noRelatedWrite();
});

it('미로그인은 프로젝트와 초대 조회를 실행하지 않는다', async () => {
    m.auth.mockResolvedValue(NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }));
    expect((await route.DELETE(request(), params)).status).toBe(401);
    expect(m.project).not.toHaveBeenCalled();
    expect(m.findFirst).not.toHaveBeenCalled();
    expect(m.deleteMany).not.toHaveBeenCalled();
});

it.each([null, [], {}, { invitationId: '' }, { invitationId: '  ' }, { invitationId: 2 }, { invitationId: pending.id, projectId: 'project_b' }, { invitationIds: [pending.id] }].map(body => [body]))('잘못된 본문 %j은 400이며 전체 삭제로 해석하지 않는다', async body => {
    expect((await route.DELETE(request(body), params)).status).toBe(400);
    expect(m.findFirst).not.toHaveBeenCalled();
    expect(m.deleteMany).not.toHaveBeenCalled();
    expect(invitations).toHaveLength(3);
});
it.each(['', ' ', '{broken'])('빈 본문 또는 깨진 JSON %j을 거절한다', async body => {
    const req = new NextRequest('https://app.example.test/api/projects/project_a/kano/invitations', { method: 'DELETE', body });
    expect((await route.DELETE(req, params)).status).toBe(400);
    expect(m.deleteMany).not.toHaveBeenCalled();
});
it.each(['inv_missing', 'inv_b'])('없는 대상 또는 다른 프로젝트의 초대 %s는 404다', async invitationId => {
    expect((await route.DELETE(request({ invitationId }), params)).status).toBe(404);
    expect(m.deleteMany).not.toHaveBeenCalled();
});
it.each([completed, imported])('완료 표시 또는 실제 응답이 있는 초대는 삭제하지 않는다 (%j)', async invitation => {
    m.findFirst.mockResolvedValue(invitation);
    expect((await route.DELETE(request(), params)).status).toBe(409);
    expect(m.deleteMany).not.toHaveBeenCalled();
    noRelatedWrite();
});
it.each([{ count: 0 }, { code: 'P2003', message: 'private database detail' }])('삭제 중 응답 제출 경쟁 또는 FK 충돌은 정보 노출 없이 409다 (%j)', async result => {
    if ('code' in result) m.deleteMany.mockRejectedValueOnce(result);
    else m.deleteMany.mockResolvedValueOnce(result);
    const response = await route.DELETE(request(), params);
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body).toEqual({ error: expect.any(String) });
    expect(JSON.stringify(body)).not.toContain('private database detail');
    expect(invitations).toHaveLength(3);
    noRelatedWrite();
});
it('예상하지 못한 DB 오류는 상세 정보 없이 500을 반환한다', async () => {
    m.findFirst.mockRejectedValueOnce(new Error('private database detail'));
    const response = await route.DELETE(request(), params);
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain('private database detail');
    expect(m.deleteMany).not.toHaveBeenCalled();
});
it.each([['MENTEE', 'owner', true], ['MENTOR', 'mentor', true], ['ADMIN', 'admin', true], ['MENTEE', 'viewer', false], ['MENTEE', 'coach', false]])('GET %s/%s는 응답 수와 쓰기 권한에 따라 삭제 가능 여부와 토큰을 제한한다', async (role, userId, writable) => {
    authAs(role as string, userId as string);
    m.project.mockResolvedValue({ ownerId: 'owner', owner: { mentorAssignment: { mentorId: 'mentor' } }, members: [{ role: userId === 'coach' ? 'COACH' : 'VIEWER' }] });
    const response = await route.GET(new NextRequest('https://app.example.test/api/projects/project_a/kano/invitations'), params);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.invitations.map((inv: { canDelete: boolean }) => inv.canDelete)).toEqual([writable, false, false]);
    for (const inv of body.invitations) expect('token' in inv).toBe(writable);
    expect(m.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { projectId: 'project_a' }, include: { _count: { select: { responses: true } } } }));
    expect(m.deleteMany).not.toHaveBeenCalled();
    noRelatedWrite();
});
