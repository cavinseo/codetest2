// 설문지 내려받기 라우트가 권한을 확인하고 올바른 첨부 응답을 내는지 확인하는 테스트입니다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { KANO_SURVEY_INTRODUCTION } from '../lib/kano-survey-document';

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

// 문서 모델에 저장된 소개문이 들어가는지 보려고 실제 렌더러를 감싸 인자를 기록한다.
const renderedModels: Array<{ introduction: string }> = [];
vi.mock('../lib/kano-survey-docx', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../lib/kano-survey-docx')>();
    return {
        ...actual,
        renderKanoSurveyDocx: (model: Parameters<typeof actual.renderKanoSurveyDocx>[0]) => {
            renderedModels.push(model);
            return actual.renderKanoSurveyDocx(model);
        },
    };
});

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
    renderedModels.length = 0;
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

    it('설문 질문 구성에서 저장한 소개문으로 완성한다', async () => {
        findProject.mockResolvedValue({
            name: '스마트팜',
            kanoSurveyIntroduction: { technology: '센서', productType: '농기계', companyName: '팜테크', representativeName: '홍길동', offering: '자동 관수' },
        });
        await call();
        expect(findProject).toHaveBeenCalledWith(expect.objectContaining({ select: { name: true, kanoSurveyIntroduction: true } }));
        expect(renderedModels[0].introduction).toContain('안녕하세요. 「센서」 기술을 활용하여 다양한 「농기계」제품을 개발하고 있는 「팜테크」 대표 「홍길동」입니다. 본 설문은 자사에서 제공하는 「자동 관수」에 대하여');
    });

    it('저장된 소개문이 형식에 맞지 않으면 빈칸 양식으로 낸다', async () => {
        findProject.mockResolvedValue({ name: '스마트팜', kanoSurveyIntroduction: { technology: 7 } });
        const res = await call();
        expect(res.status).toBe(200);
        expect(renderedModels[0].introduction).toBe(KANO_SURVEY_INTRODUCTION);
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
