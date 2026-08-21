// 워크시트 대량저장이 하위 데이터를 말없이 지우지 않는지 확인한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const countKanoResponse = vi.fn();
const countBenchmark = vi.fn();
const countQfd = vi.fn();
const countFitness = vi.fn();
const findProject = vi.fn();
const transaction = vi.fn();

vi.mock('../lib/prisma', () => ({
    prisma: {
        kanoResponse: { count: countKanoResponse },
        benchmark: { count: countBenchmark },
        qFDMatrix: { count: countQfd },
        attributeFitness: { count: countFitness },
        project: { findUnique: findProject },
        $transaction: (...args: unknown[]) => transaction(...(args as [])),
    },
}));

const requireProjectAccess = vi.fn();
vi.mock('../lib/authorization', () => ({
    requireProjectAccess: (...args: unknown[]) => requireProjectAccess(...(args as [])),
}));

const { POST: saveRequirements } = await import('../app/api/projects/[id]/requirements/route');
const { POST: saveAttributes } = await import('../app/api/projects/[id]/attributes/route');

const params = Promise.resolve({ id: 'proj_1' });

function postRequest(path: string, body: unknown): NextRequest {
    return new NextRequest(`http://localhost/api/projects/proj_1/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

beforeEach(() => {
    requireProjectAccess.mockResolvedValue({
        user: { userId: 'user_1', email: 'u@x.com', name: '사용자' },
        role: 'OWNER',
    });
    countKanoResponse.mockResolvedValue(0);
    countBenchmark.mockResolvedValue(0);
    countQfd.mockResolvedValue(0);
    countFitness.mockResolvedValue(0);
    findProject.mockResolvedValue({ id: 'proj_1' });
    transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        if (typeof fn !== 'function') return undefined;
        return fn({
            customerRequirement: {
                deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
                updateMany: vi.fn().mockResolvedValue({ count: 1 }),
                create: vi.fn().mockResolvedValue({}),
                findMany: vi.fn().mockResolvedValue([]),
            },
            productAttribute: {
                deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
                createMany: vi.fn().mockResolvedValue({ count: 0 }),
                findMany: vi.fn().mockResolvedValue([]),
            },
        });
    });
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('requirements 저장 캐스케이드', () => {
    it('id 없는 행만 보내 전량 삭제가 되는데 응답이 있으면 409 로 막는다', async () => {
        countKanoResponse.mockResolvedValue(17);

        const res = await saveRequirements(
            postRequest('requirements', {
                requirements: [{ category: 'A', requirement: 'x', order: 0 }],
            }),
            { params }
        );
        const body = await res.json();

        expect(res.status).toBe(409);
        expect(body.needsCascadeConfirm).toBe(true);
        expect(body.error).toContain('17');
    });

    it('id 를 유지한 정상 편집은 그대로 통과한다', async () => {
        countKanoResponse.mockResolvedValue(17);

        const res = await saveRequirements(
            postRequest('requirements', {
                requirements: [{ id: 'req_1', category: 'A', requirement: 'x', order: 0 }],
            }),
            { params }
        );

        expect(res.status).toBe(200);
    });

    it('confirmCascade 가 오면 전량 삭제라도 진행한다', async () => {
        // 사용자가 경고를 확인했으면 id 없는 전량 삭제도 통과해야 한다.
        // 안 그러면 확인을 눌러도 저장이 영영 안 된다.
        countKanoResponse.mockResolvedValue(17);

        const res = await saveRequirements(
            postRequest('requirements', {
                confirmCascade: true,
                requirements: [{ category: 'A', requirement: 'x', order: 0 }],
            }),
            { params }
        );

        expect(res.status).toBe(200);
    });
});

describe('attributes 저장 캐스케이드', () => {
    it('빈 배열로 전량 삭제할 때 적합도가 있으면 409 로 막는다', async () => {
        countFitness.mockResolvedValue(9);

        const res = await saveAttributes(postRequest('attributes', { attributes: [] }), { params });
        const body = await res.json();

        expect(res.status).toBe(409);
        expect(body.needsCascadeConfirm).toBe(true);
        expect(body.error).toContain('9');
    });

    it('confirmCascade 가 오면 진행한다', async () => {
        countFitness.mockResolvedValue(9);

        const res = await saveAttributes(
            postRequest('attributes', { attributes: [], confirmCascade: true }),
            { params }
        );

        expect(res.status).toBe(200);
    });
});
