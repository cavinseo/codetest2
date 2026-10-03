// Kano 오프라인 설문지 내려받기 라우트의 권한과 첨부 응답 계약을 검증한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const findProject = vi.fn();
const updateProject = vi.fn();
const findManyRequirement = vi.fn();
vi.mock('../lib/prisma', () => ({
    prisma: {
        project: { findUnique: findProject, update: updateProject },
        customerRequirement: { findMany: findManyRequirement },
    },
}));

const requireProjectAccess = vi.fn();
vi.mock('../lib/authorization', () => ({
    requireProjectAccess: (...args: unknown[]) => requireProjectAccess(...(args as [])),
}));

const { GET, PATCH } = await import('../app/api/projects/[id]/kano/offline-form/route');

const PROJECT_ID = 'proj_1';
const USER = { userId: 'user_1', email: 'owner@example.test', name: null };
const params = { params: Promise.resolve({ id: PROJECT_ID }) };
const introduction = { technology: '유로 성형', productType: '금속분리판', companyName: '테스트 기업', representativeName: '홍길동', offering: 'SOFC 제작 솔루션' };

function call(): Promise<NextResponse> {
    const request = new NextRequest(
        `http://localhost/api/projects/${PROJECT_ID}/kano/offline-form`
    );
    return GET(request, params);
}

beforeEach(() => {
    requireProjectAccess.mockResolvedValue({ user: USER, role: 'OWNER' });
    findProject.mockResolvedValue({ name: '스마트팜' });
    updateProject.mockImplementation(async ({ data }) => data);
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
    it('저장한 소개문을 HTML과 편집용 데이터에 반영한다', async () => {
        findProject.mockResolvedValue({ name: '스마트팜', kanoSurveyIntroduction: introduction });
        const response = await call();
        expect(await response.text()).toContain('「유로 성형」 기술을 활용하여 다양한 「금속분리판」제품을');
        const preview = await GET(new NextRequest(`http://localhost/api/projects/${PROJECT_ID}/kano/offline-form?format=json`), params);
        expect(await preview.json()).toMatchObject({ introduction, canEdit: true, projectName: '스마트팜' });
    });

    it('읽기 전용 역할의 편집 화면에는 저장 권한을 주지 않는다', async () => {
        requireProjectAccess.mockResolvedValue({ user: USER, role: 'VIEWER' });
        const response = await GET(new NextRequest(`http://localhost/api/projects/${PROJECT_ID}/kano/offline-form?format=json`), params);
        expect(await response.json()).toMatchObject({ canEdit: false });
    });
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

describe('PATCH /api/projects/[id]/kano/offline-form', () => {
    function save(body: unknown) {
        return PATCH(new NextRequest(`http://localhost/api/projects/${PROJECT_ID}/kano/offline-form`, {
            method: 'PATCH', body: JSON.stringify(body),
        }), params);
    }

    it('프로젝트 쓰기 권한을 확인하고 소개문만 저장한다', async () => {
        const response = await save({ introduction });
        expect(response.status).toBe(200);
        expect(requireProjectAccess).toHaveBeenCalledWith(expect.anything(), PROJECT_ID, { write: true });
        expect(updateProject).toHaveBeenCalledWith({ where: { id: PROJECT_ID }, data: { kanoSurveyIntroduction: introduction } });
        expect(await response.json()).toEqual({ introduction });
    });

    it('쓰기 권한 거부 시 기존 데이터를 수정하지 않는다', async () => {
        requireProjectAccess.mockResolvedValue(NextResponse.json({ error: 'denied' }, { status: 403 }));
        expect((await save({ introduction })).status).toBe(403);
        expect(updateProject).not.toHaveBeenCalled();
    });

    it.each([
        {}, { introduction: null }, { introduction: { ...introduction, technology: 7 } },
        { introduction: { ...introduction, technology: '가'.repeat(201) } },
        { introduction, name: '다른 프로젝트명' },
    ])('잘못된 입력은 저장하지 않는다. %j', async (body) => {
        expect((await save(body)).status).toBe(400);
        expect(updateProject).not.toHaveBeenCalled();
    });

    it('저장 실패를 성공으로 알리거나 내부 오류를 노출하지 않는다', async () => {
        updateProject.mockRejectedValueOnce(new Error('private database error'));
        const response = await save({ introduction });
        expect(response.status).toBe(500);
        expect(await response.text()).not.toContain('private database error');
    });
});
