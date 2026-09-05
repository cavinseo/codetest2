// 내부 오류 문자열이 클라이언트 응답으로 새지 않는지 확인한다.
//
// Prisma·XLSX·Google 오류 메시지에는 테이블명·컬럼명·내부 경로가 들어간다.
// 사용자에게는 고정 문구와 상관 ID 만 준다(lib/api-error.ts).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const findRequirements = vi.fn();

vi.mock('../lib/prisma', () => ({
    prisma: {
        customerRequirement: { findMany: findRequirements },
        kanoSurveyInvitation: { findUnique: vi.fn(), create: vi.fn() },
        kanoResponse: { createMany: vi.fn() },
    },
}));

const requireProjectAccess = vi.fn();
vi.mock('../lib/authorization', () => ({
    requireProjectAccess: (...args: unknown[]) => requireProjectAccess(...(args as [])),
}));

vi.mock('../lib/service-settings', () => ({
    isGoogleConfigured: () => Promise.resolve(true),
    getGoogleToken: () => Promise.resolve({ accessToken: 'token_x' }),
}));

vi.mock('../lib/google-forms', () => ({
    getFormResponses: () => Promise.resolve({ responses: [] }),
}));

vi.mock('../lib/feature-flags', () => ({
    GOOGLE_FORMS_INTEGRATION_ENABLED: true,
    GOOGLE_FORMS_DISABLED_MESSAGE: '',
}));

const { POST } = await import('../app/api/projects/[id]/kano/form-responses/route');

const SECRET_DETAIL = 'Invalid `prisma.kanoSurveyInvitation.create()` — column "invitedBy"';

beforeEach(() => {
    requireProjectAccess.mockResolvedValue({
        user: { userId: 'user_1', email: 'u@x.com', name: '사용자' },
        role: 'OWNER',
    });
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('form-responses 오류 응답', () => {
    it('내부 오류 문자열을 응답에 담지 않는다', async () => {
        findRequirements.mockRejectedValue(new Error(SECRET_DETAIL));

        const req = new NextRequest('http://localhost/api/projects/proj_1/kano/form-responses', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ formId: 'form_1' }),
        });
        const res = await POST(req, { params: Promise.resolve({ id: 'proj_1' }) });
        const body = await res.json();

        expect(res.status).toBe(500);
        expect(JSON.stringify(body)).not.toContain('prisma');
        expect(JSON.stringify(body)).not.toContain('invitedBy');
        expect(body.referenceId).toBeTruthy();
    });
});
