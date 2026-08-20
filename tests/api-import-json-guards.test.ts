// JSON 복원 라우트의 스키마 검증, 행수 상한, 캐스케이드 확인 가드를 검사한다.
//
// payload 에 customerRequirements 가 들어 있으면 요구사항 deleteMany 가 CASCADE 로
// 설문 응답까지 지운다. excel import 에는 confirmCascade 확인이 있는데 이 경로에는 없었다.
// export 라우트는 Prisma 행을 통째로 내보내므로 실제 백업 파일에는 행마다
// id·projectId·createdAt 이 들어 있다. 그 형태가 그대로 복원되는지도 함께 확인한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const counts = { kano: 0, benchmark: 0, qfd: 0 };

const tx = new Proxy({} as Record<string, Record<string, ReturnType<typeof vi.fn>>>, {
    get(target, model: string) {
        if (!target[model]) {
            target[model] = {
                deleteMany: vi.fn(),
                createMany: vi.fn(),
                update: vi.fn(),
            };
        }
        return target[model];
    },
});

const transaction = vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx));
const findUniqueProject = vi.fn(async () => ({ id: 'proj_1', name: '프로젝트' }));

vi.mock('../lib/prisma', () => ({
    prisma: {
        project: { findUnique: () => findUniqueProject() },
        kanoResponse: { count: async () => counts.kano },
        benchmark: { count: async () => counts.benchmark },
        qFDMatrix: { count: async () => counts.qfd },
        $transaction: (fn: (client: typeof tx) => unknown) => transaction(fn),
    },
}));

const requireProjectAccess = vi.fn(async () => ({
    user: { userId: 'user_1', email: 'u@x.com', name: '사용자' },
    role: 'OWNER' as const,
}));
vi.mock('../lib/authorization', () => ({
    requireProjectAccess: (...args: unknown[]) => requireProjectAccess(...(args as [])),
}));

const { POST } = await import('../app/api/projects/[id]/import-json/route');

const params = { params: Promise.resolve({ id: 'proj_1' }) };

function jsonRequest(body: unknown): NextRequest {
    return new NextRequest('http://localhost/api/projects/proj_1/import-json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

beforeEach(() => {
    counts.kano = 0;
    counts.benchmark = 0;
    counts.qfd = 0;
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('import-json 가드', () => {
    it('설문 응답이 지워질 상황이면 409 로 막고 건수를 알려준다', async () => {
        counts.kano = 42;

        const res = await POST(
            jsonRequest({
                version: '1.0-prisma',
                customerRequirements: [{ category: 'A', requirement: 'x', order: 0 }],
            }),
            params
        );
        const body = await res.json();

        expect(res.status).toBe(409);
        expect(body.needsCascadeConfirm).toBe(true);
        expect(body.error).toContain('42');
        expect(body.cascadeImpact.kanoResponses).toBe(42);
        expect(transaction).not.toHaveBeenCalled();
    });

    it('confirmCascade 가 오면 진행한다', async () => {
        counts.kano = 42;

        const res = await POST(
            jsonRequest({
                version: '1.0-prisma',
                confirmCascade: true,
                customerRequirements: [{ category: 'A', requirement: 'x', order: 0 }],
            }),
            params
        );

        expect(res.status).toBe(200);
        expect(transaction).toHaveBeenCalledTimes(1);
    });

    it('알 수 없는 필드가 들어오면 400 으로 막는다', async () => {
        const res = await POST(
            jsonRequest({
                version: '1.0-prisma',
                customerRequirements: [
                    { category: 'A', requirement: 'x', order: 0, ownerId: 'user_evil' },
                ],
            }),
            params
        );

        expect(res.status).toBe(400);
        expect(transaction).not.toHaveBeenCalled();
    });

    it('행이 너무 많으면 400 으로 막는다', async () => {
        const rows = Array.from({ length: 2001 }, (_, i) => ({
            category: 'A',
            requirement: `요구 ${i}`,
            order: i,
        }));

        const res = await POST(
            jsonRequest({ version: '1.0-prisma', customerRequirements: rows }),
            params
        );

        expect(res.status).toBe(400);
        expect(transaction).not.toHaveBeenCalled();
    });

    it('export 가 내보낸 형태의 백업을 받아들이고 클라이언트 id 는 저장하지 않는다', async () => {
        // export 는 Prisma 행을 통째로 내보낸다. 이 형태가 거부되면 기존 백업이
        // 전부 복원 불가가 된다.
        const backup = {
            project: { name: '복원 대상', description: '설명', detailedDescription: null },
            specFunctions: [
                {
                    id: 'spec_old',
                    projectId: 'proj_old',
                    level: '대분류',
                    parentId: null,
                    name: '기능',
                    technology: null,
                    order: 0,
                },
            ],
            productAttributes: [
                {
                    id: 'attr_old',
                    projectId: 'proj_old',
                    productName: '제품',
                    customerName: null,
                    marketSegment: null,
                    customerNeed: null,
                    benefit: null,
                    attribute: null,
                    techCapability: null,
                    order: 0,
                },
            ],
            attributeFitnesses: [
                {
                    id: 'fit_old',
                    projectId: 'proj_old',
                    attributeId: 'attr_old',
                    importance: 3,
                    currentLevel: 2,
                    targetLevel: 4,
                    note: null,
                },
            ],
            customerRequirements: [
                {
                    id: 'req_old',
                    projectId: 'proj_old',
                    category: 'A',
                    subcategory: null,
                    requirement: '요구',
                    kanoPositiveQ: null,
                    kanoNegativeQ: null,
                    kanoWeight: null,
                    order: 0,
                    createdAt: '2026-01-01T00:00:00.000Z',
                },
            ],
            technicalCharacteristics: [
                { id: 'tech_old', projectId: 'proj_old', name: '특성', unit: null, targetValue: null },
            ],
            qfdRelationships: [
                {
                    id: 'qfd_old',
                    projectId: 'proj_old',
                    requirementId: 'req_old',
                    technicalCharId: 'tech_old',
                    strength: '강',
                    currentScore: null,
                    competitorScore: null,
                },
            ],
            kanoResponses: [
                {
                    id: 'res_old',
                    projectId: 'proj_old',
                    requirementId: 'req_old',
                    invitationId: 'inv_1',
                    respondentEmail: 'a@b.com',
                    positiveAnswer: 1,
                    negativeAnswer: 5,
                    kanoCategory: 'M',
                    respondedAt: '2026-01-02T00:00:00.000Z',
                },
            ],
            techCorrelations: [
                {
                    id: 'corr_old',
                    projectId: 'proj_old',
                    techId1: 'tech_old',
                    techId2: 'tech_old',
                    correlation: '+',
                },
            ],
            benchmarks: [
                { id: 'bm_old', projectId: 'proj_old', requirementId: 'req_old', company: 'X', score: 3 },
            ],
            exportedAt: '2026-01-03T00:00:00.000Z',
            version: '1.0-prisma',
        };

        const res = await POST(jsonRequest(backup), params);

        expect(res.status).toBe(200);

        const requirementRows = tx.customerRequirement.createMany.mock.calls[0][0].data;
        expect(requirementRows[0].id).not.toBe('req_old');
        expect(requirementRows[0].projectId).toBe('proj_1');
        // createdAt 은 신원 열이 아니라 실제 기록 시각이라 백업에 있으면 그대로 복원한다.
        expect(requirementRows[0].createdAt).toEqual(new Date('2026-01-01T00:00:00.000Z'));
        expect(requirementRows[0].requirement).toBe('요구');

        // 요구사항 id 를 새로 만들었으므로 자식 행의 FK 도 새 id 를 가리켜야 한다.
        const qfdRows = tx.qFDMatrix.createMany.mock.calls[0][0].data;
        expect(qfdRows[0].strength).toBe('강');
        expect(qfdRows[0]).not.toHaveProperty('relationship');
        expect(qfdRows[0].requirementId).toBe(requirementRows[0].id);

        const kanoRows = tx.kanoResponse.createMany.mock.calls[0][0].data;
        expect(kanoRows[0].requirementId).toBe(requirementRows[0].id);
        expect(kanoRows[0].invitationId).toBe('inv_1');

        const fitnessRows = tx.attributeFitness.createMany.mock.calls[0][0].data;
        const attributeRows = tx.productAttribute.createMany.mock.calls[0][0].data;
        expect(fitnessRows[0].attributeId).toBe(attributeRows[0].id);
    });

    it('createdAt·respondedAt 은 신원 열이 아니라 실제 데이터라 그대로 복원한다', async () => {
        const res = await POST(
            jsonRequest({
                version: '1.0-prisma',
                customerRequirements: [
                    {
                        id: 'req_old',
                        projectId: 'proj_old',
                        category: 'A',
                        requirement: '요구',
                        order: 0,
                        createdAt: '2020-01-02T03:04:05.000Z',
                    },
                ],
                kanoResponses: [
                    {
                        id: 'res_old',
                        projectId: 'proj_old',
                        requirementId: 'req_old',
                        invitationId: 'inv_1',
                        respondentEmail: 'a@b.com',
                        positiveAnswer: 1,
                        negativeAnswer: 5,
                        kanoCategory: 'M',
                        respondedAt: '2020-01-02T03:04:05.000Z',
                    },
                ],
            }),
            params
        );

        expect(res.status).toBe(200);

        const requirementRows = tx.customerRequirement.createMany.mock.calls[0][0].data;
        expect(requirementRows[0].createdAt).toEqual(new Date('2020-01-02T03:04:05.000Z'));

        const kanoRows = tx.kanoResponse.createMany.mock.calls[0][0].data;
        expect(kanoRows[0].respondedAt).toEqual(new Date('2020-01-02T03:04:05.000Z'));
    });

    it('createdAt·respondedAt 이 없는 행도 그대로 들어간다(컬럼 기본값에 맡긴다)', async () => {
        const res = await POST(
            jsonRequest({
                version: '1.0-prisma',
                customerRequirements: [
                    { category: 'A', requirement: '요구', order: 0 },
                ],
                kanoResponses: [
                    {
                        requirementId: 'req_missing',
                        invitationId: 'inv_1',
                        respondentEmail: 'a@b.com',
                        positiveAnswer: 1,
                        negativeAnswer: 5,
                        kanoCategory: 'M',
                    },
                ],
            }),
            params
        );

        expect(res.status).toBe(200);

        const requirementRows = tx.customerRequirement.createMany.mock.calls[0][0].data;
        expect(requirementRows[0].createdAt).toBeUndefined();

        const kanoRows = tx.kanoResponse.createMany.mock.calls[0][0].data;
        expect(kanoRows[0].respondedAt).toBeUndefined();
    });
});
