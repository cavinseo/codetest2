// 관리자 프로젝트 삭제가 되돌릴 수 없는 연쇄 삭제를 올바르게 실행하는지 확인한다.
//
// Project 삭제는 schema.prisma 의 onDelete: Cascade 를 타고 하위 22개 모델
// (요구사항·QFD 행렬·Kano 응답·초대·멤버 …)을 전부 지운다. 그 프로젝트에
// 참여한 다른 사람의 작업물까지 함께 사라지므로, 대상 확인과 권한 확인이
// 삭제보다 반드시 먼저 일어나야 한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const findProject = vi.fn();
const deleteProject = vi.fn();
const findManyProject = vi.fn();

vi.mock('../lib/prisma', () => ({
    prisma: {
        project: { findUnique: findProject, delete: deleteProject, findMany: findManyProject },
    },
}));

const requireAdmin = vi.fn();
vi.mock('../lib/authorization', () => ({
    requireAdmin: (...args: unknown[]) => requireAdmin(...(args as [])),
}));

const { DELETE, GET } = await import('../app/api/admin/projects/route');

const ADMIN = { userId: 'admin_1', email: 'admin@ks-qfd.com', name: '관리자' };

function deleteRequest(body: unknown): NextRequest {
    return new NextRequest('http://localhost/api/admin/projects', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

beforeEach(() => {
    requireAdmin.mockResolvedValue(ADMIN);
    findProject.mockResolvedValue({ name: '음료 신제품 개발' });
    deleteProject.mockResolvedValue({ id: 'proj_2' });
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('admin projects DELETE', () => {
    it('projectId 가 없으면 400 으로 막는다', async () => {
        const res = await DELETE(deleteRequest({}));
        const body = await res.json();

        expect(res.status).toBe(400);
        expect(body.error).toContain('projectId');
        expect(deleteProject).not.toHaveBeenCalled();
    });

    it('없는 프로젝트는 404 로 알려주고 삭제를 시도하지 않는다', async () => {
        findProject.mockResolvedValue(null);

        const res = await DELETE(deleteRequest({ projectId: 'proj_missing' }));
        const body = await res.json();

        expect(res.status).toBe(404);
        expect(body.error).toContain('찾을 수 없습니다');
        expect(deleteProject).not.toHaveBeenCalled();
    });

    it('대상을 확인한 뒤에 삭제하고 지운 이름을 돌려준다', async () => {
        const res = await DELETE(deleteRequest({ projectId: 'proj_2' }));
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.success).toBe(true);
        // 삭제된 이름을 돌려줘야 화면이 "무엇이 사라졌는지" 말할 수 있다.
        expect(body.deletedProject).toBe('음료 신제품 개발');
        expect(deleteProject).toHaveBeenCalledWith({ where: { id: 'proj_2' } });
    });

    it('지정한 프로젝트 하나만 지운다', async () => {
        await DELETE(deleteRequest({ projectId: 'proj_2' }));

        expect(deleteProject).toHaveBeenCalledTimes(1);
        // where 절이 비면 전체 삭제가 된다. id 가 반드시 실려야 한다.
        expect(deleteProject.mock.calls[0][0].where.id).toBe('proj_2');
    });

    it('관리자가 아니면 삭제 경로에 들어가지 못한다', async () => {
        requireAdmin.mockResolvedValue(NextResponse.json({ error: 'Admin access required.' }, { status: 403 }));

        const res = await DELETE(deleteRequest({ projectId: 'proj_2' }));

        expect(res.status).toBe(403);
        expect(findProject).not.toHaveBeenCalled();
        expect(deleteProject).not.toHaveBeenCalled();
    });

    it('로그인하지 않았으면 401 을 그대로 돌려준다', async () => {
        requireAdmin.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));

        const res = await DELETE(deleteRequest({ projectId: 'proj_2' }));

        expect(res.status).toBe(401);
        expect(deleteProject).not.toHaveBeenCalled();
    });

    it('본문이 JSON 이 아니면 500 이 아니라 조용히 실패한다', async () => {
        const req = new NextRequest('http://localhost/api/admin/projects', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: 'not-json',
        });

        const res = await DELETE(req);

        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(deleteProject).not.toHaveBeenCalled();
    });

    it('DB 삭제가 실패하면 500 을 돌려주고 성공으로 위장하지 않는다', async () => {
        deleteProject.mockRejectedValue(new Error('connection lost'));

        const res = await DELETE(deleteRequest({ projectId: 'proj_2' }));
        const body = await res.json();

        expect(res.status).toBe(500);
        expect(body.success).toBeUndefined();
        expect(body.error).toContain('삭제 실패');
    });
});

describe('admin projects GET', () => {
    it('관리자가 아니면 목록을 볼 수 없다', async () => {
        requireAdmin.mockResolvedValue(NextResponse.json({ error: 'Admin access required.' }, { status: 403 }));

        const res = await GET(new NextRequest('http://localhost/api/admin/projects'));

        expect(res.status).toBe(403);
        expect(findManyProject).not.toHaveBeenCalled();
    });

    it('멤버 수는 소유자를 포함해 센다', async () => {
        findManyProject.mockResolvedValue([
            {
                id: 'proj_1',
                name: '음료 신제품 개발',
                description: null,
                ownerId: 'user_1',
                owner: { email: 'owner@x.com', name: '소유자' },
                createdAt: new Date('2026-01-02T03:04:05Z'),
                updatedAt: new Date('2026-01-02T03:04:05Z'),
                _count: { requirements: 4, kanoResponses: 7, members: 2 },
            },
        ]);

        const res = await GET(new NextRequest('http://localhost/api/admin/projects'));
        const body = await res.json();

        expect(res.status).toBe(200);
        // members 는 소유자를 빼고 세므로 화면에 보이는 인원은 +1 이다.
        expect(body.projects[0].memberCount).toBe(3);
        expect(body.projects[0].reqCount).toBe(4);
        expect(body.projects[0].responseCount).toBe(7);
    });

    it('소유자가 없는 프로젝트도 목록을 깨뜨리지 않는다', async () => {
        findManyProject.mockResolvedValue([
            {
                id: 'proj_1',
                name: '주인 없는 과제',
                description: null,
                ownerId: 'user_gone',
                owner: null,
                createdAt: new Date('2026-01-02T03:04:05Z'),
                updatedAt: new Date('2026-01-02T03:04:05Z'),
                _count: { requirements: 0, kanoResponses: 0, members: 0 },
            },
        ]);

        const res = await GET(new NextRequest('http://localhost/api/admin/projects'));
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.projects[0].ownerEmail).toBeNull();
        expect(body.projects[0].ownerName).toBeNull();
    });
});
