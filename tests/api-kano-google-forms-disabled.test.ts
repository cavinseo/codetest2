// Google Forms 라우트가 권한 판정 뒤 비활성 응답을 반환하는지 확인한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { GOOGLE_FORMS_DISABLED_MESSAGE } from '../lib/feature-flags';

const findManyRequirement = vi.fn();
const findProject = vi.fn();
const findInvitation = vi.fn();
const createInvitation = vi.fn();
const createManyResponses = vi.fn();
vi.mock('../lib/prisma', () => ({
    prisma: {
        customerRequirement: { findMany: findManyRequirement },
        project: { findUnique: findProject },
        kanoSurveyInvitation: { findUnique: findInvitation, create: createInvitation },
        kanoResponse: { createMany: createManyResponses },
    },
}));

const requireProjectAccess = vi.fn();
vi.mock('../lib/authorization', () => ({
    requireProjectAccess: (...args: unknown[]) => requireProjectAccess(...(args as [])),
}));

const isGoogleConfigured = vi.fn();
const getGoogleToken = vi.fn();
vi.mock('../lib/service-settings', () => ({
    isGoogleConfigured: (...args: unknown[]) => isGoogleConfigured(...(args as [])),
    getGoogleToken: (...args: unknown[]) => getGoogleToken(...(args as [])),
}));

const createKanoForm = vi.fn();
const getFormResponses = vi.fn();
vi.mock('../lib/google-forms', () => ({
    createKanoForm: (...args: unknown[]) => createKanoForm(...(args as [])),
    getFormResponses: (...args: unknown[]) => getFormResponses(...(args as [])),
}));

const buildKanoGoogleFormScript = vi.fn();
vi.mock('../lib/kano-google-form-script', () => ({
    buildKanoGoogleFormScript: (...args: unknown[]) => buildKanoGoogleFormScript(...(args as [])),
}));

const { POST: createForm } = await import('../app/api/projects/[id]/kano/create-form/route');
const { POST: importFormResponses } = await import('../app/api/projects/[id]/kano/form-responses/route');
const { GET: downloadFormScript } = await import('../app/api/projects/[id]/kano/form-script/route');

const USER = { userId: 'user_1', email: 'owner@x.com', name: '소유자' };
const params = Promise.resolve({ id: 'proj_1' });

function postRequest(path: string, body: unknown): NextRequest {
    return new NextRequest(`http://localhost/api/projects/proj_1/kano/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

function getRequest(): NextRequest {
    return new NextRequest('http://localhost/api/projects/proj_1/kano/form-script');
}

beforeEach(() => {
    requireProjectAccess.mockResolvedValue({ user: USER, role: 'OWNER' });
    isGoogleConfigured.mockResolvedValue(true);
    getGoogleToken.mockResolvedValue({ accessToken: 'token_x' });
    findManyRequirement.mockResolvedValue([{ id: 'req_1', order: 0 }]);
    findProject.mockResolvedValue({
        name: '프로젝트',
        requirements: [{
            category: '기능',
            subcategory: null,
            requirement: '빠른 처리',
            kanoPositiveQ: '빠르면 어떻습니까?',
            kanoNegativeQ: '느리면 어떻습니까?',
        }],
    });
    findInvitation.mockResolvedValue({ id: 'inv_1' });
    createKanoForm.mockResolvedValue({ formId: 'form_1', formUrl: 'url', editUrl: 'edit' });
    getFormResponses.mockResolvedValue({ responses: [] });
    buildKanoGoogleFormScript.mockReturnValue('function createForm() {}');
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('Google Forms 라우트 비활성화', () => {
    it.each([
        ['create-form', () => createForm(postRequest('create-form', { projectName: '프로젝트' }), { params })],
        ['form-responses', () => importFormResponses(postRequest('form-responses', { formId: 'form_1' }), { params })],
        ['form-script', () => downloadFormScript(getRequest(), { params })],
    ])('%s 라우트는 503과 고정 안내문을 반환한다', async (_name, callRoute) => {
        const response = await callRoute();

        expect(response.status).toBe(503);
        await expect(response.json()).resolves.toEqual({ error: GOOGLE_FORMS_DISABLED_MESSAGE });
        expect(isGoogleConfigured).not.toHaveBeenCalled();
        expect(getGoogleToken).not.toHaveBeenCalled();
        expect(findManyRequirement).not.toHaveBeenCalled();
        expect(findProject).not.toHaveBeenCalled();
        expect(findInvitation).not.toHaveBeenCalled();
        expect(createInvitation).not.toHaveBeenCalled();
        expect(createManyResponses).not.toHaveBeenCalled();
        expect(createKanoForm).not.toHaveBeenCalled();
        expect(getFormResponses).not.toHaveBeenCalled();
        expect(buildKanoGoogleFormScript).not.toHaveBeenCalled();
    });

    it.each([
        ['create-form', () => createForm(postRequest('create-form', { projectName: '프로젝트' }), { params })],
        ['form-responses', () => importFormResponses(postRequest('form-responses', { formId: 'form_1' }), { params })],
        ['form-script', () => downloadFormScript(getRequest(), { params })],
    ])('%s 라우트는 권한 거부 응답을 먼저 반환한다', async (_name, callRoute) => {
        requireProjectAccess.mockResolvedValue(
            NextResponse.json({ error: 'denied' }, { status: 403 })
        );

        const response = await callRoute();

        expect(response.status).toBe(403);
        await expect(response.json()).resolves.toEqual({ error: 'denied' });
        expect(isGoogleConfigured).not.toHaveBeenCalled();
        expect(getGoogleToken).not.toHaveBeenCalled();
        expect(findManyRequirement).not.toHaveBeenCalled();
        expect(findProject).not.toHaveBeenCalled();
        expect(findInvitation).not.toHaveBeenCalled();
        expect(createInvitation).not.toHaveBeenCalled();
        expect(createManyResponses).not.toHaveBeenCalled();
        expect(createKanoForm).not.toHaveBeenCalled();
        expect(getFormResponses).not.toHaveBeenCalled();
        expect(buildKanoGoogleFormScript).not.toHaveBeenCalled();
    });
});
