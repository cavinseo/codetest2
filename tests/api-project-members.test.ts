// 팀원 초대가 EDITOR 만 허용하는지, 그리고 초대한 팀원을 소유자가 다시 제외할 수 있는지 확인한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const findUniqueProject = vi.fn();
const findUniqueUser = vi.fn();
const findUniqueMember = vi.fn();
const createMember = vi.fn();
const deleteManyMember = vi.fn();

vi.mock('../lib/prisma', () => ({
    prisma: {
        project: { findUnique: findUniqueProject },
        user: { findUnique: findUniqueUser },
        projectMember: { findUnique: findUniqueMember, create: createMember, deleteMany: deleteManyMember },
    },
}));

const requireProjectAccess = vi.fn();
vi.mock('../lib/authorization', () => ({
    requireProjectAccess: (...args: unknown[]) => requireProjectAccess(...(args as [])),
}));

const { POST, DELETE } = await import('../app/api/projects/[id]/members/route');

const params = { params: Promise.resolve({ id: 'proj_1' }) };

function jsonRequest(body: unknown): NextRequest {
    return new NextRequest('http://localhost/api/projects/proj_1/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

function deleteRequest(body: unknown): NextRequest {
    return new NextRequest('http://localhost/api/projects/proj_1/members', {
        method: 'DELETE',
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
    deleteManyMember.mockResolvedValue({ count: 1 });
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

describe('팀원 제외', () => {
    it('소유자는 팀원을 제외할 수 있고 그 팀원 행만 지운다', async () => {
        const res = await DELETE(deleteRequest({ userId: 'member_9' }), params);

        expect(res.status).toBe(200);
        expect(deleteManyMember).toHaveBeenCalledWith({ where: { projectId: 'proj_1', userId: 'member_9' } });
    });

    it('소유자 권한이 아니면 제외하지 않고 권한 응답을 그대로 돌려준다', async () => {
        // 초대와 같은 게이트(roles: ['OWNER'])를 쓰므로 편집자·멘토·관리자는 여기서 걸린다.
        requireProjectAccess.mockResolvedValue(
            NextResponse.json({ error: 'Project role not allowed.' }, { status: 403 })
        );

        const res = await DELETE(deleteRequest({ userId: 'member_9' }), params);

        expect(res.status).toBe(403);
        expect(deleteManyMember).not.toHaveBeenCalled();
    });

    it('소유자 자신은 제외할 수 없다', async () => {
        // 소유자는 project_members 행이 아니라 프로젝트 자체에 붙는다. 지울 대상이 아니며,
        // 지울 수 있게 두면 소유자가 자기 프로젝트에서 스스로 잠기는 길이 열린다.
        const res = await DELETE(deleteRequest({ userId: 'owner_1' }), params);

        expect(res.status).toBe(400);
        expect(deleteManyMember).not.toHaveBeenCalled();
    });

    it('이 프로젝트의 팀원이 아니면 404 로 거절한다', async () => {
        deleteManyMember.mockResolvedValue({ count: 0 });

        const res = await DELETE(deleteRequest({ userId: 'stranger_1' }), params);

        expect(res.status).toBe(404);
    });

    it('userId 가 없으면 400 으로 거절한다', async () => {
        const res = await DELETE(deleteRequest({}), params);

        expect(res.status).toBe(400);
        expect(deleteManyMember).not.toHaveBeenCalled();
    });

    it('제외 응답에 회원 이메일을 담지 않는다', async () => {
        // 응답 본문에 이메일을 남기지 않는다(lib/logger.ts 규칙과 같은 이유).
        const res = await DELETE(deleteRequest({ userId: 'member_9' }), params);

        expect(JSON.stringify(await res.json())).not.toContain('@');
    });
});
