// 오프라인 Kano 설문 내려받기 라우트의 권한·조회·응답 계약을 검증한다.
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

const { GET } = await import('../app/api/projects/[id]/kano/offline-survey/route');

const USER = { userId: 'user_1', email: 'owner@x.com', name: '소유자' };

function call(projectId = 'proj_1') {
    const request = new NextRequest(`http://localhost/api/projects/${projectId}/kano/offline-survey`);
    return GET(request, { params: Promise.resolve({ id: projectId }) });
}

beforeEach(() => {
    requireProjectAccess.mockResolvedValue({ user: USER, role: 'OWNER' });
    findProject.mockResolvedValue({ name: '스마트팜' });
    findManyRequirement.mockResolvedValue([
        {
            id: 'req_1',
            category: '성능',
            requirement: '응답이 빨라야 한다',
            kanoPositiveQ: '빠르면 어떻습니까?',
            kanoNegativeQ: '빠르지 않으면 어떻습니까?',
        },
    ]);
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('GET /api/projects/[id]/kano/offline-survey', () => {
    it('자급자족 HTML을 네 보안·다운로드 헤더와 함께 내려준다', async () => {
        const res = await call();
        const body = await res.text();

        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
        expect(res.headers.get('Content-Disposition')).toBe(
            `attachment; filename*=UTF-8''${encodeURIComponent('Kano_설문_스마트팜.html')}`
        );
        expect(res.headers.get('Cache-Control')).toBe('no-store');
        expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
        expect(body).toContain('<!DOCTYPE html>');
        expect(body).toContain('스마트팜');
    });

    it('요구사항을 화면과 같은 순서와 필요한 필드로 읽는다', async () => {
        await call();

        expect(findManyRequirement).toHaveBeenCalledWith({
            where: { projectId: 'proj_1' },
            orderBy: { order: 'asc' },
            select: {
                id: true,
                category: true,
                requirement: true,
                kanoPositiveQ: true,
                kanoNegativeQ: true,
            },
        });
    });

    it('요구사항이 없으면 등록 안내와 함께 400을 돌려준다', async () => {
        findManyRequirement.mockResolvedValue([]);

        const res = await call();
        const body = await res.json();

        expect(res.status).toBe(400);
        expect(body).toEqual({ error: '먼저 고객요구사항을 등록하세요.' });
    });

    it('프로젝트가 없으면 404를 돌려준다', async () => {
        findProject.mockResolvedValue(null);

        const res = await call();
        const body = await res.json();

        expect(res.status).toBe(404);
        expect(body).toEqual({ error: '프로젝트를 찾을 수 없습니다.' });
        expect(findManyRequirement).not.toHaveBeenCalled();
    });

    it('권한이 없으면 접근 판정 결과를 그대로 돌려준다', async () => {
        requireProjectAccess.mockResolvedValue(NextResponse.json({ error: 'denied' }, { status: 403 }));

        const res = await call();

        expect(res.status).toBe(403);
        expect(findProject).not.toHaveBeenCalled();
    });

    it('생성 실패 시 500을 돌리고 원인을 응답에 담지 않는다', async () => {
        findManyRequirement.mockRejectedValue(new Error('db down'));

        const res = await call();
        const body = await res.json();

        expect(res.status).toBe(500);
        expect(body.error).toBe('오프라인 설문지 생성에 실패했습니다.');
        expect(JSON.stringify(body)).not.toContain('db down');
    });
});
