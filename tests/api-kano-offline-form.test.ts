// Kano 오프라인 설문지 내려받기 라우트의 권한과 첨부 응답 계약을 검증한다.
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

const { GET } = await import('../app/api/projects/[id]/kano/offline-form/route');

const PROJECT_ID = 'proj_1';
const USER = { userId: 'user_1', email: 'owner@example.test', name: null };
const params = { params: Promise.resolve({ id: PROJECT_ID }) };

function call(): Promise<NextResponse> {
    const request = new NextRequest(
        `http://localhost/api/projects/${PROJECT_ID}/kano/offline-form`
    );
    return GET(request, params);
}

beforeEach(() => {
    requireProjectAccess.mockResolvedValue({ user: USER, role: 'OWNER' });
    findProject.mockResolvedValue({ name: '스마트팜' });
    findManyRequirement.mockResolvedValue([
        {
            requirement: '온도 자동 조절',
            kanoPositiveQ: '온도가 자동으로 조절되면 어떻습니까?',
            kanoNegativeQ: '온도가 자동으로 조절되지 않으면 어떻습니까?',
        },
    ]);
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('GET /api/projects/[id]/kano/offline-form', () => {
    it('프로젝트 식별자가 든 자체 완결형 HTML을 첨부로 내려준다', async () => {
        const response = await call();
        const html = await response.text();

        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
        expect(response.headers.get('Content-Disposition')).toBe(
            `attachment; filename*=UTF-8''${encodeURIComponent('Kano_오프라인_응답지_스마트팜.html')}`
        );
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
        expect(html).toContain(`\"projectId\":\"${PROJECT_ID}\"`);
        expect(findManyRequirement).toHaveBeenCalledWith({
            where: { projectId: PROJECT_ID },
            orderBy: { order: 'asc' },
            select: {
                requirement: true,
                kanoPositiveQ: true,
                kanoNegativeQ: true,
            },
        });
    });

    it('프로젝트가 없으면 지정된 404 오류를 반환한다', async () => {
        findProject.mockResolvedValue(null);

        const response = await call();

        expect(response.status).toBe(404);
        await expect(response.json()).resolves.toEqual({
            error: '프로젝트를 찾을 수 없습니다.',
        });
        expect(findManyRequirement).not.toHaveBeenCalled();
    });

    it('요구사항이 없으면 지정된 400 오류를 반환한다', async () => {
        findManyRequirement.mockResolvedValue([]);

        const response = await call();

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toEqual({
            error: '먼저 고객요구사항을 등록하세요.',
        });
    });

    it('권한 거부 응답을 그대로 반환하고 데이터를 읽지 않는다', async () => {
        requireProjectAccess.mockResolvedValue(
            NextResponse.json({ error: '접근 권한이 없습니다.' }, { status: 403 })
        );

        const response = await call();

        expect(response.status).toBe(403);
        await expect(response.json()).resolves.toEqual({ error: '접근 권한이 없습니다.' });
        expect(findProject).not.toHaveBeenCalled();
        expect(findManyRequirement).not.toHaveBeenCalled();
    });
});
