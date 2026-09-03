// 설문지 내려받기 라우트가 권한을 확인하고 올바른 첨부 응답을 내는지 확인하는 테스트입니다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const findProject = vi.fn();
const findManyRequirement = vi.fn();
vi.mock('../lib/prisma', () => ({
    prisma: {
        project: { findUnique: findProject },
        customerRequirement: { findMany: findManyRequirement },
    },
}));

const requireProjectAccess = vi.fn();
vi.mock('../lib/authorization', () => ({
    requireProjectAccess: (...args: unknown[]) => requireProjectAccess(...(args as [])),
}));

const { GET } = await import('../app/api/projects/[id]/kano/survey-document/route');

const USER = { userId: 'user_1', email: 'owner@x.com', name: '소유자' };

function call(projectId = 'proj_1') {
    const request = new NextRequest(`http://localhost/api/projects/${projectId}/kano/survey-document`);
    return GET(request, { params: Promise.resolve({ id: projectId }) });
}

beforeEach(() => {
    requireProjectAccess.mockResolvedValue({ user: USER, role: 'OWNER' });
    findProject.mockResolvedValue({ name: '스마트팜' });
    findManyRequirement.mockResolvedValue([
        { requirement: '가', kanoPositiveQ: '가-긍정', kanoNegativeQ: '가-부정' },
    ]);
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('GET /api/projects/[id]/kano/survey-document', () => {
    it('.docx 첨부 파일로 내려준다', async () => {
        const res = await call();
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toBe(
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        );
        expect(res.headers.get('Content-Disposition')).toBe(
            `attachment; filename*=UTF-8''${encodeURIComponent('Kano_설문지_스마트팜.docx')}`
        );
        expect(res.headers.get('Cache-Control')).toBe('no-store');
        const bytes = new Uint8Array(await res.arrayBuffer());
        expect(Buffer.from(bytes.subarray(0, 2)).toString()).toBe('PK');
    });

    it('요구사항을 화면과 같은 순서로 읽는다', async () => {
        await call();
        expect(findManyRequirement).toHaveBeenCalledWith(expect.objectContaining({
            where: { projectId: 'proj_1' },
            orderBy: { order: 'asc' },
        }));
    });

    it('프로젝트가 없으면 404 다', async () => {
        findProject.mockResolvedValue(null);
        const res = await call();
        expect(res.status).toBe(404);
    });

    it('권한이 없으면 접근 판정 결과를 그대로 돌려준다', async () => {
        requireProjectAccess.mockResolvedValue(NextResponse.json({ error: 'denied' }, { status: 403 }));
        const res = await call();
        expect(res.status).toBe(403);
        expect(findProject).not.toHaveBeenCalled();
    });

    it('문서 생성이 실패하면 500 이고 원인을 응답에 담지 않는다', async () => {
        findManyRequirement.mockRejectedValue(new Error('db down'));
        const res = await call();
        const body = await res.json();
        expect(res.status).toBe(500);
        expect(body.error).toBe('설문지 문서 생성에 실패했습니다.');
        expect(JSON.stringify(body)).not.toContain('db down');
    });
});
