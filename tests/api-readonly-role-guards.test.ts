// 읽기 전용 역할(VIEWER·COACH)이 조회만으로 쓰기를 일으키거나 설문 자격증명을
// 얻지 못하는지 확인한다. 두 라우트 모두 GET 이라 requireProjectAccess 는
// write:false 로 통과하므로, 그 뒤의 isProjectWriteRole 게이트가 유일한 방어다.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const fundingPlanFindMany = vi.fn();
const fundingPlanCreateMany = vi.fn();
const fundingSourceFindMany = vi.fn();
const fundingSourceCreateMany = vi.fn();
const salesEstimateFindMany = vi.fn();
const invitationFindMany = vi.fn();
const transaction = vi.fn();

vi.mock('../lib/prisma', () => ({
    prisma: {
        fundingPlan: { findMany: fundingPlanFindMany, createMany: fundingPlanCreateMany },
        fundingSource: { findMany: fundingSourceFindMany, createMany: fundingSourceCreateMany },
        salesEstimate: { findMany: salesEstimateFindMany },
        kanoSurveyInvitation: { findMany: invitationFindMany },
        $transaction: (...args: unknown[]) => transaction(...(args as [])),
    },
}));

// isProjectWriteRole 은 실제 구현을 써야 한다 — 이 테스트가 확인하려는 것이
// "라우트가 그 판정을 실제로 따르는가" 이기 때문이다.
const requireProjectAccess = vi.fn();
vi.mock('../lib/authorization', async () => {
    const actual = await vi.importActual<typeof import('../lib/authorization')>(
        '../lib/authorization'
    );
    return {
        ...actual,
        requireProjectAccess: (...args: unknown[]) => requireProjectAccess(...(args as [])),
    };
});

const { GET: getFunding } = await import('../app/api/projects/[id]/funding/route');
const { GET: getInvitations } = await import('../app/api/projects/[id]/kano/invitations/route');

const params = Promise.resolve({ id: 'proj_1' });

function getRequest(path: string): NextRequest {
    return new NextRequest(`http://localhost/api/projects/proj_1/${path}`, { method: 'GET' });
}

function grantRole(role: string) {
    requireProjectAccess.mockResolvedValue({
        user: { userId: 'user_1', email: 'u@x.com', name: '사용자' },
        role,
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    // 기본행이 아직 없는 프로젝트를 흉내낸다 — 자동 채움이 도는 조건이다.
    fundingPlanFindMany.mockResolvedValue([]);
    fundingSourceFindMany.mockResolvedValue([]);
    salesEstimateFindMany.mockResolvedValue([]);
    transaction.mockResolvedValue([]);
    invitationFindMany.mockResolvedValue([
        {
            id: 'inv_1',
            email: 'respondent@example.com',
            token: 'secret-token',
            expiresAt: new Date('2026-12-31'),
            respondedAt: null,
        },
    ]);
});

describe('자금계획 GET 의 기본행 자동 채움', () => {
    it.each(['VIEWER', 'COACH'])('%s 는 조회만 해도 행을 만들지 않는다', async (role) => {
        grantRole(role);

        const response = await getFunding(getRequest('funding'), { params });

        expect(response.status).toBe(200);
        expect(transaction).not.toHaveBeenCalled();
        expect(fundingPlanCreateMany).not.toHaveBeenCalled();
        expect(fundingSourceCreateMany).not.toHaveBeenCalled();
    });

    it.each(['OWNER', 'EDITOR', 'ADMIN'])('%s 는 기존대로 기본행을 채운다', async (role) => {
        grantRole(role);

        const response = await getFunding(getRequest('funding'), { params });

        expect(response.status).toBe(200);
        expect(transaction).toHaveBeenCalledTimes(1);
    });
});

describe('설문 초대 목록의 토큰 노출', () => {
    it.each(['VIEWER', 'COACH'])('%s 에게는 토큰을 내리지 않는다', async (role) => {
        grantRole(role);

        const response = await getInvitations(getRequest('kano/invitations'), { params });
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.invitations).toHaveLength(1);
        expect(body.invitations[0].token).toBeUndefined();
        // 목록 자체는 그대로 보여야 한다 — 막는 것은 자격증명뿐이다.
        expect(body.invitations[0].email).toBe('respondent@example.com');
    });

    it.each(['OWNER', 'EDITOR', 'ADMIN'])('%s 는 링크 복사를 위해 토큰을 받는다', async (role) => {
        grantRole(role);

        const response = await getInvitations(getRequest('kano/invitations'), { params });
        const body = await response.json();

        expect(body.invitations[0].token).toBe('secret-token');
    });
});
