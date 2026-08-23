// 팀원 초대가 EDITOR 만 허용하고 COACH(멘토) 배정 경로를 막는지 확인한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const findUniqueProject = vi.fn();
const findUniqueUser = vi.fn();
const findUniqueMember = vi.fn();
const createMember = vi.fn();

vi.mock('../lib/prisma', () => ({
    prisma: {
        project: { findUnique: findUniqueProject },
        user: { findUnique: findUniqueUser },
        projectMember: { findUnique: findUniqueMember, create: createMember },
    },
}));

const requireProjectAccess = vi.fn();
vi.mock('../lib/authorization', () => ({
    requireProjectAccess: (...args: unknown[]) => requireProjectAccess(...(args as [])),
}));

const { POST } = await import('../app/api/projects/[id]/members/route');

const params = { params: Promise.resolve({ id: 'proj_1' }) };

function jsonRequest(body: unknown): NextRequest {
    return new NextRequest('http://localhost/api/projects/proj_1/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

beforeEach(() => {
    requireProjectAccess.mockResolvedValue({ user: { userId: 'owner_1' }, role: 'OWNER' });
    findUniqueProject.mockResolvedValue({ id: 'proj_1', ownerId: 'owner_1' });
    findUniqueUser.mockResolvedValue({ id: 'invitee_1', email: 'i@x.com', name: '초대대상' });
    findUniqueMember.mockResolvedValue(null);
    createMember.mockResolvedValue({ id: 'member_1', role: 'EDITOR', joinedAt: new Date() });
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('팀원 초대 역할', () => {
    it('EDITOR 초대는 허용한다', async () => {
        const res = await POST(jsonRequest({ email: 'i@x.com', role: 'EDITOR' }), params);

        expect(res.status).toBe(200);
        expect(createMember.mock.calls[0][0].data.role).toBe('EDITOR');
    });

    it('COACH 초대는 거부한다', async () => {
        // 멘토(COACH) 배정은 대상의 시스템 역할을 검사하는 /mentors 로만 해야 한다.
        // 이 경로로 COACH 행을 만들면 그 검사를 우회하는 두 번째 배정 경로가 생긴다.
        const res = await POST(jsonRequest({ email: 'i@x.com', role: 'COACH' }), params);

        expect(res.status).toBe(400);
        expect(createMember).not.toHaveBeenCalled();
    });
});
