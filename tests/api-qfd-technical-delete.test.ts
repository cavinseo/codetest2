// 기술특성(세부기능 열) 삭제 라우트가 권한과 프로젝트 소속을 확인하고 지우는지 검사한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const findFirstTech = vi.fn();
const deleteTech = vi.fn();
vi.mock('../lib/prisma', () => ({
    prisma: {
        technicalCharacteristic: {
            findFirst: findFirstTech,
            delete: deleteTech,
        },
    },
}));

const requireProjectAccess = vi.fn();
vi.mock('../lib/authorization', () => ({
    requireProjectAccess: (...args: unknown[]) => requireProjectAccess(...(args as [])),
}));

const { DELETE } = await import('../app/api/projects/[id]/qfd/technical/route');

const USER = { userId: 'user_1', email: 'owner@x.com', name: '소유자' };

function call(body: unknown, projectId = 'proj_1') {
    const request = new NextRequest(`http://localhost/api/projects/${projectId}/qfd/technical`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    return DELETE(request, { params: Promise.resolve({ id: projectId }) });
}

beforeEach(() => {
    requireProjectAccess.mockResolvedValue({ user: USER, role: 'OWNER' });
    findFirstTech.mockResolvedValue({ id: 'tech_1' });
    deleteTech.mockResolvedValue({ id: 'tech_1' });
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('DELETE /api/projects/[id]/qfd/technical', () => {
    it('프로젝트에 속한 기술특성을 지운다', async () => {
        const res = await call({ id: 'tech_1' });

        expect(res.status).toBe(200);
        await expect(res.json()).resolves.toEqual({ success: true });
        expect(deleteTech).toHaveBeenCalledWith({ where: { id: 'tech_1' } });
    });

    it('쓰기 권한을 요구한다', async () => {
        await call({ id: 'tech_1' });

        expect(requireProjectAccess).toHaveBeenCalledWith(
            expect.anything(),
            'proj_1',
            { write: true }
        );
    });

    it('권한 검사가 응답을 내면 그대로 돌려주고 지우지 않는다', async () => {
        requireProjectAccess.mockResolvedValue(NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 }));

        const res = await call({ id: 'tech_1' });

        expect(res.status).toBe(403);
        expect(deleteTech).not.toHaveBeenCalled();
    });

    it('다른 프로젝트의 기술특성은 404 로 막고 지우지 않는다', async () => {
        // id 만 믿고 지우면 남의 프로젝트 열이 사라진다. 소속 조회가 관문이다.
        findFirstTech.mockResolvedValue(null);

        const res = await call({ id: 'tech_other' });

        expect(res.status).toBe(404);
        expect(findFirstTech).toHaveBeenCalledWith({
            where: { id: 'tech_other', projectId: 'proj_1' },
            select: { id: true },
        });
        expect(deleteTech).not.toHaveBeenCalled();
    });

    it('id 가 없으면 400 으로 막는다', async () => {
        const res = await call({});

        expect(res.status).toBe(400);
        expect(deleteTech).not.toHaveBeenCalled();
    });

    it('삭제 중 오류가 나면 500 을 내고 원인을 응답 본문에 담지 않는다', async () => {
        deleteTech.mockRejectedValue(new Error('P2025: record not found at db-host'));

        const res = await call({ id: 'tech_1' });

        expect(res.status).toBe(500);
        await expect(res.json()).resolves.toEqual({ error: '기술특성 삭제 실패' });
    });
});
