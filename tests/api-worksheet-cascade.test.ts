// 워크시트 대량저장이 하위 데이터를 말없이 지우지 않는지 확인한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const countKanoResponse = vi.fn();
const countBenchmark = vi.fn();
const countQfd = vi.fn();
const countFitness = vi.fn();
const countCustomerRequirement = vi.fn();
const findProject = vi.fn();
const transaction = vi.fn();

const tx = {
    customerRequirement: {
        deleteMany: vi.fn(),
        updateMany: vi.fn(),
        create: vi.fn(),
        findMany: vi.fn(),
    },
    productAttribute: {
        deleteMany: vi.fn(),
        updateMany: vi.fn(),
        create: vi.fn(),
        findMany: vi.fn(),
    },
};

vi.mock('../lib/prisma', () => ({
    prisma: {
        kanoResponse: { count: countKanoResponse },
        benchmark: { count: countBenchmark },
        qFDMatrix: { count: countQfd },
        attributeFitness: { count: countFitness },
        customerRequirement: { count: countCustomerRequirement },
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
    // 적합도도 요구사항과 같은 규칙이다. 살아남을 속성 id 로 걸러진 쿼리
    // (attributeId.notIn)는 "지워질 적합도"를 세므로 정상 편집에서는 0 이고,
    // 필터 없는 쿼리는 전량 삭제라 기존 적합도가 다 걸린다.
    countFitness.mockImplementation((args?: { where?: { attributeId?: { notIn?: string[] } } }) =>
        Promise.resolve(args?.where?.attributeId?.notIn ? 0 : 5)
    );
    // 기본값: notIn 필터가 있는 쿼리(제출 id 로 걸러진 "지워질 기존 행")는 0건,
    // 필터 없는 전량 삭제 쿼리는 기존 행이 있다고 본다. 정상 편집은 제출 id 가
    // 기존 행을 모두 덮으므로 notIn 결과가 0 이라 게이트가 걸리지 않는다.
    countCustomerRequirement.mockImplementation((args?: { where?: { id?: { notIn?: string[] } } }) =>
        Promise.resolve(args?.where?.id?.notIn ? 0 : 5)
    );
    findProject.mockResolvedValue({ id: 'proj_1' });
    // tx 는 모듈 수준의 고정 객체다. 트랜잭션 안에서 어떤 where 로 지웠는지까지
    // 단언하려면 매번 새로 만든 vi.fn() 이 아니라 같은 참조를 봐야 한다.
    tx.customerRequirement.deleteMany.mockResolvedValue({ count: 0 });
    tx.customerRequirement.updateMany.mockResolvedValue({ count: 1 });
    tx.customerRequirement.create.mockResolvedValue({});
    tx.customerRequirement.findMany.mockResolvedValue([]);
    tx.productAttribute.deleteMany.mockResolvedValue({ count: 0 });
    tx.productAttribute.updateMany.mockResolvedValue({ count: 1 });
    tx.productAttribute.create.mockResolvedValue({});
    tx.productAttribute.findMany.mockResolvedValue([]);
    transaction.mockImplementation(async (fn: (client: typeof tx) => Promise<unknown>) => {
        if (typeof fn !== 'function') return undefined;
        return fn(tx);
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

    it('confirmCascade 가 오면 새 id 전체 교체도 진행한다', async () => {
        countKanoResponse.mockResolvedValue(17);
        countCustomerRequirement.mockResolvedValue(4);

        const res = await saveRequirements(
            postRequest('requirements', {
                confirmCascade: true,
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

    it('confirmCascade 가 오면 진행한다', async () => {
        countFitness.mockResolvedValue(9);

        const res = await saveAttributes(
            postRequest('attributes', { attributes: [], confirmCascade: true }),
            { params }
        );

        expect(res.status).toBe(200);
    });

    it('id 를 유지한 정상 편집은 적합도가 있어도 통과한다', async () => {
        // 예전에는 여기서 409 가 났다. 저장이 늘 전량 삭제였고 가드도 제출 id 를
        // 보지 않아, 오타 한 글자를 고치는 저장에도 "적합도 9건이 삭제됩니다"가
        // 떴다. 늘 뜨는 경고는 읽히지 않고 확인 클릭을 습관으로 만든다.
        const res = await saveAttributes(
            postRequest('attributes', {
                attributes: [{ id: 'attr_1', marketSegment: 'M', attribute: 'A', order: 0 }],
            }),
            { params }
        );

        expect(res.status).toBe(200);
    });

    it('새 id 로 전체 교체하면 기존 행이 지워지므로 409 로 막는다', async () => {
        // AI 위저드처럼 기존 행과 하나도 겹치지 않는 id 로 덮어쓰면, notIn 이
        // 기존 속성을 전부 지우고 적합도가 캐스케이드로 사라진다.
        countFitness.mockResolvedValue(9);

        const res = await saveAttributes(
            postRequest('attributes', {
                attributes: [{ id: 'gen_1', marketSegment: 'M', attribute: 'A', order: 0 }],
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

    it('적합도가 있어도 confirmCascade 면 비어있지 않은 저장을 진행한다', async () => {
        countFitness.mockResolvedValue(9);

        const res = await saveAttributes(
            postRequest('attributes', {
                attributes: [{ marketSegment: 'M', attribute: 'A', order: 0 }],
                confirmCascade: true,
            }),
            { params }
        );

        expect(res.status).toBe(200);
    });
});

describe('attributes 저장 — 행 단위 upsert', () => {
    it('제출에서 빠진 행만 지운다', async () => {
        await saveAttributes(
            postRequest('attributes', {
                attributes: [
                    { id: 'attr_1', marketSegment: 'M', attribute: 'A', order: 0 },
                    { id: 'attr_2', marketSegment: 'M', attribute: 'B', order: 1 },
                ],
            }),
            { params }
        );

        expect(tx.productAttribute.deleteMany).toHaveBeenCalledWith({
            where: { projectId: 'proj_1', id: { notIn: ['attr_1', 'attr_2'] } },
        });
    });

    it('빈 제출은 필터 없이 전량을 지운다', async () => {
        await saveAttributes(
            postRequest('attributes', { attributes: [], confirmCascade: true }),
            { params }
        );

        // notIn: [] 은 전체 일치라 결과는 같지만, 그 우연에 기대지 않는다.
        expect(tx.productAttribute.deleteMany).toHaveBeenCalledWith({
            where: { projectId: 'proj_1' },
        });
    });

    it('기존 id 는 update 로 가고 create 를 부르지 않는다', async () => {
        tx.productAttribute.updateMany.mockResolvedValue({ count: 1 });

        await saveAttributes(
            postRequest('attributes', {
                attributes: [{ id: 'attr_1', marketSegment: 'M', attribute: 'A', order: 0 }],
            }),
            { params }
        );

        expect(tx.productAttribute.updateMany).toHaveBeenCalledTimes(1);
        expect(tx.productAttribute.create).not.toHaveBeenCalled();
    });

    it('update 의 where 에 projectId 가 함께 걸린다', async () => {
        // id 만으로 걸면 남의 프로젝트 행을 id 하나로 덮어쓸 수 있다.
        await saveAttributes(
            postRequest('attributes', {
                attributes: [{ id: 'attr_1', marketSegment: 'M', attribute: 'A', order: 0 }],
            }),
            { params }
        );

        const [{ where }] = tx.productAttribute.updateMany.mock.calls[0];
        expect(where).toEqual({ id: 'attr_1', projectId: 'proj_1' });
    });

    it('DB 에 없는 id 는 그 id 그대로 create 한다', async () => {
        // 적합도가 이 id 를 참조할 수 있으므로 서버가 새 id 를 발급하면 안 된다.
        tx.productAttribute.updateMany.mockResolvedValue({ count: 0 });

        await saveAttributes(
            postRequest('attributes', {
                attributes: [{ id: 'attr_new', marketSegment: 'M', attribute: 'A', order: 0 }],
            }),
            { params }
        );

        const [{ data }] = tx.productAttribute.create.mock.calls[0];
        expect(data.id).toBe('attr_new');
        expect(data.projectId).toBe('proj_1');
    });

    it('id 가 없는 행은 서버가 id 를 발급해 create 한다', async () => {
        // 제출 id 가 없으면 전량 삭제라 가드가 걸린다. 여기서 볼 것은 가드가 아니다.
        countFitness.mockResolvedValue(0);

        await saveAttributes(
            postRequest('attributes', {
                attributes: [{ marketSegment: 'M', attribute: 'A', order: 0 }],
            }),
            { params }
        );

        expect(tx.productAttribute.updateMany).not.toHaveBeenCalled();
        const [{ data }] = tx.productAttribute.create.mock.calls[0];
        expect(data.id).toMatch(/^attr_/);
    });

    it('클라이언트가 보낸 임의 필드는 저장되지 않는다', async () => {
        countFitness.mockResolvedValue(0);

        await saveAttributes(
            postRequest('attributes', {
                attributes: [{
                    marketSegment: 'M',
                    attribute: 'A',
                    order: 0,
                    projectId: 'other_project',
                    bogus: 1,
                }],
            }),
            { params }
        );

        const [{ data }] = tx.productAttribute.create.mock.calls[0];
        expect(data.projectId).toBe('proj_1');
        expect(data).not.toHaveProperty('bogus');
    });
});
