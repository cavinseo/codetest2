// Kano Google Forms 상태 조회가 프로젝트 권한만 확인하고 비밀 설정을 내리지 않는지 확인한다.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const requireProjectAccess = vi.fn();
vi.mock('../lib/authorization', () => ({
    requireProjectAccess: (...args: unknown[]) => requireProjectAccess(...(args as [])),
}));

const isGoogleConfigured = vi.fn();
vi.mock('../lib/service-settings', () => ({
    isGoogleConfigured: (...args: unknown[]) => isGoogleConfigured(...(args as [])),
}));

const { GET } = await import('../app/api/projects/[id]/kano/google-status/route');
const params = Promise.resolve({ id: 'project_1' });
const request = new NextRequest('http://localhost/api/projects/project_1/kano/google-status');

beforeEach(() => {
    vi.clearAllMocks();
    requireProjectAccess.mockResolvedValue({ user: { userId: 'user_1' }, role: 'OWNER' });
});

describe('GET /api/projects/[id]/kano/google-status', () => {
    it('프로젝트 접근자가 Google 설정 여부만 받는다', async () => {
        isGoogleConfigured.mockResolvedValue(true);

        const response = await GET(request, { params });

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({ configured: true });
        expect(requireProjectAccess).toHaveBeenCalledWith(request, 'project_1', { write: false });
    });

    it('접근 권한이 없으면 Google 설정을 조회하지 않는다', async () => {
        requireProjectAccess.mockResolvedValue(NextResponse.json({ error: 'denied' }, { status: 403 }));

        const response = await GET(request, { params });

        expect(response.status).toBe(403);
        expect(isGoogleConfigured).not.toHaveBeenCalled();
    });
});
