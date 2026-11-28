// 워크시트 저장이 클라이언트가 보낸 id 로 다른 프로젝트 데이터에 연결하거나, 응답 차이로
// 남의 id 존재 여부를 드러내지 않는지 확인한다(2026-10-25 코드 리뷰 B13).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { worksheetRevision } from '../lib/worksheet-revision';

const countCustomerRequirement = vi.fn();
const findRequirements = vi.fn();
const findProject = vi.fn();
const findAttributes = vi.fn();
const transaction = vi.fn();
const updateRequirements = vi.fn();
const createRequirement = vi.fn();
const deleteFitnesses = vi.fn();
const createFitnesses = vi.fn();

vi.mock('../lib/prisma', () => ({
    prisma: {
        // 트랜잭션 밖 findMany 는 남의 id 조회(NOT 조건)와 저장 전 개정값 검사(감리 B3) 두 가지다.
        // 이 파일은 앞의 것만 본다. 개정값 검사는 빈 워크시트를 읽게 둔다.
        customerRequirement: {
            count: countCustomerRequirement,
            findMany: async (args: { where?: { NOT?: unknown } }) => (args?.where?.NOT ? findRequirements(args) : []),
        },
        productAttribute: { findMany: findAttributes },
        project: { findUnique: findProject },
        $transaction: (...args: unknown[]) => transaction(...(args as [])),
    },
}));

const requireProjectAccess = vi.fn();
vi.mock('../lib/authorization', () => ({
    requireProjectAccess: (...args: unknown[]) => requireProjectAccess(...(args as [])),
}));

const { POST: saveRequirements } = await import('../app/api/projects/[id]/requirements/route');
const { POST: saveFitnesses } = await import('../app/api/projects/[id]/attributes/fitness/route');

const params = Promise.resolve({ id: 'proj_1' });

function postRequest(path: string, body: unknown): NextRequest {
    return new NextRequest(`http://localhost/api/projects/proj_1/${path}`, {
        method: 'POST',
        // 전체 교체 저장은 화면이 읽은 개정값을 If-Match 로 보내야 한다(감리 B3).
        headers: { 'Content-Type': 'application/json', 'If-Match': worksheetRevision([]) },
        body: JSON.stringify(body),
    });
}

beforeEach(() => {
    requireProjectAccess.mockResolvedValue({ user: { userId: 'user_1' }, role: 'OWNER' });
    countCustomerRequirement.mockResolvedValue(0);
    findRequirements.mockResolvedValue([]);
    findProject.mockResolvedValue({ id: 'proj_1' });
    findAttributes.mockResolvedValue([]);
    updateRequirements.mockResolvedValue({ count: 0 });
    createRequirement.mockResolvedValue({});
    deleteFitnesses.mockResolvedValue({ count: 0 });
    createFitnesses.mockResolvedValue({ count: 1 });
    transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn({
        customerRequirement: {
            // 지우기 직전 캐스케이드 재확인(감리 B4)이 센다. 지워질 기존 행은 없다.
            count: vi.fn().mockResolvedValue(0),
            // 개정값 검사·순서 동기화는 빈 워크시트를, 제출 id 조회는 그 id 들을 이미 있는 행으로 본다.
            findMany: vi.fn(async ({ where }: { where: { id?: { in: string[] } } }) =>
                (where.id?.in ? where.id.in.map((id) => ({ id })) : [])),
            deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
            updateMany: updateRequirements,
            // 새 행은 한 번의 createMany 로 만든다(대량 저장 리팩터링).
            createMany: createRequirement,
        },
        attributeFitness: {
            deleteMany: deleteFitnesses,
            createMany: createFitnesses,
            findMany: vi.fn().mockResolvedValue([]),
        },
        // 요구사항 순서를 따르는 후속 워크시트는 비어 있다고 본다.
        techTreeEntry: { findMany: vi.fn().mockResolvedValue([]) },
        improvementItem: { findMany: vi.fn().mockResolvedValue([]) },
        techRoadmap: { findMany: vi.fn().mockResolvedValue([]) },
        targetSpec: { findMany: vi.fn().mockResolvedValue([]) },
    }));
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('요구사항 저장의 남의 id (B13)', () => {
    const row = { id: 'req_other', category: '사용성', requirement: '빠른 주문', order: 0 };

    it('다른 프로젝트에 있는 id 는 그 id 로 만들지 않고 서버 id 로 새 행을 만든다', async () => {
        findRequirements.mockResolvedValue([{ id: 'req_other' }]);
        const res = await saveRequirements(postRequest('requirements', { requirements: [row] }), { params });

        expect(res.status).toBe(200);
        expect(findRequirements).toHaveBeenCalledWith({
            where: { id: { in: ['req_other'] }, NOT: { projectId: 'proj_1' } },
            select: { id: true },
        });
        expect(updateRequirements).not.toHaveBeenCalled();
        const [created] = createRequirement.mock.calls[0][0].data;
        expect(created.id).not.toBe('req_other');
        expect(created.projectId).toBe('proj_1');
    });

    it('남의 id 든 없는 id 든 응답이 같아 존재 여부를 떠볼 수 없다', async () => {
        findRequirements.mockResolvedValue([{ id: 'req_other' }]);
        const foreign = await saveRequirements(postRequest('requirements', { requirements: [row] }), { params });
        findRequirements.mockResolvedValue([]);
        const missing = await saveRequirements(postRequest('requirements', { requirements: [{ ...row, id: 'req_none' }] }), { params });

        expect(foreign.status).toBe(missing.status);
        expect(await foreign.json()).toEqual(await missing.json());
    });

    it('이 프로젝트의 새 클라이언트 id 는 그대로 쓴다', async () => {
        await saveRequirements(postRequest('requirements', { requirements: [{ ...row, id: 'gen_new' }] }), { params });

        expect(updateRequirements).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'gen_new', projectId: 'proj_1' } }));
        expect(createRequirement.mock.calls[0][0].data[0].id).toBe('gen_new');
    });

    it('id 없는 제출은 남의 id 조회를 하지 않는다', async () => {
        await saveRequirements(postRequest('requirements', { requirements: [{ ...row, id: undefined }] }), { params });

        expect(findRequirements).not.toHaveBeenCalled();
        expect(createRequirement).toHaveBeenCalledTimes(1);
    });
});

describe('적합도 저장의 남의 속성 (B13)', () => {
    const fitness = { id: 'fit_client', attributeId: 'attr_1', importance: 9, currentLevel: 8, targetLevel: 10, note: '메모' };

    it('이 프로젝트에 없는 속성에 적합도를 매달지 않고 400 으로 거절한다', async () => {
        findAttributes.mockResolvedValue([{ id: 'attr_1' }]);
        const res = await saveFitnesses(postRequest('attributes/fitness', {
            fitnesses: [fitness, { ...fitness, attributeId: 'attr_other_project' }],
        }), { params });

        expect(res.status).toBe(400);
        expect(findAttributes).toHaveBeenCalledWith({
            where: { projectId: 'proj_1', id: { in: ['attr_1', 'attr_other_project'] } },
            select: { id: true },
        });
        expect(transaction).not.toHaveBeenCalled();
        expect(deleteFitnesses).not.toHaveBeenCalled();
    });

    it('이 프로젝트 속성만이면 저장하고, 클라이언트 id 대신 서버 id 를 붙인다', async () => {
        findAttributes.mockResolvedValue([{ id: 'attr_1' }]);
        const res = await saveFitnesses(postRequest('attributes/fitness', { fitnesses: [fitness, { ...fitness, id: undefined }] }), { params });

        expect(res.status).toBe(200);
        const data = createFitnesses.mock.calls[0][0].data;
        expect(data).toHaveLength(2);
        expect(data[0]).toEqual({
            id: expect.any(String), projectId: 'proj_1', attributeId: 'attr_1',
            importance: 9, currentLevel: 8, targetLevel: 10, note: '메모',
        });
        expect(data.map((item: { id: string }) => item.id)).not.toContain('fit_client');
    });

    it('빈 목록은 속성 조회 없이 전체를 비운다', async () => {
        const res = await saveFitnesses(postRequest('attributes/fitness', { fitnesses: [] }), { params });

        expect(res.status).toBe(200);
        expect(findAttributes).not.toHaveBeenCalled();
        expect(deleteFitnesses).toHaveBeenCalledWith({ where: { projectId: 'proj_1' } });
        expect(createFitnesses).not.toHaveBeenCalled();
    });
});

it('적합도 저장에 깨진 JSON 본문을 보내면 400 으로 거절하고 지우지 않는다 (B25)', async () => {
    const res = await saveFitnesses(new NextRequest('http://localhost/api/projects/proj_1/attributes/fitness', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{',
    }), { params });

    expect(res.status).toBe(400);
    expect(deleteFitnesses).not.toHaveBeenCalled();
});
