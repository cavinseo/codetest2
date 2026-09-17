// JSON 복원 라우트의 스키마 검증, 행수 상한, 캐스케이드 확인 가드를 검사한다.
//
// payload 에 customerRequirements 가 들어 있으면 요구사항 deleteMany 가 CASCADE 로
// 설문 응답까지 지운다. excel import 에는 confirmCascade 확인이 있는데 이 경로에는 없었다.
// export 라우트는 Prisma 행을 통째로 내보내므로 실제 백업 파일에는 행마다
// id·projectId·createdAt 이 들어 있다. 그 형태가 그대로 복원되는지도 함께 확인한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { MAX_IMPORT_ROWS } from '../lib/import-json-schema';

const counts = { kano: 0, benchmark: 0, qfd: 0, fitness: 0, correlation: 0, technicalBenchmark: 0 };

const tx = new Proxy({} as Record<string, Record<string, ReturnType<typeof vi.fn>>>, {
    get(target, model: string) {
        if (!target[model]) {
            target[model] = {
                deleteMany: vi.fn(),
                createMany: vi.fn(),
                update: vi.fn(),
                findMany: vi.fn(async () => []),
                upsert: vi.fn(async (args: { create: unknown }) => args.create),
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
        attributeFitness: { count: async () => counts.fitness },
        techCorrelation: { count: async () => counts.correlation },
        technicalBenchmark: { count: async () => counts.technicalBenchmark },
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

it.each(['', ' \t\n '])('공백 세부기능 %j가 있으면 기존 관계를 건드리기 전에 복원을 거절한다', async name => {
    const response = await POST(jsonRequest({ technicalCharacteristics: [{ name }], confirmCascade: true }), params);
    expect(response.status).toBe(400);
    expect(transaction).not.toHaveBeenCalled();
});

beforeEach(() => {
    counts.kano = 0;
    counts.benchmark = 0;
    counts.qfd = 0;
    counts.fitness = 0;
    counts.correlation = 0;
    counts.technicalBenchmark = 0;
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('import-json 가드', () => {
    it.each([
        { payload: { productAttributes: [{ attribute: '새 속성' }] }, count: 'fitness', label: '적합도' },
        { payload: { technicalCharacteristics: [{ name: '새 기능' }] }, count: 'correlation', label: '기술 상관관계' },
        { payload: { technicalCharacteristics: [{ name: '새 기능' }] }, count: 'technicalBenchmark', label: '기술 벤치마크' },
        { payload: { technicalCharacteristics: [{ name: '새 기능' }] }, count: 'qfd', label: 'QFD 관계' },
    ] as const)('$label이 삭제될 때 확인 없이 복원을 진행하지 않는다', async ({ payload, count, label }) => {
        counts[count] = 4;
        const response = await POST(jsonRequest(payload), params);
        expect(response.status).toBe(409);
        expect((await response.json()).error).toContain(`${label} 4건`);
        expect(transaction).not.toHaveBeenCalled();
        const confirmed = await POST(jsonRequest({ ...payload, confirmCascade: true }), params);
        expect(confirmed.status).toBe(200);
    });

    it.each([
        { benchmarks: [{ requirementId: 'outside', company: 'self', score: 2 }] },
        { techCorrelations: [{ techId1: 'outside', techId2: 'outside', correlation: '+' }] },
        { technicalBenchmarks: [{ technicalCharId: 'outside', company: 'self', value: '10' }] },
    ])('복원 대상 프로젝트에 없는 연결은 삭제 전에 거부한다', async payload => {
        const response = await POST(jsonRequest(payload), params);
        expect(response.status).toBe(400);
        for (const model of Object.values(tx)) expect(model.deleteMany).not.toHaveBeenCalled();
    });

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

    it('createdAt 이 날짜 형식이 아니면 400 으로 막는다', async () => {
        // 스키마가 z.string() 이면 'not-a-date' 가 통과해 new Date() 에서
        // Invalid Date 가 되고, Prisma 가 트랜잭션 중간에 던져 500 이 된다.
        // .datetime() 이 그것을 400 으로 앞에서 막는다.
        const res = await POST(
            jsonRequest({
                version: '1.0-prisma',
                customerRequirements: [
                    { category: 'A', requirement: 'x', order: 0, createdAt: 'not-a-date' },
                ],
            }),
            params
        );

        expect(res.status).toBe(400);
        expect(transaction).not.toHaveBeenCalled();
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

    it('행이 너무 많으면 400 으로 막고, 형식 문제가 아니라 행수 문제라고 알려준다', async () => {
        const rows = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => ({
            category: 'A',
            requirement: `요구 ${i}`,
            order: i,
        }));

        const res = await POST(
            jsonRequest({ version: '1.0-prisma', customerRequirements: rows }),
            params
        );
        const body = await res.json();

        expect(res.status).toBe(400);
        expect(body.error).toContain(String(MAX_IMPORT_ROWS));
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
            technicalBenchmarks: [
                { id: 'tb_old', projectId: 'proj_old', technicalCharId: 'tech_old', company: 'X', value: '25 ms' },
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
        const invitation = tx.kanoSurveyInvitation.upsert.mock.calls[0][0];
        expect(invitation.where).toEqual({ projectId_email: { projectId: 'proj_1', email: 'a@b.com' } });
        expect(invitation.create).toMatchObject({ projectId: 'proj_1', email: 'a@b.com', isUsed: true });
        expect(invitation.create.id).not.toBe('inv_1');
        expect(kanoRows[0].invitationId).toBe(invitation.create.id);

        const techId = tx.technicalCharacteristic.createMany.mock.calls[0][0].data[0].id;
        expect(tx.benchmark.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ projectId: 'proj_1', requirementId: requirementRows[0].id, company: 'X', score: 3 })] });
        expect(tx.techCorrelation.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ projectId: 'proj_1', techId1: techId, techId2: techId, correlation: '+' })] });
        expect(tx.technicalBenchmark.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ projectId: 'proj_1', technicalCharId: techId, company: 'X', value: '25 ms' })] });

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
                    { id: 'req_old', category: 'A', requirement: '요구', order: 0 },
                ],
                kanoResponses: [
                    {
                        requirementId: 'req_old',
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

    it('customerRequirements 가 없는 payload 는 기존 Kano 응답이 있어도 확인 없이 진행한다', async () => {
        // countCascadeImpact 는 payload 에 customerRequirements 가 실려 있을 때만
        // 캐스케이드 영향을 센다. 이 판단이 무조건 true 로 바뀌면(뮤테이션), 관계
        // 없는 컬렉션만 보내는 요청도 잘못 409 로 막히게 된다.
        counts.kano = 42;

        const res = await POST(
            jsonRequest({
                version: '1.0-prisma',
                specFunctions: [{ level: '대분류', name: '기능', order: 0 }],
            }),
            params
        );

        expect(res.status).toBe(200);
        expect(transaction).toHaveBeenCalledTimes(1);
    });

    it('specFunctions 의 parentId 를 새 id 로 다시 잇는다', async () => {
        const res = await POST(
            jsonRequest({
                version: '1.0-prisma',
                specFunctions: [
                    { id: 'spec_old_parent', level: '대분류', parentId: null, name: '부모', order: 0 },
                    { id: 'spec_old_child', level: '중분류', parentId: 'spec_old_parent', name: '자식', order: 1 },
                ],
            }),
            params
        );

        expect(res.status).toBe(200);

        const specRows = tx.specFunction.createMany.mock.calls[0][0].data;
        expect(specRows[0].parentId).toBeNull();
        expect(specRows[1].parentId).toBe(specRows[0].id);
        expect(specRows[1].parentId).not.toBe('spec_old_parent');
    });

    it('알 수 없는(더 이상 존재하지 않는) parentId 는 끊어진 참조 대신 루트가 된다', async () => {
        // importDeletionPlan 이 이 프로젝트의 기존 SpecFunction 을 전부 지운 뒤라,
        // 이번 payload 에 없는 옛 id 를 그대로 두면 반드시 죽은 참조가 된다.
        const res = await POST(
            jsonRequest({
                version: '1.0-prisma',
                specFunctions: [
                    { id: 'spec_old_child', level: '중분류', parentId: 'spec_old_gone', name: '자식', order: 0 },
                ],
            }),
            params
        );

        expect(res.status).toBe(200);

        const specRows = tx.specFunction.createMany.mock.calls[0][0].data;
        expect(specRows[0].parentId).toBeNull();
    });

    it('최상위에 알 수 없는 필드가 있으면 400 으로 막는다', async () => {
        const res = await POST(
            jsonRequest({
                version: '1.0-prisma',
                unknownTopLevelField: 'evil',
                specFunctions: [{ level: '대분류', name: '기능', order: 0 }],
            }),
            params
        );

        expect(res.status).toBe(400);
        expect(transaction).not.toHaveBeenCalled();
    });
});

describe('WS-9 그룹 백업 복원', () => {
    it('그룹 번호와 열 순서를 그대로 복원하고 자동 채움을 완료 처리한다', async () => {
        const response = await POST(jsonRequest({ technicalCharacteristics: [
            { id: 'old1', name: '첫 기능', groupIndex: 7, columnOrder: 2 },
            { id: 'old2', name: '둘째 기능', groupIndex: 1, columnOrder: 8 },
        ] }), params);
        expect(response.status).toBe(200);
        expect(tx.technicalCharacteristic.createMany).toHaveBeenCalledWith({ data: [
            expect.objectContaining({ name: '첫 기능', groupIndex: 7, columnOrder: 2 }),
            expect.objectContaining({ name: '둘째 기능', groupIndex: 1, columnOrder: 8 }),
        ] });
        expect(tx.project.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ qfdTechnicalInitialized: true }) }));
    });
    it('그룹 정보가 없는 기존 백업은 3개씩 순서대로 복원한다', async () => {
        const response = await POST(jsonRequest({ technicalCharacteristics: [0, 1, 2, 3].map(i => ({ name: '기능' + i })) }), params);
        expect(response.status).toBe(200);
        expect(tx.technicalCharacteristic.createMany.mock.calls[0][0].data.map((t: { groupIndex: number; columnOrder: number }) => [t.groupIndex, t.columnOrder]))
            .toEqual([[0, 0], [0, 1], [0, 2], [1, 3]]);
    });
    it.each(['groupIndex', 'columnOrder'])('%s는 0 이상의 정수만 허용한다', async field => {
        for (const value of [-1, 1.5, '2', null]) {
            const response = await POST(jsonRequest({ technicalCharacteristics: [{ name: '기능', [field]: value }] }), params);
            expect(response.status).toBe(400);
        }
        expect(transaction).not.toHaveBeenCalled();
    });
});
