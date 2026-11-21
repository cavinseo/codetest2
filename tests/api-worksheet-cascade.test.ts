// 워크시트 대량저장이 하위 데이터를 말없이 지우지 않는지 확인한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { worksheetRevision } from '../lib/worksheet-revision';

const countKanoResponse = vi.fn();
const countBenchmark = vi.fn();
const countQfd = vi.fn();
const countFitness = vi.fn();
const countCustomerRequirement = vi.fn();
const findProject = vi.fn();
const findRequirements = vi.fn();
const transaction = vi.fn();

vi.mock('../lib/prisma', () => ({
    prisma: {
        kanoResponse: { count: countKanoResponse },
        benchmark: { count: countBenchmark },
        qFDMatrix: { count: countQfd },
        attributeFitness: { count: countFitness },
        // 다른 프로젝트 id 조회와 캐스케이드 확인 전 개정값 검사가 읽는다.
        // beforeEach 가 빈 배열로 두어 트랜잭션 안과 같은 빈 워크시트가 된다.
        customerRequirement: { count: countCustomerRequirement, findMany: findRequirements },
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

// 서버가 409 로 보여 준 cascadeImpact 를 화면이 그대로 돌려보내는 모양이다.
function impactOf(counts: Partial<Record<string, number>>) {
    return {
        kanoResponses: 0, benchmarks: 0, qfdMatrices: 0,
        attributeFitnesses: 0, techCorrelations: 0, technicalBenchmarks: 0,
        ...counts,
    };
}

function postRequest(path: string, body: unknown): NextRequest {
    return new NextRequest(`http://localhost/api/projects/proj_1/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'If-Match': worksheetRevision([]) },
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
    // 기본값: notIn 필터가 있는 쿼리(제출 id 로 걸러진 "지워질 기존 행")는 0건,
    // 필터 없는 전량 삭제 쿼리는 기존 행이 있다고 본다. 정상 편집은 제출 id 가
    // 기존 행을 모두 덮으므로 notIn 결과가 0 이라 게이트가 걸리지 않는다.
    countCustomerRequirement.mockImplementation((args?: { where?: { id?: { notIn?: string[] } } }) =>
        Promise.resolve(args?.where?.id?.notIn ? 0 : 5)
    );
    findProject.mockResolvedValue({ id: 'proj_1' });
    // 다른 프로젝트에 같은 id 가 있는지 보는 조회(B13). 기본은 없음.
    findRequirements.mockResolvedValue([]);
    transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        if (typeof fn !== 'function') return undefined;
        return fn({
            // 지우기 직전 캐스케이드 재확인이 트랜잭션 안에서 다시 센다. 바깥과 같은 mock 을
            // 써서, 테스트가 바꾼 건수가 트랜잭션 안에서도 그대로 보이게 한다.
            kanoResponse: { count: countKanoResponse },
            benchmark: { count: countBenchmark },
            qFDMatrix: { count: countQfd },
            attributeFitness: { count: countFitness },
            customerRequirement: {
                count: countCustomerRequirement,
                deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
                updateMany: vi.fn().mockResolvedValue({ count: 1 }),
                createMany: vi.fn().mockResolvedValue({ count: 1 }),
                create: vi.fn().mockResolvedValue({}),
                findMany: vi.fn().mockResolvedValue([]),
            },
            ...Object.fromEntries(['techTreeEntry', 'improvementItem', 'techRoadmap', 'targetSpec'].map(name => [name, { findMany: vi.fn(async () => []), updateMany: vi.fn() }])),
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

    it('확인한 건수가 오면 전량 삭제라도 진행한다', async () => {
        // 사용자가 경고를 확인했으면 id 없는 전량 삭제도 통과해야 한다.
        // 안 그러면 확인을 눌러도 저장이 영영 안 된다.
        countKanoResponse.mockResolvedValue(17);

        const res = await saveRequirements(
            postRequest('requirements', {
                confirmedCascadeImpact: impactOf({ kanoResponses: 17 }),
                requirements: [{ category: 'A', requirement: 'x', order: 0 }],
            }),
            { params }
        );

        expect(res.status).toBe(200);
    });

    // 확인은 화면이 보여 준 건수에 묶여야 한다. 예전의 confirmCascade: true 는 건수와
    // 무관하게 통과해, 확인 뒤 들어온 응답까지 지웠다(감리 B4).
    it('예전 방식의 confirmCascade: true 만으로는 지우지 않는다', async () => {
        countKanoResponse.mockResolvedValue(17);

        const res = await saveRequirements(
            postRequest('requirements', {
                confirmCascade: true,
                requirements: [{ category: 'A', requirement: 'x', order: 0 }],
            }),
            { params }
        );

        expect(res.status).toBe(409);
        expect(transaction).not.toHaveBeenCalled();
    });

    it('확인한 건수와 지금 건수가 다르면 새 건수로 다시 묻는다', async () => {
        // 확인창에는 3건이었는데 그 사이 응답이 40건 더 들어왔다.
        countKanoResponse.mockResolvedValue(43);

        const res = await saveRequirements(
            postRequest('requirements', {
                confirmedCascadeImpact: impactOf({ kanoResponses: 3 }),
                requirements: [{ category: 'A', requirement: 'x', order: 0 }],
            }),
            { params }
        );
        const body = await res.json();

        expect(res.status).toBe(409);
        expect(body.cascadeImpact.kanoResponses).toBe(43);
        expect(transaction).not.toHaveBeenCalled();
    });

    it('확인 직후 트랜잭션 안에서 건수가 바뀌었으면 지우지 않고 다시 묻는다', async () => {
        // 바깥 확인 때는 17건, 트랜잭션 안에서 다시 세면 18건이다.
        countKanoResponse.mockResolvedValueOnce(17).mockResolvedValue(18);
        const deleteMany = vi.fn();
        transaction.mockImplementationOnce(async (fn: (tx: unknown) => Promise<unknown>) => fn({
            kanoResponse: { count: countKanoResponse },
            benchmark: { count: countBenchmark },
            qFDMatrix: { count: countQfd },
            customerRequirement: { count: countCustomerRequirement, findMany: vi.fn(async () => []), deleteMany },
        }));

        const res = await saveRequirements(
            postRequest('requirements', {
                confirmedCascadeImpact: impactOf({ kanoResponses: 17 }),
                requirements: [{ category: 'A', requirement: 'x', order: 0 }],
            }),
            { params }
        );
        const body = await res.json();

        expect(res.status).toBe(409);
        expect(body.needsCascadeConfirm).toBe(true);
        expect(body.cascadeImpact.kanoResponses).toBe(18);
        expect(deleteMany).not.toHaveBeenCalled();
    });

    it('새 id 로 전체 교체(AI 자동생성 등)해 기존 행이 지워지고 응답이 있으면 409 로 막는다', async () => {
        // 제출 id 가 있어도 기존 행과 하나도 안 겹치면 deleteMany(notIn) 가
        // 기존 요구사항을 전부 지우고 Kano 응답이 캐스케이드로 사라진다.
        countKanoResponse.mockResolvedValue(17);
        countCustomerRequirement.mockResolvedValue(4); // notIn 결과 = 지워질 기존 행

        const res = await saveRequirements(
            postRequest('requirements', {
                requirements: [{ id: 'gen_1', category: 'A', requirement: 'x', order: 0 }],
            }),
            { params }
        );
        const body = await res.json();

        expect(res.status).toBe(409);
        expect(body.needsCascadeConfirm).toBe(true);
        expect(body.error).toContain('17');
    });

    it('확인한 건수가 오면 새 id 전체 교체도 진행한다', async () => {
        countKanoResponse.mockResolvedValue(17);
        countCustomerRequirement.mockResolvedValue(4);

        const res = await saveRequirements(
            postRequest('requirements', {
                confirmedCascadeImpact: impactOf({ kanoResponses: 17 }),
                requirements: [{ id: 'gen_1', category: 'A', requirement: 'x', order: 0 }],
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

    it('확인한 적합도 영향 범위가 일치하면 진행한다', async () => {
        countFitness.mockResolvedValue(9);

        const res = await saveAttributes(
            postRequest('attributes', { attributes: [], confirmedCascadeImpact: { fitnesses: 9 } }),
            { params }
        );

        expect(res.status).toBe(200);
    });

    it('속성이 비어있지 않아도(전체 교체) 적합도가 있으면 409 로 막는다', async () => {
        // 저장은 항상 deleteMany 로 전체를 지우고 다시 만든다. 비어있지 않은
        // 저장도 그 삭제의 캐스케이드로 적합도를 전부 없앤다.
        countFitness.mockResolvedValue(9);

        const res = await saveAttributes(
            postRequest('attributes', {
                attributes: [{ marketSegment: 'M', attribute: 'A', order: 0 }],
            }),
            { params }
        );
        const body = await res.json();

        expect(res.status).toBe(409);
        expect(body.needsCascadeConfirm).toBe(true);
        expect(body.error).toContain('9');
    });

    it('적합도가 없으면 비어있지 않은 저장은 그대로 통과한다', async () => {
        countFitness.mockResolvedValue(0);

        const res = await saveAttributes(
            postRequest('attributes', {
                attributes: [{ marketSegment: 'M', attribute: 'A', order: 0 }],
            }),
            { params }
        );

        expect(res.status).toBe(200);
    });

    it('적합도가 있어도 확인한 영향 범위가 일치하면 비어있지 않은 저장을 진행한다', async () => {
        countFitness.mockResolvedValue(9);

        const res = await saveAttributes(
            postRequest('attributes', {
                attributes: [{ marketSegment: 'M', attribute: 'A', order: 0 }],
                confirmedCascadeImpact: { fitnesses: 9 },
            }),
            { params }
        );

        expect(res.status).toBe(200);
    });

    // 바깥 확인은 트랜잭션 밖에서 센다. 그 사이 적합도가 더 저장됐으면 지우지 않고 다시 묻는다(감리 B4).
    it('확인 직후 트랜잭션 안에서 적합도 건수가 바뀌었으면 지우지 않고 다시 묻는다', async () => {
        countFitness.mockResolvedValueOnce(9).mockResolvedValue(12);
        const deleteMany = vi.fn();
        transaction.mockImplementationOnce(async (fn: (tx: unknown) => Promise<unknown>) => fn({
            attributeFitness: { count: countFitness },
            productAttribute: { findMany: vi.fn(async () => []), deleteMany, createMany: vi.fn() },
        }));

        const res = await saveAttributes(
            postRequest('attributes', { attributes: [], confirmedCascadeImpact: { fitnesses: 9 } }),
            { params }
        );
        const body = await res.json();

        expect(res.status).toBe(409);
        expect(body.cascadeImpact).toEqual({ fitnesses: 12 });
        expect(deleteMany).not.toHaveBeenCalled();
    });
});
