// 설문 제출이 두 번 들어와도 응답 세트가 한 벌만 저장되는지 확인한다.
// 트랜잭션 밖의 respondedAt 검사만으로는 두 요청이 모두 통과하고,
// (invitationId, requirementId) 유니크 제약이 없어 DB 도 막아 주지 않는다.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const invitationFindUnique = vi.fn();
const invitationUpdateMany = vi.fn();
const requirementFindMany = vi.fn();
const responseCreateMany = vi.fn();

vi.mock('../lib/prisma', () => ({
    prisma: {
        kanoSurveyInvitation: {
            findUnique: (...args: unknown[]) => invitationFindUnique(...(args as [])),
            updateMany: (...args: unknown[]) => invitationUpdateMany(...(args as [])),
        },
        customerRequirement: { findMany: (...args: unknown[]) => requirementFindMany(...(args as [])) },
        kanoResponse: { createMany: (...args: unknown[]) => responseCreateMany(...(args as [])) },
        $transaction: async (callback: (tx: unknown) => unknown) => callback({
            kanoSurveyInvitation: { updateMany: (...args: unknown[]) => invitationUpdateMany(...(args as [])) },
            kanoResponse: { createMany: (...args: unknown[]) => responseCreateMany(...(args as [])) },
        }),
    },
}));

const { POST } = await import('../app/api/survey/[token]/submit/route');

const params = { params: Promise.resolve({ token: 'survey-token' }) };

function submitRequest() {
    return new NextRequest('http://localhost/api/survey/survey-token/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            answers: {
                req_1: { functional: 'LIKE', dysfunctional: 'DISLIKE' },
                req_2: { functional: 'EXPECT', dysfunctional: 'TOLERATE' },
            },
        }),
    });
}

// respondedAt 을 들고 있는 초대 한 건을 흉내낸다. updateMany 는 실제 DB 처럼
// respondedAt 이 아직 비어 있을 때만 성공시킨다 — 이것이 경쟁의 승부처다.
let respondedAt: Date | null;

beforeEach(() => {
    vi.clearAllMocks();
    respondedAt = null;

    requirementFindMany.mockResolvedValue([{ id: 'req_1' }, { id: 'req_2' }]);
    responseCreateMany.mockResolvedValue({ count: 2 });
    invitationUpdateMany.mockImplementation(async ({ where, data }: {
        where: { respondedAt: Date | null };
        data: { respondedAt: Date };
    }) => {
        if (where.respondedAt === null && respondedAt !== null) return { count: 0 };
        respondedAt = data.respondedAt;
        return { count: 1 };
    });
});

describe('설문 제출 이중 처리 방지', () => {
    it('두 요청이 모두 미응답 상태를 본 뒤에도 응답은 한 벌만 저장된다', async () => {
        // 두 요청 다 트랜잭션 밖 검사를 통과하는 상황 — 느린 네트워크에서 제출을
        // 두 번 누르면 실제로 이렇게 된다.
        invitationFindUnique.mockResolvedValue({
            id: 'inv_1',
            projectId: 'proj_1',
            email: 'respondent@example.com',
            expiresAt: new Date('2099-12-31'),
            respondedAt: null,
        });

        const first = await POST(submitRequest(), params);
        const second = await POST(submitRequest(), params);

        expect(first.status).toBe(200);
        expect(await first.json()).toMatchObject({ success: true, responseCount: 2 });

        expect(second.status).toBe(400);
        expect(await second.json()).toMatchObject({ error: '이미 응답을 완료하셨습니다.' });

        // 진 쪽은 아무것도 쓰지 않는다.
        expect(responseCreateMany).toHaveBeenCalledTimes(1);
    });

    it('이미 응답한 초대는 트랜잭션에 들어가기 전에 막힌다', async () => {
        invitationFindUnique.mockResolvedValue({
            id: 'inv_1',
            projectId: 'proj_1',
            email: 'respondent@example.com',
            expiresAt: new Date('2099-12-31'),
            respondedAt: new Date('2026-01-01'),
        });

        const response = await POST(submitRequest(), params);

        expect(response.status).toBe(400);
        expect(invitationUpdateMany).not.toHaveBeenCalled();
        expect(responseCreateMany).not.toHaveBeenCalled();
    });
});
