// 회원 목록 API가 멘토·매니저의 프로그램 관계를 계산해 내리고 원본 관계는 노출하지 않는지 검증한다.
import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), requireAdmin: vi.fn() }));
vi.mock('../lib/prisma', () => ({ prisma: { user: { findMany: mocks.findMany } } }));
vi.mock('../lib/authorization', () => ({ requireAdmin: mocks.requireAdmin, hasAdminAccess: vi.fn() }));

import { GET } from '../app/api/admin/users/route';

const request = () => new NextRequest('http://localhost/api/admin/users');

beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({ userId: 'admin', role: 'ADMIN' });
});

it('담당 멘티와 담당 프로그램을 relatedProgramIds 로 합쳐 내린다', async () => {
    mocks.findMany.mockResolvedValue([{
        id: 'manager', program: null, usedInviteCode: null,
        assignedMentees: [{ mentee: { programId: 'a' } }, { mentee: { programId: null } }],
        managedPrograms: [{ id: 'b' }],
    }]);
    const body = await (await GET(request())).json();
    expect(body.users[0].relatedProgramIds).toEqual(['a', 'b']);
    expect(body.users[0]).not.toHaveProperty('assignedMentees');
    expect(body.users[0]).not.toHaveProperty('managedPrograms');
});

it('관리자가 아니면 회원 목록을 조회하지 않는다', async () => {
    mocks.requireAdmin.mockResolvedValue(NextResponse.json({ error: '권한 없음' }, { status: 403 }));
    expect((await GET(request())).status).toBe(403);
    expect(mocks.findMany).not.toHaveBeenCalled();
});
