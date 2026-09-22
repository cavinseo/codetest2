// 실제 세션 검증을 거쳐 관리자 API의 비로그인 및 비관리자 접근 차단을 검증한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { encodeSessionCookie } from '../lib/auth';
import * as users from '../app/api/admin/users/route';
import * as projects from '../app/api/admin/projects/route';
import * as stats from '../app/api/admin/stats/route';
import * as transfer from '../app/api/admin/projects/[id]/transfer/route';
import * as password from '../app/api/admin/password/route';

const { findUser } = vi.hoisted(() => ({ findUser: vi.fn() }));
vi.mock('../lib/prisma', () => ({ prisma: { user: { findUnique: findUser } } }));

const adminRoutes = [
    ['GET users', users.GET], ['POST users', users.POST], ['PATCH users', users.PATCH], ['DELETE users', users.DELETE],
    ['GET projects', projects.GET], ['DELETE projects', projects.DELETE], ['GET stats', stats.GET],
    ['GET transfer', (request: NextRequest) => transfer.GET(request, { params: Promise.resolve({ id: 'project' }) })],
    ['POST transfer', (request: NextRequest) => transfer.POST(request, { params: Promise.resolve({ id: 'project' }) })],
] as const;
const session = () => encodeSessionCookie({ userId: 'admin', email: 'admin@example.test', name: '관리자' });
const request = (cookie?: string) => new NextRequest('http://localhost/api/admin/test', {
    headers: cookie ? { cookie: `session=${cookie}` } : {},
});
const approved = { id: 'admin', email: 'admin@example.test', name: '관리자', role: 'ADMIN', isAdmin: true,
    status: 'APPROVED', sessionVersion: 0, accessExpiresAt: null, mustChangePassword: false,
    profile: { organization: '기관', phone: '010-0000-0000', expertise: '제조', careerYears: 10, companyName: '회사', industry: '제조' } };

beforeEach(() => {
    vi.stubEnv('SESSION_SECRET', 'admin-access-test-secret');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('ADMIN_EMAILS', 'admin@example.test');
    vi.stubEnv('ALLOW_DEV_ADMIN', 'true');
    findUser.mockResolvedValue(approved);
});
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });

describe.each([...adminRoutes, ['POST password', password.POST] as const])('%s', (_name, handler) => {
    it.each(['없음', '위조', '만료'])('세션이 %s이면 관리자 예외 설정이 있어도 401이다', async kind => {
        const cookie = kind === '없음' ? undefined : kind === '위조' ? `${session()}tampered`
            : encodeSessionCookie({ userId: 'admin', email: 'admin@example.test', name: null }, { maxAgeSeconds: -1 });
        const result = await handler(request(cookie));
        expect(result.status).toBe(401);
        expect(await result.json()).toEqual({ error: 'Login required.' });
        expect(findUser).not.toHaveBeenCalled();
    });

    it('폐기된 관리자 세션도 401이다', async () => {
        findUser.mockResolvedValue({ ...approved, sessionVersion: 1 });
        expect((await handler(request(session()))).status).toBe(401);
    });
});

describe.each(adminRoutes)('%s 역할 제한', (_name, handler) => {
    it.each(['MENTOR', 'PROGRAM_MANAGER', 'MENTEE'])('%s는 관리자 이메일과 플래그가 있어도 403이다', async role => {
        findUser.mockResolvedValue({ ...approved, role });
        expect((await handler(request(session()))).status).toBe(403);
    });
});
